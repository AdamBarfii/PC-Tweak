import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: 15s Test & Auto-Revert Logic
test('Safety System: 15s auto-revert timer countdown and trigger', () => {
  let secondsRemaining = 15;
  let reverted = false;

  const tick = () => {
    if (secondsRemaining <= 1) {
      reverted = true;
      secondsRemaining = 0;
    } else {
      secondsRemaining--;
    }
  };

  // Simulate 14 ticks -> should still be active
  for (let i = 0; i < 14; i++) {
    tick();
  }
  assert.equal(secondsRemaining, 1);
  assert.equal(reverted, false);

  // 15th tick -> triggers auto-revert
  tick();
  assert.equal(secondsRemaining, 0);
  assert.equal(reverted, true);
});

// Test 2: Input Health Check 30% Drop Detection
test('Safety System: Silent health check detects >30% input drop', () => {
  const evaluateHealthCheck = (baselineHz, postHz) => {
    if (postHz === 0) return { passed: false, dropPercent: 100, reason: 'Input stream stopped' };
    const drop = ((baselineHz - postHz) / baselineHz) * 100;
    if (drop > 30) {
      return { passed: false, dropPercent: parseFloat(drop.toFixed(1)), reason: 'Input dropped >30%' };
    }
    return { passed: true, dropPercent: Math.max(0, parseFloat(drop.toFixed(1))) };
  };

  // Normal slight variance: 1000Hz -> 960Hz (4% drop) -> passed
  const test1 = evaluateHealthCheck(1000, 960);
  assert.equal(test1.passed, true);
  assert.equal(test1.dropPercent, 4);

  // Moderate variance: 1000Hz -> 750Hz (25% drop) -> passed
  const test2 = evaluateHealthCheck(1000, 750);
  assert.equal(test2.passed, true);

  // Severe degradation: 1000Hz -> 650Hz (35% drop) -> FAILS & REVERTS
  const test3 = evaluateHealthCheck(1000, 650);
  assert.equal(test3.passed, false);
  assert.equal(test3.dropPercent, 35);
  assert.equal(test3.reason, 'Input dropped >30%');

  // Total disconnect: 1000Hz -> 0Hz -> FAILS & REVERTS
  const test4 = evaluateHealthCheck(1000, 0);
  assert.equal(test4.passed, false);
  assert.equal(test4.reason, 'Input stream stopped');
});

// Test 3: Tweak ID Whitelist Enforcement
test('Safety System: Tweak ID whitelist rejection of arbitrary commands or paths', () => {
  const WHITELISTED_TWEAKS = new Set([
    'mouse_disable_acceleration',
    'pointer_speed_neutral',
    'keyboard_repeat_fastest',
    'keyboard_turn_off_filterkeys',
    'keyboard_turn_off_sticky_toggle',
    'keyboard_turn_off_alt_shift',
    'usb_selective_suspend_off',
    'power_plan_ultimate',
    'pcie_link_state_off',
    'processor_state_100_core_unpark',
    'game_mode_on_dvr_off',
    'windowed_optimizations_win11',
    'global_timer_resolution_requests',
    'monitor_refresh_rate_info',
    'msi_mode_gpu_usb',
    'vbs_memory_integrity_off',
    'hyperv_launch_off',
  ]);

  const validateTweakId = (id) => WHITELISTED_TWEAKS.has(id);

  assert.equal(validateTweakId('mouse_disable_acceleration'), true);
  assert.equal(validateTweakId('vbs_memory_integrity_off'), true);

  // Injections or arbitrary paths must be rejected
  assert.equal(validateTweakId('cmd.exe /c calc'), false);
  assert.equal(validateTweakId('HKLM\\SOFTWARE\\...'), false);
  assert.equal(validateTweakId('MouseDataQueueSize'), false); // strictly excluded
  assert.equal(validateTweakId('HPET'), false); // strictly excluded
});
