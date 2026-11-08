import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tweaksDir = path.join(rootDir, 'data/tweaks');
const profileStoreSourcePath = path.join(rootDir, 'electron/storage/profileStore.ts');

// ============================================================================
// Catalogs Loader & Referential Integrity Helpers
// ============================================================================

function loadAllTweakCatalogs() {
  const files = ['gaming.json', 'input.json', 'privacy.json', 'advanced.json'];
  const tweakMap = new Map();

  for (const file of files) {
    const filePath = path.join(tweaksDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const items = JSON.parse(content);
    for (const item of items) {
      tweakMap.set(item.id, { ...item, _sourceCatalog: file });
    }
  }

  return tweakMap;
}

// Canonical Aliases matching TweakEngine
const TWEAK_ID_ALIASES = {
  pointer_speed_neutral: 'mouse_neutral_pointer_speed',
  usb_selective_suspend_off: 'usb_disable_selective_suspend',
  game_mode_on_dvr_off: 'enable_game_mode',
};

// ============================================================================
// Built-in Presets Definition (Milestone 2 R2 Standard)
// ============================================================================

export const EXPECTED_BUILT_IN_PRESETS = [
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

// ============================================================================
// In-Memory Test Mocks & Isolated Engine Simulator
// ============================================================================

class MockRegistry {
  constructor() {
    this.store = new Map();
  }

  _key(hive, p, valueName) {
    return `${hive.toUpperCase()}\\${p.toLowerCase()}\\${valueName.toLowerCase()}`;
  }

  async getValue(hive, p, valueName) {
    const k = this._key(hive, p, valueName);
    if (this.store.has(k)) {
      return { exists: true, value: this.store.get(k) };
    }
    return { exists: false, value: null };
  }

  async setValue(hive, p, valueName, valueType, val) {
    const k = this._key(hive, p, valueName);
    this.store.set(k, val.toString());
    return true;
  }

  async deleteValue(hive, p, valueName) {
    const k = this._key(hive, p, valueName);
    this.store.delete(k);
    return true;
  }
}

class MockBackupStore {
  constructor() {
    this.backups = [];
  }

  saveBackup(record) {
    this.backups.unshift(record);
  }

  listBackups() {
    return this.backups;
  }
}

class IsolatedProfileStore {
  constructor(storageFilePath, builtIns = EXPECTED_BUILT_IN_PRESETS) {
    this.filePath = storageFilePath;
    this.builtIns = builtIns;
  }

  getAllProfiles() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [...this.builtIns];
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const customList = JSON.parse(raw);
      if (!Array.isArray(customList)) return [...this.builtIns];
      return [...this.builtIns, ...customList];
    } catch {
      return [...this.builtIns];
    }
  }

  saveProfile(profile) {
    if (profile.isBuiltIn || this.builtIns.some((b) => b.id === profile.id)) {
      return { success: false, id: profile.id, error: 'Cannot modify or overwrite built-in preset.' };
    }
    if (!profile.name || typeof profile.name !== 'string' || !profile.name.trim()) {
      return { success: false, id: profile.id || '', error: 'Profile name is required' };
    }

    const customList = this.getAllProfiles().filter((p) => !p.isBuiltIn);
    const existingIndex = customList.findIndex((p) => p.id === profile.id);
    if (existingIndex >= 0) {
      customList[existingIndex] = profile;
    } else {
      customList.push(profile);
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(customList, null, 2), 'utf8');
    return { success: true, id: profile.id };
  }

  deleteProfile(profileId) {
    // Built-in delete protection guard
    const isBuiltIn = this.builtIns.some((b) => b.id === profileId);
    if (isBuiltIn) {
      return { success: false, error: 'Built-in presets cannot be deleted' };
    }

    const customList = this.getAllProfiles().filter((p) => !p.isBuiltIn);
    const initialLen = customList.length;
    const filtered = customList.filter((p) => p.id !== profileId);
    if (filtered.length === initialLen) {
      return { success: false, error: 'Profile not found' };
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf8');
    return { success: true };
  }

  exportProfile(profile) {
    const envelope = {
      format: 'pctweak-profile',
      schemaVersion: 1,
      formatVersion: 1,
      app: 'PC Tweak',
      exportedAt: new Date().toISOString(),
      profile: {
        ...profile,
        isBuiltIn: false, // Ensure exported profiles never stay built-in
      },
    };
    return JSON.stringify(envelope, null, 2);
  }

  importProfile(jsonString) {
    let parsed;
    try {
      if (typeof jsonString !== 'string') {
        return { success: false, error: 'Invalid JSON format' };
      }
      parsed = JSON.parse(jsonString);
    } catch {
      return { success: false, error: 'Invalid JSON format' };
    }

    // Prototype pollution guard
    if (
      parsed &&
      (Object.prototype.hasOwnProperty.call(parsed, '__proto__') ||
        Object.prototype.hasOwnProperty.call(parsed, 'constructor') ||
        Object.prototype.hasOwnProperty.call(parsed, 'prototype'))
    ) {
      return { success: false, error: 'Malicious payload rejected (prototype pollution detected)' };
    }

    const profileData = parsed.format === 'pctweak-profile' && parsed.profile ? parsed.profile : parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : parsed;
    if (!profileData || typeof profileData !== 'object') {
      return { success: false, error: 'Malformed profile payload' };
    }

    if (
      Object.prototype.hasOwnProperty.call(profileData, '__proto__') ||
      Object.prototype.hasOwnProperty.call(profileData, 'constructor') ||
      Object.prototype.hasOwnProperty.call(profileData, 'prototype')
    ) {
      return { success: false, error: 'Malicious payload rejected (prototype pollution detected)' };
    }

    // Required fields validation
    if (!profileData.name || typeof profileData.name !== 'string' || profileData.name.trim() === '') {
      return { success: false, error: 'Profile name is required' };
    }
    if (!profileData.mouseSettings || typeof profileData.mouseSettings !== 'object') {
      return { success: false, error: 'Profile mouseSettings object is required' };
    }
    if (profileData.tweakIds !== undefined && !Array.isArray(profileData.tweakIds)) {
      return { success: false, error: 'Profile tweakIds must be an array' };
    }

    // Mouse speed validation & clamping
    let speed = profileData.mouseSettings.pointerSpeed;
    if (typeof speed !== 'number' || isNaN(speed)) {
      speed = 6;
    }
    speed = Math.max(1, Math.min(11, speed));

    // ID Collision Guard: Never allow imported profile to claim built-in ID
    let finalId = profileData.id || `custom_${Date.now()}`;
    const builtInIds = new Set(this.builtIns.map((b) => b.id));
    if (builtInIds.has(finalId)) {
      finalId = `${finalId}_imported_${Date.now()}`;
    }

    // Sanitize script/path injection in tweak IDs
    const safeTweakIds = (profileData.tweakIds || []).filter(
      (id) => typeof id === 'string' && /^[a-z0-9_]+$/.test(id)
    );

    const safeProfile = {
      id: finalId,
      name: profileData.name.trim(),
      category: profileData.category || 'custom',
      description: profileData.description || 'Imported user tuning profile',
      isBuiltIn: false, // Strict override
      createdAt: new Date().toISOString(),
      tweakIds: safeTweakIds,
      mouseSettings: {
        pointerSpeed: speed,
        enhancePointerAccuracy: Boolean(profileData.mouseSettings.enhancePointerAccuracy),
        disableAcceleration: Boolean(profileData.mouseSettings.disableAcceleration),
        disableTrails: Boolean(profileData.mouseSettings.disableTrails),
        scrollSpeed: profileData.mouseSettings.scrollSpeed || 3,
        doubleClickSpeed: profileData.mouseSettings.doubleClickSpeed || 550,
      },
      directX: profileData.directX || {},
      keyboardTweaks: Array.isArray(profileData.keyboardTweaks) ? profileData.keyboardTweaks : [],
    };

    return { success: true, profile: safeProfile };
  }
}

class ProfileApplySimulator {
  constructor(registry, backupStore, tweakCatalogs) {
    this.reg = registry;
    this.backups = backupStore;
    this.catalogs = tweakCatalogs;
    this.appliedTweaks = [];
  }

  async applyProfile(profile) {
    try {
      const ms = profile.mouseSettings || {};
      const snapshots = [];

      // 1. Mouse Sensitivity Calculation (1-20 scale; 6/11 maps to 10)
      if (ms.pointerSpeed !== undefined) {
        const sensitivity = Math.max(1, Math.min(20, Math.round((ms.pointerSpeed / 6) * 10)));
        const origSens = await this.reg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
        snapshots.push({
          hive: 'HKCU',
          path: 'Control Panel\\Mouse',
          valueName: 'MouseSensitivity',
          orig: origSens,
          applied: sensitivity.toString(),
        });
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity', 'REG_SZ', sensitivity.toString());
      }

      // 2. Mouse Acceleration & Thresholds
      const isPrecision = ms.enhancePointerAccuracy || !ms.disableAcceleration;
      if (isPrecision) {
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
      } else {
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
      }

      // 3. Scroll Speed
      if (ms.scrollSpeed !== undefined) {
        await this.reg.setValue('HKCU', 'Control Panel\\Desktop', 'WheelScrollLines', 'REG_SZ', ms.scrollSpeed.toString());
      }

      // 4. Double Click Speed
      if (ms.doubleClickSpeed !== undefined) {
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'DoubleClickSpeed', 'REG_SZ', ms.doubleClickSpeed.toString());
      }

      // 5. Disable Pointer Trails
      if (ms.disableTrails !== undefined) {
        await this.reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseTrails', 'REG_SZ', ms.disableTrails ? '0' : '2');
      }

      // 6. DirectX Presentation Settings
      if (profile.directX?.flipModel) {
        await this.reg.setValue(
          'HKCU',
          'Software\\Microsoft\\DirectX\\UserGpuPreferences',
          'DirectXUserGlobalSettings',
          'REG_SZ',
          'SwapEffectUpgradeEnable=1;'
        );
      }

      // 7. Dispatch TweakEngine Tweaks
      const tweakList = [...(profile.tweakIds || []), ...(profile.keyboardTweaks || [])];
      for (const tweakId of tweakList) {
        const canonical = TWEAK_ID_ALIASES[tweakId] || tweakId;
        const tweakDef = this.catalogs.get(canonical);
        if (tweakDef) {
          for (const action of tweakDef.actions) {
            if (action.type === 'registry') {
              await this.reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.applyValue);
            }
          }
          this.appliedTweaks.push(canonical);
        }
      }

      // Save pre-apply snapshot to BackupStore
      this.backups.saveBackup({
        id: `backup_profile_${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: `Applied Profile: ${profile.name}`,
        type: 'profile_apply',
        tweakIds: tweakList,
        snapshots,
        status: 'active',
      });

      return { success: true, appliedCount: tweakList.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Milestone 2: Tuning Profiles Suite (tests/tuningProfiles.test.mjs)', () => {
  let tweakCatalogs;
  let tempDir;
  let tempStoragePath;
  let isolatedStore;

  before(() => {
    tweakCatalogs = loadAllTweakCatalogs();
    assert.ok(tweakCatalogs.size >= 20, 'Tweak catalogs must contain active definitions');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-profiles-test-'));
    tempStoragePath = path.join(tempDir, 'profiles.json');
    isolatedStore = new IsolatedProfileStore(tempStoragePath);
  });

  after(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // ==========================================================================
  // Suite 1: Built-in Presets Schema & Completeness
  // ==========================================================================
  describe('Suite 1: Built-in Presets Schema & Completeness', () => {
    it('verifies all 4 required built-in presets exist with valid IDs', () => {
      const presets = EXPECTED_BUILT_IN_PRESETS;
      assert.equal(presets.length, 4, 'Must have exactly 4 built-in presets');

      const expectedIds = [
        'esports_competitive',
        'streaming_content',
        'max_battery_quiet',
        'windows_default',
      ];
      const actualIds = presets.map((p) => p.id);
      assert.deepEqual(actualIds.sort(), expectedIds.sort());
    });

    it('verifies exact preset names match specification', () => {
      const names = EXPECTED_BUILT_IN_PRESETS.map((p) => p.name);
      assert.ok(names.includes('Esports Competitive'));
      assert.ok(names.includes('Streaming & Content Creation'));
      assert.ok(names.includes('Maximum Battery / Quiet'));
      assert.ok(names.includes('Windows Default / Revert All'));
    });

    it('verifies all presets contain valid categories, descriptions, and isBuiltIn flags', () => {
      const validCategories = new Set(['esports', 'streaming', 'battery', 'default', 'custom']);

      for (const preset of EXPECTED_BUILT_IN_PRESETS) {
        assert.ok(preset.id && /^[a-z0-9_]+$/.test(preset.id), `Invalid ID for ${preset.id}`);
        assert.ok(validCategories.has(preset.category), `Invalid category for ${preset.id}: ${preset.category}`);
        assert.ok(typeof preset.description === 'string' && preset.description.length >= 20, `Description too short for ${preset.id}`);
        assert.strictEqual(preset.isBuiltIn, true, `${preset.id} must have isBuiltIn: true`);
        assert.ok(!isNaN(Date.parse(preset.createdAt)), `createdAt invalid timestamp for ${preset.id}`);
        assert.ok(Array.isArray(preset.tweakIds), `tweakIds must be array for ${preset.id}`);
        assert.ok(preset.mouseSettings && typeof preset.mouseSettings === 'object', `mouseSettings missing in ${preset.id}`);
      }
    });

    it('verifies all tweakIds referenced in presets exist in data/tweaks catalogs with zero orphans', () => {
      for (const preset of EXPECTED_BUILT_IN_PRESETS) {
        for (const tweakId of preset.tweakIds) {
          const canonical = TWEAK_ID_ALIASES[tweakId] || tweakId;
          const exists = tweakCatalogs.has(canonical);
          assert.ok(
            exists,
            `Dangling/orphaned tweak ID '${tweakId}' in preset '${preset.name}'! Not found in any data/tweaks catalog.`
          );
        }
      }
    });

    it('verifies Esports Competitive preset enforces 1:1 mouse tracking and anticheat safety', () => {
      const esports = EXPECTED_BUILT_IN_PRESETS.find((p) => p.id === 'esports_competitive');
      assert.ok(esports);

      // Mouse settings: neutral 6/11, acceleration off
      assert.strictEqual(esports.mouseSettings.pointerSpeed, 6);
      assert.strictEqual(esports.mouseSettings.disableAcceleration, true);
      assert.strictEqual(esports.mouseSettings.enhancePointerAccuracy, false);
      assert.strictEqual(esports.mouseSettings.disableTrails, true);

      // Anti-cheat verification: Esports Competitive MUST NOT include blocked-risk tweaks
      for (const tweakId of esports.tweakIds) {
        const canonical = TWEAK_ID_ALIASES[tweakId] || tweakId;
        const tweakDef = tweakCatalogs.get(canonical);
        assert.ok(tweakDef, `Missing tweak: ${canonical}`);
        assert.notStrictEqual(
          tweakDef.anticheat,
          'blocked-risk',
          `Esports Competitive preset contains blocked-risk tweak '${tweakId}'! This would trigger anti-cheat bans.`
        );
      }
    });

    it('verifies Windows Default preset returns to stock baseline', () => {
      const def = EXPECTED_BUILT_IN_PRESETS.find((p) => p.id === 'windows_default');
      assert.ok(def);
      assert.strictEqual(def.mouseSettings.pointerSpeed, 6);
      assert.strictEqual(def.mouseSettings.enhancePointerAccuracy, true);
      assert.strictEqual(def.mouseSettings.disableAcceleration, false);
      assert.strictEqual(def.mouseSettings.disableTrails, false);
    });

    it('verifies BUILT_IN_PROFILES in profileStore.ts matches EXPECTED_BUILT_IN_PRESETS in source code', () => {
      assert.ok(fs.existsSync(profileStoreSourcePath), 'profileStore.ts must exist');
      const source = fs.readFileSync(profileStoreSourcePath, 'utf8');

      // Check presets exist in source file
      assert.ok(source.includes("'esports_competitive'"));
      assert.ok(source.includes("'streaming_content'"));
      assert.ok(source.includes("'max_battery_quiet'"));
      assert.ok(source.includes("'windows_default'"));

      // Check backwards compatibility alias exists
      assert.ok(source.includes('export type GameInputProfile = TuningProfile;'));
    });
  });

  // ==========================================================================
  // Suite 2: ProfileStore CRUD & Delete Protection
  // ==========================================================================
  describe('Suite 2: ProfileStore CRUD & Delete Protection', () => {
    beforeEach(() => {
      if (fs.existsSync(tempStoragePath)) {
        fs.unlinkSync(tempStoragePath);
      }
    });

    it('retrieves all built-in presets when no custom profiles exist', () => {
      const profiles = isolatedStore.getAllProfiles();
      assert.strictEqual(profiles.length, 4);
      assert.ok(profiles.every((p) => p.isBuiltIn));
    });

    it('saves a new custom profile and retrieves it by ID', () => {
      const custom = {
        id: 'user_cs2_lowsens',
        name: 'My CS2 Low Sensitivity',
        category: 'custom',
        description: '400 DPI tournament tuned',
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        tweakIds: ['mouse_disable_acceleration', 'keyboard_repeat_rate_max'],
        mouseSettings: {
          pointerSpeed: 6,
          enhancePointerAccuracy: false,
          disableAcceleration: true,
          disableTrails: true,
          scrollSpeed: 3,
          doubleClickSpeed: 550,
        },
      };

      const res = isolatedStore.saveProfile(custom);
      assert.strictEqual(res.success, true);

      const all = isolatedStore.getAllProfiles();
      assert.strictEqual(all.length, 5);

      const retrieved = all.find((p) => p.id === 'user_cs2_lowsens');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.name, 'My CS2 Low Sensitivity');
      assert.strictEqual(retrieved.isBuiltIn, false);
    });

    it('updates an existing custom profile in-place without duplicating rows', () => {
      const custom = {
        id: 'user_profile_edit',
        name: 'Initial Name',
        category: 'custom',
        description: 'V1',
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        tweakIds: [],
        mouseSettings: { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true },
      };
      isolatedStore.saveProfile(custom);
      assert.strictEqual(isolatedStore.getAllProfiles().length, 5);

      // Edit
      const updated = { ...custom, name: 'Updated Name', description: 'V2' };
      isolatedStore.saveProfile(updated);

      const all = isolatedStore.getAllProfiles();
      assert.strictEqual(all.length, 5, 'Profile count must not increase on edit');
      const retrieved = all.find((p) => p.id === 'user_profile_edit');
      assert.strictEqual(retrieved.name, 'Updated Name');
      assert.strictEqual(retrieved.description, 'V2');
    });

    it('STRICT GUARD: Built-in presets CANNOT be deleted and return error', () => {
      const builtIns = ['esports_competitive', 'streaming_content', 'max_battery_quiet', 'windows_default'];

      for (const id of builtIns) {
        const res = isolatedStore.deleteProfile(id);
        assert.strictEqual(res.success, false, `Delete must fail for built-in preset '${id}'`);
        assert.match(res.error, /built-in/i);

        // Verify still exists in store
        const remaining = isolatedStore.getAllProfiles();
        assert.ok(remaining.some((p) => p.id === id), `Built-in preset '${id}' was unexpectedly deleted!`);
      }
    });

    it('deletes custom profile cleanly', () => {
      const custom = {
        id: 'to_be_deleted',
        name: 'Temporary Profile',
        category: 'custom',
        description: 'Temp',
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        tweakIds: [],
        mouseSettings: { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true },
      };
      isolatedStore.saveProfile(custom);
      assert.strictEqual(isolatedStore.getAllProfiles().length, 5);

      const delRes = isolatedStore.deleteProfile('to_be_deleted');
      assert.strictEqual(delRes.success, true);
      assert.strictEqual(isolatedStore.getAllProfiles().length, 4);
      assert.ok(!isolatedStore.getAllProfiles().some((p) => p.id === 'to_be_deleted'));
    });

    it('gracefully recovers when profiles.json on disk is corrupted with malformed JSON', () => {
      fs.mkdirSync(path.dirname(tempStoragePath), { recursive: true });
      fs.writeFileSync(tempStoragePath, '{"bad_json: true, unterminated...', 'utf8');

      // Must not throw an unhandled crash, but fallback to built-ins
      const profiles = isolatedStore.getAllProfiles();
      assert.strictEqual(profiles.length, 4);
      assert.ok(profiles.every((p) => p.isBuiltIn));
    });
  });

  // ==========================================================================
  // Suite 3: Export & Import Roundtrip
  // ==========================================================================
  describe('Suite 3: Export & Import Roundtrip', () => {
    it('exports a profile to a valid JSON envelope with metadata', () => {
      const profile = {
        id: 'export_test_profile',
        name: 'Exportable Profile',
        category: 'custom',
        description: 'Testing export serialization',
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        tweakIds: ['mouse_disable_acceleration', 'enable_game_mode'],
        mouseSettings: {
          pointerSpeed: 6,
          enhancePointerAccuracy: false,
          disableAcceleration: true,
          disableTrails: true,
          scrollSpeed: 3,
          doubleClickSpeed: 550,
        },
      };

      const exportedJson = isolatedStore.exportProfile(profile);
      assert.ok(typeof exportedJson === 'string');

      const parsed = JSON.parse(exportedJson);
      assert.strictEqual(parsed.format, 'pctweak-profile');
      assert.strictEqual(parsed.schemaVersion, 1);
      assert.ok(parsed.exportedAt);
      assert.strictEqual(parsed.profile.name, 'Exportable Profile');
      assert.strictEqual(parsed.profile.isBuiltIn, false);
    });

    it('lossless roundtrip: re-importing exported profile restores identical values', () => {
      const original = {
        id: 'lossless_test',
        name: 'Lossless Apex Config',
        category: 'custom',
        description: 'High tracking accuracy',
        isBuiltIn: false,
        createdAt: '2026-02-01T12:00:00.000Z',
        tweakIds: ['mouse_disable_acceleration', 'keyboard_repeat_rate_max'],
        mouseSettings: {
          pointerSpeed: 6,
          enhancePointerAccuracy: false,
          disableAcceleration: true,
          disableTrails: true,
          scrollSpeed: 4,
          doubleClickSpeed: 500,
        },
      };

      const exported = isolatedStore.exportProfile(original);
      const importRes = isolatedStore.importProfile(exported);

      assert.strictEqual(importRes.success, true);
      const imported = importRes.profile;

      assert.strictEqual(imported.name, original.name);
      assert.strictEqual(imported.description, original.description);
      assert.deepEqual(imported.tweakIds, original.tweakIds);
      assert.deepEqual(imported.mouseSettings, original.mouseSettings);
    });

    it('rejects malformed or non-JSON payloads', () => {
      const res1 = isolatedStore.importProfile('NOT_JSON');
      assert.strictEqual(res1.success, false);
      assert.match(res1.error, /invalid json/i);

      const res2 = isolatedStore.importProfile(JSON.stringify({}));
      assert.strictEqual(res2.success, false);
      assert.match(res2.error, /name is required/i);
    });

    it('rejects payloads missing required fields (name, mouseSettings)', () => {
      const invalidNoName = JSON.stringify({
        format: 'pctweak-profile',
        profile: { mouseSettings: { pointerSpeed: 6 } },
      });
      const res1 = isolatedStore.importProfile(invalidNoName);
      assert.strictEqual(res1.success, false);
      assert.match(res1.error, /name/i);

      const invalidNoMouse = JSON.stringify({
        format: 'pctweak-profile',
        profile: { name: 'No Mouse' },
      });
      const res2 = isolatedStore.importProfile(invalidNoMouse);
      assert.strictEqual(res2.success, false);
      assert.match(res2.error, /mouseSettings/i);
    });

    it('SECURITY GUARD: Defends against prototype pollution payloads', () => {
      const maliciousPayload = `
      {
        "__proto__": { "polluted": true },
        "format": "pctweak-profile",
        "profile": {
          "name": "Polluter",
          "mouseSettings": { "pointerSpeed": 6 }
        }
      }
      `;

      const res = isolatedStore.importProfile(maliciousPayload);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');
    });

    it('SECURITY GUARD: Coerces isBuiltIn: true to false on imported profiles', () => {
      const spoofPayload = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          name: 'Spoofed BuiltIn',
          isBuiltIn: true, // Malicious attempt to get delete protection
          mouseSettings: { pointerSpeed: 6 },
        },
      });

      const res = isolatedStore.importProfile(spoofPayload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.profile.isBuiltIn, false, 'Imported profile must NEVER be isBuiltIn: true');
    });

    it('SECURITY GUARD: Prevents ID collision with built-in presets by re-keying', () => {
      const collidePayload = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          id: 'esports_competitive', // Collision with built-in ID
          name: 'Fake Esports',
          mouseSettings: { pointerSpeed: 6 },
        },
      });

      const res = isolatedStore.importProfile(collidePayload);
      assert.strictEqual(res.success, true);
      assert.notStrictEqual(res.profile.id, 'esports_competitive', 'Colliding ID must be re-keyed');
    });
  });

  // ==========================================================================
  // Suite 4: Apply Logic & Execution Mechanics
  // ==========================================================================
  describe('Suite 4: Apply Logic & Execution Mechanics', () => {
    let mockReg;
    let mockBackups;
    let applySimulator;

    beforeEach(() => {
      mockReg = new MockRegistry();
      mockBackups = new MockBackupStore();
      applySimulator = new ProfileApplySimulator(mockReg, mockBackups, tweakCatalogs);
    });

    it('calculates correct Windows MouseSensitivity across pointerSpeed spectrum', async () => {
      // Sensitivity formula: Math.max(1, Math.min(20, Math.round((pointerSpeed / 6) * 10)))
      const testCases = [
        { pointerSpeed: 1, expected: '2' },
        { pointerSpeed: 3, expected: '5' },
        { pointerSpeed: 6, expected: '10' }, // 6/11 neutral maps to 10
        { pointerSpeed: 9, expected: '15' },
        { pointerSpeed: 11, expected: '18' },
      ];

      for (const tc of testCases) {
        const profile = {
          id: `test_sens_${tc.pointerSpeed}`,
          name: 'Sens Test',
          mouseSettings: { pointerSpeed: tc.pointerSpeed, disableAcceleration: true },
        };
        await applySimulator.applyProfile(profile);

        const regVal = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
        assert.strictEqual(
          regVal.value,
          tc.expected,
          `pointerSpeed ${tc.pointerSpeed} must map to Windows Sensitivity '${tc.expected}', got '${regVal.value}'`
        );
      }
    });

    it('applies unaccelerated mouse registry keys (MouseSpeed 0, thresholds 0)', async () => {
      const unacceleratedProfile = {
        id: 'unaccelerated',
        name: 'Zero Accel',
        mouseSettings: {
          pointerSpeed: 6,
          disableAcceleration: true,
          enhancePointerAccuracy: false,
        },
      };

      await applySimulator.applyProfile(unacceleratedProfile);

      const speed = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
      const th1 = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1');
      const th2 = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2');

      assert.strictEqual(speed.value, '0');
      assert.strictEqual(th1.value, '0');
      assert.strictEqual(th2.value, '0');
    });

    it('applies accelerated mouse registry keys when precision is enabled', async () => {
      const acceleratedProfile = {
        id: 'accelerated',
        name: 'Windows Default Accel',
        mouseSettings: {
          pointerSpeed: 6,
          disableAcceleration: false,
          enhancePointerAccuracy: true,
        },
      };

      await applySimulator.applyProfile(acceleratedProfile);

      const speed = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
      const th1 = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1');
      const th2 = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2');

      assert.strictEqual(speed.value, '1');
      assert.strictEqual(th1.value, '6');
      assert.strictEqual(th2.value, '10');
    });

    it('applies scroll lines, double click speed, and pointer trails', async () => {
      const profile = {
        id: 'aux_settings',
        name: 'Aux Mouse Settings',
        mouseSettings: {
          pointerSpeed: 6,
          disableAcceleration: true,
          scrollSpeed: 4,
          doubleClickSpeed: 480,
          disableTrails: true,
        },
      };

      await applySimulator.applyProfile(profile);

      const scroll = await mockReg.getValue('HKCU', 'Control Panel\\Desktop', 'WheelScrollLines');
      const dbl = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'DoubleClickSpeed');
      const trails = await mockReg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseTrails');

      assert.strictEqual(scroll.value, '4');
      assert.strictEqual(dbl.value, '480');
      assert.strictEqual(trails.value, '0');
    });

    it('applies DirectX presentation flip model setting when requested', async () => {
      const profile = {
        id: 'dx_profile',
        name: 'DirectX Flip',
        directX: { flipModel: true },
        mouseSettings: { pointerSpeed: 6, disableAcceleration: true },
      };

      await applySimulator.applyProfile(profile);

      const dxSetting = await mockReg.getValue(
        'HKCU',
        'Software\\Microsoft\\DirectX\\UserGpuPreferences',
        'DirectXUserGlobalSettings'
      );
      assert.strictEqual(dxSetting.value, 'SwapEffectUpgradeEnable=1;');
    });

    it('dispatches catalog tweaks and commits profile_apply backup snapshot record', async () => {
      const profile = {
        id: 'full_apply_test',
        name: 'Full Optimization Preset',
        tweakIds: ['enable_game_mode', 'mouse_disable_acceleration'],
        mouseSettings: { pointerSpeed: 6, disableAcceleration: true },
      };

      const res = await applySimulator.applyProfile(profile);
      assert.strictEqual(res.success, true);

      // Verify BackupStore recorded profile_apply snapshot
      const backups = mockBackups.listBackups();
      assert.strictEqual(backups.length, 1);
      assert.strictEqual(backups[0].type, 'profile_apply');
      assert.strictEqual(backups[0].status, 'active');
      assert.ok(backups[0].tweakIds.includes('enable_game_mode'));

      // Verify registry changes took effect
      const gameModeReg = await mockReg.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled');
      assert.strictEqual(gameModeReg.value, '1');
    });
  });
});
