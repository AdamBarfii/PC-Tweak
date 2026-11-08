import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Test-isolated implementation of AutomationStore logic
const DEFAULT_AUTOMATION_CONFIG = {
  masterEnabled: false,
  notifyOnAutoAction: false,
  autoTrimRam: {
    enabled: true,
    thresholdPercent: 80,
    cooldownMinutes: 15,
    trimOnGameExit: true,
  },
  autoCleanDisk: {
    enabled: true,
    thresholdMb: 2048,
    frequency: 'threshold_only',
    categories: ['user_temp', 'system_temp', 'crash_dumps_wer', 'directx_shader_cache'],
  },
  autoTrimSsd: {
    enabled: true,
    frequencyDays: 7,
  },
  autoGameBoost: {
    enabled: true,
    powerPlanSwitch: true,
    throttleBackground: true,
    trimRamOnLaunch: true,
  },
  autoTelemetrySentinel: {
    enabled: true,
    autoDisableOnDetect: true,
  },
};

const MAX_LOG_ENTRIES = 200;

class TestAutomationStore {
  constructor(testDir) {
    this.filePath = path.join(testDir, 'automation.json');
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return { config: structuredClone(DEFAULT_AUTOMATION_CONFIG), logs: [] };
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        config: { ...structuredClone(DEFAULT_AUTOMATION_CONFIG), ...(data.config || {}) },
        logs: Array.isArray(data.logs) ? data.logs : [],
      };
    } catch {
      return { config: structuredClone(DEFAULT_AUTOMATION_CONFIG), logs: [] };
    }
  }

  save(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getConfig() {
    return this.load().config;
  }

  updateConfig(partial) {
    const current = this.load();
    current.config = {
      ...current.config,
      ...partial,
      autoTrimRam: { ...current.config.autoTrimRam, ...(partial.autoTrimRam || {}) },
      autoCleanDisk: { ...current.config.autoCleanDisk, ...(partial.autoCleanDisk || {}) },
      autoTrimSsd: { ...current.config.autoTrimSsd, ...(partial.autoTrimSsd || {}) },
      autoGameBoost: { ...current.config.autoGameBoost, ...(partial.autoGameBoost || {}) },
      autoTelemetrySentinel: { ...current.config.autoTelemetrySentinel, ...(partial.autoTelemetrySentinel || {}) },
    };
    this.save(current);
    return current.config;
  }

  addLog(entry) {
    const current = this.load();
    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    current.logs.unshift(newLog);
    if (current.logs.length > MAX_LOG_ENTRIES) {
      current.logs = current.logs.slice(0, MAX_LOG_ENTRIES);
    }
    this.save(current);
    return newLog;
  }

  getLogs(limit = 50) {
    const current = this.load();
    return current.logs.slice(0, limit);
  }

  clearLogs() {
    const current = this.load();
    current.logs = [];
    this.save(current);
  }
}

test('AutomationStore: Default Configuration Contract', () => {
  assert.equal(DEFAULT_AUTOMATION_CONFIG.masterEnabled, false);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.notifyOnAutoAction, false);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTrimRam.enabled, true);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTrimRam.thresholdPercent, 80);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTrimRam.cooldownMinutes, 15);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoCleanDisk.enabled, true);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoCleanDisk.thresholdMb, 2048);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoCleanDisk.frequency, 'threshold_only');
  assert.ok(DEFAULT_AUTOMATION_CONFIG.autoCleanDisk.categories.includes('user_temp'));
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTrimSsd.enabled, true);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTrimSsd.frequencyDays, 7);
  assert.equal(DEFAULT_AUTOMATION_CONFIG.autoTelemetrySentinel.enabled, true);
});

test('AutomationStore: Partial config update preserves nested fields', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-auto-test-'));
  try {
    const store = new TestAutomationStore(tempDir);
    const initial = store.getConfig();
    assert.equal(initial.masterEnabled, false);

    // Update master enabled and RAM threshold only
    const updated = store.updateConfig({
      masterEnabled: true,
      autoTrimRam: { thresholdPercent: 75, enabled: true, cooldownMinutes: 15, trimOnGameExit: true },
    });

    assert.equal(updated.masterEnabled, true);
    assert.equal(updated.autoTrimRam.thresholdPercent, 75);
    // Other properties should be intact
    assert.equal(updated.autoCleanDisk.thresholdMb, 2048);
    assert.equal(updated.autoTrimSsd.frequencyDays, 7);

    // Read back fresh
    const fresh = store.getConfig();
    assert.equal(fresh.masterEnabled, true);
    assert.equal(fresh.autoTrimRam.thresholdPercent, 75);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AutomationStore: Log management and 200 entry capping', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctweak-auto-test-'));
  try {
    const store = new TestAutomationStore(tempDir);
    assert.equal(store.getLogs().length, 0);

    // Add 250 log entries
    for (let i = 0; i < 250; i++) {
      store.addLog({
        type: 'ram_trim',
        title: `Test Log ${i}`,
        detail: `Detail for ${i}`,
        reclaimedBytes: 1024 * 1024 * i,
      });
    }

    // Should cap at MAX_LOG_ENTRIES (200)
    const logs = store.getLogs(300);
    assert.equal(logs.length, 200);

    // Newest log should be first
    assert.equal(logs[0].title, 'Test Log 249');
    assert.ok(logs[0].id.startsWith('log_'));
    assert.ok(logs[0].timestamp);

    // Limit check
    assert.equal(store.getLogs(20).length, 20);

    // Clear logs
    store.clearLogs();
    assert.equal(store.getLogs().length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
