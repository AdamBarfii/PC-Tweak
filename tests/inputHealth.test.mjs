import test from 'node:test';
import assert from 'node:assert/strict';

// Inline replication of the pure functions for direct node test runner validation
function computeInputHealth(pollingHz, jitterP99, timerResMs, sufficientMovement) {
  const thresholds = {
    optimal: 'Polling ≥ 950Hz, Jitter p99 ≤ 0.15ms, Timer Res ≤ 0.6ms',
    good: 'Polling ≥ 450Hz, Jitter p99 ≤ 0.50ms, Timer Res ≤ 1.1ms',
    needsAttention: 'Higher input arrival jitter or default Windows 15.6ms timer resolution',
  };

  if (!sufficientMovement || pollingHz === null || jitterP99 === null || timerResMs === null) {
    return {
      status: 'idle',
      label: 'No Data',
      color: 'slate',
      description: 'Move mouse fast in circles to measure.',
      thresholds,
    };
  }

  if (pollingHz >= 950 && jitterP99 <= 0.15 && timerResMs <= 0.6) {
    return {
      status: 'optimal',
      label: 'Optimal',
      color: 'emerald',
      description: 'High polling and low jitter detected with precision timer.',
      thresholds,
    };
  }

  if (pollingHz >= 450 && jitterP99 <= 0.5 && timerResMs <= 1.1) {
    return {
      status: 'good',
      label: 'Good',
      color: 'cyan',
      description: 'Acceptable polling rate and jitter pacing.',
      thresholds,
    };
  }

  return {
    status: 'needs_attention',
    label: 'Needs Attention',
    color: 'amber',
    description: 'Elevated arrival jitter or unoptimized timer resolution.',
    thresholds,
  };
}

function evaluateBenchmarkDelta(baselineSpreadMs, baselineAvgJitterMs, postJitterMs) {
  const deltaMs = baselineAvgJitterMs - postJitterMs;
  const significanceThreshold = 2 * baselineSpreadMs;

  if (deltaMs > significanceThreshold && deltaMs > 0.01) {
    const percent = Math.min(100, Math.max(0, (deltaMs / baselineAvgJitterMs) * 100));
    return {
      improved: true,
      deltaMs,
      percent: parseFloat(percent.toFixed(1)),
      message: `Jitter reduced by ${deltaMs.toFixed(3)}ms (exceeds 2x noise spread).`,
    };
  }

  return {
    improved: false,
    deltaMs,
    percent: 0,
    message: `No measurable change: delta of ${deltaMs.toFixed(
      3
    )}ms is within 2x baseline noise spread (±${(2 * baselineSpreadMs).toFixed(3)}ms).`,
  };
}

test('computeInputHealth: returns No Data when stationary or idle', () => {
  const idle1 = computeInputHealth(null, null, 1.0, false);
  assert.equal(idle1.status, 'idle');
  assert.equal(idle1.label, 'No Data');

  const idle2 = computeInputHealth(1000, 0.08, 0.5, false);
  assert.equal(idle2.status, 'idle');
  assert.equal(idle2.label, 'No Data');
});

test('computeInputHealth: returns Optimal for 1000Hz gaming mouse with 0.5ms timer', () => {
  const result = computeInputHealth(1000, 0.08, 0.5, true);
  assert.equal(result.status, 'optimal');
  assert.equal(result.label, 'Optimal');
  assert.equal(result.color, 'emerald');
});

test('computeInputHealth: returns Good for 500Hz mouse with 1.0ms timer', () => {
  const result = computeInputHealth(500, 0.35, 1.0, true);
  assert.equal(result.status, 'good');
  assert.equal(result.label, 'Good');
  assert.equal(result.color, 'cyan');
});

test('computeInputHealth: returns Needs Attention for high jitter or 15.6ms default timer', () => {
  const badTimer = computeInputHealth(1000, 0.10, 15.625, true);
  assert.equal(badTimer.status, 'needs_attention');
  assert.equal(badTimer.label, 'Needs Attention');

  const highJitter = computeInputHealth(1000, 0.95, 0.5, true);
  assert.equal(highJitter.status, 'needs_attention');
});

test('evaluateBenchmarkDelta: flags improvement when delta > 2x noise spread', () => {
  // Baseline: avg jitter 0.20ms, spread 0.02ms. 2x spread = 0.04ms.
  // Post jitter: 0.12ms -> delta = 0.08ms > 0.04ms.
  const result = evaluateBenchmarkDelta(0.02, 0.20, 0.12);
  assert.equal(result.improved, true);
  assert.equal(result.percent, 40.0);
  assert.match(result.message, /exceeds 2x noise spread/);
});

test('evaluateBenchmarkDelta: reports No measurable change when delta <= 2x noise spread', () => {
  // Baseline: avg jitter 0.20ms, spread 0.03ms. 2x spread = 0.06ms.
  // Post jitter: 0.17ms -> delta = 0.03ms <= 0.06ms.
  const result = evaluateBenchmarkDelta(0.03, 0.20, 0.17);
  assert.equal(result.improved, false);
  assert.equal(result.percent, 0);
  assert.match(result.message, /No measurable change/);
});
