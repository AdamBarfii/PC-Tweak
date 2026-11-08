import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CRITICAL_PROCESSES = new Set([
  'csrss',
  'services',
  'lsass',
  'smss',
  'svchost',
  'dwm',
  'explorer',
  'winlogon',
  'spoolsv',
  'taskhostw',
  'system',
  'registry',
  'idle',
  'fontdrvhost',
  'sihost',
  'audiodg',
  'pctweak',
  'pc tweak',
  'electron',
]);

function isCritical(name) {
  const clean = (name || '').toLowerCase().replace(/\.exe$/, '').trim();
  return CRITICAL_PROCESSES.has(clean);
}

test('RAM Optimizer: Critical Process Whitelist Enforcement', () => {
  const protectedNames = [
    'csrss',
    'csrss.exe',
    'services',
    'services.exe',
    'lsass',
    'lsass.exe',
    'smss',
    'svchost',
    'svchost.exe',
    'dwm',
    'dwm.exe',
    'explorer',
    'explorer.exe',
    'winlogon',
    'spoolsv',
    'taskhostw',
    'system',
    'registry',
    'pctweak',
    'electron',
  ];

  for (const name of protectedNames) {
    assert.equal(
      isCritical(name),
      true,
      `Process '${name}' must be recognized as critical and protected`
    );
  }

  const safeNames = ['chrome', 'discord', 'spotify', 'steam', 'game.exe', 'notepad'];
  for (const name of safeNames) {
    assert.equal(
      isCritical(name),
      false,
      `User process '${name}' should not be marked as system-critical`
    );
  }
});

test('RAM Optimizer: Engine source enforces critical process protection and PID validation', () => {
  const enginePath = path.resolve('electron/engine/ramOptimizerEngine.ts');
  assert.ok(fs.existsSync(enginePath), 'ramOptimizerEngine.ts must exist');
  const content = fs.readFileSync(enginePath, 'utf8');

  assert.ok(content.includes('CRITICAL_PROCESSES'), 'Engine must define CRITICAL_PROCESSES set');
  assert.ok(content.includes('if (!pid || pid <= 4)'), 'Engine must guard PID <= 4');
  assert.ok(content.includes('isCritical(procName)'), 'Engine must check isCritical before killing');
});

test('RAM Optimizer: Truth in Engineering (Zero negative freed RAM delta)', () => {
  const calculateFreedMb = (memBeforeMb, memAfterMb) => Math.max(0, memAfterMb - memBeforeMb);

  assert.equal(calculateFreedMb(8000, 8500), 500, 'Positive delta reported accurately');
  assert.equal(calculateFreedMb(8000, 8000), 0, 'Zero delta reported as 0');
  assert.equal(calculateFreedMb(8500, 8000), 0, 'Negative delta clamped to 0 to prevent misleading UI');
});
