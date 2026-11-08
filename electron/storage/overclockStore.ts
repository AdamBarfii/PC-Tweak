import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { OverclockProfile } from '../../src/types/electron';

export interface OverclockStorageData {
  profiles: OverclockProfile[];
  activeProfileId: string;
  peakTempRecorded: number;
  tdrEventsDetected: number;
  rollbackCount: number;
  lastTunedTimestamp?: string;
}

const DEFAULT_PROFILES: OverclockProfile[] = [
  {
    id: 'stock',
    name: 'Factory Stock Defaults',
    coreOffsetMhz: 0,
    memOffsetMhz: 0,
    powerLimitPct: 100,
    fanSpeedPct: 0,
    isStock: true,
    stabilityScore: 100,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-safe',
    name: 'Safe Daily Boost (+30 / +100)',
    coreOffsetMhz: 30,
    memOffsetMhz: 100,
    powerLimitPct: 100,
    fanSpeedPct: 0,
    isStock: false,
    stabilityScore: 99,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-gaming',
    name: 'Esports Peak (+60 / +200)',
    coreOffsetMhz: 60,
    memOffsetMhz: 200,
    powerLimitPct: 103,
    fanSpeedPct: 65,
    isStock: false,
    stabilityScore: 98,
    createdAt: new Date().toISOString(),
  },
];

export class OverclockStore {
  private static filePath: string;
  private static customStoragePath: string | null = null;

  static setStoragePathForTesting(customPath: string | null): void {
    this.customStoragePath = customPath;
    this.filePath = customPath || '';
  }

  private static getStoragePath(): string {
    if (this.customStoragePath) {
      const dir = path.dirname(this.customStoragePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return this.customStoragePath;
    }
    if (!this.filePath) {
      const userDataDir = typeof app !== 'undefined' && app && app.getPath
        ? app.getPath('userData')
        : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'overclockData.json');
    }
    return this.filePath;
  }

  private static readData(): OverclockStorageData {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) {
        return {
          profiles: [...DEFAULT_PROFILES],
          activeProfileId: 'stock',
          peakTempRecorded: 0,
          tdrEventsDetected: 0,
          rollbackCount: 0,
        };
      }
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.profiles) || data.profiles.length === 0) {
        data.profiles = [...DEFAULT_PROFILES];
      }
      return data;
    } catch {
      return {
        profiles: [...DEFAULT_PROFILES],
        activeProfileId: 'stock',
        peakTempRecorded: 0,
        tdrEventsDetected: 0,
        rollbackCount: 0,
      };
    }
  }

  private static writeData(data: OverclockStorageData): void {
    try {
      const p = this.getStoragePath();
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write overclock store:', err);
    }
  }

  static listProfiles(): OverclockProfile[] {
    return this.readData().profiles;
  }

  static getActiveProfileId(): string {
    return this.readData().activeProfileId || 'stock';
  }

  static setActiveProfileId(id: string): void {
    const data = this.readData();
    data.activeProfileId = id;
    this.writeData(data);
  }

  static saveProfile(profile: Omit<OverclockProfile, 'id' | 'createdAt'>): OverclockProfile {
    const data = this.readData();
    const newProfile: OverclockProfile = {
      ...profile,
      id: `oc-prof-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    data.profiles.push(newProfile);
    this.writeData(data);
    return newProfile;
  }

  static deleteProfile(id: string): boolean {
    if (id === 'stock') return false; // Factory stock is protected
    const data = this.readData();
    const initLen = data.profiles.length;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    if (data.profiles.length !== initLen) {
      if (data.activeProfileId === id) {
        data.activeProfileId = 'stock';
      }
      this.writeData(data);
      return true;
    }
    return false;
  }

  static getStats(): {
    peakTempRecorded: number;
    tdrEventsDetected: number;
    rollbackCount: number;
    lastTunedTimestamp?: string;
  } {
    const d = this.readData();
    return {
      peakTempRecorded: d.peakTempRecorded || 0,
      tdrEventsDetected: d.tdrEventsDetected || 0,
      rollbackCount: d.rollbackCount || 0,
      lastTunedTimestamp: d.lastTunedTimestamp,
    };
  }

  static recordPeakTemp(temp: number): void {
    if (temp <= 0) return;
    const data = this.readData();
    if (!data.peakTempRecorded || temp > data.peakTempRecorded) {
      data.peakTempRecorded = Math.round(temp);
      this.writeData(data);
    }
  }

  static recordRollback(): void {
    const data = this.readData();
    data.rollbackCount = (data.rollbackCount || 0) + 1;
    data.activeProfileId = 'stock';
    this.writeData(data);
  }

  static recordTdrEvent(): void {
    const data = this.readData();
    data.tdrEventsDetected = (data.tdrEventsDetected || 0) + 1;
    this.writeData(data);
  }

  static recordTuningSession(): void {
    const data = this.readData();
    data.lastTunedTimestamp = new Date().toISOString();
    this.writeData(data);
  }
}
