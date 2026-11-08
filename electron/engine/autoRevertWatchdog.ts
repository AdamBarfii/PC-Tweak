import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { AuditStore } from '../storage/auditStore';
import { NetworkEngine } from './networkEngine';

export interface PendingRevertRecord {
  tweakName: string;
  adapterName: string;
  tweakId?: string;
  category: 'dns' | 'adapter' | 'advanced' | 'network';
  startedAt: number;
  durationSeconds: number;
  expiresAt: number;
  status: 'pending' | 'confirmed' | 'reverted';
}

export interface WatchdogTickPayload {
  remainingSeconds: number;
  tweakName: string;
  adapterName: string;
}

export interface WatchdogRevertedPayload {
  tweakName: string;
  adapterName: string;
  reason: 'timeout' | 'crash_recovery' | 'manual';
}

export class AutoRevertWatchdog {
  private static activeRecord: PendingRevertRecord | null = null;
  private static timer: NodeJS.Timeout | null = null;
  private static customStoragePath: string | null = null;

  /**
   * Allows tests to override the storage path
   */
  static setStoragePathForTesting(customPath: string | null): void {
    this.customStoragePath = customPath;
  }

  static getStoragePath(): string {
    if (this.customStoragePath) {
      const dir = path.dirname(this.customStoragePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return this.customStoragePath;
    }
    const baseDir = typeof app !== 'undefined' && app && app.getPath
      ? app.getPath('userData')
      : process.cwd();
    const storageDir = path.join(baseDir, 'storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    return path.join(storageDir, 'pendingRevert.json');
  }

  private static persistToDisk(record: PendingRevertRecord | null): void {
    try {
      const filePath = this.getStoragePath();
      if (record) {
        fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
      } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('Failed to persist pendingRevert state to disk:', err);
    }
  }

  private static readFromDisk(): PendingRevertRecord | null {
    try {
      const filePath = this.getStoragePath();
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private static broadcast(channel: string, payload: any): void {
    try {
      if (typeof BrowserWindow !== 'undefined' && BrowserWindow && BrowserWindow.getAllWindows) {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
          }
        }
      }
    } catch {}
  }

  /**
   * Arms the 20-second auto-revert countdown watchdog backed by disk persistence
   */
  static arm(params: {
    tweakName: string;
    adapterName: string;
    tweakId?: string;
    category?: 'dns' | 'adapter' | 'advanced' | 'network';
    durationSeconds?: number;
  }): PendingRevertRecord {
    this.cancelTimerOnly();

    const durationSeconds = params.durationSeconds && params.durationSeconds > 0 ? params.durationSeconds : 20;
    const now = Date.now();
    const record: PendingRevertRecord = {
      tweakName: params.tweakName,
      adapterName: params.adapterName,
      tweakId: params.tweakId,
      category: params.category || 'network',
      startedAt: now,
      durationSeconds,
      expiresAt: now + durationSeconds * 1000,
      status: 'pending',
    };

    this.activeRecord = record;
    this.persistToDisk(record);

    // Initial broadcast tick
    this.broadcast('network:watchdogTick', {
      remainingSeconds: durationSeconds,
      tweakName: record.tweakName,
      adapterName: record.adapterName,
    });

    this.timer = setInterval(async () => {
      if (!this.activeRecord) {
        this.cancelTimerOnly();
        return;
      }

      const remaining = Math.max(0, Math.ceil((this.activeRecord.expiresAt - Date.now()) / 1000));
      this.broadcast('network:watchdogTick', {
        remainingSeconds: remaining,
        tweakName: this.activeRecord.tweakName,
        adapterName: this.activeRecord.adapterName,
      });

      if (remaining <= 0) {
        this.cancelTimerOnly();
        await this.triggerRevert('timeout');
      }
    }, 1000);

    return record;
  }

  /**
   * Confirms the pending network changes, cancelling countdown and removing disk state
   */
  static confirm(): { success: boolean; message: string } {
    this.cancelTimerOnly();
    const record = this.activeRecord || this.readFromDisk();
    this.activeRecord = null;
    this.persistToDisk(null);

    this.broadcast('network:watchdogConfirmed', {
      tweakName: record?.tweakName || 'Network Tweak',
    });

    return {
      success: true,
      message: record ? `Changes to "${record.tweakName}" confirmed successfully.` : 'No active revert timer to confirm.',
    };
  }

  /**
   * Automatically executes rollback when timer expires or manual revert requested
   */
  static async triggerRevert(reason: 'timeout' | 'crash_recovery' | 'manual' = 'timeout'): Promise<{ success: boolean; message: string }> {
    this.cancelTimerOnly();
    const record = this.activeRecord || this.readFromDisk();
    this.activeRecord = null;
    this.persistToDisk(null);

    if (!record) {
      return { success: false, message: 'No pending network changes to revert.' };
    }

    try {
      // Execute rollback on target adapter
      await NetworkEngine.undoAll(record.adapterName);

      AuditStore.record({
        category: 'network',
        action: 'Watchdog Safety Rollback',
        details: `Reason: ${reason}. Reverted "${record.tweakName}" on adapter "${record.adapterName}".`,
        reversible: false,
      });

      this.broadcast('network:watchdogReverted', {
        tweakName: record.tweakName,
        adapterName: record.adapterName,
        reason,
      });

      return {
        success: true,
        message: `Watchdog reverted "${record.tweakName}" (${reason}).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to rollback changes: ${err.message}`,
      };
    }
  }

  /**
   * Inspects storage at app startup. If pendingRevert.json exists in 'pending' state,
   * an unclean exit or crash occurred while changes were unconfirmed -> automatically rolls back!
   */
  static async checkStartupCrashRecovery(): Promise<{ recovered: boolean; revertedTweak?: string }> {
    const diskRecord = this.readFromDisk();
    if (!diskRecord || diskRecord.status !== 'pending') {
      return { recovered: false };
    }

    console.warn(`[AutoRevertWatchdog] Unclean shutdown detected with unconfirmed tweak: "${diskRecord.tweakName}". Triggering crash recovery rollback.`);

    try {
      await NetworkEngine.undoAll(diskRecord.adapterName);
      this.persistToDisk(null);

      AuditStore.record({
        category: 'network',
        action: 'Startup Crash Recovery Rollback',
        details: `Application crashed/terminated during 20s confirmation window. Automatically reverted "${diskRecord.tweakName}" on "${diskRecord.adapterName}".`,
        reversible: false,
      });

      return {
        recovered: true,
        revertedTweak: diskRecord.tweakName,
      };
    } catch (err: any) {
      console.error('[AutoRevertWatchdog] Startup crash recovery rollback failed:', err);
      this.persistToDisk(null);
      return { recovered: false };
    }
  }

  /**
   * Returns current live state of watchdog
   */
  static getState(): { isArmed: boolean; record: PendingRevertRecord | null; remainingSeconds: number } {
    const record = this.activeRecord || this.readFromDisk();
    if (!record || record.status !== 'pending') {
      return { isArmed: false, record: null, remainingSeconds: 0 };
    }
    const remaining = Math.max(0, Math.ceil((record.expiresAt - Date.now()) / 1000));
    return {
      isArmed: remaining > 0,
      record,
      remainingSeconds: remaining,
    };
  }

  private static cancelTimerOnly(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
