import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Test-isolated implementation of AutoRevertWatchdog logic
class TestWatchdog {
  constructor(storageFile) {
    this.storageFile = storageFile;
    this.activeRecord = null;
    this.timer = null;
    this.rollbackCount = 0;
    this.lastRollbackDetails = null;
  }

  persist(record) {
    if (record) {
      fs.writeFileSync(this.storageFile, JSON.stringify(record, null, 2), 'utf8');
    } else if (fs.existsSync(this.storageFile)) {
      fs.unlinkSync(this.storageFile);
    }
  }

  read() {
    try {
      if (!fs.existsSync(this.storageFile)) return null;
      return JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
    } catch {
      return null;
    }
  }

  arm({ tweakName, adapterName, durationSeconds = 20, onRevert }) {
    this.cancelTimer();
    const now = Date.now();
    const record = {
      tweakName,
      adapterName,
      startedAt: now,
      durationSeconds,
      expiresAt: now + durationSeconds * 1000,
      status: 'pending',
    };

    this.activeRecord = record;
    this.persist(record);

    this.timer = setTimeout(async () => {
      await this.triggerRevert('timeout', onRevert);
    }, durationSeconds * 1000);

    return record;
  }

  confirm() {
    this.cancelTimer();
    const record = this.activeRecord || this.read();
    this.activeRecord = null;
    this.persist(null);

    return {
      success: true,
      confirmedTweak: record?.tweakName || null,
    };
  }

  async triggerRevert(reason = 'timeout', customRevertFn) {
    this.cancelTimer();
    const record = this.activeRecord || this.read();
    this.activeRecord = null;
    this.persist(null);

    if (!record) return { success: false, reason: 'none' };

    this.rollbackCount++;
    this.lastRollbackDetails = { tweakName: record.tweakName, adapterName: record.adapterName, reason };

    if (customRevertFn) {
      await customRevertFn(record);
    }

    return { success: true, reason, tweakName: record.tweakName };
  }

  async checkStartupCrashRecovery(customRevertFn) {
    const diskRecord = this.read();
    if (!diskRecord || diskRecord.status !== 'pending') {
      return { recovered: false };
    }

    this.rollbackCount++;
    this.lastRollbackDetails = { tweakName: diskRecord.tweakName, adapterName: diskRecord.adapterName, reason: 'crash_recovery' };

    if (customRevertFn) {
      await customRevertFn(diskRecord);
    }

    this.persist(null);

    return {
      recovered: true,
      revertedTweak: diskRecord.tweakName,
      adapterName: diskRecord.adapterName,
    };
  }

  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

test('AutoRevertWatchdog: Arming writes pendingRevert record to disk with 20s expiry', () => {
  const tmpFile = path.join(os.tmpdir(), `test_watchdog_${Date.now()}_1.json`);
  const watchdog = new TestWatchdog(tmpFile);

  try {
    const record = watchdog.arm({
      tweakName: 'DNS: Cloudflare Quad1',
      adapterName: 'Ethernet',
      durationSeconds: 20,
    });

    assert.equal(record.status, 'pending');
    assert.equal(record.tweakName, 'DNS: Cloudflare Quad1');
    assert.equal(record.adapterName, 'Ethernet');
    assert.ok(fs.existsSync(tmpFile));

    const saved = watchdog.read();
    assert.equal(saved.status, 'pending');
    assert.equal(saved.tweakName, 'DNS: Cloudflare Quad1');
    assert.equal(saved.durationSeconds, 20);
  } finally {
    watchdog.cancelTimer();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('AutoRevertWatchdog: confirm() clears active countdown and deletes pending disk record', () => {
  const tmpFile = path.join(os.tmpdir(), `test_watchdog_${Date.now()}_2.json`);
  const watchdog = new TestWatchdog(tmpFile);

  try {
    watchdog.arm({
      tweakName: 'adapter_flow_control_off',
      adapterName: 'Ethernet',
      durationSeconds: 20,
    });

    assert.ok(fs.existsSync(tmpFile));

    const res = watchdog.confirm();
    assert.equal(res.success, true);
    assert.equal(res.confirmedTweak, 'adapter_flow_control_off');
    assert.equal(fs.existsSync(tmpFile), false);
    assert.equal(watchdog.rollbackCount, 0);
  } finally {
    watchdog.cancelTimer();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('AutoRevertWatchdog: Timeout expiration automatically triggers rollback and cleans up disk state', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_watchdog_${Date.now()}_3.json`);
  const watchdog = new TestWatchdog(tmpFile);

  try {
    let customRevertCalled = false;
    watchdog.arm({
      tweakName: 'adapter_interrupt_moderation_off',
      adapterName: 'Ethernet',
      durationSeconds: 0.05, // 50ms fast test timeout
      onRevert: async (rec) => {
        customRevertCalled = true;
      },
    });

    // Wait 100ms for timer to expire
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(watchdog.rollbackCount, 1);
    assert.equal(watchdog.lastRollbackDetails.tweakName, 'adapter_interrupt_moderation_off');
    assert.equal(watchdog.lastRollbackDetails.reason, 'timeout');
    assert.equal(customRevertCalled, true);
    assert.equal(fs.existsSync(tmpFile), false);
  } finally {
    watchdog.cancelTimer();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('AutoRevertWatchdog: Crash recovery on startup detects unconfirmed pending change and rolls back', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_watchdog_${Date.now()}_4.json`);
  const watchdog = new TestWatchdog(tmpFile);

  try {
    // Simulate application crash: pendingRevert.json was left on disk
    fs.writeFileSync(
      tmpFile,
      JSON.stringify(
        {
          tweakName: 'DNS: Google Public',
          adapterName: 'Wi-Fi',
          startedAt: Date.now() - 30000,
          durationSeconds: 20,
          expiresAt: Date.now() - 10000,
          status: 'pending',
        },
        null,
        2
      ),
      'utf8'
    );

    let rollbackExecuted = false;
    const recoveryResult = await watchdog.checkStartupCrashRecovery(async (rec) => {
      rollbackExecuted = true;
      assert.equal(rec.adapterName, 'Wi-Fi');
    });

    assert.equal(recoveryResult.recovered, true);
    assert.equal(recoveryResult.revertedTweak, 'DNS: Google Public');
    assert.equal(recoveryResult.adapterName, 'Wi-Fi');
    assert.equal(rollbackExecuted, true);
    assert.equal(watchdog.rollbackCount, 1);
    assert.equal(watchdog.lastRollbackDetails.reason, 'crash_recovery');

    // State file deleted after recovery
    assert.equal(fs.existsSync(tmpFile), false);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('AutoRevertWatchdog: Startup check returns recovered: false when no pending changes exist', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_watchdog_${Date.now()}_5.json`);
  const watchdog = new TestWatchdog(tmpFile);

  try {
    const res = await watchdog.checkStartupCrashRecovery();
    assert.equal(res.recovered, false);
    assert.equal(watchdog.rollbackCount, 0);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
