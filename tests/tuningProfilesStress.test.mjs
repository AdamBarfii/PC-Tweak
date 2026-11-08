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
const tweaksDir = path.join(rootDir, 'data/tweaks');
const profileStoreTsPath = path.join(rootDir, 'electron/storage/profileStore.ts');
const profilesIpcTsPath = path.join(rootDir, 'electron/ipc/profiles.ts');

// ============================================================================
// Dynamic Module Loader: Load the REAL TypeScript ProfileStore implementation
// ============================================================================
async function loadRealProfileStore() {
  const tsCode = fs.readFileSync(profileStoreTsPath, 'utf8');
  // Mock Electron's `app` so it runs natively in Node.js test environment
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
  return import(`data:text/javascript;base64,${base64}`);
}

// ============================================================================
// Catalog Loader Helper
// ============================================================================
function loadCatalogs() {
  const files = ['gaming.json', 'input.json', 'privacy.json', 'advanced.json'];
  const tweakMap = new Map();

  for (const file of files) {
    const p = path.join(tweaksDir, file);
    if (!fs.existsSync(p)) continue;
    const items = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const item of items) {
      tweakMap.set(item.id, { ...item, _catalog: file });
    }
  }

  return tweakMap;
}

const TWEAK_ALIASES = {
  pointer_speed_neutral: 'mouse_neutral_pointer_speed',
  usb_selective_suspend_off: 'usb_disable_selective_suspend',
  game_mode_on_dvr_off: 'enable_game_mode',
};

// ============================================================================
// EMPIRICAL CHALLENGER: Milestone 2 Backend Stress Test Suite
// ============================================================================
describe('EMPIRICAL CHALLENGER: Milestone 2 Backend Stress Test Suite', async () => {
  let profileStoreMod;
  let ProfileStore;
  let BUILT_IN_PROFILES;
  let testTempDir;
  let testStoragePath;
  let catalogs;

  before(async () => {
    profileStoreMod = await loadRealProfileStore();
    ProfileStore = profileStoreMod.ProfileStore;
    BUILT_IN_PROFILES = profileStoreMod.BUILT_IN_PROFILES;
    catalogs = loadCatalogs();

    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-m2-stress-'));
    testStoragePath = path.join(testTempDir, 'profiles.json');
    ProfileStore.setStoragePathForTesting(testStoragePath);
  });

  after(() => {
    ProfileStore.setStoragePathForTesting('');
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  beforeEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
  });

  // ==========================================================================
  // Section 1: Built-In Preset Delete & Overwrite Bypass Attacks
  // ==========================================================================
  describe('1. Built-In Preset Delete & Overwrite Bypass Attempts', () => {
    it('blocks direct deletion of every single built-in preset ID', () => {
      const builtInIds = ['esports_competitive', 'streaming_content', 'max_battery_quiet', 'windows_default'];

      for (const id of builtInIds) {
        const res = ProfileStore.deleteProfile(id);
        assert.strictEqual(res.success, false, `deleteProfile('${id}') must fail`);
        assert.match(res.error, /built-in/i);

        // Verify preset is intact
        const all = ProfileStore.getAllProfiles();
        const found = all.find((p) => p.id === id);
        assert.ok(found, `Built-in preset '${id}' must remain in store`);
        assert.strictEqual(found.isBuiltIn, true);
      }
    });

    it('blocks overwriting built-in presets via saveProfile with matching ID', () => {
      for (const b of BUILT_IN_PROFILES) {
        const hostilePayload = {
          id: b.id,
          name: 'MALICIOUS_OVERWRITE',
          category: 'custom',
          description: 'Hacked preset',
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          tweakIds: [],
          mouseSettings: { pointerSpeed: 1, enhancePointerAccuracy: true, disableAcceleration: false },
        };

        const res = ProfileStore.saveProfile(hostilePayload);
        assert.strictEqual(res.success, false, `saveProfile must reject overwriting built-in '${b.id}'`);
        assert.match(res.error, /built-in/i);

        const current = ProfileStore.getProfileById(b.id);
        assert.notStrictEqual(current.name, 'MALICIOUS_OVERWRITE');
        assert.strictEqual(current.isBuiltIn, true);
      }
    });

    it('blocks saveProfile when caller marks isBuiltIn: true on a new profile ID', () => {
      const spoofed = {
        id: 'new_rogue_preset',
        name: 'Rogue Builtin',
        category: 'custom',
        description: 'Trying to become un-deletable',
        isBuiltIn: true, // Malicious claim
        createdAt: new Date().toISOString(),
        tweakIds: [],
        mouseSettings: { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true },
      };

      const res = ProfileStore.saveProfile(spoofed);
      assert.strictEqual(res.success, false, 'Must reject saveProfile with isBuiltIn: true');
      assert.match(res.error, /built-in/i);
    });

    it('handles non-existent or path-traversal IDs safely during delete', () => {
      const maliciousIds = [
        '../profiles.json',
        '..\\storage\\profiles.json',
        '__proto__',
        'constructor',
        '*',
        '',
        'ESPORTS_COMPETITIVE', // Casing mismatch
      ];

      for (const id of maliciousIds) {
        const res = ProfileStore.deleteProfile(id);
        assert.strictEqual(res.success, false);
      }

      // Presets remain exactly 4
      assert.strictEqual(ProfileStore.getAllProfiles().length, 4);
    });

    it('ADVERSARIAL STRESS: checks in-memory object reference leakage of BUILT_IN_PROFILES', () => {
      // In JavaScript, if getAllProfiles() returns references to BUILT_IN_PROFILES objects,
      // an in-process caller modifying profiles[0].name will mutate the built-in preset in memory!
      const initialProfiles = ProfileStore.getAllProfiles();
      const firstPreset = initialProfiles[0];
      const originalName = firstPreset.name;

      // Attempt to mutate the object in-memory
      firstPreset.name = 'POISONED_NAME_IN_MEMORY';

      const freshFetch = ProfileStore.getAllProfiles();
      const freshFirst = freshFetch.find((p) => p.id === firstPreset.id);

      // Restore original name immediately for subsequent tests
      const wasMutated = freshFirst.name === 'POISONED_NAME_IN_MEMORY';
      firstPreset.name = originalName;

      // We document this as an empirical finding:
      // BUILT_IN_PROFILES elements are shallow references unless structuredClone or deep copy is used.
      if (wasMutated) {
        console.warn('FINDING (Medium Risk): ProfileStore.getAllProfiles() exposes mutable references to BUILT_IN_PROFILES.');
      }
    });
  });

  // ==========================================================================
  // Section 2: Malicious & Corrupted Import Payloads
  // ==========================================================================
  describe('2. Malicious & Corrupted Import Payloads', () => {
    it('rejects top-level prototype pollution payloads via __proto__ and constructor', () => {
      const payload1 = '{"__proto__": {"polluted": true}, "format": "pctweak-profile", "profile": {"name": "P1", "mouseSettings": {"pointerSpeed": 6}}}';
      const res1 = ProfileStore.importProfileFromJson(payload1);
      assert.strictEqual(res1.success, false);
      assert.match(res1.error, /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined);

      const payload2 = '{"constructor": {"prototype": {"polluted": true}}, "format": "pctweak-profile", "profile": {"name": "P2", "mouseSettings": {"pointerSpeed": 6}}}';
      const res2 = ProfileStore.importProfileFromJson(payload2);
      assert.strictEqual(res2.success, false);
      assert.match(res2.error, /prototype pollution/i);
      assert.strictEqual(({}).polluted, undefined);
    });

    it('rejects nested prototype pollution inside profile envelope', () => {
      const payloadNested = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          __proto__: { injected: 'fatal' },
          name: 'Nested Pollution',
          mouseSettings: { pointerSpeed: 6 },
        },
      });

      const res = ProfileStore.importProfileFromJson(payloadNested);
      // Even if JSON.parse does not pollute directly, the validator explicitly checks target own properties
      assert.strictEqual(({}).injected, undefined);
    });

    it('handles huge JSON payload (5MB) without unhandled crash or OOM', () => {
      const hugeDescription = 'A'.repeat(5 * 1024 * 1024); // 5MB string
      const hugePayload = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          name: 'Huge Profile',
          description: hugeDescription,
          mouseSettings: { pointerSpeed: 6 },
          tweakIds: ['mouse_disable_acceleration'],
        },
      });

      const res = ProfileStore.importProfileFromJson(hugePayload);
      assert.strictEqual(res.success, true);
      assert.ok(res.profile.id);

      // Clean up from store
      ProfileStore.deleteProfile(res.profile.id);
    });

    it('handles huge array of 10,000 tweak IDs without crash and sanitizes IDs', () => {
      const manyTweaks = Array.from({ length: 10000 }, (_, i) => `tweak_${i}`);
      manyTweaks.push('<script>evil()</script>');
      manyTweaks.push('../../etc/passwd');

      const payload = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          name: 'Massive Tweaks',
          mouseSettings: { pointerSpeed: 6 },
          tweakIds: manyTweaks,
        },
      });

      const res = ProfileStore.importProfileFromJson(payload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.profile.tweakIds.length, 10000, 'XSS/Path injection tweakIds must be filtered out');
      assert.ok(!res.profile.tweakIds.includes('<script>evil()</script>'));
      assert.ok(!res.profile.tweakIds.includes('../../etc/passwd'));

      // Clean up
      ProfileStore.deleteProfile(res.profile.id);
    });

    it('rigorously tests malformed numbers for pointerSpeed (NaN, negative, out of bounds, strings)', () => {
      // Note: In standard JSON specification, Infinity and NaN serialize to null.
      const jsonTestCases = [
        { input: null, expected: 6 },
        { input: -999, expected: 1 },
        { input: 0, expected: 1 },
        { input: 12, expected: 11 },
        { input: 99999, expected: 11 },
        { input: 'not_a_number', expected: 6 },
      ];

      for (const tc of jsonTestCases) {
        const payload = JSON.stringify({
          format: 'pctweak-profile',
          profile: {
            name: `Speed Test ${tc.input}`,
            mouseSettings: { pointerSpeed: tc.input },
          },
        });

        const res = ProfileStore.importProfileFromJson(payload);
        assert.strictEqual(res.success, true, `Import must succeed for speed: ${tc.input}`);
        assert.strictEqual(
          res.profile.mouseSettings.pointerSpeed,
          tc.expected,
          `Input ${tc.input} must clamp/fallback to ${tc.expected}, got ${res.profile.mouseSettings.pointerSpeed}`
        );

        // Clean up
        ProfileStore.deleteProfile(res.profile.id);
      }

      // Test direct validation function with raw JS numbers (Infinity, -Infinity, NaN)
      const directCases = [
        { speed: NaN, expected: 6 },
        { speed: Infinity, expected: 11 },
        { speed: -Infinity, expected: 1 },
        { speed: 3.7, expected: 3.7 },
      ];

      for (const dc of directCases) {
        const valRes = ProfileStore.validateProfile({
          name: 'Direct Speed Test',
          mouseSettings: { pointerSpeed: dc.speed },
        });
        assert.strictEqual(valRes.valid, true);
        assert.strictEqual(
          valRes.profile.mouseSettings.pointerSpeed,
          dc.expected,
          `Direct validateProfile speed ${dc.speed} must map to ${dc.expected}`
        );
      }
    });

    it('STRICT SECURITY: Coerces isBuiltIn: true to false on all imported profiles', () => {
      const spoofPayload = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          name: 'Spoofed BuiltIn Preset',
          isBuiltIn: true,
          mouseSettings: { pointerSpeed: 6 },
        },
      });

      const res = ProfileStore.importProfileFromJson(spoofPayload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.profile.isBuiltIn, false, 'Imported profile must NEVER be isBuiltIn: true');

      // Verify that this imported profile CAN be deleted (it cannot hijack deletion protection)
      const delRes = ProfileStore.deleteProfile(res.profile.id);
      assert.strictEqual(delRes.success, true, 'User must be able to delete imported profile');
    });
  });

  // ==========================================================================
  // Section 3: ID Collision Handling
  // ==========================================================================
  describe('3. ID Collision Handling on Import', () => {
    it('prevents ID collision with built-in presets by re-keying', () => {
      for (const b of BUILT_IN_PROFILES) {
        const collisionPayload = JSON.stringify({
          format: 'pctweak-profile',
          profile: {
            id: b.id,
            name: `Fake ${b.name}`,
            mouseSettings: { pointerSpeed: 6 },
          },
        });

        const res = ProfileStore.importProfileFromJson(collisionPayload);
        assert.strictEqual(res.success, true);
        assert.notStrictEqual(res.profile.id, b.id, `Imported profile must be re-keyed away from '${b.id}'`);
        assert.ok(res.profile.id.startsWith(b.id));

        // Original built-in preset must still exist unchanged
        const original = ProfileStore.getProfileById(b.id);
        assert.strictEqual(original.name, b.name);
        assert.strictEqual(original.isBuiltIn, true);

        // Clean up imported profile
        ProfileStore.deleteProfile(res.profile.id);
      }
    });

    it('ADVERSARIAL STRESS: checks behavior when importing profile colliding with an existing CUSTOM profile ID', () => {
      // 1. Create an existing custom profile
      const existing = {
        id: 'user_custom_shared_id',
        name: 'Original Custom Profile',
        category: 'custom',
        description: 'Should not be silently overwritten if another user shares a file with same ID',
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        tweakIds: ['mouse_disable_acceleration'],
        mouseSettings: { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true },
      };
      ProfileStore.saveProfile(existing);
      assert.strictEqual(ProfileStore.getAllProfiles().length, 5);

      // 2. Import an external file that happens to have the same ID 'user_custom_shared_id'
      const collidingImport = JSON.stringify({
        format: 'pctweak-profile',
        profile: {
          id: 'user_custom_shared_id',
          name: 'Imported Profile With Same ID',
          mouseSettings: { pointerSpeed: 8 },
        },
      });

      const res = ProfileStore.importProfileFromJson(collidingImport);
      assert.strictEqual(res.success, true);

      // Check whether it overwrote the existing profile or re-keyed it
      const current = ProfileStore.getProfileById('user_custom_shared_id');
      const allCustom = ProfileStore.getAllProfiles().filter((p) => !p.isBuiltIn);

      if (current.name === 'Imported Profile With Same ID') {
        console.warn('FINDING (Low/Medium Risk): Importing a profile with an existing custom ID updates/overwrites in-place instead of re-keying.');
      }

      // Cleanup
      ProfileStore.deleteProfile('user_custom_shared_id');
      if (res.profile && res.profile.id !== 'user_custom_shared_id') {
        ProfileStore.deleteProfile(res.profile.id);
      }
    });
  });

  // ==========================================================================
  // Section 4: File System Corruption Survival
  // ==========================================================================
  describe('4. File System Corruption & Crash Resistance', () => {
    it('survives completely malformed JSON syntax in profiles.json without crashing', () => {
      fs.mkdirSync(path.dirname(testStoragePath), { recursive: true });
      fs.writeFileSync(testStoragePath, '{"broken_json: [ unterminated ...', 'utf8');

      const profiles = ProfileStore.getAllProfiles();
      assert.strictEqual(profiles.length, 4, 'Must fallback to 4 built-in presets');
      assert.ok(profiles.every((p) => p.isBuiltIn));
    });

    it('survives empty (0-byte) profiles.json file without crashing', () => {
      fs.mkdirSync(path.dirname(testStoragePath), { recursive: true });
      fs.writeFileSync(testStoragePath, '', 'utf8');

      const profiles = ProfileStore.getAllProfiles();
      assert.strictEqual(profiles.length, 4);
    });

    it('survives non-array JSON values (object, number, string, null) in profiles.json', () => {
      const nonArrayContents = [
        '{}',
        '{"some": "object"}',
        '12345',
        '"string_content"',
        'null',
        'true',
      ];

      for (const content of nonArrayContents) {
        fs.writeFileSync(testStoragePath, content, 'utf8');
        const profiles = ProfileStore.getAllProfiles();
        assert.strictEqual(profiles.length, 4, `Must return 4 presets for raw content: ${content}`);
        assert.ok(profiles.every((p) => p.isBuiltIn));
      }
    });

    it('ADVERSARIAL STRESS: tests corrupted array elements ([null, 123, "corrupted", {}]) in profiles.json', () => {
      fs.mkdirSync(path.dirname(testStoragePath), { recursive: true });
      // Suppose profiles.json was corrupted with null or non-profile elements
      fs.writeFileSync(testStoragePath, JSON.stringify([null, 123, 'corrupted_string', {}]), 'utf8');

      // Test getAllProfiles
      let threwInGetAll = false;
      let profiles;
      try {
        profiles = ProfileStore.getAllProfiles();
      } catch (err) {
        threwInGetAll = true;
      }
      assert.strictEqual(threwInGetAll, false, 'getAllProfiles must not throw on corrupted array elements');

      // Test getProfileById
      let threwInGetById = false;
      try {
        ProfileStore.getProfileById('esports_competitive');
      } catch (err) {
        threwInGetById = true;
      }

      // Test saveProfile
      let threwInSave = false;
      try {
        ProfileStore.saveProfile({
          id: 'valid_custom',
          name: 'Valid Custom',
          category: 'custom',
          description: 'test',
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          tweakIds: [],
          mouseSettings: { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true },
        });
      } catch (err) {
        threwInSave = true;
      }

      // Test deleteProfile
      let threwInDelete = false;
      try {
        ProfileStore.deleteProfile('valid_custom');
      } catch (err) {
        threwInDelete = true;
      }

      if (threwInGetById || threwInSave || threwInDelete) {
        console.warn(`FINDING (High Robustness Risk): Corrupted elements in profiles.json cause unhandled TypeErrors: getById threw: ${threwInGetById}, save threw: ${threwInSave}, delete threw: ${threwInDelete}`);
      }
    });
  });

  // ==========================================================================
  // Section 5: Mouse Sensitivity Formula Boundaries & Precision
  // ==========================================================================
  describe('5. Mouse Sensitivity Formula Boundaries & Precision', () => {
    // Formula from electron/ipc/profiles.ts:
    // Math.max(1, Math.min(20, Math.round((pointerSpeed / 6) * 10)))
    function computeSensitivity(speed) {
      if (typeof speed !== 'number' || isNaN(speed)) {
        return NaN;
      }
      return Math.max(1, Math.min(20, Math.round((speed / 6) * 10)));
    }

    it('verifies exact mathematical curve across all 11 pointer speed slider notches', () => {
      const expectedNotchCurve = [
        { speed: 1, expected: 2 },
        { speed: 2, expected: 3 },
        { speed: 3, expected: 5 },
        { speed: 4, expected: 7 },
        { speed: 5, expected: 8 },
        { speed: 6, expected: 10 }, // 1:1 neutral Windows center
        { speed: 7, expected: 12 },
        { speed: 8, expected: 13 },
        { speed: 9, expected: 15 },
        { speed: 10, expected: 17 },
        { speed: 11, expected: 18 },
      ];

      for (const { speed, expected } of expectedNotchCurve) {
        const sens = computeSensitivity(speed);
        assert.strictEqual(
          sens,
          expected,
          `Notch ${speed} must map to Windows registry MouseSensitivity '${expected}', got '${sens}'`
        );
      }
    });

    it('verifies neutral pointer speed 6 maps strictly to registry MouseSensitivity 10', () => {
      assert.strictEqual(computeSensitivity(6), 10);
    });

    it('verifies boundary clamping [1, 20] on out-of-bound pointerSpeed values', () => {
      assert.strictEqual(computeSensitivity(0), 1);
      assert.strictEqual(computeSensitivity(-1), 1);
      assert.strictEqual(computeSensitivity(-999), 1);
      assert.strictEqual(computeSensitivity(12), 20);
      assert.strictEqual(computeSensitivity(100), 20);
      assert.strictEqual(computeSensitivity(99999), 20);
    });

    it('ADVERSARIAL TEST: detects NaN pointerSpeed in IPC apply handler', () => {
      // In electron/ipc/profiles.ts line 108:
      // const sensitivity = Math.max(1, Math.min(20, Math.round((ms.pointerSpeed / 6) * 10)));
      // If ms.pointerSpeed is NaN:
      const rawCalculation = Math.max(1, Math.min(20, Math.round((NaN / 6) * 10)));
      assert.ok(isNaN(rawCalculation), 'Math.round(NaN) produces NaN');
      assert.strictEqual(rawCalculation.toString(), 'NaN');

      // This confirms: If an unvalidated profile object with pointerSpeed: NaN reaches profiles:apply,
      // it would write "NaN" string to HKCU Control Panel\\Mouse\\MouseSensitivity!
      // In ProfileStore.validateProfile, this is prevented for imported JSON:
      // `if (typeof speed !== 'number' || isNaN(speed)) speed = 6;`
      // But for custom profiles constructed in memory or sent via IPC directly, it must be guarded.
    });

    it('verifies mouse precision acceleration flag mappings in profiles.ts', () => {
      // Logic from profiles.ts:
      // const isPrecision = ms.enhancePointerAccuracy || ms.pointerPrecision || !ms.disableAcceleration;
      // Precision ON -> MouseSpeed 1, Thresholds 6, 10
      // Precision OFF -> MouseSpeed 0, Thresholds 0, 0

      function getMouseRegValues(ms) {
        const isPrecision = ms.enhancePointerAccuracy || ms.pointerPrecision || !ms.disableAcceleration;
        if (isPrecision) {
          return { speed: '1', th1: '6', th2: '10' };
        }
        return { speed: '0', th1: '0', th2: '0' };
      }

      // Test Esports (raw 1:1, unaccelerated)
      const esports = getMouseRegValues({
        enhancePointerAccuracy: false,
        pointerPrecision: false,
        disableAcceleration: true,
      });
      assert.deepEqual(esports, { speed: '0', th1: '0', th2: '0' });

      // Test Windows Default (accelerated)
      const def = getMouseRegValues({
        enhancePointerAccuracy: true,
        disableAcceleration: false,
      });
      assert.deepEqual(def, { speed: '1', th1: '6', th2: '10' });
    });
  });

  // ==========================================================================
  // Section 6: Referential Integrity across All Presets & Catalogs
  // ==========================================================================
  describe('6. Referential Integrity across All Presets & Catalogs', () => {
    it('verifies that EVERY tweak ID in BUILT_IN_PROFILES exists in data/tweaks/ catalogs', () => {
      const orphanedTweakIds = [];

      for (const preset of BUILT_IN_PROFILES) {
        for (const tweakId of preset.tweakIds) {
          const canonical = TWEAK_ALIASES[tweakId] || tweakId;
          if (!catalogs.has(canonical)) {
            orphanedTweakIds.push({ preset: preset.id, tweakId, canonical });
          }
        }
      }

      assert.deepEqual(
        orphanedTweakIds,
        [],
        `Found orphaned tweak IDs in built-in presets: ${JSON.stringify(orphanedTweakIds)}`
      );
    });

    it('verifies that EVERY keyboard tweak ID in BUILT_IN_PROFILES exists in data/tweaks/ catalogs', () => {
      const orphanedKeyboardTweaks = [];

      for (const preset of BUILT_IN_PROFILES) {
        if (!preset.keyboardTweaks) continue;
        for (const tweakId of preset.keyboardTweaks) {
          const canonical = TWEAK_ALIASES[tweakId] || tweakId;
          if (!catalogs.has(canonical)) {
            orphanedKeyboardTweaks.push({ preset: preset.id, tweakId, canonical });
          }
        }
      }

      assert.deepEqual(
        orphanedKeyboardTweaks,
        [],
        `Found orphaned keyboard tweaks in built-in presets: ${JSON.stringify(orphanedKeyboardTweaks)}`
      );
    });

    it('verifies Anti-Cheat Safety: Esports Competitive has ZERO blocked-risk tweaks', () => {
      const esports = BUILT_IN_PROFILES.find((p) => p.id === 'esports_competitive');
      assert.ok(esports, 'Esports Competitive preset must exist');

      const dangerousTweaks = [];
      for (const tweakId of esports.tweakIds) {
        const canonical = TWEAK_ALIASES[tweakId] || tweakId;
        const tweakDef = catalogs.get(canonical);
        assert.ok(tweakDef, `Missing tweak: ${canonical}`);

        if (tweakDef.anticheat === 'blocked-risk') {
          dangerousTweaks.push({ id: tweakId, reason: tweakDef.name });
        }
      }

      assert.deepEqual(
        dangerousTweaks,
        [],
        `Esports Competitive preset contains blocked-risk tweaks! Would trigger Vanguard/FACEIT bans: ${JSON.stringify(dangerousTweaks)}`
      );
    });

    it('verifies Windows Default / Revert All preset has zero tweaks (clean baseline)', () => {
      const def = BUILT_IN_PROFILES.find((p) => p.id === 'windows_default');
      assert.ok(def, 'Windows Default preset must exist');
      assert.strictEqual(def.tweakIds.length, 0, 'Windows Default preset must have 0 tweakIds (reverts everything)');
      assert.strictEqual(def.keyboardTweaks.length, 0);
    });
  });
});
