import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CRITICAL_SERVICES = new Set([
  'rpcss',
  'rpceptmapper',
  'dcomlaunch',
  'plugplay',
  'audiosrv',
  'audioendpointbuilder',
  'dhcp',
  'dnscache',
  'cryptsvc',
  'eventlog',
  'schedule',
  'windefend',
  'mpssvc',
  'samss',
  'lsm',
  'power',
  'themes',
  'lanmanworkstation',
  'lanmanserver',
  'coremessagingregistrar',
  'keyiso',
  'vaultsvc',
  'brokerinfrastructure',
  'systemeventsbroker',
  'wuauserv',
  'bits',
]);

function isCritical(name) {
  return CRITICAL_SERVICES.has((name || '').toLowerCase().trim());
}

function resolveExecutablePath(rawImagePath) {
  if (!rawImagePath || !rawImagePath.trim()) return null;

  let clean = rawImagePath.trim();
  clean = clean.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');

  if (clean.startsWith('"')) {
    const closingQuote = clean.indexOf('"', 1);
    if (closingQuote !== -1) {
      return clean.substring(1, closingQuote).trim();
    }
  }

  const firstSpace = clean.indexOf(' ');
  if (firstSpace !== -1) {
    const candidate = clean.substring(0, firstSpace).trim();
    if (candidate.endsWith('.exe') || candidate.endsWith('.sys')) {
      return candidate;
    }
  }

  return clean;
}

test('Service Optimizer: Immutable Critical Windows Services Whitelist', () => {
  const criticalServices = [
    'RpcSs',
    'RpcEptMapper',
    'DcomLaunch',
    'PlugPlay',
    'AudioSrv',
    'AudioEndpointBuilder',
    'Dhcp',
    'Dnscache',
    'CryptSvc',
    'EventLog',
    'Schedule',
    'WinDefend',
    'mpssvc',
    'SamSs',
    'LSM',
    'Power',
    'Themes',
    'LanmanWorkstation',
    'LanmanServer',
    'wuauserv',
    'bits',
  ];

  for (const srv of criticalServices) {
    assert.equal(
      isCritical(srv),
      true,
      `Core Windows service '${srv}' must be immutable and critically protected`
    );
  }

  const optionalServices = [
    'DiagTrack',
    'dmwappushservice',
    'RetailDemo',
    'MapsBroker',
    'RemoteRegistry',
    'XblAuthManager',
    'EdgeUpdate',
    'GoogleUpdate',
  ];

  for (const srv of optionalServices) {
    assert.equal(
      isCritical(srv),
      false,
      `Optional/telemetry service '${srv}' should not be in the critical whitelist`
    );
  }
});

test('Service Optimizer: Executable Path Resolution and Argument Parsing', () => {
  const cases = [
    {
      raw: '"C:\\Program Files\\Example\\service.exe" -run',
      expected: 'C:\\Program Files\\Example\\service.exe',
    },
    {
      raw: 'C:\\Windows\\System32\\svchost.exe -k netsvcs',
      expected: 'C:\\Windows\\System32\\svchost.exe',
    },
    {
      raw: '"C:\\Tools\\orphaned.exe"',
      expected: 'C:\\Tools\\orphaned.exe',
    },
    {
      raw: 'C:\\Drivers\\driver.sys',
      expected: 'C:\\Drivers\\driver.sys',
    },
  ];

  for (const tc of cases) {
    const resolved = resolveExecutablePath(tc.raw);
    assert.equal(resolved, tc.expected, `Failed to correctly resolve executable path from: ${tc.raw}`);
  }
});

test('Service Optimizer: Engine source enforces critical protection and backup recording', () => {
  const enginePath = path.resolve('electron/engine/serviceOptimizerEngine.ts');
  assert.ok(fs.existsSync(enginePath), 'serviceOptimizerEngine.ts must exist');
  const content = fs.readFileSync(enginePath, 'utf8');

  assert.ok(content.includes('isCritical'), 'Engine must check isCritical before changing startup');
  assert.ok(content.includes('BackupStore.saveBackup'), 'Engine must save transactional backup before mutation');
});
