import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Rule 6: Process Integrity Static Analysis Test
// Our process must NEVER open handles to game processes with write/inject rights,
// inject code, hook APIs, or load custom kernel drivers.
test('Anti-Cheat Integrity: Repository source code contains zero code injection, driver loading, or write OpenProcess hooks', () => {
  const rootDir = path.resolve('D:/PC Tweak');
  const targetDirs = [
    path.join(rootDir, 'electron'),
    path.join(rootDir, 'src'),
  ];

  const bannedPatterns = [
    {
      name: 'OpenProcess with Write/Inject access',
      regex: /OpenProcess\s*\([^)]*(PROCESS_VM_WRITE|PROCESS_VM_OPERATION|PROCESS_CREATE_THREAD|PROCESS_ALL_ACCESS)/i,
    },
    {
      name: 'WriteProcessMemory memory tampering',
      regex: /WriteProcessMemory/i,
    },
    {
      name: 'CreateRemoteThread injection',
      regex: /CreateRemoteThread|NtCreateThreadEx/i,
    },
    {
      name: 'VirtualAllocEx cross-process allocation',
      regex: /VirtualAllocEx/i,
    },
    {
      name: 'Global SetWindowsHookEx injection',
      regex: /SetWindowsHookEx\s*\([^)]*WH_KEYBOARD_LL/i,
    },
    {
      name: 'Driver loading APIs (NtLoadDriver / ZwLoadDriver)',
      regex: /NtLoadDriver|ZwLoadDriver|sc\.exe\s+create\s+.*type=\s*kernel/i,
    },
    {
      name: 'Game process memory scanning or dumping',
      regex: /ReadProcessMemory.*game/i,
    },
  ];

  const getAllFiles = (dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'release') {
          results = results.concat(getAllFiles(fullPath));
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.rs')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  const allFiles = targetDirs.flatMap((d) => getAllFiles(d));
  assert.ok(allFiles.length > 10, 'Expected at least 10 source files to be scanned.');

  const violations = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of bannedPatterns) {
      if (pattern.regex.test(content)) {
        violations.push({
          file: path.relative(rootDir, file),
          violation: pattern.name,
        });
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Integrity check failed! Found forbidden process injection or driver loading patterns: ${JSON.stringify(
      violations,
      null,
      2
    )}`
  );
});
