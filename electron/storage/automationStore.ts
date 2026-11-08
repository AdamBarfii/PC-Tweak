/**
 * PC Tweak - Automation Store
 * 
 * Persists automation trigger configuration, schedules, and background maintenance execution logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface AutomationConfig {
  masterEnabled: boolean;
  notifyOnAutoAction: boolean;
  autoTrimRam: {
    enabled: boolean;
    thresholdPercent: number;
    cooldownMinutes: number;
    trimOnGameExit: boolean;
  };
  autoCleanDisk: {
    enabled: boolean;
    thresholdMb: number;
    frequency: 'threshold_only' | 'daily' | 'weekly';
    categories: string[];
  };
  autoTrimSsd: {
    enabled: boolean;
    frequencyDays: number;
    lastRunTimestamp?: string;
  };
  autoGameBoost: {
    enabled: boolean;
    powerPlanSwitch: boolean;
    throttleBackground: boolean;
    trimRamOnLaunch: boolean;
  };
  autoTelemetrySentinel: {
    enabled: boolean;
    autoDisableOnDetect: boolean;
  };
}

export interface AutomationLogEntry {
  id: string;
  timestamp: string;
  type: 'ram_trim' | 'disk_clean' | 'ssd_trim' | 'game_boost' | 'telemetry_silenced';
  title: string;
  detail: string;
  reclaimedBytes?: number;
}

export interface AutomationDataFile {
  config: AutomationConfig;
  logs: AutomationLogEntry[];
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  masterEnabled: false,
  notifyOnAutoAction: false,
  autoTrimRam: {
    enabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    trimOnGameExit: true,
  },
  autoCleanDisk: {
    enabled: true,
    thresholdMb: 2048,
    frequency: 'threshold_only',
    categories: ['user_temp', 'system_temp', 'crash_dumps_wer', 'directx_shader_cache'],
  },
  autoTrimSsd: {
    enabled: true,
    frequencyDays: 7,
  },
  autoGameBoost: {
    enabled: true,
    powerPlanSwitch: true,
    throttleBackground: true,
    trimRamOnLaunch: true,
  },
  autoTelemetrySentinel: {
    enabled: true,
    autoDisableOnDetect: true,
  },
};

export class AutomationStore {
  private static filePath: string = '';

  public static setStoragePathForTesting(customPath?: string): void {
    this.filePath = customPath || '';
  }

  private static getStoragePath(): string {
    if (!this.filePath) {
      let userDataDir = process.cwd();
      try {
        if (app && typeof app.getPath === 'function') {
          userDataDir = app.getPath('userData');
        }
      } catch {
        userDataDir = process.cwd();
      }
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'automation.json');
    }
    return this.filePath;
  }

  private static readData(): AutomationDataFile {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) {
        return {
          config: { ...DEFAULT_AUTOMATION_CONFIG },
          logs: [],
        };
      }
      const content = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(content);
      return {
        config: { ...DEFAULT_AUTOMATION_CONFIG, ...(parsed.config || {}) },
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    } catch {
      return {
        config: { ...DEFAULT_AUTOMATION_CONFIG },
        logs: [],
      };
    }
  }

  private static writeData(data: AutomationDataFile): void {
    try {
      const p = this.getStoragePath();
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write automation store:', err);
    }
  }

  public static getConfig(): AutomationConfig {
    return this.readData().config;
  }

  public static updateConfig(partial: Partial<AutomationConfig>): { success: boolean; config: AutomationConfig } {
    const data = this.readData();
    data.config = {
      ...data.config,
      ...partial,
      autoTrimRam: { ...data.config.autoTrimRam, ...(partial.autoTrimRam || {}) },
      autoCleanDisk: { ...data.config.autoCleanDisk, ...(partial.autoCleanDisk || {}) },
      autoTrimSsd: { ...data.config.autoTrimSsd, ...(partial.autoTrimSsd || {}) },
      autoGameBoost: { ...data.config.autoGameBoost, ...(partial.autoGameBoost || {}) },
      autoTelemetrySentinel: { ...data.config.autoTelemetrySentinel, ...(partial.autoTelemetrySentinel || {}) },
    };
    this.writeData(data);
    return { success: true, config: data.config };
  }

  public static getLogs(limit: number = 50): AutomationLogEntry[] {
    const data = this.readData();
    return data.logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Math.min(200, Math.max(1, limit)));
  }

  public static addLog(entry: Omit<AutomationLogEntry, 'id' | 'timestamp'>): AutomationLogEntry {
    const data = this.readData();
    const newEntry: AutomationLogEntry = {
      id: `autolog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    data.logs.unshift(newEntry);
    // Keep max 200 log entries
    if (data.logs.length > 200) {
      data.logs = data.logs.slice(0, 200);
    }
    this.writeData(data);
    return newEntry;
  }

  public static clearLogs(): { success: boolean } {
    const data = this.readData();
    data.logs = [];
    this.writeData(data);
    return { success: true };
  }
}
