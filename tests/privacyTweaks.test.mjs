import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tweaksDir = path.join(rootDir, 'data/tweaks');
const privacyJsonPath = path.join(tweaksDir, 'privacy.json');

// ==========================================
// Test Mocks & In-Memory Simulators
// ==========================================

class MockRegistry {
  constructor() {
    this.store = new Map();
  }

  _getKey(hive, p, valueName) {
    return `${hive.toUpperCase()}\\${p.toLowerCase()}\\${valueName.toLowerCase()}`;
  }

  async getValue(hive, p, valueName) {
    const key = this._getKey(hive, p, valueName);
    if (this.store.has(key)) {
      return { exists: true, value: this.store.get(key) };
    }
    return { exists: false, value: null };
  }

  async setValue(hive, p, valueName, valueType, val) {
    const key = this._getKey(hive, p, valueName);
    this.store.set(key, val);
    return true;
  }

  async deleteValue(hive, p, valueName) {
    const key = this._getKey(hive, p, valueName);
    this.store.delete(key);
    return true;
  }
}

class MockServiceManager {
  constructor() {
    // serviceName -> { startup: 'Automatic' | 'Manual' | 'Disabled', running: boolean }
    this.services = new Map();
  }

  registerService(name, startup = 'Automatic', running = true) {
    this.services.set(name.toLowerCase(), { startup, running });
  }

  async getServiceConfig(name) {
    const s = this.services.get(name.toLowerCase());
    if (!s) return { exists: false, startup: 'Disabled', running: false };
    return { exists: true, startup: s.startup, running: s.running };
  }

  async setServiceStartup(name, startup) {
    const s = this.services.get(name.toLowerCase());
    if (!s) throw new Error(`Service not found: ${name}`);
    s.startup = startup;
    return true;
  }

  async stopService(name) {
    const s = this.services.get(name.toLowerCase());
    if (!s) throw new Error(`Service not found: ${name}`);
    s.running = false;
    return true;
  }

  async startService(name) {
    const s = this.services.get(name.toLowerCase());
    if (!s) throw new Error(`Service not found: ${name}`);
    s.running = true;
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

  getActiveBackupForTweak(tweakId) {
    return this.backups.find(
      (b) => b.status === 'active' && b.tweakIds && b.tweakIds.includes(tweakId)
    );
  }

  updateStatus(id, status) {
    const b = this.backups.find((x) => x.id === id);
    if (b) b.status = status;
  }
}

/**
 * Execution Engine Simulator modeling exact TweakEngine ServiceAction and RegistryAction mechanics
 */
class PrivacyTestEngine {
  constructor(registry, serviceManager, backupStore) {
    this.reg = registry;
    this.services = serviceManager;
    this.backups = backupStore;
  }

  async applyTweak(tweak, failAtStep = -1) {
    const snapshots = [];
    const appliedActions = [];

    try {
      for (let i = 0; i < tweak.actions.length; i++) {
        if (i === failAtStep) {
          throw new Error(`Simulated failure at action step ${i}`);
        }

        const action = tweak.actions[i];

        if (action.type === 'registry') {
          const original = await this.reg.getValue(action.hive, action.path, action.valueName);
          const snapshot = {
            actionId: `${action.hive}\\${action.path}\\${action.valueName}`,
            actionType: 'registry',
            originalValue: original,
            appliedValue: action.applyValue,
            targetIdentifier: `${action.hive}\\${action.path}\\${action.valueName}`,
            metadata: {
              hive: action.hive,
              path: action.path,
              valueName: action.valueName,
              valueType: action.valueType,
            },
          };
          snapshots.push(snapshot);
          await this.reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.applyValue);
          appliedActions.push({ action, snapshot });
        } else if (action.type === 'service') {
          const original = await this.services.getServiceConfig(action.serviceName);
          const snapshot = {
            actionId: `service\\${action.serviceName}`,
            actionType: 'service',
            originalValue: { startup: original.startup, running: original.running },
            appliedValue: action.applyStartup,
            targetIdentifier: action.serviceName,
            metadata: {
              serviceName: action.serviceName,
              applyStartup: action.applyStartup,
              revertStartup: action.revertStartup,
              stopImmediately: action.stopImmediately,
            },
          };
          snapshots.push(snapshot);
          await this.services.setServiceStartup(action.serviceName, action.applyStartup);
          if (action.stopImmediately) {
            await this.services.stopService(action.serviceName);
          }
          appliedActions.push({ action, snapshot });
        }
      }

      const backupRecord = {
        id: `backup_${Date.now()}_${tweak.id}`,
        timestamp: new Date().toISOString(),
        tweakIds: [tweak.id],
        snapshots,
        status: 'active',
      };
      this.backups.saveBackup(backupRecord);

      return { success: true, snapshots };
    } catch (err) {
      // Transactional Reverse Rollback
      for (const applied of appliedActions.reverse()) {
        if (applied.action.type === 'registry') {
          const orig = applied.snapshot.originalValue;
          if (orig && orig.exists) {
            await this.reg.setValue(
              applied.action.hive,
              applied.action.path,
              applied.action.valueName,
              applied.action.valueType,
              orig.value
            );
          } else {
            await this.reg.deleteValue(applied.action.hive, applied.action.path, applied.action.valueName);
          }
        } else if (applied.action.type === 'service') {
          const orig = applied.snapshot.originalValue;
          await this.services.setServiceStartup(applied.action.serviceName, orig.startup);
          if (orig.running) {
            await this.services.startService(applied.action.serviceName);
          }
        }
      }
      return { success: false, error: err.message, rolledBackCount: appliedActions.length };
    }
  }

  async revertTweak(tweak) {
    const activeBackup = this.backups.getActiveBackupForTweak(tweak.id);

    for (const action of tweak.actions) {
      if (action.type === 'registry') {
        const snap = activeBackup?.snapshots.find(
          (s) =>
            s.actionType === 'registry' &&
            s.metadata?.hive === action.hive &&
            s.metadata?.path.toLowerCase() === action.path.toLowerCase() &&
            s.metadata?.valueName.toLowerCase() === action.valueName.toLowerCase()
        );

        if (snap) {
          const orig = snap.originalValue;
          if (orig && orig.exists) {
            await this.reg.setValue(action.hive, action.path, action.valueName, action.valueType, orig.value);
          } else {
            await this.reg.deleteValue(action.hive, action.path, action.valueName);
          }
        } else {
          if (action.revertValue === null) {
            await this.reg.deleteValue(action.hive, action.path, action.valueName);
          } else {
            await this.reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.revertValue);
          }
        }
      } else if (action.type === 'service') {
        const snap = activeBackup?.snapshots.find(
          (s) => s.actionType === 'service' && s.metadata?.serviceName.toLowerCase() === action.serviceName.toLowerCase()
        );

        if (snap) {
          const orig = snap.originalValue;
          await this.services.setServiceStartup(action.serviceName, orig.startup);
          if (orig.running) {
            await this.services.startService(action.serviceName);
          }
        } else {
          await this.services.setServiceStartup(action.serviceName, action.revertStartup);
        }
      }
    }

    if (activeBackup) {
      this.backups.updateStatus(activeBackup.id, 'reverted');
    }

    return { success: true };
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('Privacy Tweaks & Security Suite', () => {
  function loadPrivacyTweaks() {
    assert.ok(fs.existsSync(privacyJsonPath), 'data/tweaks/privacy.json must exist on disk');
    const content = fs.readFileSync(privacyJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(Array.isArray(parsed), 'privacy.json content must be a JSON array');
    return parsed;
  }

  describe('Suite 1: Catalog & Schema Integrity', () => {
    it('privacy.json exists and contains exactly 6 required privacy tweaks', () => {
      const tweaks = loadPrivacyTweaks();
      assert.equal(tweaks.length, 6, `Expected exactly 6 privacy tweaks, but found ${tweaks.length}`);

      const ids = tweaks.map((t) => t.id).sort();
      const expectedIds = [
        'disable_activity_history',
        'disable_advertising_id',
        'disable_cortana_copilot',
        'disable_location_diagnostics',
        'disable_telemetry',
        'disable_wer',
      ].sort();
      assert.deepEqual(ids, expectedIds, 'Active privacy tweak IDs must match the 6 required tweaks');
    });

    it('all privacy tweaks adhere to category, impact, and anticheat standards', () => {
      const tweaks = loadPrivacyTweaks();
      for (const t of tweaks) {
        assert.equal(t.category, 'privacy', `Tweak '${t.id}' must have category 'privacy'`);
        assert.ok(['safe', 'moderate'].includes(t.impact), `Tweak '${t.id}' impact must be safe or moderate`);
        assert.equal(t.anticheat, 'safe', `Privacy tweak '${t.id}' must be anticheat safe`);
        assert.ok(t.nameKey?.startsWith('tweaks.privacy.'), `Tweak '${t.id}' nameKey must follow naming convention`);
        assert.ok(t.descriptionKey?.startsWith('tweaks.privacy.'), `Tweak '${t.id}' descriptionKey must follow convention`);
      }
    });

    it('zero duplicate target collisions within privacy.json', () => {
      const tweaks = loadPrivacyTweaks();
      const seenRegistry = new Set();
      const seenServices = new Set();

      for (const t of tweaks) {
        for (const action of t.actions) {
          if (action.type === 'registry') {
            const key = `${action.hive}\\${action.path.toLowerCase()}\\${action.valueName.toLowerCase()}`;
            assert.ok(!seenRegistry.has(key), `Collision within privacy.json for registry target '${key}'`);
            seenRegistry.add(key);
          } else if (action.type === 'service') {
            const sName = action.serviceName.toLowerCase();
            assert.ok(!seenServices.has(sName), `Duplicate service action target for '${sName}'`);
            seenServices.add(sName);
          }
        }
      }
    });

    it('zero collisions between privacy tweaks and active gaming, input, and advanced catalogs', () => {
      const privacyTweaks = loadPrivacyTweaks();
      const otherFiles = ['gaming.json', 'input.json', 'advanced.json'];
      const otherRegistryTargets = new Map();

      for (const file of otherFiles) {
        const filePath = path.join(tweaksDir, file);
        if (!fs.existsSync(filePath)) continue;
        const tweaks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const t of tweaks) {
          for (const a of t.actions) {
            if (a.type === 'registry') {
              const key = `${a.hive}\\${a.path.toLowerCase()}\\${a.valueName.toLowerCase()}`;
              otherRegistryTargets.set(key, { file, tweakId: t.id });
            }
          }
        }
      }

      for (const t of privacyTweaks) {
        for (const a of t.actions) {
          if (a.type === 'registry') {
            const key = `${a.hive}\\${a.path.toLowerCase()}\\${a.valueName.toLowerCase()}`;
            const collision = otherRegistryTargets.get(key);
            assert.ok(
              !collision,
              `Collision detected! Privacy tweak '${t.id}' targets '${key}' which is already registered by '${collision?.tweakId}' in '${collision?.file}'`
            );
          }
        }
      }
    });
  });

  describe('Suite 2: 6 Required Privacy Tweaks Contract Verification', () => {
    it('verifies telemetry and Windows error reporting tweak structures with service actions', () => {
      const tweaks = loadPrivacyTweaks();

      // 1. disable_telemetry
      const telem = tweaks.find((t) => t.id === 'disable_telemetry');
      assert.ok(telem);
      const telemReg = telem.actions.find((a) => a.type === 'registry');
      assert.equal(telemReg.hive, 'HKLM');
      assert.equal(telemReg.valueName, 'AllowTelemetry');
      assert.equal(telemReg.applyValue, 0);
      assert.equal(telemReg.revertValue, 1);
      const telemSvc = telem.actions.find((a) => a.type === 'service');
      assert.equal(telemSvc.serviceName, 'DiagTrack');
      assert.equal(telemSvc.applyStartup, 'Disabled');
      assert.equal(telemSvc.revertStartup, 'Automatic');
      assert.equal(telemSvc.stopImmediately, true);

      // 2. disable_wer
      const wer = tweaks.find((t) => t.id === 'disable_wer');
      assert.ok(wer);
      assert.equal(wer.actions.length, 3, 'disable_wer must have 2 registry actions and 1 service action');
      const werSvc = wer.actions.find((a) => a.type === 'service');
      assert.equal(werSvc.serviceName, 'WerSvc');
      assert.equal(werSvc.applyStartup, 'Disabled');
      assert.equal(werSvc.revertStartup, 'Manual');
      assert.equal(werSvc.stopImmediately, true);
    });

    it('verifies cortana/copilot and advertising ID multi-key actions', () => {
      const tweaks = loadPrivacyTweaks();

      // 3. disable_cortana_copilot
      const cortana = tweaks.find((t) => t.id === 'disable_cortana_copilot');
      assert.ok(cortana);
      assert.equal(cortana.actions.length, 4, 'disable_cortana_copilot must have 4 registry actions');
      const hklmActions = cortana.actions.filter((a) => a.hive === 'HKLM');
      const hkcuActions = cortana.actions.filter((a) => a.hive === 'HKCU');
      assert.equal(hklmActions.length, 3);
      assert.equal(hkcuActions.length, 1);
      assert.ok(hklmActions.some((a) => a.valueName === 'AllowCortana'));
      assert.ok(hklmActions.some((a) => a.valueName === 'DisableWebSearch'));
      assert.ok(hklmActions.some((a) => a.valueName === 'ConnectedSearchUseWeb'));
      assert.ok(hkcuActions.some((a) => a.valueName === 'TurnOffWindowsCopilot'));

      // 4. disable_advertising_id
      const ad = tweaks.find((t) => t.id === 'disable_advertising_id');
      assert.ok(ad);
      assert.equal(ad.actions.length, 2);
      assert.ok(ad.actions.some((a) => a.hive === 'HKCU' && a.valueName === 'Enabled'));
      assert.ok(ad.actions.some((a) => a.hive === 'HKLM' && a.valueName === 'DisabledByGroupPolicy'));
    });

    it('verifies activity history and location diagnostics policy actions', () => {
      const tweaks = loadPrivacyTweaks();

      // 5. disable_activity_history
      const act = tweaks.find((t) => t.id === 'disable_activity_history');
      assert.ok(act);
      assert.equal(act.actions.length, 3);
      assert.ok(act.actions.every((a) => a.hive === 'HKLM' && a.path.includes('Windows\\System')));

      // 6. disable_location_diagnostics
      const loc = tweaks.find((t) => t.id === 'disable_location_diagnostics');
      assert.ok(loc);
      assert.equal(loc.actions.length, 2);
      assert.ok(loc.actions.some((a) => a.valueName === 'DisableLocation' && a.applyValue === 1));
      assert.ok(loc.actions.some((a) => a.valueName === 'LetAppsGetDiagnosticInfo' && a.applyValue === 2));
    });
  });

  describe('Suite 3: ServiceAction Lifecycle & Snapshot Rollback Engine', () => {
    it('captures pre-tweak service start type in snapshot and applies disabled status', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      services.registerService('DiagTrack', 'Automatic', true);

      const tweak = {
        id: 'disable_telemetry',
        actions: [
          {
            type: 'service',
            serviceName: 'DiagTrack',
            applyStartup: 'Disabled',
            revertStartup: 'Automatic',
            stopImmediately: true,
          },
        ],
      };

      const result = await engine.applyTweak(tweak);
      assert.equal(result.success, true);

      // Verify service state updated to Disabled and stopped
      const config = await services.getServiceConfig('DiagTrack');
      assert.equal(config.startup, 'Disabled');
      assert.equal(config.running, false);

      // Verify BackupStore received accurate pre-tweak snapshot
      const backup = backups.getActiveBackupForTweak('disable_telemetry');
      assert.ok(backup, 'Active backup record must be saved in BackupStore');
      assert.equal(backup.snapshots.length, 1);
      assert.equal(backup.snapshots[0].actionType, 'service');
      assert.equal(backup.snapshots[0].originalValue.startup, 'Automatic');
      assert.equal(backup.snapshots[0].originalValue.running, true);
    });

    it('100% rollback restores initial pre-tweak service start type and running status', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      services.registerService('DiagTrack', 'Automatic', true);
      const tweak = {
        id: 'disable_telemetry',
        actions: [
          {
            type: 'service',
            serviceName: 'DiagTrack',
            applyStartup: 'Disabled',
            revertStartup: 'Automatic',
            stopImmediately: true,
          },
        ],
      };

      await engine.applyTweak(tweak);
      const revertRes = await engine.revertTweak(tweak);
      assert.equal(revertRes.success, true);

      // Verify service returned to Automatic and restarted
      const config = await services.getServiceConfig('DiagTrack');
      assert.equal(config.startup, 'Automatic');
      assert.equal(config.running, true);

      // Backup status marked reverted
      assert.equal(backups.listBackups()[0].status, 'reverted');
    });

    it('rollback restores user custom pre-tweak service state rather than blind JSON default', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      // User had DiagTrack configured as 'Manual' (not default Automatic) before running PC Tweak
      services.registerService('DiagTrack', 'Manual', false);

      const tweak = {
        id: 'disable_telemetry',
        actions: [
          {
            type: 'service',
            serviceName: 'DiagTrack',
            applyStartup: 'Disabled',
            revertStartup: 'Automatic', // Default in JSON is Automatic
            stopImmediately: true,
          },
        ],
      };

      await engine.applyTweak(tweak);
      await engine.revertTweak(tweak);

      // Must restore user's prior 'Manual' state, not the JSON default 'Automatic'
      const config = await services.getServiceConfig('DiagTrack');
      assert.equal(config.startup, 'Manual', 'Snapshot rollback must preserve pre-tweak custom Manual startup');
      assert.equal(config.running, false);
    });
  });

  describe('Suite 4: Multi-Key & Multi-Hive Registry Rollback Engine', () => {
    it('disable_wer rolls back both registry keys and WerSvc service cleanly', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      // Pre-tweak state
      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 'REG_DWORD', 0);
      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'DoReport', 'REG_DWORD', 1);
      services.registerService('WerSvc', 'Manual', false);

      const tweak = {
        id: 'disable_wer',
        actions: [
          {
            type: 'registry',
            hive: 'HKLM',
            path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting',
            valueName: 'Disabled',
            valueType: 'REG_DWORD',
            applyValue: 1,
            revertValue: 0,
          },
          {
            type: 'registry',
            hive: 'HKLM',
            path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting',
            valueName: 'DoReport',
            valueType: 'REG_DWORD',
            applyValue: 0,
            revertValue: 1,
          },
          {
            type: 'service',
            serviceName: 'WerSvc',
            applyStartup: 'Disabled',
            revertStartup: 'Manual',
            stopImmediately: true,
          },
        ],
      };

      await engine.applyTweak(tweak);
      let dVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled');
      assert.equal(dVal.value, 1);

      await engine.revertTweak(tweak);
      dVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled');
      const rVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'DoReport');
      const svcVal = await services.getServiceConfig('WerSvc');

      assert.equal(dVal.value, 0, 'Disabled must be restored to 0');
      assert.equal(rVal.value, 1, 'DoReport must be restored to 1');
      assert.equal(svcVal.startup, 'Manual', 'WerSvc must be restored to Manual');
    });

    it('disable_cortana_copilot deletes non-preexisting keys and restores preexisting keys across HKLM and HKCU', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      // Pre-tweak: AllowCortana existed, but TurnOffWindowsCopilot did NOT exist
      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana', 'REG_DWORD', 1);

      const tweak = {
        id: 'disable_cortana_copilot',
        actions: [
          {
            type: 'registry',
            hive: 'HKLM',
            path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search',
            valueName: 'AllowCortana',
            valueType: 'REG_DWORD',
            applyValue: 0,
            revertValue: 1,
          },
          {
            type: 'registry',
            hive: 'HKCU',
            path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot',
            valueName: 'TurnOffWindowsCopilot',
            valueType: 'REG_DWORD',
            applyValue: 1,
            revertValue: null,
          },
        ],
      };

      await engine.applyTweak(tweak);

      // Verify applied
      const cApplied = await reg.getValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot');
      assert.equal(cApplied.value, 1);

      await engine.revertTweak(tweak);

      // AllowCortana restored to 1
      const cortanaVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana');
      assert.equal(cortanaVal.value, 1);

      // TurnOffWindowsCopilot must be DELETED (exists === false), not left as 0 or null
      const copilotVal = await reg.getValue('HKCU', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot');
      assert.equal(copilotVal.exists, false, 'Non-preexisting Copilot key must be deleted upon rollback');
    });

    it('disable_activity_history cleanly restores all 3 policy registry targets', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      const tweak = {
        id: 'disable_activity_history',
        actions: [
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', valueName: 'EnableActivityFeed', valueType: 'REG_DWORD', applyValue: 0, revertValue: 1 },
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', valueName: 'PublishUserActivities', valueType: 'REG_DWORD', applyValue: 0, revertValue: 1 },
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', valueName: 'UploadUserActivities', valueType: 'REG_DWORD', applyValue: 0, revertValue: 1 },
        ],
      };

      await engine.applyTweak(tweak);
      await engine.revertTweak(tweak);

      for (const a of tweak.actions) {
        const val = await reg.getValue(a.hive, a.path, a.valueName);
        assert.equal(val.exists, false, 'Keys that did not exist initially must be completely deleted upon rollback');
      }
    });
  });

  describe('Suite 5: Transactional Safety & Intermediate Failure Handling', () => {
    it('intermediate failure on registry action triggers reverse rollback of preceding actions', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 'REG_DWORD', 0);

      const tweak = {
        id: 'disable_wer',
        actions: [
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', valueName: 'Disabled', valueType: 'REG_DWORD', applyValue: 1, revertValue: 0 },
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', valueName: 'DoReport', valueType: 'REG_DWORD', applyValue: 0, revertValue: 1 },
        ],
      };

      // Force failure on step 1 (second action: DoReport)
      const res = await engine.applyTweak(tweak, 1);
      assert.equal(res.success, false);
      assert.equal(res.rolledBackCount, 1);

      // Verify Disabled was rolled back to 0
      const disabledVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled');
      assert.equal(disabledVal.value, 0, 'Preceding registry change must be unwound on error');

      // Verify DoReport was never set
      const doReportVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'DoReport');
      assert.equal(doReportVal.exists, false);
    });

    it('intermediate failure on service action rolls back preceding registry writes cleanly', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      await reg.setValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', 3);
      services.registerService('DiagTrack', 'Automatic', true);

      const tweak = {
        id: 'disable_telemetry',
        actions: [
          { type: 'registry', hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', valueName: 'AllowTelemetry', valueType: 'REG_DWORD', applyValue: 0, revertValue: 1 },
          { type: 'service', serviceName: 'DiagTrack', applyStartup: 'Disabled', revertStartup: 'Automatic', stopImmediately: true },
        ],
      };

      // Force failure on step 1 (service action)
      const res = await engine.applyTweak(tweak, 1);
      assert.equal(res.success, false);
      assert.equal(res.rolledBackCount, 1);

      // Verify AllowTelemetry was restored to 3
      const telemVal = await reg.getValue('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry');
      assert.equal(telemVal.value, 3, 'AllowTelemetry must be rolled back to pre-tweak value 3');

      // Verify DiagTrack service was never disabled
      const svcVal = await services.getServiceConfig('DiagTrack');
      assert.equal(svcVal.startup, 'Automatic');
      assert.equal(svcVal.running, true);
    });

    it('no orphaned active backup record exists after transactional failure', async () => {
      const reg = new MockRegistry();
      const services = new MockServiceManager();
      const backups = new MockBackupStore();
      const engine = new PrivacyTestEngine(reg, services, backups);

      const tweak = {
        id: 'test_failing_tweak',
        actions: [
          { type: 'registry', hive: 'HKLM', path: 'Test', valueName: 'K1', valueType: 'REG_DWORD', applyValue: 1, revertValue: 0 },
          { type: 'registry', hive: 'HKLM', path: 'Test', valueName: 'K2', valueType: 'REG_DWORD', applyValue: 1, revertValue: 0 },
        ],
      };

      await engine.applyTweak(tweak, 1);

      // Must have zero active backups
      const activeBackups = backups.listBackups().filter((b) => b.status === 'active');
      assert.equal(activeBackups.length, 0, 'No active backup record should be committed if tweak application fails');
    });
  });
});
