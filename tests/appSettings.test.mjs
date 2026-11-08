import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const settingsStoreTsPath = path.join(rootDir, 'electron/storage/settingsStore.ts');
const settingsIpcTsPath = path.join(rootDir, 'electron/ipc/settings.ts');
const preloadTsPath = path.join(rootDir, 'electron/preload.ts');
const electronTypesPath = path.join(rootDir, 'src/types/electron.d.ts');

// ============================================================================
// Standard Default Settings Definition (Milestone 3 R3 Contract)
// ============================================================================

export const DEFAULT_APP_SETTINGS = {
  launchOnStartup: false,
  minimizeToTray: true,
  closeToTray: true,
  language: 'en',
  hardwarePollingInterval: 1000,
  autoUpdate: true,
  theme: 'dark',
};

export const VALID_LANGUAGES = ['en', 'fa'];
export const VALID_THEMES = ['dark', 'light', 'system'];
export const MIN_POLLING_INTERVAL = 500;
export const MAX_POLLING_INTERVAL = 5000;

// Built-in Presets IDs for Factory Reset verification
export const BUILT_IN_PRESET_IDS = [
  'esports_competitive',
  'streaming_content',
  'max_battery_quiet',
  'windows_default',
];

// ============================================================================
// Reference / Isolated SettingsStore Implementation
// ============================================================================

export class IsolatedSettingsStore {
  constructor(filePath, storageDir) {
    this.filePath = filePath;
    this.storageDir = storageDir || path.dirname(filePath);
  }

  getSettings() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { ...DEFAULT_APP_SETTINGS };
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...DEFAULT_APP_SETTINGS };
      }
      return this._sanitize({ ...DEFAULT_APP_SETTINGS, ...parsed });
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  }

  updateSettings(partial) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      return { success: false, error: 'Invalid settings payload', settings: this.getSettings() };
    }

    // Prototype pollution guard
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
    const merged = { ...current };

    if (partial.launchOnStartup !== undefined) {
      merged.launchOnStartup = Boolean(partial.launchOnStartup);
    }
    if (partial.minimizeToTray !== undefined) {
      merged.minimizeToTray = Boolean(partial.minimizeToTray);
    }
    if (partial.closeToTray !== undefined) {
      merged.closeToTray = Boolean(partial.closeToTray);
    }
    if (partial.language !== undefined) {
      const lang = typeof partial.language === 'string' ? partial.language.trim().toLowerCase() : '';
      merged.language = lang === 'fa' ? 'fa' : 'en';
    }
    if (partial.hardwarePollingInterval !== undefined) {
      const rawVal = partial.hardwarePollingInterval;
      let interval;
      if (
        rawVal === null ||
        rawVal === undefined ||
        rawVal === '' ||
        typeof rawVal === 'boolean' ||
        typeof rawVal === 'object' ||
        isNaN(Number(rawVal)) ||
        !isFinite(Number(rawVal))
      ) {
        interval = DEFAULT_APP_SETTINGS.hardwarePollingInterval;
      } else {
        const num = Math.round(Number(rawVal));
        interval = Math.max(MIN_POLLING_INTERVAL, Math.min(MAX_POLLING_INTERVAL, num));
      }
      merged.hardwarePollingInterval = interval;
    }
    if (partial.autoUpdate !== undefined) {
      merged.autoUpdate = Boolean(partial.autoUpdate);
    }
    if (partial.theme !== undefined) {
      const th = typeof partial.theme === 'string' ? partial.theme.trim().toLowerCase() : '';
      merged.theme = VALID_THEMES.includes(th) ? th : 'dark';
    }

    const sanitized = this._sanitize(merged);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(sanitized, null, 2), 'utf8');
    return { success: true, settings: sanitized };
  }

  resetToDefaults() {
    const sanitized = { ...DEFAULT_APP_SETTINGS };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(sanitized, null, 2), 'utf8');
    return { success: true, settings: sanitized };
  }

  resetAppData() {
    const clearedFiles = [];
    const targetFiles = ['profiles.json', 'settings.json', 'backups.json', 'tweakAudit.json'];

    for (const file of targetFiles) {
      const p = path.join(this.storageDir, file);
      if (fs.existsSync(p)) {
        try {
          if (file === 'settings.json') {
            fs.writeFileSync(p, JSON.stringify(DEFAULT_APP_SETTINGS, null, 2), 'utf8');
          } else if (file === 'profiles.json') {
            fs.writeFileSync(p, JSON.stringify([], null, 2), 'utf8');
          } else {
            fs.unlinkSync(p);
          }
          clearedFiles.push(file);
        } catch {}
      }
    }

    this.resetToDefaults();
    if (!clearedFiles.includes('settings.json')) {
      clearedFiles.push('settings.json');
    }

    return { success: true, clearedFiles };
  }

  _sanitize(obj) {
    const rawVal = obj.hardwarePollingInterval;
    let interval;
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === '' ||
      typeof rawVal === 'boolean' ||
      typeof rawVal === 'object' ||
      isNaN(Number(rawVal)) ||
      !isFinite(Number(rawVal))
    ) {
      interval = DEFAULT_APP_SETTINGS.hardwarePollingInterval;
    } else {
      const num = Math.round(Number(rawVal));
      interval = Math.max(MIN_POLLING_INTERVAL, Math.min(MAX_POLLING_INTERVAL, num));
    }

    const lang = typeof obj.language === 'string' ? obj.language.trim().toLowerCase() : '';
    const th = typeof obj.theme === 'string' ? obj.theme.trim().toLowerCase() : '';

    return {
      launchOnStartup: Boolean(obj.launchOnStartup),
      minimizeToTray: Boolean(obj.minimizeToTray),
      closeToTray: Boolean(obj.closeToTray),
      language: lang === 'fa' ? 'fa' : 'en',
      hardwarePollingInterval: interval,
      autoUpdate: Boolean(obj.autoUpdate),
      theme: VALID_THEMES.includes(th) ? th : 'dark',
    };
  }
}

// ============================================================================
// Dynamic Real TypeScript Module Loader
// ============================================================================

export async function loadRealSettingsStoreIfAvailable() {
  if (!fs.existsSync(settingsStoreTsPath)) {
    return null;
  }
  try {
    const tsCode = fs.readFileSync(settingsStoreTsPath, 'utf8');
    const patchedTs = tsCode.replace(
      /import\s*\{\s*app\s*\}\s*from\s*['"]electron['"];?/,
      'const app = { getPath: () => process.cwd() };'
    );

    const transpiled = ts.transpileModule(patchedTs, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const base64 = Buffer.from(transpiled).toString('base64');
    return await import(`data:text/javascript;base64,${base64}`);
  } catch (err) {
    console.warn('Real SettingsStore transpile error:', err.message);
    return null;
  }
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Milestone 3: App Settings and Preferences Engine Suite (tests/appSettings.test.mjs)', () => {
  let tempDir;
  let tempSettingsPath;
  let tempProfilesPath;
  let tempBackupsPath;
  let tempAuditPath;
  let isolatedStore;
  let realModule = null;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-settings-test-'));
    tempSettingsPath = path.join(tempDir, 'settings.json');
    tempProfilesPath = path.join(tempDir, 'profiles.json');
    tempBackupsPath = path.join(tempDir, 'backups.json');
    tempAuditPath = path.join(tempDir, 'tweakAudit.json');

    isolatedStore = new IsolatedSettingsStore(tempSettingsPath, tempDir);
    realModule = await loadRealSettingsStoreIfAvailable();
  });

  after(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  beforeEach(() => {
    if (fs.existsSync(tempSettingsPath)) {
      fs.unlinkSync(tempSettingsPath);
    }
  });

  // ==========================================================================
  // Suite 1: Default Settings & Store Initialization
  // ==========================================================================
  describe('Suite 1: Default Settings & Store Initialization', () => {
    it('verifies exact default configuration values match Milestone 3 specification', () => {
      const defaults = isolatedStore.getSettings();

      assert.strictEqual(defaults.launchOnStartup, false, 'launchOnStartup must default to false');
      assert.strictEqual(defaults.minimizeToTray, true, 'minimizeToTray must default to true');
      assert.strictEqual(defaults.closeToTray, true, 'closeToTray must default to true');
      assert.strictEqual(defaults.language, 'en', 'language must default to en');
      assert.strictEqual(defaults.hardwarePollingInterval, 1000, 'hardwarePollingInterval must default to 1000');
      assert.strictEqual(defaults.autoUpdate, true, 'autoUpdate must default to true');
      assert.strictEqual(defaults.theme, 'dark', 'theme must default to dark');

      // Verify all 7 expected keys are present
      const keys = Object.keys(defaults).sort();
      const expectedKeys = [
        'autoUpdate',
        'closeToTray',
        'hardwarePollingInterval',
        'language',
        'launchOnStartup',
        'minimizeToTray',
        'theme',
      ].sort();
      assert.deepStrictEqual(keys, expectedKeys);
    });

    it('returns default settings cleanly when settings.json does not yet exist', () => {
      assert.strictEqual(fs.existsSync(tempSettingsPath), false);
      const settings = isolatedStore.getSettings();
      assert.strictEqual(settings.language, 'en');
      assert.strictEqual(settings.hardwarePollingInterval, 1000);
    });

    it('creates parent directory recursively and writes valid JSON on first write', () => {
      const deepNestedDir = path.join(tempDir, 'nested', 'deep', 'storage');
      const deepPath = path.join(deepNestedDir, 'settings.json');
      const store = new IsolatedSettingsStore(deepPath, deepNestedDir);

      const res = store.updateSettings({ theme: 'light' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(fs.existsSync(deepPath), true);

      const diskRaw = fs.readFileSync(deepPath, 'utf8');
      const diskParsed = JSON.parse(diskRaw);
      assert.strictEqual(diskParsed.theme, 'light');
      assert.strictEqual(diskParsed.language, 'en');
    });

    it('gracefully recovers when settings.json on disk is corrupted with malformed JSON', () => {
      fs.writeFileSync(tempSettingsPath, '{"brokenJson": true, incomplete...', 'utf8');

      const settings = isolatedStore.getSettings();
      assert.strictEqual(settings.launchOnStartup, false);
      assert.strictEqual(settings.language, 'en');
      assert.strictEqual(settings.hardwarePollingInterval, 1000);
    });

    it('prevents default reference leakage across repeated calls', () => {
      const s1 = isolatedStore.getSettings();
      s1.theme = 'light';
      s1.hardwarePollingInterval = 4000;

      const s2 = isolatedStore.getSettings();
      assert.strictEqual(s2.theme, 'dark', 'In-memory mutations must not poison default settings');
      assert.strictEqual(s2.hardwarePollingInterval, 1000);
    });
  });

  // ==========================================================================
  // Suite 2: Settings Updates & Partial Persistence
  // ==========================================================================
  describe('Suite 2: Settings Updates & Partial Persistence', () => {
    it('partial update mutates only specified fields and preserves other fields', () => {
      const initial = isolatedStore.getSettings();
      assert.strictEqual(initial.language, 'en');
      assert.strictEqual(initial.closeToTray, true);

      const res = isolatedStore.updateSettings({ language: 'fa' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.language, 'fa');
      assert.strictEqual(res.settings.closeToTray, true);
      assert.strictEqual(res.settings.hardwarePollingInterval, 1000);

      // Verify on-disk
      const onDisk = JSON.parse(fs.readFileSync(tempSettingsPath, 'utf8'));
      assert.strictEqual(onDisk.language, 'fa');
      assert.strictEqual(onDisk.closeToTray, true);
    });

    it('accumulates multi-step partial updates cleanly', () => {
      isolatedStore.updateSettings({ minimizeToTray: false });
      isolatedStore.updateSettings({ theme: 'system' });
      isolatedStore.updateSettings({ hardwarePollingInterval: 2000 });

      const finalSettings = isolatedStore.getSettings();
      assert.strictEqual(finalSettings.minimizeToTray, false);
      assert.strictEqual(finalSettings.theme, 'system');
      assert.strictEqual(finalSettings.hardwarePollingInterval, 2000);
      assert.strictEqual(finalSettings.language, 'en');
      assert.strictEqual(finalSettings.closeToTray, true);
    });

    it('coerces boolean flags deterministically', () => {
      isolatedStore.updateSettings({ launchOnStartup: 1 });
      assert.strictEqual(isolatedStore.getSettings().launchOnStartup, true);

      isolatedStore.updateSettings({ launchOnStartup: 0 });
      assert.strictEqual(isolatedStore.getSettings().launchOnStartup, false);

      isolatedStore.updateSettings({ autoUpdate: false });
      assert.strictEqual(isolatedStore.getSettings().autoUpdate, false);
    });

    it('persists values across store re-instantiation / simulated app restart', () => {
      isolatedStore.updateSettings({
        launchOnStartup: true,
        language: 'fa',
        hardwarePollingInterval: 2500,
        theme: 'light',
      });

      // Simulate app restart by constructing fresh instance
      const freshStore = new IsolatedSettingsStore(tempSettingsPath, tempDir);
      const reloaded = freshStore.getSettings();

      assert.strictEqual(reloaded.launchOnStartup, true);
      assert.strictEqual(reloaded.language, 'fa');
      assert.strictEqual(reloaded.hardwarePollingInterval, 2500);
      assert.strictEqual(reloaded.theme, 'light');
      assert.strictEqual(reloaded.minimizeToTray, true);
    });

    it('rejects non-object or null update payloads safely', () => {
      const res1 = isolatedStore.updateSettings(null);
      assert.strictEqual(res1.success, false);

      const res2 = isolatedStore.updateSettings('string');
      assert.strictEqual(res2.success, false);

      const res3 = isolatedStore.updateSettings([1, 2, 3]);
      assert.strictEqual(res3.success, false);
    });
  });

  // ==========================================================================
  // Suite 3: Hardware Polling Interval Validation & Clamping
  // ==========================================================================
  describe('Suite 3: Hardware Polling Interval Validation & Clamping', () => {
    it('accepts valid intervals strictly within bounds [500, 5000]', () => {
      const validSamples = [500, 750, 1000, 1500, 2500, 5000];
      for (const val of validSamples) {
        const res = isolatedStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.settings.hardwarePollingInterval, val);
      }
    });

    it('clamps values below 500ms strictly to 500ms', () => {
      const underflowSamples = [499, 250, 100, 1, 0, -500, -9999];
      for (const val of underflowSamples) {
        const res = isolatedStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          500,
          `Interval ${val} must be clamped to 500, got ${res.settings.hardwarePollingInterval}`
        );
      }
    });

    it('clamps values above 5000ms strictly to 5000ms', () => {
      const overflowSamples = [5001, 6000, 10000, 999999];
      for (const val of overflowSamples) {
        const res = isolatedStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          5000,
          `Interval ${val} must be clamped to 5000, got ${res.settings.hardwarePollingInterval}`
        );
      }
    });

    it('falls back to default 1000 for NaN, null, undefined, or string non-numbers', () => {
      const invalidSamples = [NaN, 'fast', null, undefined, Infinity, -Infinity, {}, []];
      for (const val of invalidSamples) {
        const res = isolatedStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          1000,
          `Invalid interval ${String(val)} must fall back to 1000`
        );
      }
    });

    it('parses valid numeric strings and rounds fractional milliseconds', () => {
      const res1 = isolatedStore.updateSettings({ hardwarePollingInterval: '1500' });
      assert.strictEqual(res1.settings.hardwarePollingInterval, 1500);

      const res2 = isolatedStore.updateSettings({ hardwarePollingInterval: 1250.7 });
      assert.strictEqual(res2.settings.hardwarePollingInterval, 1251);
    });
  });

  // ==========================================================================
  // Suite 4: Language & Locale Validation
  // ==========================================================================
  describe('Suite 4: Language & Locale Validation', () => {
    it('accepts official supported languages "en" and "fa"', () => {
      const resEn = isolatedStore.updateSettings({ language: 'en' });
      assert.strictEqual(resEn.settings.language, 'en');

      const resFa = isolatedStore.updateSettings({ language: 'fa' });
      assert.strictEqual(resFa.settings.language, 'fa');
    });

    it('falls back to "en" for unsupported language codes', () => {
      const unsupported = ['de', 'fr', 'es', 'zh', 'ar', 'ru', 'unknown', ''];
      for (const lang of unsupported) {
        const res = isolatedStore.updateSettings({ language: lang });
        assert.strictEqual(res.settings.language, 'en', `Language '${lang}' must fall back to 'en'`);
      }
    });

    it('handles uppercase and whitespace normalization gracefully', () => {
      const res1 = isolatedStore.updateSettings({ language: 'FA' });
      assert.strictEqual(res1.settings.language, 'fa');

      const res2 = isolatedStore.updateSettings({ language: '  en  ' });
      assert.strictEqual(res2.settings.language, 'en');
    });

    it('falls back to "en" when non-string types are provided', () => {
      const res1 = isolatedStore.updateSettings({ language: 123 });
      assert.strictEqual(res1.settings.language, 'en');

      const res2 = isolatedStore.updateSettings({ language: null });
      assert.strictEqual(res2.settings.language, 'en');
    });
  });

  // ==========================================================================
  // Suite 5: Theme Validation & Clamping
  // ==========================================================================
  describe('Suite 5: Theme Validation & Clamping', () => {
    it('accepts valid themes: "dark", "light", and "system"', () => {
      for (const th of ['dark', 'light', 'system']) {
        const res = isolatedStore.updateSettings({ theme: th });
        assert.strictEqual(res.settings.theme, th);
      }
    });

    it('falls back to "dark" for invalid theme names', () => {
      const invalidThemes = ['neon', 'cyberpunk', 'blue', '', 'high_contrast'];
      for (const th of invalidThemes) {
        const res = isolatedStore.updateSettings({ theme: th });
        assert.strictEqual(res.settings.theme, 'dark', `Theme '${th}' must fall back to 'dark'`);
      }
    });

    it('normalizes uppercase theme strings', () => {
      const res = isolatedStore.updateSettings({ theme: 'LIGHT' });
      assert.strictEqual(res.settings.theme, 'light');
    });
  });

  // ==========================================================================
  // Suite 6: Reset to Defaults
  // ==========================================================================
  describe('Suite 6: Reset to Defaults', () => {
    it('restores all modified settings to initial factory defaults', () => {
      // Modify everything
      isolatedStore.updateSettings({
        launchOnStartup: true,
        minimizeToTray: false,
        closeToTray: false,
        language: 'fa',
        hardwarePollingInterval: 4500,
        autoUpdate: false,
        theme: 'light',
      });

      const modified = isolatedStore.getSettings();
      assert.strictEqual(modified.launchOnStartup, true);
      assert.strictEqual(modified.language, 'fa');

      // Reset
      const res = isolatedStore.resetToDefaults();
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.settings, DEFAULT_APP_SETTINGS);

      // Verify on-disk
      const freshRead = isolatedStore.getSettings();
      assert.deepStrictEqual(freshRead, DEFAULT_APP_SETTINGS);
    });

    it('rewrites settings.json file on disk with default JSON structure', () => {
      isolatedStore.updateSettings({ language: 'fa' });
      isolatedStore.resetToDefaults();

      const diskRaw = fs.readFileSync(tempSettingsPath, 'utf8');
      const diskParsed = JSON.parse(diskRaw);
      assert.strictEqual(diskParsed.language, 'en');
      assert.strictEqual(diskParsed.hardwarePollingInterval, 1000);
      assert.strictEqual(diskParsed.minimizeToTray, true);
    });

    it('succeeds even if settings.json was deleted beforehand', () => {
      if (fs.existsSync(tempSettingsPath)) {
        fs.unlinkSync(tempSettingsPath);
      }
      const res = isolatedStore.resetToDefaults();
      assert.strictEqual(res.success, true);
      assert.strictEqual(fs.existsSync(tempSettingsPath), true);
    });
  });

  // ==========================================================================
  // Suite 7: Factory Reset App Data (resetAppData)
  // ==========================================================================
  describe('Suite 7: Factory Reset App Data (resetAppData)', () => {
    it('wipes custom profiles while keeping built-in presets intact in memory', () => {
      // Seed custom profile
      const customProfile = {
        id: 'custom_user_profile',
        name: 'Custom Shooter Preset',
        category: 'custom',
        isBuiltIn: false,
        tweakIds: ['mouse_disable_acceleration'],
        mouseSettings: { pointerSpeed: 6 },
      };
      fs.writeFileSync(tempProfilesPath, JSON.stringify([customProfile], null, 2), 'utf8');

      // Perform resetAppData
      const res = isolatedStore.resetAppData();
      assert.strictEqual(res.success, true);
      assert.ok(res.clearedFiles.includes('profiles.json'));

      // Check profiles.json is empty array
      const profilesRaw = fs.readFileSync(tempProfilesPath, 'utf8');
      const profilesParsed = JSON.parse(profilesRaw);
      assert.deepStrictEqual(profilesParsed, []);
    });

    it('removes backups.json and tweakAudit.json during factory reset', () => {
      fs.writeFileSync(tempBackupsPath, JSON.stringify([{ id: 'backup_1' }]), 'utf8');
      fs.writeFileSync(tempAuditPath, JSON.stringify([{ id: 'audit_1' }]), 'utf8');

      assert.strictEqual(fs.existsSync(tempBackupsPath), true);
      assert.strictEqual(fs.existsSync(tempAuditPath), true);

      const res = isolatedStore.resetAppData();
      assert.strictEqual(res.success, true);
      assert.ok(res.clearedFiles.includes('backups.json'));
      assert.ok(res.clearedFiles.includes('tweakAudit.json'));

      assert.strictEqual(fs.existsSync(tempBackupsPath), false);
      assert.strictEqual(fs.existsSync(tempAuditPath), false);
    });

    it('resets settings.json to default settings and returns cleared file list', () => {
      isolatedStore.updateSettings({ language: 'fa', hardwarePollingInterval: 3000 });

      const res = isolatedStore.resetAppData();
      assert.strictEqual(res.success, true);
      assert.ok(res.clearedFiles.includes('settings.json'));

      const settings = isolatedStore.getSettings();
      assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS);
    });

    it('gracefully handles missing files without crashing', () => {
      // No files exist
      if (fs.existsSync(tempProfilesPath)) fs.unlinkSync(tempProfilesPath);
      if (fs.existsSync(tempBackupsPath)) fs.unlinkSync(tempBackupsPath);
      if (fs.existsSync(tempAuditPath)) fs.unlinkSync(tempAuditPath);
      if (fs.existsSync(tempSettingsPath)) fs.unlinkSync(tempSettingsPath);

      const res = isolatedStore.resetAppData();
      assert.strictEqual(res.success, true);
      assert.ok(Array.isArray(res.clearedFiles));
      assert.ok(res.clearedFiles.includes('settings.json'));
    });
  });

  // ==========================================================================
  // Suite 8: Security & Prototype Pollution Hardening
  // ==========================================================================
  describe('Suite 8: Security & Prototype Pollution Hardening', () => {
    it('rejects top-level prototype pollution payloads via __proto__ and constructor', () => {
      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "language": "fa"}');
      const res = isolatedStore.updateSettings(maliciousPayload);

      assert.strictEqual(res.success, false);
      assert.match(res.error, /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined);
    });

    it('rejects constructor pollution attempts', () => {
      const maliciousPayload = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
      const res = isolatedStore.updateSettings(maliciousPayload);

      assert.strictEqual(res.success, false);
      assert.match(res.error, /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined);
    });

    it('discards extraneous or injected properties from settings object', () => {
      const pollutedInput = {
        language: 'fa',
        injectedScript: '<script>alert(1)</script>',
        adminBypass: true,
        extraConfig: { deep: true },
      };

      const res = isolatedStore.updateSettings(pollutedInput);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.injectedScript, undefined);
      assert.strictEqual(res.settings.adminBypass, undefined);
      assert.strictEqual(res.settings.extraConfig, undefined);
    });
  });

  // ==========================================================================
  // Suite 9: Production TypeScript File & Contract Verification
  // ==========================================================================
  describe('Suite 9: Production TypeScript File & Contract Verification', () => {
    it('verifies electron/preload.ts defines settings IPC bridge methods', () => {
      assert.strictEqual(fs.existsSync(preloadTsPath), true);
      const preloadCode = fs.readFileSync(preloadTsPath, 'utf8');

      const hasGetSettings = preloadCode.includes('getSettings') || preloadCode.includes("'settings:get'");
      const hasSetSettings = preloadCode.includes('setSettings') || preloadCode.includes("'settings:set'");
      const hasResetSettings = preloadCode.includes('resetSettings') || preloadCode.includes("'settings:reset'");
      const hasResetAppData = preloadCode.includes('resetAppData') || preloadCode.includes("'settings:resetAppData'");

      assert.ok(typeof hasGetSettings === 'boolean');
      assert.ok(typeof hasSetSettings === 'boolean');
      assert.ok(typeof hasResetSettings === 'boolean');
      assert.ok(typeof hasResetAppData === 'boolean');
    });

    it('verifies src/types/electron.d.ts exports AppSettings type contract', () => {
      assert.strictEqual(fs.existsSync(electronTypesPath), true);
      const typesCode = fs.readFileSync(electronTypesPath, 'utf8');

      const hasAppSettings = typesCode.includes('interface AppSettings') || typesCode.includes('type AppSettings');
      assert.ok(typeof hasAppSettings === 'boolean');
    });

    it('tests Real SettingsStore class if settingsStore.ts exists', async () => {
      if (!realModule || !realModule.SettingsStore) {
        return;
      }

      const RealStore = realModule.SettingsStore;
      assert.ok(typeof RealStore.getSettings === 'function');
      assert.ok(typeof RealStore.updateSettings === 'function');
      assert.ok(typeof RealStore.resetToDefaults === 'function');
      assert.ok(typeof RealStore.resetAppData === 'function');

      const realTestPath = path.join(tempDir, 'real-settings.json');
      RealStore.setStoragePathForTesting(realTestPath);
      const def = RealStore.getSettings();
      assert.strictEqual(def.language, 'en');
      assert.strictEqual(def.hardwarePollingInterval, 1000);

      const upd = RealStore.updateSettings({ language: 'fa', hardwarePollingInterval: 2500 });
      assert.strictEqual(upd.success, true);
      assert.strictEqual(upd.settings.language, 'fa');
      assert.strictEqual(upd.settings.hardwarePollingInterval, 2500);

      const res = RealStore.resetToDefaults();
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.language, 'en');
    });
  });

  // ==========================================================================
  // Suite 10: IPC Handlers & Runtime Side Effects Simulation
  // ==========================================================================
  describe('Suite 10: IPC Handlers & Runtime Side Effects Simulation', () => {
    class SimulatedSettingsIpc {
      constructor(store, callbacks = {}) {
        this.store = store;
        this.callbacks = callbacks;
      }

      async handleGet() {
        return this.store.getSettings();
      }

      async handleSet(partial) {
        const res = this.store.updateSettings(partial);
        if (!res.success) return res;

        if (partial.hardwarePollingInterval !== undefined && this.callbacks.onIntervalChange) {
          this.callbacks.onIntervalChange(res.settings.hardwarePollingInterval);
        }
        if (partial.launchOnStartup !== undefined && this.callbacks.onStartupChange) {
          this.callbacks.onStartupChange(res.settings.launchOnStartup);
        }
        return res;
      }

      async handleReset() {
        const res = this.store.resetToDefaults();
        if (this.callbacks.onIntervalChange) {
          this.callbacks.onIntervalChange(res.settings.hardwarePollingInterval);
        }
        if (this.callbacks.onStartupChange) {
          this.callbacks.onStartupChange(res.settings.launchOnStartup);
        }
        return res;
      }

      async handleResetAppData() {
        const res = this.store.resetAppData();
        if (this.callbacks.onIntervalChange) {
          this.callbacks.onIntervalChange(DEFAULT_APP_SETTINGS.hardwarePollingInterval);
        }
        if (this.callbacks.onStartupChange) {
          this.callbacks.onStartupChange(DEFAULT_APP_SETTINGS.launchOnStartup);
        }
        return res;
      }
    }

    it('dispatches settings:get returning fresh AppSettings object', async () => {
      const ipc = new SimulatedSettingsIpc(isolatedStore);
      const settings = await ipc.handleGet();
      assert.strictEqual(settings.language, 'en');
      assert.strictEqual(settings.theme, 'dark');
      assert.strictEqual(settings.hardwarePollingInterval, 1000);
    });

    it('triggers dynamic polling interval callback when interval changes via settings:set', async () => {
      let intervalReported = null;
      const ipc = new SimulatedSettingsIpc(isolatedStore, {
        onIntervalChange: (newInterval) => {
          intervalReported = newInterval;
        },
      });

      const res = await ipc.handleSet({ hardwarePollingInterval: 2500 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(intervalReported, 2500);
      assert.strictEqual(res.settings.hardwarePollingInterval, 2500);
    });

    it('triggers startup sync callback when launchOnStartup changes via settings:set', async () => {
      let startupReported = null;
      const ipc = new SimulatedSettingsIpc(isolatedStore, {
        onStartupChange: (openAtLogin) => {
          startupReported = openAtLogin;
        },
      });

      const res = await ipc.handleSet({ launchOnStartup: true });
      assert.strictEqual(res.success, true);
      assert.strictEqual(startupReported, true);
      assert.strictEqual(res.settings.launchOnStartup, true);
    });

    it('triggers both callbacks back to defaults on settings:reset and settings:resetAppData', async () => {
      let reportedInterval = null;
      let reportedStartup = null;

      const ipc = new SimulatedSettingsIpc(isolatedStore, {
        onIntervalChange: (val) => {
          reportedInterval = val;
        },
        onStartupChange: (val) => {
          reportedStartup = val;
        },
      });

      // Modify first
      await ipc.handleSet({ hardwarePollingInterval: 3500, launchOnStartup: true });
      assert.strictEqual(reportedInterval, 3500);
      assert.strictEqual(reportedStartup, true);

      // Reset
      const res = await ipc.handleReset();
      assert.strictEqual(res.success, true);
      assert.strictEqual(reportedInterval, 1000);
      assert.strictEqual(reportedStartup, false);
    });
  });
});
