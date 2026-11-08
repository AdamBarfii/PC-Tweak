import test from 'node:test';
import assert from 'node:assert/strict';

class MockSuggestionsEngine {
  constructor() {
    this.dismissedIds = new Set();
  }

  dismiss(id) {
    this.dismissedIds.add(id);
  }

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  evaluate({
    diskJunkBytes = 0,
    ramLoadPercent = 50,
    powerPlanName = 'Balanced',
    telemetryServicesRunning = 0,
    orphanItemsFound = 0,
    gameModeEnabled = true,
  }) {
    const list = [];

    // 1. Storage Junk >= 400 MB
    if (diskJunkBytes >= 400 * 1024 * 1024 && !this.dismissedIds.has('sug_disk_clean')) {
      list.push({
        id: 'sug_disk_clean',
        category: 'storage',
        impact: 'safe',
        titleKey: 'suggestions.diskClean.title',
        descriptionParams: { size: this.formatBytes(diskJunkBytes) },
        actionType: 'clean_disk',
      });
    }

    // 2. RAM >= 75%
    if (ramLoadPercent >= 75 && !this.dismissedIds.has('sug_ram_trim')) {
      list.push({
        id: 'sug_ram_trim',
        category: 'memory',
        impact: 'safe',
        titleKey: 'suggestions.ramTrim.title',
        descriptionParams: { percent: ramLoadPercent },
        actionType: 'trim_ram',
      });
    }

    // 3. Sub-optimal power plan
    const isOptimal =
      powerPlanName.toLowerCase().includes('high performance') ||
      powerPlanName.toLowerCase().includes('ultimate');
    if (!isOptimal && !this.dismissedIds.has('sug_power_plan')) {
      list.push({
        id: 'sug_power_plan',
        category: 'performance',
        impact: 'safe',
        titleKey: 'suggestions.powerPlan.title',
        actionType: 'set_power_plan',
      });
    }

    // 4. Telemetry services
    if (telemetryServicesRunning > 0 && !this.dismissedIds.has('sug_telemetry')) {
      list.push({
        id: 'sug_telemetry',
        category: 'privacy',
        impact: 'safe',
        titleKey: 'suggestions.telemetry.title',
        descriptionParams: { count: telemetryServicesRunning },
        actionType: 'disable_telemetry',
      });
    }

    // 5. Orphan items
    if (orphanItemsFound > 0 && !this.dismissedIds.has('sug_orphans')) {
      list.push({
        id: 'sug_orphans',
        category: 'performance',
        impact: 'safe',
        titleKey: 'suggestions.orphans.title',
        descriptionParams: { count: orphanItemsFound },
        actionType: 'clean_orphans',
      });
    }

    // 6. Game Mode
    if (!gameModeEnabled && !this.dismissedIds.has('sug_game_mode')) {
      list.push({
        id: 'sug_game_mode',
        category: 'gaming',
        impact: 'safe',
        titleKey: 'suggestions.gameMode.title',
        actionType: 'enable_game_mode',
      });
    }

    return list;
  }
}

test('SmartSuggestions: Dynamic Rule Evaluation', () => {
  const engine = new MockSuggestionsEngine();

  // Clean system scenario -> 0 suggestions
  let suggestions = engine.evaluate({
    diskJunkBytes: 50 * 1024 * 1024, // 50 MB
    ramLoadPercent: 45,
    powerPlanName: 'Ultimate Performance',
    telemetryServicesRunning: 0,
    orphanItemsFound: 0,
    gameModeEnabled: true,
  });
  assert.equal(suggestions.length, 0);

  // Cluttered system scenario -> multiple suggestions triggered
  suggestions = engine.evaluate({
    diskJunkBytes: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
    ramLoadPercent: 88,
    powerPlanName: 'Balanced',
    telemetryServicesRunning: 2,
    orphanItemsFound: 3,
    gameModeEnabled: false,
  });

  assert.equal(suggestions.length, 6);
  assert.ok(suggestions.some((s) => s.id === 'sug_disk_clean'));
  assert.ok(suggestions.some((s) => s.id === 'sug_ram_trim'));
  assert.ok(suggestions.some((s) => s.id === 'sug_power_plan'));
  assert.ok(suggestions.some((s) => s.id === 'sug_telemetry'));
  assert.ok(suggestions.some((s) => s.id === 'sug_orphans'));
  assert.ok(suggestions.some((s) => s.id === 'sug_game_mode'));

  // All suggestions must have safe impact
  for (const s of suggestions) {
    assert.equal(s.impact, 'safe');
  }

  // Description params check
  const diskSug = suggestions.find((s) => s.id === 'sug_disk_clean');
  assert.equal(diskSug.descriptionParams.size, '1.5 GB');

  const ramSug = suggestions.find((s) => s.id === 'sug_ram_trim');
  assert.equal(ramSug.descriptionParams.percent, 88);
});

test('SmartSuggestions: Dismissal persistence across evaluations', () => {
  const engine = new MockSuggestionsEngine();

  // Cluttered system
  let suggestions = engine.evaluate({
    diskJunkBytes: 2 * 1024 * 1024 * 1024,
    ramLoadPercent: 85,
    powerPlanName: 'Balanced',
  });
  assert.ok(suggestions.some((s) => s.id === 'sug_disk_clean'));

  // User dismisses disk clean
  engine.dismiss('sug_disk_clean');

  // Next evaluation should suppress sug_disk_clean
  suggestions = engine.evaluate({
    diskJunkBytes: 2 * 1024 * 1024 * 1024,
    ramLoadPercent: 85,
    powerPlanName: 'Balanced',
  });
  assert.ok(!suggestions.some((s) => s.id === 'sug_disk_clean'));
  assert.ok(suggestions.some((s) => s.id === 'sug_ram_trim'));
});
