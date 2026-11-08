import test from 'node:test';
import assert from 'node:assert/strict';

// Isolated mock of Automation Rule Evaluation Logic
class MockRuleEvaluator {
  constructor() {
    this.lastRamTrimTimestamp = 0;
    this.lastDiskCheckTimestamp = 0;
    this.executedActions = [];
  }

  evaluateRamRule({
    masterEnabled,
    ruleEnabled,
    thresholdPercent,
    cooldownMinutes,
    currentMemPercent,
    currentTime,
  }) {
    if (!masterEnabled || !ruleEnabled) return { triggered: false, reason: 'disabled' };

    const cooldownMs = cooldownMinutes * 60 * 1000;
    if (currentTime - this.lastRamTrimTimestamp < cooldownMs) {
      return { triggered: false, reason: 'cooldown_active' };
    }

    if (currentMemPercent < thresholdPercent) {
      return { triggered: false, reason: 'below_threshold' };
    }

    this.lastRamTrimTimestamp = currentTime;
    this.executedActions.push({ type: 'ram_trim', time: currentTime });
    return { triggered: true, reason: 'success' };
  }

  evaluateDiskRule({
    masterEnabled,
    ruleEnabled,
    thresholdMb,
    currentJunkMb,
    isGameActive,
    selectedCategories,
    currentTime,
  }) {
    if (!masterEnabled || !ruleEnabled) return { triggered: false, reason: 'disabled' };

    // Strict game safety guardrail
    if (isGameActive) {
      return { triggered: false, reason: 'game_active_suppressed' };
    }

    const cooldownMs = 15 * 60 * 1000;
    if (currentTime - this.lastDiskCheckTimestamp < cooldownMs) {
      return { triggered: false, reason: 'cooldown_active' };
    }

    // Safe category filter: recycle bin cannot be in automated cleaning
    const safeCategories = selectedCategories.filter((cat) => cat !== 'recycle_bin');
    if (safeCategories.length === 0) {
      return { triggered: false, reason: 'no_safe_categories' };
    }

    if (currentJunkMb < thresholdMb) {
      return { triggered: false, reason: 'below_threshold' };
    }

    this.lastDiskCheckTimestamp = currentTime;
    this.executedActions.push({ type: 'disk_clean', time: currentTime, categories: safeCategories });
    return { triggered: true, reason: 'success' };
  }

  evaluateSsdTrimRule({
    masterEnabled,
    ruleEnabled,
    frequencyDays,
    lastRunTimestamp,
    isGameActive,
    currentTime,
  }) {
    if (!masterEnabled || !ruleEnabled) return { triggered: false, reason: 'disabled' };

    // Strict game safety guardrail
    if (isGameActive) {
      return { triggered: false, reason: 'game_active_suppressed' };
    }

    const intervalMs = frequencyDays * 24 * 3600 * 1000;
    const lastRun = lastRunTimestamp ? new Date(lastRunTimestamp).getTime() : 0;

    if (currentTime - lastRun < intervalMs) {
      return { triggered: false, reason: 'interval_not_reached' };
    }

    this.executedActions.push({ type: 'ssd_trim', time: currentTime });
    return { triggered: true, reason: 'success' };
  }
}

test('AutomationEngine: RAM Rule - Respects Master Toggle & Cooldown', () => {
  const evaluator = new MockRuleEvaluator();
  const baseTime = 1700000000000;

  // 1. Master disabled -> does nothing even if RAM is 95%
  let res = evaluator.evaluateRamRule({
    masterEnabled: false,
    ruleEnabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    currentMemPercent: 95,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'disabled');

  // 2. Master enabled, RAM 70% < 80% threshold -> does not trigger
  res = evaluator.evaluateRamRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    currentMemPercent: 70,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'below_threshold');

  // 3. Master enabled, RAM 85% >= 80% threshold -> triggers successfully
  res = evaluator.evaluateRamRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    currentMemPercent: 85,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, true);
  assert.equal(res.reason, 'success');

  // 4. Within 5 minutes (cooldown is 15 min), RAM 90% -> blocked by cooldown
  res = evaluator.evaluateRamRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    currentMemPercent: 90,
    currentTime: baseTime + 5 * 60 * 1000,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'cooldown_active');

  // 5. After 16 minutes, RAM 82% -> triggers again
  res = evaluator.evaluateRamRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    currentMemPercent: 82,
    currentTime: baseTime + 16 * 60 * 1000,
  });
  assert.equal(res.triggered, true);
  assert.equal(res.reason, 'success');
});

test('AutomationEngine: Storage Rule - Game Safety and Recycle Bin Protection', () => {
  const evaluator = new MockRuleEvaluator();
  const baseTime = 1700000000000;

  // 1. While gaming is active, disk clean is strictly suppressed to avoid I/O hitching
  let res = evaluator.evaluateDiskRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdMb: 2048,
    currentJunkMb: 5000,
    isGameActive: true,
    selectedCategories: ['user_temp', 'recycle_bin'],
    currentTime: baseTime,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'game_active_suppressed');

  // 2. When game is inactive, triggers and strips recycle_bin from target categories
  res = evaluator.evaluateDiskRule({
    masterEnabled: true,
    ruleEnabled: true,
    thresholdMb: 2048,
    currentJunkMb: 3500,
    isGameActive: false,
    selectedCategories: ['user_temp', 'system_temp', 'recycle_bin'],
    currentTime: baseTime,
  });
  assert.equal(res.triggered, true);
  assert.equal(res.reason, 'success');
  const lastAction = evaluator.executedActions[evaluator.executedActions.length - 1];
  assert.deepEqual(lastAction.categories, ['user_temp', 'system_temp']);
  assert.ok(!lastAction.categories.includes('recycle_bin'));
});

test('AutomationEngine: SSD TRIM - Weekly Cadence & Game Safety', () => {
  const evaluator = new MockRuleEvaluator();
  const baseTime = 1700000000000;
  const threeDaysAgo = new Date(baseTime - 3 * 24 * 3600 * 1000).toISOString();
  const eightDaysAgo = new Date(baseTime - 8 * 24 * 3600 * 1000).toISOString();

  // 1. 3 days since last run -> interval (7 days) not reached
  let res = evaluator.evaluateSsdTrimRule({
    masterEnabled: true,
    ruleEnabled: true,
    frequencyDays: 7,
    lastRunTimestamp: threeDaysAgo,
    isGameActive: false,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'interval_not_reached');

  // 2. 8 days since last run, but gaming active -> suppressed
  res = evaluator.evaluateSsdTrimRule({
    masterEnabled: true,
    ruleEnabled: true,
    frequencyDays: 7,
    lastRunTimestamp: eightDaysAgo,
    isGameActive: true,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, false);
  assert.equal(res.reason, 'game_active_suppressed');

  // 3. 8 days since last run, idle -> triggers
  res = evaluator.evaluateSsdTrimRule({
    masterEnabled: true,
    ruleEnabled: true,
    frequencyDays: 7,
    lastRunTimestamp: eightDaysAgo,
    isGameActive: false,
    currentTime: baseTime,
  });
  assert.equal(res.triggered, true);
  assert.equal(res.reason, 'success');
});
