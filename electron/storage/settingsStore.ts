import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface AppSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  language: 'en' | 'fa';
  hardwarePollingInterval: number; // 500 to 5000 ms
  autoUpdate: boolean;
  theme: 'dark' | 'light' | 'system';
}

export interface SettingsUpdateResult {
  success: boolean;
  settings: AppSettings;
  error?: string;
}

export interface ResetAppDataResult {
  success: boolean;
  clearedFiles: string[];
  error?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchOnStartup: false,
  minimizeToTray: true,
  closeToTray: true,
  language: 'en',
  hardwarePollingInterval: 1000,
  autoUpdate: true,
  theme: 'dark',
};

export const DEFAULT_APP_SETTINGS = DEFAULT_SETTINGS;

const VALID_THEMES: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];

export class SettingsStore {
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
      this.filePath = path.join(storageDir, 'settings.json');
    }
    return this.filePath;
  }

  public static sanitizeSettings(input: any): AppSettings {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ...DEFAULT_SETTINGS };
    }

    // Prototype pollution defense
    if (
      Object.prototype.hasOwnProperty.call(input, '__proto__') ||
      Object.prototype.hasOwnProperty.call(input, 'constructor') ||
      Object.prototype.hasOwnProperty.call(input, 'prototype')
    ) {
      return { ...DEFAULT_SETTINGS };
    }

    const rawVal = input.hardwarePollingInterval;
    let interval: number;
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === '' ||
      typeof rawVal === 'boolean' ||
      typeof rawVal === 'object' ||
      isNaN(Number(rawVal)) ||
      !isFinite(Number(rawVal))
    ) {
      interval = DEFAULT_SETTINGS.hardwarePollingInterval;
    } else {
      const num = Math.round(Number(rawVal));
      interval = Math.max(500, Math.min(5000, num));
    }

    const lang = typeof input.language === 'string' ? input.language.trim().toLowerCase() : '';
    const language: 'en' | 'fa' = lang === 'fa' ? 'fa' : 'en';

    const th = typeof input.theme === 'string' ? input.theme.trim().toLowerCase() : '';
    const theme: 'dark' | 'light' | 'system' = VALID_THEMES.includes(th as any)
      ? (th as 'dark' | 'light' | 'system')
      : DEFAULT_SETTINGS.theme;

    return {
      launchOnStartup: Boolean(input.launchOnStartup),
      minimizeToTray:
        input.minimizeToTray !== undefined ? Boolean(input.minimizeToTray) : DEFAULT_SETTINGS.minimizeToTray,
      closeToTray:
        input.closeToTray !== undefined ? Boolean(input.closeToTray) : DEFAULT_SETTINGS.closeToTray,
      language,
      hardwarePollingInterval: interval,
      autoUpdate:
        input.autoUpdate !== undefined ? Boolean(input.autoUpdate) : DEFAULT_SETTINGS.autoUpdate,
      theme,
    };
  }

  public static getSettings(): AppSettings {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) {
        return { ...DEFAULT_SETTINGS };
      }
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...DEFAULT_SETTINGS };
      }
      return this.sanitizeSettings(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private static saveSettings(settings: AppSettings): void {
    const p = this.getStoragePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf8');
  }

  public static updateSettings(partial: Partial<AppSettings> | any): SettingsUpdateResult {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      return {
        success: false,
        error: 'Invalid settings payload',
        settings: this.getSettings(),
      };
    }

    // Prototype pollution defense
    if (
      Object.prototype.hasOwnProperty.call(partial, '__proto__') ||
      Object.prototype.hasOwnProperty.call(partial, 'constructor') ||
      Object.prototype.hasOwnProperty.call(partial, 'prototype')
    ) {
      return {
        success: false,
        error: 'Malicious payload rejected (prototype pollution detected)',
        settings: this.getSettings(),
      };
    }

    const current = this.getSettings();
    const merged = {
      ...current,
      ...partial,
    };
    const sanitized = this.sanitizeSettings(merged);
    this.saveSettings(sanitized);
    return {
      success: true,
      settings: sanitized,
    };
  }

  public static resetToDefaults(): SettingsUpdateResult {
    const fresh = { ...DEFAULT_SETTINGS };
    this.saveSettings(fresh);
    return {
      success: true,
      settings: fresh,
    };
  }

  public static resetAppData(): ResetAppDataResult {
    const storageDir = path.dirname(this.getStoragePath());
    const clearedFiles: string[] = [];
    const targetFiles = ['profiles.json', 'settings.json', 'backups.json', 'tweakAudit.json'];

    for (const file of targetFiles) {
      const p = path.join(storageDir, file);
      if (fs.existsSync(p)) {
        try {
          if (file === 'settings.json') {
            fs.writeFileSync(p, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
          } else if (file === 'profiles.json') {
            fs.writeFileSync(p, JSON.stringify([], null, 2), 'utf8');
          } else {
            fs.unlinkSync(p);
          }
          clearedFiles.push(file);
        } catch (err) {
          console.error(`Failed to reset ${file}:`, err);
        }
      }
    }

    this.resetToDefaults();
    if (!clearedFiles.includes('settings.json')) {
      clearedFiles.push('settings.json');
    }

    return {
      success: true,
      clearedFiles,
    };
  }
}
