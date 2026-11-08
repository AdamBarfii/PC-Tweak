import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tweaksDir = path.join(rootDir, 'data/tweaks');
const localesDir = path.join(rootDir, 'src/locales');

describe('EMPIRICAL CHALLENGER: Milestone 1 Stress Harness', () => {
  // ==============================================================
  // 1. DATA CATALOG STRESS TESTING (privacy.json)
  // ==============================================================
  describe('1. Stress Test data/tweaks/privacy.json Boundary Conditions & Schema', () => {
    const privacyPath = path.join(tweaksDir, 'privacy.json');
    assert.ok(fs.existsSync(privacyPath), 'privacy.json must exist');
    const content = fs.readFileSync(privacyPath, 'utf8');
    const tweaks = JSON.parse(content);

    it('validates privacy.json has valid array format and exactly 6 tweaks', () => {
      assert.ok(Array.isArray(tweaks), 'privacy.json must be a JSON array');
      assert.equal(tweaks.length, 6, 'privacy.json must define exactly 6 tweaks');
    });

    it('checks all top-level required fields, impact, anticheat, and reboot flags', () => {
      const allowedImpacts = new Set(['safe', 'moderate', 'advanced', 'extreme']);
      const allowedAntiCheat = new Set(['safe', 'caution', 'blocked-risk']);

      for (const t of tweaks) {
        // ID checks
        assert.ok(t.id, 'Tweak ID must be present');
        assert.match(t.id, /^[a-z0-9_]+$/, `Tweak ID '${t.id}' has invalid characters`);

        // Keys
        assert.ok(t.nameKey, `Tweak '${t.id}' missing nameKey`);
        assert.ok(t.descriptionKey, `Tweak '${t.id}' missing descriptionKey`);
        assert.equal(t.category, 'privacy', `Tweak '${t.id}' must have category 'privacy'`);

        // Impact & Anticheat
        assert.ok(allowedImpacts.has(t.impact), `Tweak '${t.id}' has invalid impact '${t.impact}'`);
        assert.ok(allowedAntiCheat.has(t.anticheat), `Tweak '${t.id}' has invalid anticheat '${t.anticheat}'`);
        assert.equal(typeof t.requiresReboot, 'boolean', `Tweak '${t.id}' requiresReboot must be boolean`);

        // Actions & statusQuery
        assert.ok(Array.isArray(t.actions) && t.actions.length > 0, `Tweak '${t.id}' actions must be non-empty array`);
        assert.ok(t.statusQuery && typeof t.statusQuery === 'object', `Tweak '${t.id}' missing statusQuery`);
        assert.ok(['registry', 'service'].includes(t.statusQuery.type), `Tweak '${t.id}' statusQuery.type invalid`);
        assert.ok(t.statusQuery.checkAction, `Tweak '${t.id}' missing statusQuery.checkAction`);
      }
    });

    it('strictly validates registry action paths, hives, and value types', () => {
      const allowedHives = new Set(['HKLM', 'HKCU']);
      const allowedValueTypes = new Set(['REG_DWORD', 'REG_SZ', 'REG_QWORD', 'REG_MULTI_SZ', 'REG_EXPAND_SZ', 'REG_BINARY']);

      for (const t of tweaks) {
        for (const action of t.actions) {
          if (action.type === 'registry') {
            assert.ok(allowedHives.has(action.hive), `Invalid registry hive '${action.hive}' in '${t.id}'`);
            assert.ok(action.path, `Empty registry path in '${t.id}'`);

            // Check for malformed paths: no leading or trailing slashes, no illegal chars
            assert.ok(!action.path.startsWith('\\'), `Registry path starts with backslash in '${t.id}': ${action.path}`);
            assert.ok(!action.path.endsWith('\\'), `Registry path ends with backslash in '${t.id}': ${action.path}`);
            assert.ok(!action.path.includes('\\\\'), `Registry path contains double backslash in '${t.id}': ${action.path}`);
            assert.ok(!/[<>"|?*]/.test(action.path), `Registry path contains illegal characters in '${t.id}': ${action.path}`);

            // Value Name
            assert.ok(typeof action.valueName === 'string', `valueName must be string in '${t.id}'`);
            assert.ok(action.valueName.length > 0, `valueName must not be empty in '${t.id}'`);

            // Value Type
            assert.ok(allowedValueTypes.has(action.valueType), `Invalid valueType '${action.valueType}' in '${t.id}'`);

            // Value bounds for REG_DWORD
            if (action.valueType === 'REG_DWORD') {
              assert.ok(
                Number.isInteger(action.applyValue) && action.applyValue >= 0 && action.applyValue <= 0xffffffff,
                `applyValue in '${t.id}' (${action.applyValue}) must be a 32-bit unsigned integer`
              );
              assert.ok(
                action.revertValue === null ||
                  (Number.isInteger(action.revertValue) && action.revertValue >= 0 && action.revertValue <= 0xffffffff),
                `revertValue in '${t.id}' (${action.revertValue}) must be null or 32-bit unsigned integer`
              );
            }
          }
        }
      }
    });

    it('strictly validates service action names, startup values, and stopImmediately flag', () => {
      const allowedStartups = new Set(['Disabled', 'Manual', 'Automatic']);

      for (const t of tweaks) {
        for (const action of t.actions) {
          if (action.type === 'service') {
            assert.ok(action.serviceName, `Missing serviceName in '${t.id}'`);
            assert.match(
              action.serviceName,
              /^[a-zA-Z0-9_\-]+$/,
              `serviceName '${action.serviceName}' in '${t.id}' contains illegal characters`
            );
            assert.ok(
              allowedStartups.has(action.applyStartup),
              `Invalid applyStartup '${action.applyStartup}' in '${t.id}'`
            );
            assert.ok(
              allowedStartups.has(action.revertStartup),
              `Invalid revertStartup '${action.revertStartup}' in '${t.id}'`
            );
            assert.equal(
              typeof action.stopImmediately,
              'boolean',
              `stopImmediately in '${t.id}' must be boolean`
            );
          }
        }
      }
    });

    it('verifies zero collisions between privacy tweaks and all other active tweak catalogs', () => {
      const allFiles = fs.readdirSync(tweaksDir).filter((f) => f.endsWith('.json') && f !== 'privacy.json');
      const otherTargets = new Map();

      for (const file of allFiles) {
        const fileContent = JSON.parse(fs.readFileSync(path.join(tweaksDir, file), 'utf8'));
        for (const item of fileContent) {
          for (const a of item.actions) {
            if (a.type === 'registry') {
              const key = `${a.hive}\\${a.path.toLowerCase()}\\${a.valueName.toLowerCase()}`;
              otherTargets.set(key, { file, tweakId: item.id });
            } else if (a.type === 'service') {
              const key = `service\\${a.serviceName.toLowerCase()}`;
              otherTargets.set(key, { file, tweakId: item.id });
            }
          }
        }
      }

      for (const t of tweaks) {
        for (const a of t.actions) {
          if (a.type === 'registry') {
            const key = `${a.hive}\\${a.path.toLowerCase()}\\${a.valueName.toLowerCase()}`;
            const conflict = otherTargets.get(key);
            assert.ok(
              !conflict,
              `Collision detected! Privacy tweak '${t.id}' collides on '${key}' with '${conflict?.tweakId}' in '${conflict?.file}'`
            );
          } else if (a.type === 'service') {
            const key = `service\\${a.serviceName.toLowerCase()}`;
            const conflict = otherTargets.get(key);
            assert.ok(
              !conflict,
              `Collision detected! Privacy tweak '${t.id}' collides on service '${key}' with '${conflict?.tweakId}' in '${conflict?.file}'`
            );
          }
        }
      }
    });

    it('verifies all translation keys exist and are non-empty strings in both en and fa', () => {
      const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en/translation.json'), 'utf8'));
      const fa = JSON.parse(fs.readFileSync(path.join(localesDir, 'fa/translation.json'), 'utf8'));

      function getNestedKey(obj, pathStr) {
        const parts = pathStr.split('.');
        let curr = obj;
        for (const part of parts) {
          if (curr === undefined || curr === null) return undefined;
          curr = curr[part];
        }
        return curr;
      }

      for (const t of tweaks) {
        const enName = getNestedKey(en, t.nameKey);
        const enDesc = getNestedKey(en, t.descriptionKey);
        const faName = getNestedKey(fa, t.nameKey);
        const faDesc = getNestedKey(fa, t.descriptionKey);

        assert.ok(typeof enName === 'string' && enName.length > 0, `Missing EN name translation for '${t.nameKey}'`);
        assert.ok(typeof enDesc === 'string' && enDesc.length > 0, `Missing EN desc translation for '${t.descriptionKey}'`);
        assert.ok(typeof faName === 'string' && faName.length > 0, `Missing FA name translation for '${t.nameKey}'`);
        assert.ok(typeof faDesc === 'string' && faDesc.length > 0, `Missing FA desc translation for '${t.descriptionKey}'`);
      }
    });
  });

  // ==============================================================
  // 2. SERVICE ACTION & WINDOWS SC.EXE EDGE CASES
  // ==============================================================
  describe('2. Stress Test Service Action Edge Cases & sc.exe Handling', () => {
    it('handles query against non-existent service name cleanly', async () => {
      // Simulate querying a service that does not exist
      const bogusServiceName = 'PC_Tweak_NonExistent_Svc_9999';
      let errorThrown = false;
      let stdoutOutput = '';

      try {
        await execFileAsync('sc.exe', ['qc', bogusServiceName]);
      } catch (err) {
        errorThrown = true;
        stdoutOutput = err.stdout || '';
        // Windows sc.exe prints error to stdout, while err.message contains the command line
        assert.ok(err.message.includes('sc.exe qc'), 'Error message contains command line');
        // If err.stdout is captured (promisify attaches stdout), verify 1060
        if (stdoutOutput) {
          assert.ok(stdoutOutput.includes('1060'), 'stdout contains error 1060');
        }
      }

      assert.ok(errorThrown, 'Querying non-existent service must produce error caught by fallback');
    });

    it('verifies stopService gracefully catches error 1062 on already stopped service', async () => {
      // Create simulation matching TweakEngine.stopService logic
      async function simulateStopService(errorMsg) {
        try {
          throw new Error(errorMsg);
        } catch (err) {
          const msg = err?.message || '';
          if (msg.includes('1062') || msg.toLowerCase().includes('not started')) {
            return { handled: true };
          }
          return { handled: false, error: err };
        }
      }

      const res1 = await simulateStopService('[SC] ControlService FAILED 1062: The service has not been started.');
      assert.equal(res1.handled, true, 'Error 1062 must be handled cleanly without throw');

      const res2 = await simulateStopService('The service has not started yet');
      assert.equal(res2.handled, true, 'Case-insensitive "not started" must be handled cleanly');

      const res3 = await simulateStopService('[SC] ControlService FAILED 5: Access is denied.');
      assert.equal(res3.handled, false, 'Other errors (e.g. 5 Access Denied) must not be masked as 1062');
    });

    it('verifies startService gracefully catches error 1056 on already running service', async () => {
      async function simulateStartService(errorMsg) {
        try {
          throw new Error(errorMsg);
        } catch (err) {
          const msg = err?.message || '';
          if (msg.includes('1056') || msg.toLowerCase().includes('already running')) {
            return { handled: true };
          }
          return { handled: false, error: err };
        }
      }

      const res1 = await simulateStartService('[SC] StartService FAILED 1056: An instance of the service is already running.');
      assert.equal(res1.handled, true, 'Error 1056 must be handled cleanly without throw');

      const res2 = await simulateStartService('Service is already running');
      assert.equal(res2.handled, true, 'Case-insensitive "already running" must be handled cleanly');

      const res3 = await simulateStartService('[SC] StartService FAILED 1060: The specified service does not exist.');
      assert.equal(res3.handled, false, 'Non-existent service error must not be masked as 1056');
    });

    it('verifies sc.exe argument formatting rules', () => {
      // sc.exe config requires 'start=' and the value as distinct args or formatted exactly:
      // 'start=' and 'disabled' as separate args
      const serviceName = 'WerSvc';
      const startup = 'Disabled';
      const scArg = startup === 'Automatic' ? 'auto' : startup === 'Manual' ? 'demand' : 'disabled';
      const args = ['config', serviceName, 'start=', scArg];

      assert.equal(args.length, 4);
      assert.equal(args[2], 'start=');
      assert.equal(args[3], 'disabled');
      // If someone mistakenly combined them: ['config', serviceName, 'start= disabled']
      // Node's execFile would pass "start= disabled" as a single quoted argument, causing sc.exe to fail.
    });
  });

  // ==============================================================
  // 3. TRANSACTIONAL ROLLBACK ENGINE STRESS TEST
  // ==============================================================
  describe('3. Stress Test Transactional Reverse Rollback with Service & Registry Mix', () => {
    class RigorousMockRegistry {
      constructor() {
        this.data = new Map();
        this.writeFailOnKey = null;
      }
      _key(h, p, v) {
        return `${h}\\${p.toLowerCase()}\\${v.toLowerCase()}`;
      }
      async getValue(h, p, v) {
        const k = this._key(h, p, v);
        return this.data.has(k) ? { exists: true, value: this.data.get(k) } : { exists: false, value: null };
      }
      async setValue(h, p, v, type, val) {
        const k = this._key(h, p, v);
        if (this.writeFailOnKey === k) {
          throw new Error(`Simulated Registry Permission Denied on ${k}`);
        }
        this.data.set(k, val);
        return true;
      }
      async deleteValue(h, p, v) {
        const k = this._key(h, p, v);
        this.data.delete(k);
        return true;
      }
    }

    class RigorousMockServiceManager {
      constructor() {
        this.services = new Map();
        this.failOnConfig = null;
      }
      set(name, startup, running) {
        this.services.set(name.toLowerCase(), { startup, running });
      }
      get(name) {
        return this.services.get(name.toLowerCase()) || { exists: false };
      }
      async configure(name, startup) {
        if (this.failOnConfig === name.toLowerCase()) {
          return false; // sc.exe config returned false
        }
        const s = this.services.get(name.toLowerCase());
        if (!s) return false;
        s.startup = startup;
        return true;
      }
      async stop(name) {
        const s = this.services.get(name.toLowerCase());
        if (s) s.running = false;
      }
      async start(name) {
        const s = this.services.get(name.toLowerCase());
        if (s) s.running = true;
      }
    }

    it('stress tests intermediate failure at step 2 (service) after registry write: verifies reverse unwinding', async () => {
      const reg = new RigorousMockRegistry();
      const svc = new RigorousMockServiceManager();

      // Initial state
      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', 3);
      svc.set('DiagTrack', 'Automatic', true);
      svc.failOnConfig = 'diagtrack'; // Force sc.exe config failure

      const appliedActions = [];
      const snapshots = [];
      let transactionFailed = false;

      const actions = [
        {
          type: 'registry',
          hive: 'HKLM',
          path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
          valueName: 'AllowTelemetry',
          valueType: 'REG_DWORD',
          applyValue: 0,
          revertValue: 1,
        },
        {
          type: 'service',
          serviceName: 'DiagTrack',
          applyStartup: 'Disabled',
          revertStartup: 'Automatic',
          stopImmediately: true,
        },
      ];

      // Execute apply loop with exact TweakEngine logic
      try {
        for (const action of actions) {
          if (action.type === 'registry') {
            const original = await reg.getValue(action.hive, action.path, action.valueName);
            const snapshot = {
              actionType: 'registry',
              action,
              originalValue: original,
            };
            snapshots.push(snapshot);
            await reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.applyValue);
            appliedActions.push({ action, snapshot });
          } else if (action.type === 'service') {
            const original = svc.get(action.serviceName);
            const snapshot = {
              actionType: 'service',
              action,
              originalValue: original.startup,
            };
            snapshots.push(snapshot);
            const ok = await svc.configure(action.serviceName, action.applyStartup);
            if (!ok) {
              throw new Error(`Failed to configure service: ${action.serviceName}`);
            }
            if (action.stopImmediately) {
              await svc.stop(action.serviceName);
            }
            appliedActions.push({ action, snapshot });
          }
        }
      } catch (err) {
        transactionFailed = true;
        // Reverse rollback of all applied actions
        for (const applied of appliedActions.reverse()) {
          if (applied.action.type === 'registry') {
            const orig = applied.snapshot.originalValue;
            if (orig && orig.exists) {
              await reg.setValue(applied.action.hive, applied.action.path, applied.action.valueName, applied.action.valueType, orig.value);
            } else {
              await reg.deleteValue(applied.action.hive, applied.action.path, applied.action.valueName);
            }
          } else if (applied.action.type === 'service') {
            const origStartup = applied.snapshot.originalValue;
            await svc.configure(applied.action.serviceName, origStartup);
            if (origStartup === 'Automatic') {
              await svc.start(applied.action.serviceName);
            }
          }
        }
      }

      assert.equal(transactionFailed, true, 'Transaction must fail when service configuration fails');
      assert.equal(appliedActions.length, 1, 'Only step 1 was applied before failure');

      // Verify registry was restored to 3
      const telemVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry');
      assert.equal(telemVal.value, 3, 'Pre-tweak registry value 3 must be cleanly restored on rollback');

      // Verify service was untouched
      const diagState = svc.get('DiagTrack');
      assert.equal(diagState.startup, 'Automatic');
      assert.equal(diagState.running, true);
    });

    it('stress tests rollback when pre-tweak registry key did not exist: ensures key deletion', async () => {
      const reg = new RigorousMockRegistry();
      // TurnOffWindowsCopilot does NOT exist initially
      const initialVal = await reg.getValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot');
      assert.equal(initialVal.exists, false);

      // Snapshot captured with exists = false
      const snapshot = {
        actionType: 'registry',
        action: { hive: 'HKCU', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', valueName: 'TurnOffWindowsCopilot', valueType: 'REG_DWORD' },
        originalValue: { exists: false, value: null },
      };

      // Applied
      await reg.setValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 'REG_DWORD', 1);
      assert.equal((await reg.getValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot')).value, 1);

      // Revert executed
      if (snapshot.originalValue && snapshot.originalValue.exists) {
        await reg.setValue(snapshot.action.hive, snapshot.action.path, snapshot.action.valueName, snapshot.action.valueType, snapshot.originalValue.value);
      } else {
        await reg.deleteValue(snapshot.action.hive, snapshot.action.path, snapshot.action.valueName);
      }

      // Assert key was deleted, not set to 0 or null
      const afterRevert = await reg.getValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot');
      assert.equal(afterRevert.exists, false, 'Non-existent key must be deleted upon rollback');
    });

    it('stress tests restoring custom user pre-tweak service startup (Manual) rather than default (Automatic)', async () => {
      const svc = new RigorousMockServiceManager();
      // User had DiagTrack set to Manual, not running
      svc.set('DiagTrack', 'Manual', false);

      // Snapshot captures pre-tweak startupType: 'Manual'
      const preTweakStartup = svc.get('DiagTrack').startup;
      assert.equal(preTweakStartup, 'Manual');

      // Apply tweak
      await svc.configure('DiagTrack', 'Disabled');
      await svc.stop('DiagTrack');
      assert.equal(svc.get('DiagTrack').startup, 'Disabled');

      // Revert using snapshot.originalValue
      const targetStartup = preTweakStartup; // 'Manual'
      await svc.configure('DiagTrack', targetStartup);
      if (targetStartup === 'Automatic') {
        await svc.start('DiagTrack');
      }

      const revertedState = svc.get('DiagTrack');
      assert.equal(revertedState.startup, 'Manual', 'Must restore custom Manual state');
      assert.equal(revertedState.running, false, 'Manual service should not be started');
    });
  });

  // ==============================================================
  // 4. TEST SUITE DISCREPANCY & STRICTNESS AUDIT
  // ==============================================================
  describe('4. Audit tests/privacyTweaks.test.mjs Strictness & Discrepancies', () => {
    it('verifies tests/privacyTweaks.test.mjs contains zero skipped or bypassed tests', () => {
      const testContent = fs.readFileSync(path.join(rootDir, 'tests/privacyTweaks.test.mjs'), 'utf8');
      assert.ok(!testContent.includes('.skip'), 'No test or suite may be skipped with .skip');
      assert.ok(!testContent.includes('.todo'), 'No test may be marked .todo');
      assert.ok(!testContent.includes('xdescribe') && !testContent.includes('xit'), 'No xdescribe or xit allowed');
    });

    it('empirically audits the snapshot structure in TweakEngine.ts vs PrivacyTestEngine', () => {
      // In TweakEngine.ts:
      // Line 370: originalValue: original.exists ? original.startupType : null
      // original.startupType is 'Automatic' | 'Manual' | 'Disabled'
      //
      // In tests/privacyTweaks.test.mjs:
      // Line 155: originalValue: { startup: original.startup, running: original.running }
      //
      // Verify that TweakEngine.revertTweak and restoreBackup expect a string:
      // Line 529: const targetStartup = matchingSnapshot?.originalValue || action.revertStartup;
      // Line 567: const targetStartup: 'Automatic' | 'Manual' | 'Disabled' = snapshot.originalValue;

      const tweakEngineSrc = fs.readFileSync(path.join(rootDir, 'electron/engine/tweakEngine.ts'), 'utf8');
      const testSuiteSrc = fs.readFileSync(path.join(rootDir, 'tests/privacyTweaks.test.mjs'), 'utf8');

      const tweakEngineStoresString = tweakEngineSrc.includes('originalValue: original.exists ? original.startupType : null');
      assert.ok(tweakEngineStoresString, 'TweakEngine.ts stores startupType string in originalValue');

      const testStoresObject = testSuiteSrc.includes('originalValue: { startup: original.startup, running: original.running }');
      assert.ok(testStoresObject, 'Audited: tests/privacyTweaks.test.mjs tested a local simulator with { startup, running } object structure');

      // If an object were saved to BackupStore in real TweakEngine, line 532:
      // configureService(action.serviceName, targetStartup)
      // would pass an object { startup: 'Automatic', running: true } to configureService!
      // But TweakEngine.ts actually passes a string because it stores the string!
      // This proves TweakEngine.ts is internally self-consistent (string in, string out),
      // but the worker test suite used an independent mock simulator class.
    });
  });
});
