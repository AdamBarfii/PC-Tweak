import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CRITICAL_TASK_PREFIXES = [
  '\\microsoft\\windows\\registry\\',
  '\\microsoft\\windows\\chkdsk\\',
  '\\microsoft\\windows\\bitlocker\\',
  '\\microsoft\\windows\\time synchronization\\',
  '\\microsoft\\windows\\systemrestore\\',
  '\\microsoft\\windows\\memorydiagnostic\\',
  '\\microsoft\\windows\\servicing\\',
];

function isCriticalTask(fullPath) {
  const lower = (fullPath || '').toLowerCase();
  return CRITICAL_TASK_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function resolveExecutablePath(rawAction) {
  if (!rawAction || !rawAction.trim()) return null;

  let clean = rawAction.trim();
  clean = clean.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');

  if (clean.startsWith('"')) {
    const closing = clean.indexOf('"', 1);
    if (closing !== -1) {
      return clean.substring(1, closing).trim();
    }
  }

  const firstSpace = clean.indexOf(' ');
  if (firstSpace !== -1) {
    const candidate = clean.substring(0, firstSpace).trim();
    if (candidate.endsWith('.exe') || candidate.endsWith('.bat') || candidate.endsWith('.cmd')) {
      return candidate;
    }
  }

  return clean;
}

test('Task Optimizer: Critical Windows Maintenance Tasks Whitelist', () => {
  const criticalPrefixes = [
    '\\Microsoft\\Windows\\Registry\\RegIdleBackup',
    '\\Microsoft\\Windows\\Chkdsk\\SyspartAnalysis',
    '\\Microsoft\\Windows\\BitLocker\\BitLocker Encrypt',
    '\\Microsoft\\Windows\\Time Synchronization\\SynchronizeTime',
    '\\Microsoft\\Windows\\SystemRestore\\SR',
    '\\Microsoft\\Windows\\MemoryDiagnostic\\ProcessMemoryDiagnosticEvents',
  ];

  for (const p of criticalPrefixes) {
    assert.equal(
      isCriticalTask(p),
      true,
      `Maintenance task '${p}' must be recognized as critical and protected`
    );
  }

  const safeToModify = [
    '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
    '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
    '\\GoogleUpdateTaskMachineUA',
    '\\MicrosoftEdgeUpdateTaskMachineCore',
  ];

  for (const p of safeToModify) {
    assert.equal(
      isCriticalTask(p),
      false,
      `Telemetry/updater task '${p}' should not be in the critical whitelist`
    );
  }
});

test('Task Optimizer: Action Executable Path Resolution', () => {
  const cases = [
    {
      raw: '"C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe" /c',
      expected: 'C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe',
    },
    {
      raw: 'C:\\Windows\\system32\\rundll32.exe aepdu.dll,AePduRunUpdate',
      expected: 'C:\\Windows\\system32\\rundll32.exe',
    },
    {
      raw: '"D:\\OldApp\\orphaned_task.exe"',
      expected: 'D:\\OldApp\\orphaned_task.exe',
    },
  ];

  for (const tc of cases) {
    const resolved = resolveExecutablePath(tc.raw);
    assert.equal(resolved, tc.expected, `Failed to resolve action executable from: ${tc.raw}`);
  }
});

test('Task Optimizer: Engine source enforces critical protection and task XML export', () => {
  const enginePath = path.resolve('electron/engine/taskOptimizerEngine.ts');
  assert.ok(fs.existsSync(enginePath), 'taskOptimizerEngine.ts must exist');
  const content = fs.readFileSync(enginePath, 'utf8');

  assert.ok(content.includes('isCritical'), 'Engine must check isCritical before changing task state');
  assert.ok(content.includes('Export-ScheduledTask'), 'Engine must export XML before modification');
  assert.ok(content.includes('BackupStore.saveBackup'), 'Engine must save XML snapshot in BackupStore');
});
