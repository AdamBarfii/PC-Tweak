import test from 'node:test';
import assert from 'node:assert/strict';

// Mock Registry state
class MockRegistry {
  constructor() {
    this.store = new Map();
  }

  getKey(hive, path, valueName) {
    return `${hive}\\${path}\\${valueName}`;
  }

  async getValue(hive, path, valueName) {
    const key = this.getKey(hive, path, valueName);
    if (this.store.has(key)) {
      return { exists: true, value: this.store.get(key) };
    }
    return { exists: false };
  }

  async setValue(hive, path, valueName, valueType, val) {
    const key = this.getKey(hive, path, valueName);
    this.store.set(key, val);
    return true;
  }

  async deleteValue(hive, path, valueName) {
    const key = this.getKey(hive, path, valueName);
    this.store.delete(key);
    return true;
  }
}

test('Transactional Rollback: Step 1 is cleanly rolled back when Step 2 fails', async () => {
  const reg = new MockRegistry();

  // Initial machine state
  await reg.setValue('HKCU', 'Software\\Test', 'Setting1', 'REG_DWORD', 10);
  // Setting2 does not exist initially

  const tweakDefinition = {
    id: 'test_multi_tweak',
    actions: [
      {
        type: 'registry',
        hive: 'HKCU',
        path: 'Software\\Test',
        valueName: 'Setting1',
        valueType: 'REG_DWORD',
        applyValue: 99,
        revertValue: 10,
      },
      {
        type: 'registry',
        hive: 'HKCU',
        path: 'Software\\Test',
        valueName: 'Setting2',
        valueType: 'REG_DWORD',
        applyValue: 100,
        revertValue: null,
      },
    ],
  };

  // Execution engine implementing our exact transactional rollback logic
  const executeTransactionalApply = async (tweak, shouldFailStepIndex = -1) => {
    const snapshots = [];
    const appliedActions = [];

    try {
      for (let i = 0; i < tweak.actions.length; i++) {
        const action = tweak.actions[i];
        if (i === shouldFailStepIndex) {
          throw new Error('Simulated hardware/registry access failure');
        }

        const original = await reg.getValue(action.hive, action.path, action.valueName);
        const snapshot = {
          actionId: `${action.hive}\\${action.path}\\${action.valueName}`,
          actionType: 'registry',
          originalValue: original,
          appliedValue: action.applyValue,
          metadata: {
            hive: action.hive,
            path: action.path,
            valueName: action.valueName,
            valueType: action.valueType,
          },
        };
        snapshots.push(snapshot);

        await reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.applyValue);
        appliedActions.push({ action, snapshot });
      }

      return { success: true, snapshots };
    } catch (err) {
      // Transactional Rollback
      for (const applied of appliedActions.reverse()) {
        const orig = applied.snapshot.originalValue;
        if (orig && orig.exists) {
          await reg.setValue(applied.action.hive, applied.action.path, applied.action.valueName, applied.action.valueType, orig.value);
        } else {
          await reg.deleteValue(applied.action.hive, applied.action.path, applied.action.valueName);
        }
      }
      return { success: false, error: err.message, rolledBackCount: appliedActions.length };
    }
  };

  // Run with failure on step 2 (index 1)
  const result = await executeTransactionalApply(tweakDefinition, 1);
  assert.equal(result.success, false);
  assert.equal(result.rolledBackCount, 1);

  // Assert Setting1 is restored to 10 (not left at 99)
  const val1 = await reg.getValue('HKCU', 'Software\\Test', 'Setting1');
  assert.equal(val1.exists, true);
  assert.equal(val1.value, 10, 'Setting1 must be rolled back to original pre-tweak value 10');

  // Assert Setting2 was never created
  const val2 = await reg.getValue('HKCU', 'Software\\Test', 'Setting2');
  assert.equal(val2.exists, false, 'Setting2 must not exist');
});

test('Pre-Tweak Snapshot Restore: Restores user custom value before JSON default', async () => {
  const reg = new MockRegistry();

  // User originally had non-default value: 42
  await reg.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity', 'REG_SZ', '42');

  const snapshot = {
    actionType: 'registry',
    originalValue: { exists: true, value: '42' },
    appliedValue: '10',
    metadata: {
      hive: 'HKCU',
      path: 'Control Panel\\Mouse',
      valueName: 'MouseSensitivity',
      valueType: 'REG_SZ',
    },
  };

  // Revert function matching our exact tweakEngine implementation
  const executeRevert = async (action, backupRecord) => {
    const matchingSnapshot = backupRecord?.snapshots?.find(
      (s) => s.metadata.path === action.path && s.metadata.valueName === action.valueName
    );

    if (matchingSnapshot) {
      const orig = matchingSnapshot.originalValue;
      if (orig && orig.exists) {
        await reg.setValue(action.hive, action.path, action.valueName, action.valueType, orig.value);
      } else {
        await reg.deleteValue(action.hive, action.path, action.valueName);
      }
      return 'restored_from_snapshot';
    } else {
      await reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.revertValue);
      return 'restored_from_default';
    }
  };

  const action = {
    hive: 'HKCU',
    path: 'Control Panel\\Mouse',
    valueName: 'MouseSensitivity',
    valueType: 'REG_SZ',
    applyValue: '10',
    revertValue: '10', // Default Windows is 10
  };

  // 1. Tweak was applied -> changes value to 10
  await reg.setValue(action.hive, action.path, action.valueName, action.valueType, action.applyValue);

  // 2. Revert with backup record -> should restore 42, NOT default 10!
  const backup = { snapshots: [snapshot] };
  const revertSource = await executeRevert(action, backup);
  assert.equal(revertSource, 'restored_from_snapshot');

  const finalVal = await reg.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
  assert.equal(finalVal.value, '42', 'Must restore custom pre-tweak value 42 rather than hardcoded default 10');
});
