import test from 'node:test';
import assert from 'node:assert/strict';

// Isolated Test Implementation of OverclockSafetyWatchdog
class TestOverclockWatchdog {
  constructor() {
    this.isRunning = false;
    this.gpuTempThresholdC = 85;
    this.gpuHotspotThresholdC = 92;
    this.cpuTempThresholdC = 85;
    this.tripwireTriggered = false;
    this.lastTripwireReason = null;
    this.rollbackCount = 0;
    this.tdrCount = 0;
    this.onRevert = null;
  }

  start(onRevert) {
    this.isRunning = true;
    this.tripwireTriggered = false;
    this.lastTripwireReason = null;
    this.onRevert = onRevert || null;
  }

  stop() {
    this.isRunning = false;
  }

  async checkSample(sample) {
    if (!this.isRunning) return;

    if (sample.gpuTemp !== null && sample.gpuTemp !== undefined) {
      if (sample.gpuTemp >= this.gpuTempThresholdC) {
        await this.triggerEmergencyRevert(
          `GPU thermal tripwire breached (${sample.gpuTemp}°C >= ${this.gpuTempThresholdC}°C)`
        );
        return;
      }
    }

    if (sample.hotspotTemp !== null && sample.hotspotTemp !== undefined) {
      if (sample.hotspotTemp >= this.gpuHotspotThresholdC) {
        await this.triggerEmergencyRevert(
          `GPU hotspot thermal tripwire breached (${sample.hotspotTemp}°C >= ${this.gpuHotspotThresholdC}°C)`
        );
        return;
      }
    }

    if (sample.cpuTemp !== null && sample.cpuTemp !== undefined) {
      if (sample.cpuTemp >= this.cpuTempThresholdC) {
        await this.triggerEmergencyRevert(
          `CPU package thermal tripwire breached (${sample.cpuTemp}°C >= ${this.cpuTempThresholdC}°C)`
        );
        return;
      }
    }
  }

  async triggerEmergencyRevert(reason) {
    this.tripwireTriggered = true;
    this.lastTripwireReason = reason;
    this.rollbackCount += 1;
    if (this.onRevert) {
      await this.onRevert(reason);
    }
  }

  async reportTdrEvent(details = 'Display driver reset event detected') {
    this.tdrCount += 1;
    await this.triggerEmergencyRevert(`TDR Driver Recovery: ${details}`);
  }
}

test('Overclock Safety Watchdog Tripwire Tests', async (t) => {
  await t.test('Safe temperatures do not trigger rollback', async () => {
    let reverted = false;
    const watchdog = new TestOverclockWatchdog();
    watchdog.start(() => {
      reverted = true;
    });

    await watchdog.checkSample({ gpuTemp: 55, hotspotTemp: 65, cpuTemp: 60 });
    assert.equal(watchdog.tripwireTriggered, false);
    assert.equal(reverted, false);
    assert.equal(watchdog.rollbackCount, 0);

    await watchdog.checkSample({ gpuTemp: 78, hotspotTemp: 86, cpuTemp: 79 });
    assert.equal(watchdog.tripwireTriggered, false);
    assert.equal(reverted, false);
  });

  await t.test('GPU Core temperature spike to 85°C triggers emergency rollback', async () => {
    let revertReason = null;
    const watchdog = new TestOverclockWatchdog();
    watchdog.start((reason) => {
      revertReason = reason;
    });

    await watchdog.checkSample({ gpuTemp: 86, hotspotTemp: 89, cpuTemp: 65 });
    assert.equal(watchdog.tripwireTriggered, true);
    assert.ok(revertReason.includes('GPU thermal tripwire breached'));
    assert.equal(watchdog.rollbackCount, 1);
  });

  await t.test('GPU Hotspot temperature spike to 92°C triggers emergency rollback', async () => {
    let revertReason = null;
    const watchdog = new TestOverclockWatchdog();
    watchdog.start((reason) => {
      revertReason = reason;
    });

    // Core temp is 72°C (safe), but hotspot is 93°C (dangerous)
    await watchdog.checkSample({ gpuTemp: 72, hotspotTemp: 93, cpuTemp: 60 });
    assert.equal(watchdog.tripwireTriggered, true);
    assert.ok(revertReason.includes('GPU hotspot thermal tripwire breached'));
    assert.equal(watchdog.rollbackCount, 1);
  });

  await t.test('CPU package temperature spike to 85°C triggers emergency rollback', async () => {
    let revertReason = null;
    const watchdog = new TestOverclockWatchdog();
    watchdog.start((reason) => {
      revertReason = reason;
    });

    await watchdog.checkSample({ gpuTemp: 65, hotspotTemp: 75, cpuTemp: 86 });
    assert.equal(watchdog.tripwireTriggered, true);
    assert.ok(revertReason.includes('CPU package thermal tripwire breached'));
    assert.equal(watchdog.rollbackCount, 1);
  });

  await t.test('TDR driver reset event triggers instant rollback', async () => {
    let revertReason = null;
    const watchdog = new TestOverclockWatchdog();
    watchdog.start((reason) => {
      revertReason = reason;
    });

    await watchdog.reportTdrEvent('nvlddmkm display driver reset');
    assert.equal(watchdog.tripwireTriggered, true);
    assert.equal(watchdog.tdrCount, 1);
    assert.ok(revertReason.includes('TDR Driver Recovery'));
  });
});
