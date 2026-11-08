import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';

export type TuningProfileCategory = 'esports' | 'streaming' | 'battery' | 'default' | 'custom';

export interface TuningProfileMouseSettings {
  pointerSpeed: number; // 1 to 11 (6 is neutral 1:1, 10 in Windows registry)
  enhancePointerAccuracy: boolean;
  disableAcceleration: boolean;
  disableTrails?: boolean;
  rawInputMode?: boolean;
  scrollSpeed?: number;
  doubleClickSpeed?: number;
  pointerPrecision?: boolean;
  improveScrollSmoothness?: boolean;
  smartSensitivity?: boolean;
}

export interface TuningProfileDirectXSettings {
  flipModel?: boolean;
  maxFrameLatency?: boolean;
  shaderCacheBoost?: boolean;
  tdrDelay?: boolean;
}

export interface TuningProfile {
  id: string;
  name: string;
  category: TuningProfileCategory;
  description: string;
  isBuiltIn: boolean;
  createdAt: string;
  tweakIds: string[];
  directX?: TuningProfileDirectXSettings;
  mouseSettings?: TuningProfileMouseSettings;
  keyboardTweaks?: string[];
  gameTag?: 'CS2' | 'VALORANT' | 'APEX' | 'OVERWATCH' | 'CUSTOM' | string;
}

// 100% Backwards-compatible alias for existing consumers
export type GameInputProfile = TuningProfile;

export const BUILT_IN_PROFILES: TuningProfile[] = [
  {
    id: 'esports_competitive',
    name: 'Esports Competitive',
    category: 'esports',
    description: 'Ultra-low input latency preset engineered for tournament shooter play: 1:1 raw unaccelerated mouse tracking, maximum keyboard repeat rate, timer resolution optimization, and Game Mode prioritized.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    tweakIds: [
      'enable_game_mode',
      'disable_game_dvr',
      'windowed_optimizations_win11',
      'mouse_disable_acceleration',
      'mouse_neutral_pointer_speed',
      'mouse_disable_trails_and_shadow',
      'keyboard_repeat_rate_max',
      'keyboard_disable_filter_keys',
      'keyboard_disable_sticky_toggle_keys',
      'timer_resolution_global',
    ],
    directX: {
      flipModel: true,
      maxFrameLatency: true,
      shaderCacheBoost: true,
    },
    mouseSettings: {
      pointerSpeed: 6, // 1:1 neutral (Sensitivity 10)
      enhancePointerAccuracy: false,
      disableAcceleration: true,
      disableTrails: true,
      scrollSpeed: 3,
      doubleClickSpeed: 550,
      pointerPrecision: false,
      rawInputMode: true,
      improveScrollSmoothness: true,
      smartSensitivity: false,
    },
    keyboardTweaks: [
      'keyboard_repeat_rate_max',
      'keyboard_disable_filter_keys',
      'keyboard_disable_sticky_toggle_keys',
    ],
  },
  {
    id: 'streaming_content',
    name: 'Streaming & Content Creation',
    category: 'streaming',
    description: 'Optimized for high-bitrate OBS broadcasting, NVENC encoding, and multi-monitor capture without frame drops while preserving input precision.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    tweakIds: [
      'enable_game_mode',
      'windowed_optimizations_win11',
      'mouse_disable_acceleration',
      'mouse_neutral_pointer_speed',
      'keyboard_repeat_rate_max',
      'keyboard_disable_sticky_toggle_keys',
    ],
    directX: {
      flipModel: true,
      maxFrameLatency: false,
      shaderCacheBoost: true,
    },
    mouseSettings: {
      pointerSpeed: 6,
      enhancePointerAccuracy: false,
      disableAcceleration: true,
      disableTrails: true,
      scrollSpeed: 3,
      doubleClickSpeed: 550,
      pointerPrecision: false,
      rawInputMode: true,
      improveScrollSmoothness: true,
      smartSensitivity: false,
    },
    keyboardTweaks: [
      'keyboard_repeat_rate_max',
      'keyboard_disable_sticky_toggle_keys',
    ],
  },
  {
    id: 'max_battery_quiet',
    name: 'Maximum Battery / Quiet',
    category: 'battery',
    description: 'Energy efficiency and acoustic profile: suspends telemetry background daemons, enables USB selective suspend, and eliminates unwanted OS wakeups.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    tweakIds: [
      'disable_telemetry',
      'disable_wer',
      'disable_activity_history',
      'usb_disable_selective_suspend',
    ],
    directX: {
      flipModel: false,
      maxFrameLatency: false,
      shaderCacheBoost: false,
    },
    mouseSettings: {
      pointerSpeed: 6,
      enhancePointerAccuracy: true,
      disableAcceleration: false,
      disableTrails: false,
      scrollSpeed: 3,
      doubleClickSpeed: 550,
      pointerPrecision: true,
      rawInputMode: false,
      improveScrollSmoothness: false,
      smartSensitivity: false,
    },
    keyboardTweaks: [],
  },
  {
    id: 'windows_default',
    name: 'Windows Default / Revert All',
    category: 'default',
    description: 'Restores official Microsoft Windows defaults: re-enables standard mouse curves, resets pointer sensitivity, and re-enables default background subsystems.',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    tweakIds: [],
    directX: {
      flipModel: false,
      maxFrameLatency: false,
      shaderCacheBoost: false,
    },
    mouseSettings: {
      pointerSpeed: 6,
      enhancePointerAccuracy: true,
      disableAcceleration: false,
      disableTrails: false,
      scrollSpeed: 3,
      doubleClickSpeed: 550,
      pointerPrecision: true,
      rawInputMode: false,
      improveScrollSmoothness: false,
      smartSensitivity: false,
    },
    keyboardTweaks: [],
  },
];

export interface ProfileExportEnvelope {
  format: string;
  schemaVersion: number;
  formatVersion?: number;
  app: string;
  exportedAt: string;
  profile: TuningProfile;
}

export class ProfileStore {
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
      this.filePath = path.join(storageDir, 'profiles.json');
    }
    return this.filePath;
  }

  static getAllProfiles(): TuningProfile[] {
    try {
      const filePath = this.getStoragePath();
      const getClonedBuiltIns = (): TuningProfile[] => JSON.parse(JSON.stringify(BUILT_IN_PROFILES));
      if (!fs.existsSync(filePath)) {
        this.saveCustomProfiles([]);
        return getClonedBuiltIns();
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const customList = JSON.parse(raw);
      if (!Array.isArray(customList)) {
        return getClonedBuiltIns();
      }
      const validCustomList = customList.filter(
        (p): p is TuningProfile => Boolean(p && typeof p === 'object' && typeof p.id === 'string')
      );
      return [...getClonedBuiltIns(), ...validCustomList];
    } catch {
      return JSON.parse(JSON.stringify(BUILT_IN_PROFILES));
    }
  }

  static getProfileById(profileId: string): TuningProfile | undefined {
    return this.getAllProfiles().find((p) => p.id === profileId);
  }

  private static saveCustomProfiles(profiles: TuningProfile[]): void {
    const filePath = this.getStoragePath();
    const storageDir = path.dirname(filePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf8');
  }

  static saveProfile(profile: TuningProfile): { success: boolean; id: string; error?: string } {
    if (BUILT_IN_PROFILES.some((p) => p.id === profile.id) || profile.isBuiltIn) {
      return { success: false, id: profile.id, error: 'Cannot modify or overwrite built-in preset.' };
    }

    if (!profile.name || typeof profile.name !== 'string' || !profile.name.trim()) {
      return { success: false, id: profile.id || '', error: 'Profile name is required.' };
    }

    const id = profile.id || `custom_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const sanitizedProfile: TuningProfile = {
      ...profile,
      id,
      name: profile.name.trim(),
      category: profile.category || 'custom',
      description: profile.description || '',
      isBuiltIn: false,
      createdAt: profile.createdAt || new Date().toISOString(),
      tweakIds: Array.isArray(profile.tweakIds) ? profile.tweakIds : [],
      directX: profile.directX || {},
      mouseSettings: profile.mouseSettings || {
        pointerSpeed: 6,
        enhancePointerAccuracy: false,
        disableAcceleration: true,
        disableTrails: true,
        scrollSpeed: 3,
        doubleClickSpeed: 550,
      },
      keyboardTweaks: Array.isArray(profile.keyboardTweaks) ? profile.keyboardTweaks : [],
    };

    const customList = this.getAllProfiles().filter((p) => !p.isBuiltIn);
    const existingIndex = customList.findIndex((p) => p.id === id);
    if (existingIndex >= 0) {
      customList[existingIndex] = sanitizedProfile;
    } else {
      customList.push(sanitizedProfile);
    }

    this.saveCustomProfiles(customList);
    return { success: true, id };
  }

  static deleteProfile(profileId: string): { success: boolean; error?: string } {
    if (BUILT_IN_PROFILES.some((p) => p.id === profileId)) {
      return { success: false, error: 'Cannot delete built-in preset.' };
    }

    const customList = this.getAllProfiles().filter((p) => !p.isBuiltIn);
    const initialLength = customList.length;
    const filtered = customList.filter((p) => p.id !== profileId);
    if (filtered.length === initialLength) {
      return { success: false, error: 'Profile not found.' };
    }
    this.saveCustomProfiles(filtered);
    return { success: true };
  }

  static exportProfileToJson(profile: TuningProfile): string {
    const envelope: ProfileExportEnvelope = {
      format: 'pctweak-profile',
      schemaVersion: 1,
      formatVersion: 1,
      app: 'PC Tweak',
      exportedAt: new Date().toISOString(),
      profile: {
        ...profile,
        isBuiltIn: false,
      },
    };
    return JSON.stringify(envelope, null, 2);
  }

  static exportProfile(profile: TuningProfile): string {
    return this.exportProfileToJson(profile);
  }

  static validateProfile(data: any): { valid: boolean; profile?: TuningProfile; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Profile data must be a JSON object.' };
    }

    // Prototype pollution guards
    if (
      Object.prototype.hasOwnProperty.call(data, '__proto__') ||
      Object.prototype.hasOwnProperty.call(data, 'constructor') ||
      Object.prototype.hasOwnProperty.call(data, 'prototype')
    ) {
      return { valid: false, error: 'Malicious payload rejected (prototype pollution detected)' };
    }

    const target: any = data.format === 'pctweak-profile' && data.profile ? data.profile : data.profile && typeof data.profile === 'object' ? data.profile : data;

    if (!target || typeof target !== 'object') {
      return { valid: false, error: 'Malformed profile payload' };
    }

    if (
      Object.prototype.hasOwnProperty.call(target, '__proto__') ||
      Object.prototype.hasOwnProperty.call(target, 'constructor') ||
      Object.prototype.hasOwnProperty.call(target, 'prototype')
    ) {
      return { valid: false, error: 'Malicious payload rejected (prototype pollution detected)' };
    }

    if (!target.name || typeof target.name !== 'string' || !target.name.trim()) {
      return { valid: false, error: 'Profile name is required' };
    }

    if (!target.mouseSettings || typeof target.mouseSettings !== 'object') {
      return { valid: false, error: 'Profile mouseSettings object is required' };
    }

    if (target.tweakIds !== undefined && !Array.isArray(target.tweakIds)) {
      return { valid: false, error: 'Profile tweakIds must be an array' };
    }

    // Pointer speed validation & clamping (1-11)
    let speed = target.mouseSettings.pointerSpeed;
    if (typeof speed !== 'number' || isNaN(speed)) {
      speed = 6;
    }
    speed = Math.max(1, Math.min(11, speed));

    // ID Collision Guard: Never allow imported profile to claim an existing profile ID (built-in or custom)
    const allProfiles = this.getAllProfiles();
    const existingIds = new Set(allProfiles.map((p) => p.id));
    const randomSuffix = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : crypto.randomBytes(4).toString('hex');
    let finalId = target.id || `custom_${Date.now()}_${randomSuffix}`;
    if (existingIds.has(finalId)) {
      finalId = `${finalId}_imported_${randomSuffix}`;
    }

    const validCategories: TuningProfileCategory[] = ['esports', 'streaming', 'battery', 'default', 'custom'];
    const category: TuningProfileCategory = validCategories.includes(target.category) ? target.category : 'custom';

    // Sanitize script/path injection in tweak IDs
    const safeTweakIds = Array.isArray(target.tweakIds)
      ? target.tweakIds.filter((id: any) => typeof id === 'string' && /^[a-z0-9_]+$/.test(id)).map(String)
      : [];

    const cleanProfile: TuningProfile = {
      id: finalId,
      name: String(target.name).trim(),
      category,
      description: typeof target.description === 'string' ? target.description : 'Imported user tuning profile',
      isBuiltIn: false, // Strict override
      createdAt: typeof target.createdAt === 'string' ? target.createdAt : new Date().toISOString(),
      tweakIds: safeTweakIds,
      directX: target.directX && typeof target.directX === 'object' ? {
        flipModel: Boolean(target.directX.flipModel),
        maxFrameLatency: Boolean(target.directX.maxFrameLatency),
        shaderCacheBoost: Boolean(target.directX.shaderCacheBoost),
        tdrDelay: Boolean(target.directX.tdrDelay),
      } : {},
      mouseSettings: {
        pointerSpeed: speed,
        enhancePointerAccuracy: Boolean(target.mouseSettings.enhancePointerAccuracy),
        disableAcceleration: Boolean(target.mouseSettings.disableAcceleration),
        rawInputMode: Boolean(target.mouseSettings.rawInputMode),
        disableTrails: target.mouseSettings.disableTrails !== undefined ? Boolean(target.mouseSettings.disableTrails) : true,
        scrollSpeed: Number.isFinite(target.mouseSettings.scrollSpeed) ? target.mouseSettings.scrollSpeed : 3,
        doubleClickSpeed: Number.isFinite(target.mouseSettings.doubleClickSpeed) ? target.mouseSettings.doubleClickSpeed : 550,
        pointerPrecision: Boolean(target.mouseSettings.pointerPrecision),
        improveScrollSmoothness: Boolean(target.mouseSettings.improveScrollSmoothness),
        smartSensitivity: Boolean(target.mouseSettings.smartSensitivity),
      },
      keyboardTweaks: Array.isArray(target.keyboardTweaks) ? target.keyboardTweaks.map(String) : [],
      gameTag: target.gameTag ? String(target.gameTag) : undefined,
    };

    return { valid: true, profile: cleanProfile };
  }

  static importProfileFromJson(jsonContent: string): { success: boolean; profile?: TuningProfile; error?: string } {
    try {
      if (typeof jsonContent !== 'string') {
        return { success: false, error: 'Invalid JSON format' };
      }
      const parsed = JSON.parse(jsonContent);
      const validation = this.validateProfile(parsed);
      if (!validation.valid || !validation.profile) {
        return { success: false, error: validation.error || 'Invalid profile structure.' };
      }
      this.saveProfile(validation.profile);
      return { success: true, profile: validation.profile };
    } catch (err: any) {
      return { success: false, error: `Invalid JSON format: ${err.message}` };
    }
  }

  static importProfile(jsonString: string): { success: boolean; profile?: TuningProfile; error?: string } {
    return this.importProfileFromJson(jsonString);
  }
}
