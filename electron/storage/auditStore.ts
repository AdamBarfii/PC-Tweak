import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface AuditRecord {
  id: string;
  timestamp: string;
  category: 'input' | 'system' | 'power' | 'network' | 'profile';
  action: string;
  details: string;
  reversible: boolean;
  reverted?: boolean;
}

export class AuditStore {
  private static filePath: string;

  private static getStoragePath(): string {
    if (!this.filePath) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'tweakAudit.json');
    }
    return this.filePath;
  }

  private static readAll(): AuditRecord[] {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) return [];
      const content = fs.readFileSync(p, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private static writeAll(records: AuditRecord[]): void {
    const p = this.getStoragePath();
    fs.writeFileSync(p, JSON.stringify(records, null, 2), 'utf8');
  }

  static listAudit(limit = 30): AuditRecord[] {
    const all = this.readAll();
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  static record(entry: Omit<AuditRecord, 'id' | 'timestamp'>): AuditRecord {
    const all = this.readAll();
    const newRecord: AuditRecord = {
      ...entry,
      id: `audit-${Date.now()}-${Math.floor(performance.now() * 1000)}`,
      timestamp: new Date().toISOString(),
    };
    all.unshift(newRecord);
    if (all.length > 200) {
      all.length = 200;
    }
    this.writeAll(all);
    return newRecord;
  }

  static markReverted(id: string): void {
    const all = this.readAll();
    const item = all.find((r) => r.id === id);
    if (item) {
      item.reverted = true;
      this.writeAll(all);
    }
  }
}
