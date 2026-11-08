import test from 'node:test';
import assert from 'node:assert/strict';

// Isolated Test Implementation of Overclock Engine Clamping & Safety Logic
class SafeOverclockTestHarness {
  static MAX_SAFE_CORE_OFFSET = 120;
  static MIN_SAFE_CORE_OFFSET = -50;
  static MAX_SAFE_MEM_OFFSET = 350;
  static MIN_SAFE_MEM_OFFSET = 0;
  static MAX_SAFE_POWER_LIMIT = 105;
  static MIN_SAFE_POWER_LIMIT = 100;

  constructor() {
    this.currentOffsets = {
      coreOffsetMhz: 0,
      memOffsetMhz: 0,
      powerLimitPct: 100,
      fanSpeedPct: 0,
    };
  }

  applyOffsets(offsets) {
    // 1. Strict zero overvolting check
    if (offsets.voltageMv !== undefined && offsets.voltageMv !== 0) {
      throw new Error(
        'VOLTAGE_TAMPERING_PROHIBITED: Voltage is strictly locked at stock (+0 mV) to guarantee zero silicon degradation.'
      );
    }

    // 2. Hardware safe clamping
    const clampedCore = Math.max(
      SafeOverclockTestHarness.MIN_SAFE_CORE_OFFSET,
      Math.min(SafeOverclockTestHarness.MAX_SAFE_CORE_OFFSET, Math.round(offsets.coreOffsetMhz || 0))
    );
    const clampedMem = Math.max(
      SafeOverclockTestHarness.MIN_SAFE_MEM_OFFSET,
      Math.min(SafeOverclockTestHarness.MAX_SAFE_MEM_OFFSET, Math.round(offsets.memOffsetMhz || 0))
    );
    const clampedPower = Math.max(
      SafeOverclockTestHarness.MIN_SAFE_POWER_LIMIT,
      Math.min(SafeOverclockTestHarness.MAX_SAFE_POWER_LIMIT, Math.round(offsets.powerLimitPct || 100))
    );
    const clampedFan = offsets.fanSpeedPct
      ? Math.max(0, Math.min(100, Math.round(offsets.fanSpeedPct)))
      : 0;

    this.currentOffsets = {
      coreOffsetMhz: clampedCore,
      memOffsetMhz: clampedMem,
      powerLimitPct: clampedPower,
      fanSpeedPct: clampedFan,
    };

    return {
      success: true,
      applied: { ...this.currentOffsets },
    };
  }

  revertToStock() {
    this.currentOffsets = {
      coreOffsetMhz: 0,
      memOffsetMhz: 0,
      powerLimitPct: 100,
      fanSpeedPct: 0,
    };
    return { success: true, message: 'Factory stock clocks restored successfully.' };
  }

  calculateHeadroom(currentTemp) {
    return Math.max(0, 85 - currentTemp);
  }

  calculateStabilityIndex(tdrCount = 0, rollbackCount = 0) {
    let score = 100;
    if (tdrCount > 0) score -= tdrCount * 15;
    if (rollbackCount > 0) score -= rollbackCount * 5;
    return Math.max(70, Math.min(100, score));
  }

  calculateEstimatedFps(coreOffset, memOffset) {
    const baseCore = 1750;
    const baseMem = 7000;
    const coreDeltaPct = (coreOffset / baseCore) * 100;
    const memDeltaPct = (memOffset / baseMem) * 100;
    return parseFloat((coreDeltaPct * 0.65 + memDeltaPct * 0.35).toFixed(1));
  }

  checkPreflightTemp(temp) {
    if (temp > 55) {
      return {
        canStart: false,
        error: `GPU temp too warm (${temp}°C > 55°C). Please idle fans to cool down before scanning.`,
      };
    }
    return { canStart: true };
  }
}

test('Safe Overclock Engine Guardrails & Clamping Tests', async (t) => {
  await t.test('Core offset is clamped to [+120 MHz] ceiling and [-50 MHz] floor', () => {
    const harness = new SafeOverclockTestHarness();

    // Upper clamping
    const resUpper = harness.applyOffsets({ coreOffsetMhz: 250, memOffsetMhz: 100 });
    assert.equal(resUpper.applied.coreOffsetMhz, 120, 'Core clock must not exceed +120 MHz');

    // Lower clamping
    const resLower = harness.applyOffsets({ coreOffsetMhz: -100, memOffsetMhz: 100 });
    assert.equal(resLower.applied.coreOffsetMhz, -50, 'Core clock underclock must clamp to -50 MHz');

    // Valid within range
    const resValid = harness.applyOffsets({ coreOffsetMhz: 45, memOffsetMhz: 100 });
    assert.equal(resValid.applied.coreOffsetMhz, 45, 'In-range core offset should apply directly');
  });

  await t.test('Memory offset is clamped to [+350 MHz] ceiling and [0 MHz] floor', () => {
    const harness = new SafeOverclockTestHarness();

    // Upper clamping
    const resUpper = harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: 800 });
    assert.equal(resUpper.applied.memOffsetMhz, 350, 'Memory clock must not exceed +350 MHz');

    // Lower clamping
    const resLower = harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: -100 });
    assert.equal(resLower.applied.memOffsetMhz, 0, 'Memory clock must not go below 0 MHz');

    // Valid within range
    const resValid = harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: 200 });
    assert.equal(resValid.applied.memOffsetMhz, 200, 'In-range memory offset should apply directly');
  });

  await t.test('Power limit is strictly clamped between [100%, 105%]', () => {
    const harness = new SafeOverclockTestHarness();

    // Upper clamping
    const resUpper = harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: 100, powerLimitPct: 130 });
    assert.equal(resUpper.applied.powerLimitPct, 105, 'Power target must clamp to 105% max');

    // Lower clamping
    const resLower = harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: 100, powerLimitPct: 80 });
    assert.equal(resLower.applied.powerLimitPct, 100, 'Power target must clamp to 100% min');
  });

  await t.test('Strict Zero Overvolting: Non-zero voltage immediately throws error', () => {
    const harness = new SafeOverclockTestHarness();

    assert.throws(
      () => {
        harness.applyOffsets({ coreOffsetMhz: 30, memOffsetMhz: 100, voltageMv: 50 });
      },
      /VOLTAGE_TAMPERING_PROHIBITED/,
      'Must throw voltage tampering prohibited exception'
    );
  });

  await t.test('Revert to Stock instantly zeros all offsets', () => {
    const harness = new SafeOverclockTestHarness();
    harness.applyOffsets({ coreOffsetMhz: 60, memOffsetMhz: 200, powerLimitPct: 103 });

    const revertRes = harness.revertToStock();
    assert.equal(revertRes.success, true);
    assert.equal(harness.currentOffsets.coreOffsetMhz, 0);
    assert.equal(harness.currentOffsets.memOffsetMhz, 0);
    assert.equal(harness.currentOffsets.powerLimitPct, 100);
  });

  await t.test('Pre-flight thermal inspection blocks scanning when GPU > 55°C', () => {
    const harness = new SafeOverclockTestHarness();

    const warmRes = harness.checkPreflightTemp(62);
    assert.equal(warmRes.canStart, false);
    assert.ok(warmRes.error.includes('> 55°C'));

    const coolRes = harness.checkPreflightTemp(44);
    assert.equal(coolRes.canStart, true);
  });

  await t.test('Analytics: Thermal Headroom and Silicon Stability calculations', () => {
    const harness = new SafeOverclockTestHarness();

    // 42°C temp -> 43°C headroom (ceiling 85°C)
    assert.equal(harness.calculateHeadroom(42), 43);
    // 87°C temp -> 0°C headroom
    assert.equal(harness.calculateHeadroom(87), 0);

    // Stability with 0 issues -> 100%
    assert.equal(harness.calculateStabilityIndex(0, 0), 100);

    // Stability with 1 TDR event -> 85%
    assert.equal(harness.calculateStabilityIndex(1, 0), 85);

    // Performance gain estimation
    const gain = harness.calculateEstimatedFps(60, 200);
    assert.ok(gain > 2.5 && gain < 5.0, `Gain ${gain}% should be within expected physical estimate`);
  });
});
