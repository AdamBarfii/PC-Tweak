import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface SnapshotState {
  actionId: string;
  actionType: 'registry' | 'service' | 'scheduled_task' | 'command';
  originalValue: any;
  appliedValue: any;
  targetIdentifier: string;
  metadata: Record<string, any>;
}

export interface BackupRecord {
  id: string;
  timestamp: string;
  title: string;
  type: 'single_tweak' | 'batch' | 'profile_apply';
  tweakIds: string[];
  systemRestorePointId?: number;
  snapshots: SnapshotState[];
  status: 'active' | 'reverted';
}

export class BackupStore {
  private static filePath: string;

  private static getStoragePath(): string {
    if (!this.filePath) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'backups.json');
    }
    return this.filePath;
  }

  private static readAll(): BackupRecord[] {
    try {
      const filePath = this.getStoragePath();
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private static writeAll(records: BackupRecord[]): void {
    const filePath = this.getStoragePath();
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  }

  static listBackups(): BackupRecord[] {
    return this.readAll().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  static saveBackup(backup: BackupRecord): void {
    const all = this.readAll();
    all.unshift(backup);
    this.writeAll(all);
  }

  static getBackup(id: string): BackupRecord | undefined {
    return this.readAll().find((b) => b.id === id);
  }

  static updateStatus(id: string, status: 'active' | 'reverted'): void {
    const all = this.readAll();
    const target = all.find((b) => b.id === id);
    if (target) {
      target.status = status;
      this.writeAll(all);
    }
  }

  static deleteBackup(id: string): boolean {
    const all = this.readAll();
    const filtered = all.filter((b) => b.id !== id);
    this.writeAll(filtered);
    return true;
  }
}
