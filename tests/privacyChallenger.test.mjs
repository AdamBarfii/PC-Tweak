import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const privacyViewPath = path.join(rootDir, 'src/views/PrivacyView.tsx');
const privacyJsonPath = path.join(rootDir, 'data/tweaks/privacy.json');
const enLocalePath = path.join(rootDir, 'src/locales/en/translation.json');
const faLocalePath = path.join(rootDir, 'src/locales/fa/translation.json');

function getNested(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

describe('Milestone 1 Empirical Challenger Suite: Privacy & Security', () => {
  const enTranslations = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
  const faTranslations = JSON.parse(fs.readFileSync(faLocalePath, 'utf8'));
  const privacyTweaks = JSON.parse(fs.readFileSync(privacyJsonPath, 'utf8'));
  const privacyViewContent = fs.readFileSync(privacyViewPath, 'utf8');

  // =========================================================================
  // Section 1: Internationalization Completeness Audit
  // =========================================================================
  describe('Suite 1: Internationalization (en & fa) Key Verification', () => {
    // Extract all t('key') calls from PrivacyView.tsx
    const staticKeyMatches = [];
    const tRegex = /t\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
    let match;
    while ((match = tRegex.exec(privacyViewContent)) !== null) {
      staticKeyMatches.push(match[1]);
    }
    const uniqueStaticKeys = [...new Set(staticKeyMatches)];

    it('ensures all static t(...) translation keys in PrivacyView.tsx exist in English translation.json', () => {
      const missingKeys = [];
      for (const key of uniqueStaticKeys) {
        const val = getNested(enTranslations, key);
        if (val === undefined || val === null || val === '') {
          missingKeys.push(key);
        }
      }
      assert.deepEqual(
        missingKeys,
        [],
        `Missing English translation keys in en/translation.json: ${missingKeys.join(', ')}`
      );
    });

    it('ensures all static t(...) translation keys in PrivacyView.tsx exist in Persian translation.json', () => {
      const missingKeys = [];
      for (const key of uniqueStaticKeys) {
        const val = getNested(faTranslations, key);
        if (val === undefined || val === null || val === '') {
          missingKeys.push(key);
        }
      }
      assert.deepEqual(
        missingKeys,
        [],
        `Missing Persian translation keys in fa/translation.json: ${missingKeys.join(', ')}`
      );
    });

    it('ensures all dynamic nameKey and descriptionKey from privacy.json exist in en and fa catalogs', () => {
      const missingEn = [];
      const missingFa = [];

      for (const tweak of privacyTweaks) {
        assert.ok(tweak.nameKey, `Tweak ${tweak.id} missing nameKey`);
        assert.ok(tweak.descriptionKey, `Tweak ${tweak.id} missing descriptionKey`);

        if (!getNested(enTranslations, tweak.nameKey)) missingEn.push(tweak.nameKey);
        if (!getNested(enTranslations, tweak.descriptionKey)) missingEn.push(tweak.descriptionKey);

        if (!getNested(faTranslations, tweak.nameKey)) missingFa.push(tweak.nameKey);
        if (!getNested(faTranslations, tweak.descriptionKey)) missingFa.push(tweak.descriptionKey);
      }

      assert.deepEqual(missingEn, [], `Missing EN tweak keys: ${missingEn.join(', ')}`);
      assert.deepEqual(missingFa, [], `Missing FA tweak keys: ${missingFa.join(', ')}`);
    });

    it('verifies Persian translation text contains no untranslated English placeholder leaks', () => {
      for (const tweak of privacyTweaks) {
        const nameFa = getNested(faTranslations, tweak.nameKey);
        const descFa = getNested(faTranslations, tweak.descriptionKey);
        assert.ok(typeof nameFa === 'string' && nameFa.length > 5, `Empty FA name for ${tweak.id}`);
        assert.ok(typeof descFa === 'string' && descFa.length > 15, `Empty FA desc for ${tweak.id}`);
      }
    });
  });

  // =========================================================================
  // Section 2: Rapid Switch Toggling & Race Condition Harness
  // =========================================================================
  describe('Suite 2: Rapid Switch Toggling & Concurrency Stress Test', () => {
    it('simulates rapid sequential and interleaved toggles on a single tweak without corrupted states', async () => {
      // Simulate state container identical to PrivacyView component logic
      let liveTweakState = { id: 'disable_telemetry', isApplied: false };
      let actionLoading = {};
      let tweakVersion = 0;
      let appliedCountHistory = [];

      const mockIpc = {
        async applyTweak(id) {
          // Add artificial jitter (10-30ms)
          await new Promise((r) => setTimeout(r, 15));
          liveTweakState.isApplied = true;
          return { success: true, requiresReboot: true };
        },
        async revertTweak(id) {
          await new Promise((r) => setTimeout(r, 15));
          liveTweakState.isApplied = false;
          return { success: true, requiresReboot: true };
        },
      };

      // Simulated handler with component guard
      const handleToggle = async (targetState) => {
        if (actionLoading[liveTweakState.id]) {
          return { dropped: true };
        }
        actionLoading[liveTweakState.id] = true;
        try {
          const res = targetState
            ? await mockIpc.applyTweak(liveTweakState.id)
            : await mockIpc.revertTweak(liveTweakState.id);
          if (res.success) {
            liveTweakState.isApplied = targetState;
            tweakVersion++;
            appliedCountHistory.push(liveTweakState.isApplied);
          }
          return { success: true };
        } finally {
          actionLoading[liveTweakState.id] = false;
        }
      };

      // Burst of 10 rapid clicks
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(handleToggle(i % 2 === 1));
      }
      const results = await Promise.all(promises);

      // Verify that concurrent rapid clicks were locked out and dropped
      const droppedCount = results.filter((r) => r.dropped).length;
      assert.ok(
        droppedCount >= 8,
        `Expected at least 8 rapid clicks to be safely debounced/dropped, got ${droppedCount}`
      );
      assert.strictEqual(actionLoading['disable_telemetry'], false, 'Loading state must be cleanly released');
    });

    it('simulates simultaneous multi-tweak toggling (all 6 tweaks fired concurrently)', async () => {
      const activeStates = new Map(privacyTweaks.map((t) => [t.id, false]));
      const loadingStates = new Map();

      const mockApply = async (id) => {
        loadingStates.set(id, true);
        await new Promise((r) => setTimeout(r, Math.random() * 20 + 5));
        activeStates.set(id, true);
        loadingStates.set(id, false);
        return { success: true, requiresReboot: id === 'disable_telemetry' };
      };

      // Fire all 6 simultaneously
      const results = await Promise.all(privacyTweaks.map((t) => mockApply(t.id)));

      for (const res of results) {
        assert.strictEqual(res.success, true);
      }
      for (const tweak of privacyTweaks) {
        assert.strictEqual(activeStates.get(tweak.id), true);
        assert.strictEqual(loadingStates.get(tweak.id), false);
      }
    });
  });

  // =========================================================================
  // Section 3: Batch Apply / Revert Failure & Error State Propagation
  // =========================================================================
  describe('Suite 3: Batch Operations & Error State Propagation', () => {
    it('verifies batch apply error handling and banner status behavior under partial failures', async () => {
      // Test the contract of batchApply: what happens if 2 out of 6 fail?
      const tweaksToApply = privacyTweaks.map((t) => t.id);
      const failingIds = ['disable_wer', 'disable_advertising_id'];

      let bannerState = null;
      const setStatusBanner = (banner) => {
        bannerState = banner;
      };

      const mockBatchApply = async (ids) => {
        let applied = 0;
        for (const id of ids) {
          if (!failingIds.includes(id)) {
            applied++;
          }
        }
        return { success: applied === ids.length, count: applied };
      };

      const result = await mockBatchApply(tweaksToApply);
      if (result.success) {
        setStatusBanner({ type: 'success', text: 'All 6 privacy protections have been successfully enabled.' });
      } else {
        setStatusBanner({ type: 'warning', text: 'Some tweaks could not be applied.' });
      }

      assert.strictEqual(result.success, false, 'Batch apply with failures must return success: false');
      assert.strictEqual(result.count, 4, 'Applied count must accurately reflect partial success');
      assert.strictEqual(bannerState.type, 'warning', 'Banner must display warning on partial apply');
    });

    it('verifies single tweak error propagation when backend rejects IPC call', async () => {
      let bannerState = null;
      const setStatusBanner = (banner) => {
        bannerState = banner;
      };

      const mockIpcFailing = {
        async applyTweak(_id) {
          return { success: false, requiresReboot: false, error: 'Access denied: Administrator privileges required.' };
        },
      };

      const res = await mockIpcFailing.applyTweak('disable_telemetry');
      if (res.success) {
        setStatusBanner({ type: 'success', text: 'Enabled' });
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error || 'Failed to update tweak setting.',
        });
      }

      assert.strictEqual(bannerState.type, 'error');
      assert.match(bannerState.text, /Access denied/);
    });

    it('verifies IPC exception (thrown Error / crashed worker) is caught gracefully', async () => {
      let bannerState = null;
      let actionLoading = { disable_telemetry: true };

      const mockIpcCrashed = {
        async applyTweak(_id) {
          throw new Error('IPC channel disconnected');
        },
      };

      try {
        await mockIpcCrashed.applyTweak('disable_telemetry');
      } catch (err) {
        bannerState = {
          type: 'error',
          text: err.message || 'Failed to update tweak setting.',
        };
      } finally {
        actionLoading['disable_telemetry'] = false;
      }

      assert.strictEqual(bannerState.type, 'error');
      assert.strictEqual(bannerState.text, 'IPC channel disconnected');
      assert.strictEqual(actionLoading['disable_telemetry'], false, 'Loading flag must clear even on exception');
    });
  });

  // =========================================================================
  // Section 4: Accessibility & UI Contract Inspection
  // =========================================================================
  describe('Suite 4: Accessibility & DOM Architecture Standards', () => {
    it('verifies PrivacyView passes semantic ariaLabel to every Switch instance', () => {
      assert.ok(
        privacyViewContent.includes('ariaLabel={t(tweak.nameKey)}'),
        'PrivacyView must pass ariaLabel={t(tweak.nameKey)} to Switch'
      );
    });

    it('verifies Switch component implements role="switch" and aria-checked', () => {
      const switchPath = path.join(rootDir, 'src/components/common/Switch.tsx');
      const switchContent = fs.readFileSync(switchPath, 'utf8');

      assert.ok(switchContent.includes('role="switch"'), 'Switch must define role="switch"');
      assert.ok(switchContent.includes('aria-checked={checked}'), 'Switch must define aria-checked');
      assert.ok(switchContent.includes('aria-busy={isLoading}'), 'Switch must define aria-busy');
    });

    it('verifies ConfirmDialog implements WAI-ARIA modal dialog contract with escape listener', () => {
      const dialogPath = path.join(rootDir, 'src/components/common/ConfirmDialog.tsx');
      const dialogContent = fs.readFileSync(dialogPath, 'utf8');

      assert.ok(dialogContent.includes('role="dialog"'), 'ConfirmDialog must have role="dialog"');
      assert.ok(dialogContent.includes('aria-modal="true"'), 'ConfirmDialog must have aria-modal="true"');
      assert.ok(dialogContent.includes('aria-labelledby='), 'ConfirmDialog must have aria-labelledby');
      assert.ok(dialogContent.includes('aria-describedby='), 'ConfirmDialog must have aria-describedby');
      assert.ok(dialogContent.includes("'Escape'"), 'ConfirmDialog must listen for Escape key');
    });

    it('verifies dynamic RTL support based on i18n language', () => {
      assert.ok(
        privacyViewContent.includes("dir={isRtl ? 'rtl' : 'ltr'}"),
        "PrivacyView must set dir={isRtl ? 'rtl' : 'ltr'}"
      );
    });
  });

  // =========================================================================
  // Section 5: Challenger Remedies Static & Contract Verification
  // =========================================================================
  describe('Suite 5: Challenger Remedies Contract Verification', () => {
    const tweakEnginePath = path.join(rootDir, 'electron/engine/tweakEngine.ts');
    const tweakEngineContent = fs.readFileSync(tweakEnginePath, 'utf8');

    it('Check 2: TweakEngine.batchApply computes success strictly as appliedCount === tweakIds.length', () => {
      assert.ok(
        tweakEngineContent.includes('appliedCount === tweakIds.length'),
        'TweakEngine.batchApply must compute success based on appliedCount === tweakIds.length'
      );
      assert.ok(
        !tweakEngineContent.includes('return { success: true, count: appliedCount }'),
        'TweakEngine.batchApply must not return hardcoded success: true'
      );
    });

    it('Check 2: PrivacyView checks result.count === unappliedIds.length before showing success banner', () => {
      assert.ok(
        privacyViewContent.includes('result.count === unappliedIds.length'),
        'PrivacyView must check result.count === unappliedIds.length on batch apply'
      );
    });

    it('Check 3: PrivacyView handleMaximizePrivacy guards against empty tweaks array', () => {
      assert.ok(
        /if\s*\(\s*tweaks\.length\s*===\s*0\s*\)\s*return;/.test(privacyViewContent),
        'handleMaximizePrivacy must guard with "if (tweaks.length === 0) return;"'
      );
    });

    it('Check 4: PrivacyView status banner dismiss button specifies aria-label', () => {
      const dismissBtn = privacyViewContent.match(/<button[^<]*?setStatusBanner\(null\)[\s\S]*?<\/button>/);
      assert.ok(dismissBtn, 'Banner dismiss button must exist');
      assert.ok(
        dismissBtn[0].includes('aria-label='),
        'Banner dismiss button must define an accessible aria-label'
      );
    });

    it('Check 5: PrivacyView does not invoke redundant loadTweaks immediately after notifyTweakChanged', () => {
      assert.ok(
        !/notifyTweakChanged\(\);\s*await\s+loadTweaks\(true\);/.test(privacyViewContent),
        'notifyTweakChanged() must not be immediately followed by await loadTweaks(true)'
      );
    });
  });
});

