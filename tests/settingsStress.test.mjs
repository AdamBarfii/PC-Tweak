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

export const DEFAULT_APP_SETTINGS = {
  launchOnStartup: false,
  minimizeToTray: true,
  closeToTray: true,
  language: 'en',
  hardwarePollingInterval: 1000,
  autoUpdate: true,
  theme: 'dark',
};

async function loadRealSettingsStore() {
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
}

describe('Adversarial Backend Stress & Resilience Suite (tests/settingsStress.test.mjs)', () => {
  let tempDir;
  let tempSettingsPath;
  let RealStore;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-stress-settings-'));
    tempSettingsPath = path.join(tempDir, 'settings.json');

    const loaded = await loadRealSettingsStore();
    assert.ok(loaded && loaded.SettingsStore, 'Real SettingsStore must be loaded');
    RealStore = loaded.SettingsStore;
    RealStore.setStoragePathForTesting(tempSettingsPath);
  });

  after(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  beforeEach(() => {
    RealStore.setStoragePathForTesting(tempSettingsPath);
    if (fs.existsSync(tempSettingsPath)) {
      try {
        fs.unlinkSync(tempSettingsPath);
      } catch {}
    }
  });

  // ==========================================================================
  // Suite 1: Concurrent and Rapid Sequential Updates (Race Condition Resilience)
  // ==========================================================================
  describe('Suite 1: Concurrent and Rapid Sequential Updates', () => {
    it('survives 200 rapid synchronous sequential updates alternating all properties', () => {
      const themes = ['light', 'dark', 'system'];
      const languages = ['en', 'fa'];

      for (let i = 0; i < 200; i++) {
        const payload = {
          theme: themes[i % themes.length],
          language: languages[i % languages.length],
          hardwarePollingInterval: 500 + (i * 25) % 4500,
          minimizeToTray: i % 2 === 0,
          closeToTray: i % 3 === 0,
          launchOnStartup: i % 5 === 0,
          autoUpdate: i % 4 === 0,
        };

        const res = RealStore.updateSettings(payload);
        assert.strictEqual(res.success, true, `Update #${i} must succeed`);
        assert.strictEqual(res.settings.theme, payload.theme);
        assert.strictEqual(res.settings.language, payload.language);
      }

      // Verify on-disk file remains clean and valid JSON
      assert.strictEqual(fs.existsSync(tempSettingsPath), true);
      const raw = fs.readFileSync(tempSettingsPath, 'utf8');
      const parsed = JSON.parse(raw);
      assert.strictEqual(typeof parsed, 'object');
      assert.strictEqual(parsed.theme, themes[199 % themes.length]);
      assert.strictEqual(parsed.language, languages[199 % languages.length]);
    });

    it('handles 100 concurrent asynchronous updates via Promise.all without file corruption', async () => {
      const workers = Array.from({ length: 100 }, (_, i) => {
        return (async () => {
          // slight event-loop desynchronization
          await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
          return RealStore.updateSettings({
            hardwarePollingInterval: 500 + (i * 45) % 4500,
            launchOnStartup: i % 2 === 0,
          });
        })();
      });

      const results = await Promise.all(workers);
      for (const res of results) {
        assert.strictEqual(res.success, true);
        assert.ok(res.settings.hardwarePollingInterval >= 500);
        assert.ok(res.settings.hardwarePollingInterval <= 5000);
      }

      // Verify final stored state is completely valid and parseable
      const diskContent = fs.readFileSync(tempSettingsPath, 'utf8');
      assert.doesNotThrow(() => JSON.parse(diskContent), 'Saved settings must remain strictly valid JSON');
      const finalSettings = RealStore.getSettings();
      assert.ok(finalSettings.hardwarePollingInterval >= 500);
      assert.ok(finalSettings.hardwarePollingInterval <= 5000);
    });

    it('interleaves multi-field updates without losing independent state', async () => {
      RealStore.resetToDefaults();

      // Thread A updates language, Thread B updates theme, Thread C updates interval
      const p1 = (async () => RealStore.updateSettings({ language: 'fa' }))();
      const p2 = (async () => RealStore.updateSettings({ theme: 'light' }))();
      const p3 = (async () => RealStore.updateSettings({ hardwarePollingInterval: 2500 }))();

      await Promise.all([p1, p2, p3]);

      const state = RealStore.getSettings();
      assert.strictEqual(state.language, 'fa');
      assert.strictEqual(state.theme, 'light');
      assert.strictEqual(state.hardwarePollingInterval, 2500);
      assert.strictEqual(state.minimizeToTray, true); // preserved default
    });
  });

  // ==========================================================================
  // Suite 2: Adversarial Prototype Pollution & Property Injection
  // ==========================================================================
  describe('Suite 2: Adversarial Prototype Pollution & Property Injection', () => {
    it('detects and blocks direct __proto__ prototype pollution attacks', () => {
      const payload = JSON.parse('{"__proto__": {"polluted": true, "isAdmin": true}, "language": "fa"}');
      const res = RealStore.updateSettings(payload);

      assert.strictEqual(res.success, false, 'Payload with __proto__ must be rejected');
      assert.match(res.error || '', /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');
      assert.strictEqual(({}).isAdmin, undefined, 'Object.prototype must not be polluted');
    });

    it('detects and blocks constructor prototype pollution attacks', () => {
      const payload = JSON.parse('{"constructor": {"prototype": {"hacked": true}}}');
      const res = RealStore.updateSettings(payload);

      assert.strictEqual(res.success, false, 'Payload with constructor property must be rejected');
      assert.match(res.error || '', /prototype pollution/i);
      assert.strictEqual(({}).hacked, undefined);
    });

    it('detects and blocks explicit prototype property attack', () => {
      const payload = { prototype: { evil: true } };
      const res = RealStore.updateSettings(payload);

      assert.strictEqual(res.success, false, 'Payload with prototype property must be rejected');
      assert.match(res.error || '', /prototype pollution/i);
      assert.strictEqual(({}).evil, undefined);
    });

    it('safely handles objects with null prototype Object.create(null)', () => {
      const nullProto = Object.create(null);
      nullProto.language = 'fa';
      nullProto.hardwarePollingInterval = 1500;

      const res = RealStore.updateSettings(nullProto);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.language, 'fa');
      assert.strictEqual(res.settings.hardwarePollingInterval, 1500);
    });

    it('strips massive property bloating (1,000 arbitrary injected properties)', () => {
      const bloated = { language: 'fa' };
      for (let i = 0; i < 1000; i++) {
        bloated[`extra_injected_${i}`] = `payload_${i}`;
      }

      const res = RealStore.updateSettings(bloated);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.language, 'fa');

      // Check on-disk JSON only contains the 7 official keys
      const saved = JSON.parse(fs.readFileSync(tempSettingsPath, 'utf8'));
      const keys = Object.keys(saved).sort();
      const expectedKeys = [
        'autoUpdate',
        'closeToTray',
        'hardwarePollingInterval',
        'language',
        'launchOnStartup',
        'minimizeToTray',
        'theme',
      ].sort();
      assert.deepStrictEqual(keys, expectedKeys, 'Only official keys should be written to disk');
    });

    it('preserves existing settings and disk integrity when a throwing getter payload is intercepted', () => {
      RealStore.updateSettings({ theme: 'dark', language: 'en' });

      const trapObj = {
        theme: 'light',
        get evil() {
          throw new Error('Exploit attempt in getter');
        },
      };

      // updateSettings will throw because JS object spread evaluates own getters
      assert.throws(() => {
        RealStore.updateSettings(trapObj);
      }, /Exploit attempt in getter/);

      // Verify previous state on disk was NOT corrupted by the aborted write
      const current = RealStore.getSettings();
      assert.strictEqual(current.theme, 'dark');
      assert.strictEqual(current.language, 'en');
    });

    it('handles simulated IPC handler catching of throwing getter payloads without crashing', async () => {
      // Simulate ipcMain.handle('settings:set') wrapper behavior
      const simulatedIpcSet = async (partial) => {
        try {
          return RealStore.updateSettings(partial);
        } catch (err) {
          return {
            success: false,
            error: err.message,
            settings: RealStore.getSettings(),
          };
        }
      };

      const trapObj = {
        get evil() {
          throw new Error('IPC trap error');
        },
      };

      const res = await simulatedIpcSet(trapObj);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'IPC trap error');
      assert.ok(res.settings);
    });
  });

  // ==========================================================================
  // Suite 3: Extreme Boundary and Corrupted Input Testing for hardwarePollingInterval
  // ==========================================================================
  describe('Suite 3: Extreme Boundary and Corrupted Input for hardwarePollingInterval', () => {
    it('clamps extreme negative, zero, and sub-500 integer boundaries strictly to 500', () => {
      const underflowCases = [-999999, -1000000, -1, 0, 1, 100, 250, 499];
      for (const val of underflowCases) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          500,
          `Input ${val} must be clamped to 500, got ${res.settings.hardwarePollingInterval}`
        );
      }
    });

    it('accepts exact lower bound 500 and exact upper bound 5000', () => {
      const lowerRes = RealStore.updateSettings({ hardwarePollingInterval: 500 });
      assert.strictEqual(lowerRes.settings.hardwarePollingInterval, 500);

      const upperRes = RealStore.updateSettings({ hardwarePollingInterval: 5000 });
      assert.strictEqual(upperRes.settings.hardwarePollingInterval, 5000);
    });

    it('clamps extreme positive boundaries (> 5000) strictly to 5000', () => {
      const overflowCases = [5001, 5002, 6000, 10000, 1000000, 999999999, Number.MAX_SAFE_INTEGER];
      for (const val of overflowCases) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          5000,
          `Input ${val} must be clamped to 5000, got ${res.settings.hardwarePollingInterval}`
        );
      }
    });

    it('falls back to default 1000 for NaN, Infinity, -Infinity', () => {
      for (const badNum of [NaN, Infinity, -Infinity]) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: badNum });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          1000,
          `Special number ${String(badNum)} must fall back to 1000`
        );
      }
    });

    it('handles numeric strings with trimming and clamps them correctly', () => {
      const stringCases = [
        { in: '500', expected: 500 },
        { in: '  2000  ', expected: 2000 },
        { in: '5000', expected: 5000 },
        { in: '50', expected: 500 }, // clamped
        { in: '99999', expected: 5000 }, // clamped
        { in: '-500', expected: 500 }, // clamped
      ];

      for (const item of stringCases) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: item.in });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          item.expected,
          `String '${item.in}' should yield ${item.expected}`
        );
      }
    });

    it('falls back to default 1000 for non-numeric strings, SQL injection, and path traversal strings', () => {
      const invalidStrings = [
        'abc',
        '',
        'NaN',
        'Infinity',
        '1000; DROP TABLE settings;',
        '../../../etc/passwd',
        '<script>alert(1)</script>',
        '\x00\x01\x02',
      ];

      for (const str of invalidStrings) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: str });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          1000,
          `String '${str}' must fall back to 1000`
        );
      }
    });

    it('empirically documents whitespace string coercion to 0 clamped to 500ms min interval', () => {
      // In JavaScript: Number('   ') === 0. Because 0 < 500, it clamps safely to 500ms.
      const res = RealStore.updateSettings({ hardwarePollingInterval: '   ' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(
        res.settings.hardwarePollingInterval,
        500,
        'Whitespace string coercing to 0 must be clamped to 500ms'
      );
    });

    it('falls back to default 1000 for null, undefined, booleans, objects, and arrays', () => {
      const typeFuzz = [
        null,
        undefined,
        true,
        false,
        {},
        { interval: 2000 },
        [],
        [1000],
        [500, 5000],
      ];

      for (const badVal of typeFuzz) {
        const res = RealStore.updateSettings({ hardwarePollingInterval: badVal });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          res.settings.hardwarePollingInterval,
          1000,
          `Value ${JSON.stringify(badVal)} must fall back to 1000`
        );
      }
    });

    it('rounds fractional milliseconds accurately before clamping', () => {
      assert.strictEqual(
        RealStore.updateSettings({ hardwarePollingInterval: 1250.4 }).settings.hardwarePollingInterval,
        1250
      );
      assert.strictEqual(
        RealStore.updateSettings({ hardwarePollingInterval: 1250.6 }).settings.hardwarePollingInterval,
        1251
      );
      assert.strictEqual(
        RealStore.updateSettings({ hardwarePollingInterval: 499.8 }).settings.hardwarePollingInterval,
        500
      );
      assert.strictEqual(
        RealStore.updateSettings({ hardwarePollingInterval: 5000.4 }).settings.hardwarePollingInterval,
        5000
      );
    });
  });

  // ==========================================================================
  // Suite 4: Unexpected and Malicious Language / Theme Inputs
  // ==========================================================================
  describe('Suite 4: Unexpected and Malicious Language / Theme Inputs', () => {
    it('falls back to default "en" for SQL injections, command injections, and path traversal strings in language', () => {
      const maliciousLanguages = [
        "'; DROP TABLE settings; --",
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '<script>alert("xss")</script>',
        '${7*7}',
        '{{7*7}}',
        'SELECT * FROM settings',
        '/bin/sh',
        'fa; reboot;',
      ];

      for (const badLang of maliciousLanguages) {
        const res = RealStore.updateSettings({ language: badLang });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.settings.language, 'en', `Language '${badLang}' must fall back to 'en'`);
      }
    });

    it('falls back to default "en" for unsupported legitimate language codes and invalid types', () => {
      const unsupported = ['de', 'fr', 'es', 'zh', 'ar', 'ru', 'it', 'ja', '', 123, true, {}, []];
      for (const val of unsupported) {
        const res = RealStore.updateSettings({ language: val });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.settings.language, 'en', `Language ${String(val)} must fall back to 'en'`);
      }
    });

    it('accepts and normalizes valid language codes ("fa", "en", "FA", "  en  ")', () => {
      assert.strictEqual(RealStore.updateSettings({ language: 'fa' }).settings.language, 'fa');
      assert.strictEqual(RealStore.updateSettings({ language: 'en' }).settings.language, 'en');
      assert.strictEqual(RealStore.updateSettings({ language: 'FA' }).settings.language, 'fa');
      assert.strictEqual(RealStore.updateSettings({ language: '  fa  ' }).settings.language, 'fa');
      assert.strictEqual(RealStore.updateSettings({ language: '  EN  ' }).settings.language, 'en');
    });

    it('falls back to "dark" for malicious or unknown theme inputs', () => {
      const badThemes = [
        '<svg onload=alert(1)>',
        'cyberpunk',
        'matrix',
        'blue',
        'high_contrast',
        '',
        null,
        undefined,
        12345,
        {},
      ];

      for (const th of badThemes) {
        const res = RealStore.updateSettings({ theme: th });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.settings.theme, 'dark', `Theme '${String(th)}' must fall back to 'dark'`);
      }
    });

    it('accepts and normalizes valid themes ("dark", "light", "system", "DARK", "  Light  ")', () => {
      assert.strictEqual(RealStore.updateSettings({ theme: 'light' }).settings.theme, 'light');
      assert.strictEqual(RealStore.updateSettings({ theme: 'system' }).settings.theme, 'system');
      assert.strictEqual(RealStore.updateSettings({ theme: 'dark' }).settings.theme, 'dark');
      assert.strictEqual(RealStore.updateSettings({ theme: 'LIGHT' }).settings.theme, 'light');
      assert.strictEqual(RealStore.updateSettings({ theme: '  system  ' }).settings.theme, 'system');
    });
  });

  // ==========================================================================
  // Suite 5: Malformed, Truncated, and Corrupted Disk Files Recovery
  // ==========================================================================
  describe('Suite 5: Malformed, Truncated, and Corrupted Disk Files Recovery', () => {
    it('gracefully returns default settings when settings.json contains truncated JSON', () => {
      fs.writeFileSync(tempSettingsPath, '{"theme": "light", "hardwarePollingInterval": 2500, "lang', 'utf8');

      const settings = RealStore.getSettings();
      assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS);
    });

    it('gracefully returns default settings when settings.json is completely empty (0 bytes)', () => {
      fs.writeFileSync(tempSettingsPath, '', 'utf8');

      const settings = RealStore.getSettings();
      assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS);
    });

    it('gracefully returns default settings when settings.json contains only whitespace', () => {
      fs.writeFileSync(tempSettingsPath, '   \r\n\t   \n  ', 'utf8');

      const settings = RealStore.getSettings();
      assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS);
    });

    it('gracefully returns default settings when settings.json contains binary garbage', () => {
      const garbage = Buffer.from([0x00, 0xff, 0xfe, 0x12, 0x45, 0x78, 0xba, 0xbe]);
      fs.writeFileSync(tempSettingsPath, garbage);

      const settings = RealStore.getSettings();
      assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS);
    });

    it('gracefully returns default settings when settings.json is a JSON primitive or array', () => {
      const nonObjects = ['"just a string"', '12345', 'true', 'null', '[]', '[1, 2, 3]'];
      for (const nonObj of nonObjects) {
        fs.writeFileSync(tempSettingsPath, nonObj, 'utf8');
        const settings = RealStore.getSettings();
        assert.deepStrictEqual(settings, DEFAULT_APP_SETTINGS, `Non-object JSON '${nonObj}' must return defaults`);
      }
    });

    it('self-heals: subsequent updateSettings heals corrupted disk file and writes valid JSON', () => {
      fs.writeFileSync(tempSettingsPath, '!!! CORRUPTED DISK DATA !!!', 'utf8');

      const res = RealStore.updateSettings({ language: 'fa', hardwarePollingInterval: 2000 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settings.language, 'fa');
      assert.strictEqual(res.settings.hardwarePollingInterval, 2000);

      // Verify file on disk is healed and valid
      const diskRaw = fs.readFileSync(tempSettingsPath, 'utf8');
      const diskParsed = JSON.parse(diskRaw);
      assert.strictEqual(diskParsed.language, 'fa');
      assert.strictEqual(diskParsed.hardwarePollingInterval, 2000);
      assert.strictEqual(diskParsed.theme, 'dark');
    });

    it('creates parent directory recursively when writing to previously non-existent path', () => {
      const deepPath = path.join(tempDir, 'deep', 'sub', 'folder', 'settings.json');
      RealStore.setStoragePathForTesting(deepPath);

      const res = RealStore.updateSettings({ theme: 'system' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(fs.existsSync(deepPath), true);

      const saved = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
      assert.strictEqual(saved.theme, 'system');
    });
  });

  // ==========================================================================
  // Suite 6: Factory Reset (resetAppData) Edge Cases & Static Asset Preservation
  // ==========================================================================
  describe('Suite 6: Factory Reset (resetAppData) Edge Cases & Static Asset Preservation', () => {
    it('resets custom profiles to [], unlinks backups/tweakAudit, and preserves static antiCheat assets', () => {
      const storageDir = tempDir;
      const profilesPath = path.join(storageDir, 'profiles.json');
      const backupsPath = path.join(storageDir, 'backups.json');
      const auditPath = path.join(storageDir, 'tweakAudit.json');
      const antiCheatPath = path.join(storageDir, 'antiCheatRequirements.json');
      const customCachePath = path.join(storageDir, 'otherAsset.dat');

      // 1. Seed custom user profile
      const userProfiles = [
        {
          id: 'user_custom_1',
          name: 'My Custom Gaming Preset',
          category: 'custom',
          isBuiltIn: false,
          tweakIds: ['mouse_disable_acceleration'],
        },
      ];
      fs.writeFileSync(profilesPath, JSON.stringify(userProfiles, null, 2), 'utf8');

      // 2. Seed backups
      fs.writeFileSync(backupsPath, JSON.stringify([{ backupId: 'bk_1', date: '2026-11-06' }]), 'utf8');

      // 3. Seed tweak audit log
      fs.writeFileSync(auditPath, JSON.stringify([{ tweakId: 'wer_service', action: 'applied' }]), 'utf8');

      // 4. Seed static antiCheatRequirements.json (CRITICAL STATIC ASSET)
      const antiCheatContent = JSON.stringify([
        { id: 'vanguard', name: 'Riot Vanguard', requiredSecureBoot: 'required' },
      ]);
      fs.writeFileSync(antiCheatPath, antiCheatContent, 'utf8');

      // 5. Seed other asset
      fs.writeFileSync(customCachePath, 'STATIC CACHE DATA', 'utf8');

      // 6. Set custom settings
      RealStore.updateSettings({ language: 'fa', hardwarePollingInterval: 3500, theme: 'light' });

      // EXECUTE FACTORY RESET
      const resetResult = RealStore.resetAppData();

      // Assertions:
      assert.strictEqual(resetResult.success, true);
      assert.ok(resetResult.clearedFiles.includes('profiles.json'), 'profiles.json must be in cleared list');
      assert.ok(resetResult.clearedFiles.includes('settings.json'), 'settings.json must be in cleared list');
      assert.ok(resetResult.clearedFiles.includes('backups.json'), 'backups.json must be in cleared list');
      assert.ok(resetResult.clearedFiles.includes('tweakAudit.json'), 'tweakAudit.json must be in cleared list');

      // profiles.json must exist and be an empty array []
      assert.strictEqual(fs.existsSync(profilesPath), true, 'profiles.json must still exist');
      const profilesOnDisk = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
      assert.deepStrictEqual(profilesOnDisk, [], 'profiles.json must contain empty array []');

      // backups.json and tweakAudit.json must be removed
      assert.strictEqual(fs.existsSync(backupsPath), false, 'backups.json must be unlinked');
      assert.strictEqual(fs.existsSync(auditPath), false, 'tweakAudit.json must be unlinked');

      // settings.json must be reset to defaults
      const currentSettings = RealStore.getSettings();
      assert.deepStrictEqual(currentSettings, DEFAULT_APP_SETTINGS, 'Settings must match defaults exactly');

      // CRITICAL: antiCheatRequirements.json must be 100% UNTOUCHED
      assert.strictEqual(fs.existsSync(antiCheatPath), true, 'antiCheatRequirements.json must exist');
      const preservedAntiCheat = fs.readFileSync(antiCheatPath, 'utf8');
      assert.strictEqual(preservedAntiCheat, antiCheatContent, 'antiCheatRequirements.json content must be intact');

      // otherAsset.dat must be UNTOUCHED
      assert.strictEqual(fs.existsSync(customCachePath), true, 'other assets must remain untouched');
      assert.strictEqual(fs.readFileSync(customCachePath, 'utf8'), 'STATIC CACHE DATA');
    });

    it('resetAppData succeeds idempotently when files do not exist or are already cleared', () => {
      const storageDir = tempDir;
      const profilesPath = path.join(storageDir, 'profiles.json');
      const backupsPath = path.join(storageDir, 'backups.json');
      const auditPath = path.join(storageDir, 'tweakAudit.json');
      const settingsPath = path.join(storageDir, 'settings.json');

      for (const p of [profilesPath, backupsPath, auditPath, settingsPath]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }

      const res = RealStore.resetAppData();
      assert.strictEqual(res.success, true);
      assert.ok(Array.isArray(res.clearedFiles));
      assert.ok(res.clearedFiles.includes('settings.json'));
      assert.deepStrictEqual(RealStore.getSettings(), DEFAULT_APP_SETTINGS);
    });
  });

  // ==========================================================================
  // Suite 7: Immutability and State Leakage Stress
  // ==========================================================================
  describe('Suite 7: Immutability and State Leakage Stress', () => {
    it('modifications to returned getSettings() do not poison subsequent store reads', () => {
      const s1 = RealStore.getSettings();
      s1.theme = 'light';
      s1.language = 'fa';
      s1.hardwarePollingInterval = 4999;
      s1.injectedLeak = 'poisoned';

      const s2 = RealStore.getSettings();
      assert.strictEqual(s2.theme, 'dark');
      assert.strictEqual(s2.language, 'en');
      assert.strictEqual(s2.hardwarePollingInterval, 1000);
      assert.strictEqual(s2.injectedLeak, undefined);
    });

    it('modifications to updateSettings input object after call do not affect saved state', () => {
      const inputObj = {
        theme: 'light',
        hardwarePollingInterval: 1500,
      };

      const res = RealStore.updateSettings(inputObj);
      assert.strictEqual(res.success, true);

      // Mutate inputObj post-call
      inputObj.theme = 'system';
      inputObj.hardwarePollingInterval = 4500;

      const current = RealStore.getSettings();
      assert.strictEqual(current.theme, 'light');
      assert.strictEqual(current.hardwarePollingInterval, 1500);
    });
  });
});
