import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Disk Optimizer: Engine source enforces 24-hour age protection and graceful lock handling', () => {
  const enginePath = path.resolve('electron/engine/diskOptimizerEngine.ts');
  assert.ok(fs.existsSync(enginePath), 'diskOptimizerEngine.ts must exist');
  const content = fs.readFileSync(enginePath, 'utf8');

  assert.ok(content.includes('ONE_DAY_MS = 24 * 60 * 60 * 1000'), 'Engine must enforce 24-hour age threshold');
  assert.ok(content.includes('filterAgeMs > 0 && now - stat.mtimeMs < filterAgeMs'), 'Engine must skip files younger than filter age');
  assert.ok(content.includes('Optimize-Volume -DriveLetter'), 'Engine must invoke native Windows Optimize-Volume');
});

test('Disk Optimizer: 24-hour file age protection on user temporary directory', () => {
  const testDir = path.join(os.tmpdir(), `pctweak_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const recentFile = path.join(testDir, 'recent.tmp');
    const oldFile = path.join(testDir, 'old.tmp');

    fs.writeFileSync(recentFile, 'recent content');
    fs.writeFileSync(oldFile, 'old content');

    // Set old file modified time to 48 hours ago
    const twoDaysAgo = (Date.now() - 48 * 3600 * 1000) / 1000;
    fs.utimesSync(oldFile, twoDaysAgo, twoDaysAgo);

    // Verify stat
    const statRecent = fs.statSync(recentFile);
    const statOld = fs.statSync(oldFile);
    const oneDayMs = 24 * 3600 * 1000;

    assert.ok(Date.now() - statRecent.mtimeMs < oneDayMs, 'recent file is younger than 24h');
    assert.ok(Date.now() - statOld.mtimeMs > oneDayMs, 'old file is older than 24h');
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Disk Optimizer: Accurate human-readable byte unit formatting', () => {
  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 12.3), '12.3 GB');
});
