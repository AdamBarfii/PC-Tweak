import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Milestone 2 Challenger: Frontend UI & Apply Stress Tests', () => {
  const profilesViewPath = path.join(projectRoot, 'src', 'views', 'ProfilesView.tsx');
  const enLocalePath = path.join(projectRoot, 'src', 'locales', 'en', 'translation.json');
  const faLocalePath = path.join(projectRoot, 'src', 'locales', 'fa', 'translation.json');
  const electronDtsPath = path.join(projectRoot, 'src', 'types', 'electron.d.ts');

  const profilesViewContent = fs.readFileSync(profilesViewPath, 'utf8');
  const enLocale = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
  const faLocale = JSON.parse(fs.readFileSync(faLocalePath, 'utf8'));
  const electronDtsContent = fs.readFileSync(electronDtsPath, 'utf8');

  // Helper to resolve nested dot-notation keys in JSON
  function getNestedKey(obj, keyPath) {
    const parts = keyPath.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  describe('1. i18n & RTL Localization Coverage', () => {
    it('all t(...) keys in ProfilesView.tsx exist in English translation.json', () => {
      // Regex to capture t('key' or t("key" with word boundary
      const tKeyRegex = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
      const matchedKeys = new Set();
      let match;
      while ((match = tKeyRegex.exec(profilesViewContent)) !== null) {
        matchedKeys.add(match[1]);
      }

      assert.ok(matchedKeys.size > 20, `Expected at least 20 translation keys, found ${matchedKeys.size}`);

      const missingInEn = [];
      for (const key of matchedKeys) {
        const val = getNestedKey(enLocale, key);
        if (val === undefined || typeof val !== 'string' || val.trim() === '') {
          missingInEn.push(key);
        }
      }

      assert.deepEqual(
        missingInEn,
        [],
        `The following translation keys are missing in English translation.json: ${missingInEn.join(', ')}`
      );
    });

    it('all t(...) keys in ProfilesView.tsx exist in Persian translation.json', () => {
      const tKeyRegex = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
      const matchedKeys = new Set();
      let match;
      while ((match = tKeyRegex.exec(profilesViewContent)) !== null) {
        matchedKeys.add(match[1]);
      }

      const missingInFa = [];
      for (const key of matchedKeys) {
        const val = getNestedKey(faLocale, key);
        if (val === undefined || typeof val !== 'string' || val.trim() === '') {
          missingInFa.push(key);
        }
      }

      assert.deepEqual(
        missingInFa,
        [],
        `The following translation keys are missing in Persian translation.json: ${missingInFa.join(', ')}`
      );
    });

    it('verifies RTL direction binding in ProfilesView root and modal container', () => {
      assert.ok(
        profilesViewContent.includes("dir={isRtl ? 'rtl' : 'ltr'}"),
        'ProfilesView must dynamically bind dir attribute for Persian/RTL layout'
      );
      assert.ok(
        profilesViewContent.includes("isRtl = i18n.language === 'fa'"),
        'ProfilesView must determine RTL status from i18n.language'
      );
    });
  });

  describe('2. UI Completeness & 4 Built-In Presets', () => {
    it('verifies distinct representation and metadata for all 4 built-in presets', () => {
      const presetIds = [
        'esports_competitive',
        'streaming_content',
        'max_battery_quiet',
        'windows_default',
      ];

      for (const id of presetIds) {
        assert.ok(
          profilesViewContent.includes(id),
          `ProfilesView must explicitly reference built-in preset ID '${id}'`
        );
      }

      // Check category mappings
      assert.ok(profilesViewContent.includes("category === 'esports'"));
      assert.ok(profilesViewContent.includes("category === 'streaming'"));
      assert.ok(profilesViewContent.includes("category === 'battery'"));
      assert.ok(profilesViewContent.includes("category === 'default'"));

      // Check icons
      assert.ok(profilesViewContent.includes('Trophy'));
      assert.ok(profilesViewContent.includes('Radio'));
      assert.ok(profilesViewContent.includes('BatteryCharging'));
      assert.ok(profilesViewContent.includes('RotateCcw'));

      // Check Anti-Cheat Safe label
      assert.ok(profilesViewContent.includes('Anti-Cheat Safe'));
      assert.ok(profilesViewContent.includes('Shield'));
    });

    it('verifies all curated tweaks exist in data/tweaks catalogs', () => {
      const tweakCatalogFiles = ['gaming.json', 'privacy.json', 'input.json', 'advanced.json'];
      const allKnownTweakIds = new Set();

      for (const file of tweakCatalogFiles) {
        const catalogPath = path.join(projectRoot, 'data', 'tweaks', file);
        if (fs.existsSync(catalogPath)) {
          const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
          if (Array.isArray(catalog)) {
            catalog.forEach((t) => allKnownTweakIds.add(t.id));
          } else if (Array.isArray(catalog.tweaks)) {
            catalog.tweaks.forEach((t) => allKnownTweakIds.add(t.id));
          }
        }
      }

      // Extract CURATED_TWEAKS IDs from ProfilesView.tsx
      const curatedMatch = profilesViewContent.match(/const CURATED_TWEAKS:\s*CuratedTweakItem\[\]\s*=\s*\[([\s\S]*?)\];/);
      assert.ok(curatedMatch, 'CURATED_TWEAKS array must be defined in ProfilesView.tsx');

      const idMatches = curatedMatch[1].matchAll(/id:\s*['"]([^'"]+)['"]/g);
      const curatedIds = Array.from(idMatches, (m) => m[1]);
      assert.ok(curatedIds.length >= 15, `Expected >= 15 curated tweaks, found ${curatedIds.length}`);

      const missingTweakIds = curatedIds.filter((id) => !allKnownTweakIds.has(id));
      assert.deepEqual(
        missingTweakIds,
        [],
        `The following curated tweak IDs do not exist in data/tweaks catalogs: ${missingTweakIds.join(', ')}`
      );
    });
  });

  describe('3. Custom Profile Creation Modal & Validation', () => {
    it('modal contains category selection with valid categories', () => {
      assert.ok(profilesViewContent.includes('<option value="custom">Custom</option>'));
      assert.ok(profilesViewContent.includes('<option value="esports">Esports</option>'));
      assert.ok(profilesViewContent.includes('<option value="streaming">Streaming</option>'));
      assert.ok(profilesViewContent.includes('<option value="battery">Battery</option>'));
    });

    it('modal implements validation for empty names and maximum length', () => {
      assert.ok(
        profilesViewContent.includes('!editingProfile.name.trim()'),
        'Modal must validate that name is not empty or whitespace'
      );
      assert.ok(
        profilesViewContent.includes('editingProfile.name.length > 50'),
        'Modal must validate that name does not exceed 50 characters'
      );
      assert.ok(
        profilesViewContent.includes('maxLength={50}'),
        'Name input must enforce maxLength 50'
      );
    });

    it('modal provides controls for mouse settings and DirectX latency options', () => {
      // Mouse settings
      assert.ok(profilesViewContent.includes('pointerSpeed'));
      assert.ok(profilesViewContent.includes('disableAcceleration'));
      assert.ok(profilesViewContent.includes('rawInputMode'));
      assert.ok(profilesViewContent.includes('disableTrails'));

      // DirectX settings
      assert.ok(profilesViewContent.includes('flipModel'));
      assert.ok(profilesViewContent.includes('maxFrameLatency'));
      assert.ok(profilesViewContent.includes('shaderCacheBoost'));
    });

    it('modal supports select all and deselect all tweaks', () => {
      assert.ok(profilesViewContent.includes('handleSelectAllTweaks(true)'));
      assert.ok(profilesViewContent.includes('handleSelectAllTweaks(false)'));
    });
  });

  describe('4. Delete Flow Safety & Empty State', () => {
    it('deletion is guarded by ConfirmDialog with isDestructive: true', () => {
      assert.ok(profilesViewContent.includes('setDeleteTarget'));
      assert.ok(profilesViewContent.includes('handleDeleteConfirm'));
      assert.ok(
        profilesViewContent.includes('<ConfirmDialog\n        isOpen={!!deleteTarget}'),
        'Delete confirmation dialog must be bound to deleteTarget'
      );
      assert.ok(
        profilesViewContent.includes('isDestructive={true}'),
        'ConfirmDialog must specify isDestructive={true}'
      );
    });

    it('windows_default revert preset triggers safety confirmation before applying', () => {
      assert.ok(profilesViewContent.includes('setRevertAllTarget(profile)'));
      assert.ok(
        profilesViewContent.includes('profile.id === \'windows_default\''),
        'Applying windows_default must trigger safety confirmation'
      );
      assert.ok(
        profilesViewContent.includes('<ConfirmDialog\n        isOpen={!!revertAllTarget}'),
        'Revert confirmation dialog must be bound to revertAllTarget'
      );
    });

    it('renders empty state when no custom profiles exist', () => {
      assert.ok(profilesViewContent.includes('customProfiles.length === 0'));
      assert.ok(profilesViewContent.includes('noCustomProfilesTitle'));
      assert.ok(profilesViewContent.includes('noCustomProfilesSubtitle'));
      assert.ok(profilesViewContent.includes('createFirstProfile'));
    });
  });

  describe('5. Accessibility (WCAG / ARIA)', () => {
    it('all icon-only action buttons possess explicit accessible names (aria-label)', () => {
      // Refresh / Sync button
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'common.refresh\', \'Sync profiles\')}'),
        'Sync button must have aria-label'
      );

      // Dismiss status banner button
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'common.close\', \'Dismiss notification\')}'),
        'Dismiss banner button must have aria-label'
      );

      // Edit, duplicate, export, delete buttons in card
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'profiles.editProfile\', \'Edit Profile\')}'),
        'Edit button must have aria-label'
      );
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'profiles.duplicateProfile\', \'Duplicate Profile\')}'),
        'Duplicate button must have aria-label'
      );
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'profiles.exportProfile\', \'Export Profile\')}'),
        'Export button must have aria-label'
      );
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'profiles.deleteProfile\', \'Delete Profile\')}'),
        'Delete button must have aria-label'
      );

      // Modal close button
      assert.ok(
        profilesViewContent.includes('aria-label={t(\'profiles.modal.cancel\', \'Close\')}'),
        'Modal close button must have aria-label'
      );
    });

    it('modal and status banners have correct ARIA dialog and live region semantics', () => {
      // Modal dialog
      assert.ok(profilesViewContent.includes('role="dialog"'));
      assert.ok(profilesViewContent.includes('aria-modal="true"'));
      assert.ok(profilesViewContent.includes('aria-labelledby="profile-modal-title"'));
      assert.ok(profilesViewContent.includes('id="profile-modal-title"'));

      // Status notification banner
      assert.ok(profilesViewContent.includes('role="status"'));
      assert.ok(profilesViewContent.includes('aria-live="polite"'));
    });
  });

  describe('6. Re-entrancy & State Sync Verification', () => {
    it('applying a profile triggers notifyTweakChanged() to sync with other views', () => {
      assert.ok(
        profilesViewContent.includes('notifyTweakChanged();'),
        'executeApply must call notifyTweakChanged() upon successful application'
      );
    });

    it('reacts to external tweakChangeVersion increments to reload profiles', () => {
      assert.ok(
        profilesViewContent.includes('if (tweakChangeVersion > 0)'),
        'ProfilesView must watch tweakChangeVersion'
      );
      assert.ok(
        profilesViewContent.includes('loadProfiles(true)'),
        'ProfilesView must reload profiles in background on change'
      );
    });

    it('persists and restores active profile ID in localStorage', () => {
      assert.ok(
        profilesViewContent.includes("localStorage.getItem('pctweak_active_profile_id')"),
        'Must read active profile ID from localStorage on mount'
      );
      assert.ok(
        profilesViewContent.includes("localStorage.setItem('pctweak_active_profile_id', profile.id)"),
        'Must write active profile ID to localStorage upon apply'
      );
      assert.ok(
        profilesViewContent.includes("localStorage.removeItem('pctweak_active_profile_id')"),
        'Must remove active profile ID from localStorage when deleted'
      );
    });
  });

  describe('7. ElectronAPI TypeScript Interface Conformance', () => {
    it('ElectronAPI declares all profile methods with accurate signatures', () => {
      assert.ok(electronDtsContent.includes('listProfiles: () => Promise<TuningProfile[]>;'));
      assert.ok(electronDtsContent.includes('saveProfile: (profile: TuningProfile) => Promise<{ success: boolean; id?: string; error?: string }>;'));
      assert.ok(electronDtsContent.includes('deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string } | boolean>;'));
      assert.ok(electronDtsContent.includes('applyProfile: (profile: TuningProfile) => Promise<'));
      assert.ok(electronDtsContent.includes('exportProfile: (profile: TuningProfile) => Promise<'));
      assert.ok(electronDtsContent.includes('importProfile: () => Promise<'));
      assert.ok(electronDtsContent.includes('importProfileFromJson: (jsonContent: string) => Promise<'));
    });
  });
});
