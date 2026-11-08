import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { app } from 'electron';
import { RegistryEngine, RegistryValueType } from './registry';
import { BackupStore, BackupRecord, SnapshotState } from '../storage/backupStore';
import { RestorePointEngine } from './restorePoint';
import { AntiCheatEngine } from './antiCheatEngine';
import { execFileWithTimeout } from '../processUtils';

export function getWindowsBuildNumber(): number {
  try {
    const rel = os.release();
    const parts = rel.split('.');
    if (parts.length >= 3) {
      return parseInt(parts[2], 10) || 0;
    }
  } catch {}
  return 0;
}

export const TWEAK_ID_ALIASES: Record<string, string> = {
  // Pointer Speed Neutral
  pointer_speed_neutral: 'mouse_neutral_pointer_speed',

  // USB Selective Suspend Off
  usb_selective_suspend_off: 'usb_disable_selective_suspend',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RegistryAction {
  type: 'registry';
  hive: 'HKLM' | 'HKCU';
  path: string;
  valueName: string;
  valueType: RegistryValueType;
  applyValue: string | number;
  revertValue: string | number | null;
}

export interface ServiceAction {
  type: 'service';
  serviceName: string;
  applyStartup: 'Disabled' | 'Manual' | 'Automatic';
  revertStartup: 'Disabled' | 'Manual' | 'Automatic';
  stopImmediately: boolean;
}

export interface ServiceStartInfo {
  exists: boolean;
  startValue?: number; // 2=Auto, 3=Manual, 4=Disabled
  startupType?: 'Automatic' | 'Manual' | 'Disabled';
}

export type TweakAction = RegistryAction | ServiceAction;

export interface TweakDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  category: 'system' | 'gaming' | 'network' | 'privacy' | 'advanced';
  impact: 'safe' | 'moderate' | 'advanced' | 'extreme';
  requiresReboot: boolean;
  minWindowsBuild?: number;
  maxWindowsBuild?: number;
  actions: TweakAction[];
  statusQuery: {
    type: 'registry' | 'service';
    checkAction: TweakAction;
  };
  warningKey?: string;
  anticheat?: 'safe' | 'caution' | 'blocked-risk';
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface TweakStatusItem extends TweakDefinition {
  isApplied: boolean;
  isSupported: boolean;
}

export class TweakEngine {
  private static tweaksCache: TweakDefinition[] = [];

  static getTweaksDir(): string {
    const candidates = [
      path.join(process.cwd(), 'data/tweaks'),
      path.join(__dirname, '../data/tweaks'),
      path.join(__dirname, '../../data/tweaks'),
      app ? path.join(app.getAppPath(), 'data/tweaks') : '',
      typeof process !== 'undefined' && process.resourcesPath
        ? path.join(process.resourcesPath, 'data/tweaks')
        : '',
    ];
    for (const dir of candidates) {
      if (dir && fs.existsSync(dir)) return dir;
    }
    return path.join(process.cwd(), 'data/tweaks');
  }

  /**
   * Loads all tweak JSON files from data/tweaks directory.
   */
  static loadAllTweaks(): TweakDefinition[] {
    const tweaksDir = this.getTweaksDir();
    if (!fs.existsSync(tweaksDir)) return [];

    const files = fs.readdirSync(tweaksDir).filter((f) => f.endsWith('.json'));
    const allTweaks: TweakDefinition[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tweaksDir, file), 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            // Default unclassified tweaks to 'caution'
            if (!item.anticheat) {
              item.anticheat = 'caution';
              item.anticheatNote = item.anticheatNote || 'Unclassified tweak. Use caution in competitive gaming.';
              item.affectedAntiCheats = item.affectedAntiCheats || [];
            }
            allTweaks.push(item);
          }
        }
      } catch (err) {
        console.error(`Failed to load tweaks from ${file}:`, err);
      }
    }

    this.tweaksCache = allTweaks;
    return allTweaks;
  }

  /**
   * Queries the current startup type of a Windows service via Registry (primary) or sc.exe qc (fallback).
   */
  static async getServiceStartType(serviceName: string): Promise<ServiceStartInfo> {
    // Fast direct registry query
    const regResult = await RegistryEngine.getValue(
      'HKLM',
      `SYSTEM\\CurrentControlSet\\Services\\${serviceName}`,
      'Start'
    );

    if (regResult.exists && typeof regResult.value === 'number') {
      const val = regResult.value;
      let startupType: 'Automatic' | 'Manual' | 'Disabled' | undefined;
      if (val === 2) startupType = 'Automatic';
      else if (val === 3) startupType = 'Manual';
      else if (val === 4) startupType = 'Disabled';
      if (startupType) {
        return { exists: true, startValue: val, startupType };
      }
    }

    // Fallback via sc.exe qc
    try {
      const { stdout } = await execFileWithTimeout('sc.exe', ['qc', serviceName], { timeout: 3000 });
      const match = stdout.match(/START_TYPE\s*:\s*(\d+)/i);
      if (match) {
        const code = parseInt(match[1], 10);
        let startupType: 'Automatic' | 'Manual' | 'Disabled' | undefined;
        if (code === 2) startupType = 'Automatic';
        else if (code === 3) startupType = 'Manual';
        else if (code === 4) startupType = 'Disabled';
        if (startupType) {
          return { exists: true, startValue: code, startupType };
        }
      }
    } catch {}

    return { exists: false };
  }

  /**
   * Configures the startup type of a service using sc.exe config.
   * Note: 'start=' and the value must be separate arguments.
   */
  static async configureService(
    serviceName: string,
    startup: 'Automatic' | 'Manual' | 'Disabled'
  ): Promise<boolean> {
    const scArg = startup === 'Automatic' ? 'auto' : startup === 'Manual' ? 'demand' : 'disabled';
    try {
      await execFileWithTimeout('sc.exe', ['config', serviceName, 'start=', scArg], { timeout: 5000 });
      return true;
    } catch (err: any) {
      console.error(`Failed to configure service ${serviceName} to ${startup}:`, err);
      return false;
    }
  }

  /**
   * Stops a service immediately if running.
   */
  static async stopService(serviceName: string): Promise<void> {
    try {
      await execFileWithTimeout('sc.exe', ['stop', serviceName], { timeout: 5000 });
    } catch (err: any) {
      const msg = err?.message || '';
      // Error 1062 = "The service has not been started."
      if (msg.includes('1062') || msg.toLowerCase().includes('not started')) {
        return;
      }
      console.warn(`Warning when stopping service ${serviceName}:`, err);
    }
  }

  /**
   * Starts a service.
   */
  static async startService(serviceName: string): Promise<void> {
    try {
      await execFileWithTimeout('sc.exe', ['start', serviceName], { timeout: 5000 });
    } catch (err: any) {
      const msg = err?.message || '';
      // Error 1056 = "An instance of the service is already running."
      if (msg.includes('1056') || msg.toLowerCase().includes('already running')) {
        return;
      }
      console.warn(`Warning when starting service ${serviceName}:`, err);
    }
  }

  /**
   * Queries the live state of a tweak action.
   */
  static async isActionApplied(action: TweakAction): Promise<boolean> {
    if (action.type === 'registry') {
      const result = await RegistryEngine.getValue(action.hive, action.path, action.valueName);
      if (!result.exists) {
        return false;
      }
      return result.value?.toString() === action.applyValue.toString();
    }
    if (action.type === 'service') {
      const result = await this.getServiceStartType(action.serviceName);
      if (!result.exists || !result.startupType) {
        return false;
      }
      return result.startupType === action.applyStartup;
    }
    return false;
  }

  static resolveCanonicalId(id: string): string {
    return TWEAK_ID_ALIASES[id] || id;
  }

  /**
   * Returns all tweaks with live status and OS build compatibility gating.
   */
  static async getTweaksWithStatus(category?: string): Promise<TweakStatusItem[]> {
    const tweaks = this.loadAllTweaks();
    const filtered = category && category !== 'all'
      ? tweaks.filter((t) => t.category === category)
      : tweaks;

    const currentBuild = getWindowsBuildNumber();
    const results: TweakStatusItem[] = [];

    for (const tweak of filtered) {
      const isApplied = await this.isActionApplied(tweak.statusQuery.checkAction);
      const isSupported =
        (!tweak.minWindowsBuild || currentBuild === 0 || currentBuild >= tweak.minWindowsBuild) &&
        (!tweak.maxWindowsBuild || currentBuild === 0 || currentBuild <= tweak.maxWindowsBuild);

      results.push({
        ...tweak,
        isApplied,
        isSupported,
      });
    }

    return results;
  }

  /**
   * Applies a single tweak and saves a snapshot for rollback.
   */
  static async applyTweak(tweakId: string): Promise<{ success: boolean; requiresReboot: boolean; error?: string }> {
    if (tweakId === 'game_mode_on_dvr_off') {
      const res1 = await this.applyTweak('enable_game_mode');
      const res2 = await this.applyTweak('disable_game_dvr');
      return {
        success: res1.success && res2.success,
        requiresReboot: res1.requiresReboot || res2.requiresReboot,
        error: res1.error || res2.error,
      };
    }

    const canonicalId = this.resolveCanonicalId(tweakId);
    const tweaks = this.loadAllTweaks();
    const tweak = tweaks.find((t) => t.id === canonicalId || t.id === tweakId);
    if (!tweak) {
      return { success: false, requiresReboot: false, error: `Tweak not found: ${tweakId}` };
    }

    // OS Build Gating
    const currentBuild = getWindowsBuildNumber();
    if (tweak.minWindowsBuild && currentBuild > 0 && currentBuild < tweak.minWindowsBuild) {
      return {
        success: false,
        requiresReboot: false,
        error: `Tweak '${tweak.id}' requires Windows build >= ${tweak.minWindowsBuild} (detected: ${currentBuild}).`,
      };
    }
    if (tweak.maxWindowsBuild && currentBuild > 0 && currentBuild > tweak.maxWindowsBuild) {
      return {
        success: false,
        requiresReboot: false,
        error: `Tweak '${tweak.id}' requires Windows build <= ${tweak.maxWindowsBuild} (detected: ${currentBuild}).`,
      };
    }

    // Competitive-Safe Guardrail: Block dangerous tweaks when active
    if (AntiCheatEngine.isCompetitiveSafeActive() && tweak.anticheat === 'blocked-risk') {
      return {
        success: false,
        requiresReboot: false,
        error: `Tweak '${tweak.id}' is blocked because Competitive-Safe mode is active. Reason: ${tweak.anticheatNote || 'Violates anti-cheat requirements.'}`,
      };
    }

    const snapshots: SnapshotState[] = [];
    const appliedActions: { action: TweakAction; snapshot: SnapshotState }[] = [];

    try {
      for (const action of tweak.actions) {
        if (action.type === 'registry') {
          const original = await RegistryEngine.getValue(action.hive, action.path, action.valueName);
          const snapshot: SnapshotState = {
            actionId: `${action.hive}\\${action.path}\\${action.valueName}`,
            actionType: 'registry',
            originalValue: original,
            appliedValue: action.applyValue,
            targetIdentifier: `${action.hive}\\${action.path}\\${action.valueName}`,
            metadata: {
              hive: action.hive,
              path: action.path,
              valueName: action.valueName,
              valueType: action.valueType,
            },
          };
          snapshots.push(snapshot);

          const ok = await RegistryEngine.setValue(
            action.hive,
            action.path,
            action.valueName,
            action.valueType,
            action.applyValue
          );

          if (!ok) {
            throw new Error(`Failed to write registry value: ${action.valueName} at ${action.path}`);
          }

          appliedActions.push({ action, snapshot });
        } else if (action.type === 'service') {
          const original = await this.getServiceStartType(action.serviceName);
          const snapshot: SnapshotState = {
            actionId: `service\\${action.serviceName}`,
            actionType: 'service',
            originalValue: original.exists ? original.startupType : null,
            appliedValue: action.applyStartup,
            targetIdentifier: `service\\${action.serviceName}`,
            metadata: {
              serviceName: action.serviceName,
              applyStartup: action.applyStartup,
              revertStartup: action.revertStartup,
              stopImmediately: action.stopImmediately,
              originalStartValue: original.startValue,
            },
          };
          snapshots.push(snapshot);

          const ok = await this.configureService(action.serviceName, action.applyStartup);
          if (!ok) {
            throw new Error(`Failed to configure service: ${action.serviceName} to ${action.applyStartup}`);
          }

          if (action.stopImmediately) {
            await this.stopService(action.serviceName);
          }

          appliedActions.push({ action, snapshot });
        }
      }
    } catch (err: any) {
      // Transactional Rollback: Revert all actions that were successfully applied before the failure
      console.error(`Apply failed for tweak '${tweakId}'. Rolling back ${appliedActions.length} applied actions...`, err);
      for (const applied of appliedActions.reverse()) {
        try {
          if (applied.action.type === 'registry') {
            const orig = applied.snapshot.originalValue;
            if (orig && orig.exists) {
              await RegistryEngine.setValue(
                applied.action.hive,
                applied.action.path,
                applied.action.valueName,
                applied.action.valueType,
                orig.value
              );
            } else {
              await RegistryEngine.deleteValue(
                applied.action.hive,
                applied.action.path,
                applied.action.valueName
              );
            }
          } else if (applied.action.type === 'service') {
            const origStartup = applied.snapshot.originalValue;
            if (origStartup) {
              await this.configureService(applied.action.serviceName, origStartup);
              if (origStartup === 'Automatic') {
                await this.startService(applied.action.serviceName);
              }
            } else {
              await this.configureService(applied.action.serviceName, applied.action.revertStartup);
            }
          }
        } catch (rollbackErr) {
          console.error('Secondary error during transactional rollback:', rollbackErr);
        }
      }

      return {
        success: false,
        requiresReboot: false,
        error: `Transaction failed: ${err.message || 'Write error'}. Reverted changes cleanly.`,
      };
    }

    // Save backup record
    const backupRecord: BackupRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      title: `Applied tweak: ${tweak.id}`,
      type: 'single_tweak',
      tweakIds: [tweak.id],
      snapshots,
      status: 'active',
    };
    BackupStore.saveBackup(backupRecord);

    return { success: true, requiresReboot: tweak.requiresReboot };
  }

  /**
   * Reverts a single tweak back to default/original state.
   * Priority: Restores exact pre-tweak snapshot from BackupStore if found.
   * Fallback: Restores JSON defined default revertValue.
   */
  static async revertTweak(tweakId: string): Promise<{ success: boolean; requiresReboot: boolean; error?: string }> {
    if (tweakId === 'game_mode_on_dvr_off') {
      const res1 = await this.revertTweak('enable_game_mode');
      const res2 = await this.revertTweak('disable_game_dvr');
      return {
        success: res1.success && res2.success,
        requiresReboot: res1.requiresReboot || res2.requiresReboot,
        error: res1.error || res2.error,
      };
    }

    const canonicalId = this.resolveCanonicalId(tweakId);
    const tweaks = this.loadAllTweaks();
    const tweak = tweaks.find((t) => t.id === canonicalId || t.id === tweakId);
    if (!tweak) {
      return { success: false, requiresReboot: false, error: `Tweak not found: ${tweakId}` };
    }

    // Look for active backup snapshot recorded for this tweak
    const backups = BackupStore.listBackups();
    const activeBackup = backups.find(
      (b) => b.status === 'active' && b.tweakIds && (b.tweakIds.includes(tweak.id) || b.tweakIds.includes(tweakId))
    );

    for (const action of tweak.actions) {
      if (action.type === 'registry') {
        const matchingSnapshot = activeBackup?.snapshots.find(
          (s) =>
            s.actionType === 'registry' &&
            s.metadata?.hive === action.hive &&
            s.metadata?.path === action.path &&
            s.metadata?.valueName === action.valueName
        );

        if (matchingSnapshot) {
          // Restore exact pre-tweak state
          const orig = matchingSnapshot.originalValue;
          if (orig && orig.exists) {
            await RegistryEngine.setValue(
              action.hive,
              action.path,
              action.valueName,
              action.valueType,
              orig.value
            );
          } else {
            await RegistryEngine.deleteValue(action.hive, action.path, action.valueName);
          }
        } else {
          // Fallback to static JSON revertValue
          if (action.revertValue === null) {
            await RegistryEngine.deleteValue(action.hive, action.path, action.valueName);
          } else {
            await RegistryEngine.setValue(
              action.hive,
              action.path,
              action.valueName,
              action.valueType,
              action.revertValue
            );
          }
        }
      } else if (action.type === 'service') {
        const matchingSnapshot = activeBackup?.snapshots.find(
          (s) =>
            s.actionType === 'service' &&
            (s.metadata?.serviceName === action.serviceName || s.targetIdentifier === `service\\${action.serviceName}`)
        );

        const targetStartup: 'Automatic' | 'Manual' | 'Disabled' =
          matchingSnapshot?.originalValue || action.revertStartup;

        await this.configureService(action.serviceName, targetStartup);
        if (targetStartup === 'Automatic') {
          await this.startService(action.serviceName);
        }
      }
    }

    if (activeBackup) {
      BackupStore.updateStatus(activeBackup.id, 'reverted');
    }

    return { success: true, requiresReboot: tweak.requiresReboot };
  }

  /**
   * Restores an atomic backup record.
   */
  static async restoreBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
    const record = BackupStore.getBackup(backupId);
    if (!record) {
      return { success: false, error: 'Backup record not found' };
    }

    for (const snapshot of record.snapshots) {
      if (snapshot.actionType === 'registry') {
        const { hive, path, valueName, valueType } = snapshot.metadata;
        const orig = snapshot.originalValue;

        if (orig && orig.exists) {
          await RegistryEngine.setValue(hive, path, valueName, valueType, orig.value);
        } else {
          await RegistryEngine.deleteValue(hive, path, valueName);
        }
      } else if (snapshot.actionType === 'service') {
        const serviceName = snapshot.metadata?.serviceName || snapshot.targetIdentifier.replace('service\\', '');
        const targetStartup: 'Automatic' | 'Manual' | 'Disabled' = snapshot.originalValue;
        if (serviceName && targetStartup) {
          await this.configureService(serviceName, targetStartup);
          if (targetStartup === 'Automatic') {
            await this.startService(serviceName);
          }
        }
      }
    }

    BackupStore.updateStatus(backupId, 'reverted');
    return { success: true };
  }

  /**
   * Batch applies multiple tweaks with optional System Restore Point.
   */
  static async batchApply(
    tweakIds: string[],
    createRestorePoint: boolean
  ): Promise<{ success: boolean; count: number; backupId?: string }> {
    if (createRestorePoint) {
      await RestorePointEngine.createRestorePoint('PC Tweak Batch Optimization');
    }

    let appliedCount = 0;
    const allSnapshots: SnapshotState[] = [];

    for (const id of tweakIds) {
      const res = await this.applyTweak(id);
      if (res.success) {
        appliedCount++;
      }
    }

    return { success: appliedCount === tweakIds.length, count: appliedCount };
  }
}
