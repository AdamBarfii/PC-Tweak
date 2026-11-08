import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tweaksDir = path.resolve(__dirname, '../data/tweaks');

// Known canonical aliases
const TWEAK_ID_ALIASES = {
  pointer_speed_neutral: 'mouse_neutral_pointer_speed',
  usb_selective_suspend_off: 'usb_disable_selective_suspend',
  game_mode_on_dvr_off: 'enable_game_mode',
};

const VALID_CATEGORIES = new Set(['system', 'gaming', 'network', 'privacy', 'advanced', 'mouse_keyboard', 'system_latency']);
const VALID_IMPACT_LEVELS = new Set(['safe', 'moderate', 'advanced', 'experimental', 'extreme']);
const VALID_ANTICHEAT_STATUSES = new Set(['safe', 'caution', 'blocked-risk']);

function loadActiveJsonTweaks() {
  if (!fs.existsSync(tweaksDir)) return [];
  const files = fs.readdirSync(tweaksDir).filter((f) => f.endsWith('.json'));
  const allTweaks = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(tweaksDir, file), 'utf8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        allTweaks.push({ ...item, _sourceFile: file });
      }
    }
  }
  return allTweaks;
}

test('Tweak Schema Integrity: Active JSON files exist and orphaned system.json is archived', () => {
  const activeFiles = fs.readdirSync(tweaksDir).filter((f) => f.endsWith('.json'));

  // system.json must NOT be in active directory
  assert.equal(
    activeFiles.includes('system.json'),
    false,
    'system.json should be archived, not in active data/tweaks directory'
  );

  const archivedPath = path.join(tweaksDir, 'archived/system.json');
  assert.ok(fs.existsSync(archivedPath), 'Archived system.json must exist in data/tweaks/archived');

  // Active files must include gaming, input, privacy, advanced
  assert.ok(activeFiles.includes('gaming.json'));
  assert.ok(activeFiles.includes('input.json'));
  assert.ok(activeFiles.includes('advanced.json'));
  assert.ok(activeFiles.includes('privacy.json'));
});

test('Tweak Schema Integrity: All tweak definitions contain valid risk badges, anticheat tags, and categories', () => {
  const tweaks = loadActiveJsonTweaks();
  assert.ok(tweaks.length >= 15, `Expected at least 15 active tweaks, found ${tweaks.length}`);

  for (const tweak of tweaks) {
    assert.ok(tweak.id, `Tweak missing id in ${tweak._sourceFile}`);
    assert.ok(/^[a-z0-9_]+$/.test(tweak.id), `Tweak ID "${tweak.id}" contains invalid characters`);

    // Impact / Risk badge
    assert.ok(
      VALID_IMPACT_LEVELS.has(tweak.impact),
      `Tweak "${tweak.id}" has invalid impact badge: "${tweak.impact}"`
    );

    // Anti-cheat safety badge
    const anticheat = tweak.anticheat || 'caution';
    assert.ok(
      VALID_ANTICHEAT_STATUSES.has(anticheat),
      `Tweak "${tweak.id}" has invalid anticheat status: "${anticheat}"`
    );

    // Actions
    assert.ok(Array.isArray(tweak.actions) && tweak.actions.length > 0, `Tweak "${tweak.id}" must have at least 1 action`);
    for (const act of tweak.actions) {
      assert.ok(['registry', 'service'].includes(act.type), `Action type in "${tweak.id}" must be registry or service`);
      if (act.type === 'registry') {
        assert.ok(['HKLM', 'HKCU'].includes(act.hive), `Registry action hive in "${tweak.id}" must be HKLM or HKCU`);
        assert.ok(act.path, `Registry action path missing in "${tweak.id}"`);
        assert.ok(act.valueName !== undefined, `Registry valueName missing in "${tweak.id}"`);
      }
    }
  }
});

test('Tweak Schema Integrity: Zero duplicate registry target collisions across active tweaks', () => {
  const tweaks = loadActiveJsonTweaks();
  const seenTargets = new Map(); // targetKey -> tweakId

  for (const tweak of tweaks) {
    for (const action of tweak.actions) {
      if (action.type === 'registry') {
        const targetKey = `${action.hive}\\${action.path.toLowerCase()}\\${action.valueName.toLowerCase()}`;
        if (seenTargets.has(targetKey)) {
          const existingTweakId = seenTargets.get(targetKey);
          // If they are aliases of one another, it's permitted; otherwise it's a conflict
          const isAlias =
            TWEAK_ID_ALIASES[tweak.id] === existingTweakId ||
            TWEAK_ID_ALIASES[existingTweakId] === tweak.id;
          assert.ok(
            isAlias,
            `Collision detected on registry target "${targetKey}": claimed by both "${existingTweakId}" and "${tweak.id}" without an alias mapping.`
          );
        } else {
          seenTargets.set(targetKey, tweak.id);
        }
      }
    }
  }
});

test('Tweak Schema Integrity: Windows 11-specific tweaks enforce minWindowsBuild >= 22000', () => {
  const tweaks = loadActiveJsonTweaks();
  const win11Tweak = tweaks.find((t) => t.id === 'windowed_optimizations_win11');

  assert.ok(win11Tweak, 'windowed_optimizations_win11 must exist in active tweaks');
  assert.equal(win11Tweak.minWindowsBuild, 22000, 'windowed_optimizations_win11 must require build 22000+');
  assert.equal(win11Tweak.anticheat, 'safe');
});

test('Tweak Schema Integrity: Canonical alias mappings resolve to valid existing tweak IDs', () => {
  const tweaks = loadActiveJsonTweaks();
  const activeIds = new Set(tweaks.map((t) => t.id));

  // Pointer Speed
  const targetPointer = TWEAK_ID_ALIASES.pointer_speed_neutral;
  assert.ok(activeIds.has(targetPointer), `Alias target "${targetPointer}" must exist in active tweaks`);

  // USB Selective Suspend
  const targetUsb = TWEAK_ID_ALIASES.usb_selective_suspend_off;
  assert.ok(activeIds.has(targetUsb), `Alias target "${targetUsb}" must exist in active tweaks`);

  // Game Mode
  const targetGameMode = TWEAK_ID_ALIASES.game_mode_on_dvr_off;
  assert.ok(activeIds.has(targetGameMode), `Alias target "${targetGameMode}" must exist in active tweaks`);
});
