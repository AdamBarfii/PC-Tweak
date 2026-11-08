import test from 'node:test';
import assert from 'node:assert/strict';

function sanitizePnpDeviceId(pnpId) {
  return String(pnpId || '').replace(/[;&|`$<>]/g, '').trim();
}

function detectGpuVendor(pnpId, name) {
  if (/VEN_10DE/i.test(pnpId) || /NVIDIA/i.test(name)) {
    return 'NVIDIA';
  } else if (/VEN_1002/i.test(pnpId) || /AMD|Radeon/i.test(name)) {
    return 'AMD';
  } else if (/VEN_8086/i.test(pnpId) || /Intel/i.test(name)) {
    return 'Intel';
  }
  return 'Unknown';
}

function isGpuDiscrete(vendor, name) {
  return (
    vendor === 'NVIDIA' ||
    (vendor === 'AMD' && !/integrated|Radeon\(TM\) Graphics|APU/i.test(name)) ||
    (vendor === 'Intel' && /Arc|Xe/i.test(name))
  );
}

function parseMsiStatus(regOutput) {
  const match = regOutput.match(/MSISupported\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
  return match ? parseInt(match[1], 16) === 1 : false;
}

function parseDevicePriority(regOutput) {
  const match = regOutput.match(/DevicePriority\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
  const prio = match ? parseInt(match[1], 16) : 0;
  let text = 'Default';
  if (prio === 3) text = 'High';
  else if (prio === 2) text = 'Normal';
  else if (prio === 1) text = 'Low';
  return { prio, text };
}

test('GPU Interrupt Pipeline & MSI Mode Tests', async (t) => {
  await t.test('sanitizePnpDeviceId sanitizes malicious shell metacharacters', () => {
    const malicious = 'PCI\\VEN_10DE&DEV_21C4; calc.exe & rm -rf /';
    const cleaned = sanitizePnpDeviceId(malicious);
    assert.equal(cleaned.includes(';'), false);
    assert.equal(cleaned.includes('&'), false);
  });

  await t.test('detectGpuVendor accurately classifies NVIDIA, AMD, and Intel GPUs', () => {
    assert.equal(detectGpuVendor('PCI\\VEN_10DE&DEV_21C4', 'GeForce GTX 1660 SUPER'), 'NVIDIA');
    assert.equal(detectGpuVendor('PCI\\VEN_1002&DEV_73DF', 'AMD Radeon RX 6700 XT'), 'AMD');
    assert.equal(detectGpuVendor('PCI\\VEN_8086&DEV_5690', 'Intel(R) Arc(TM) A770 Graphics'), 'Intel');
    assert.equal(detectGpuVendor('PCI\\VEN_1234&DEV_0000', 'Generic Display Adapter'), 'Unknown');
  });

  await t.test('isGpuDiscrete distinguishes discrete gaming GPUs from integrated APUs', () => {
    assert.equal(isGpuDiscrete('NVIDIA', 'NVIDIA GeForce RTX 4070 Ti SUPER'), true);
    assert.equal(isGpuDiscrete('AMD', 'AMD Radeon RX 7900 XTX'), true);
    assert.equal(isGpuDiscrete('AMD', 'AMD Radeon(TM) Graphics (integrated)'), false);
    assert.equal(isGpuDiscrete('Intel', 'Intel(R) Arc(TM) A750 Graphics'), true);
    assert.equal(isGpuDiscrete('Intel', 'Intel(R) UHD Graphics 770'), false);
  });

  await t.test('parseMsiStatus extracts boolean MSI status from reg query output', () => {
    const activeOut = '    MSISupported    REG_DWORD    0x1';
    assert.equal(parseMsiStatus(activeOut), true);

    const inactiveOut = '    MSISupported    REG_DWORD    0x0';
    assert.equal(parseMsiStatus(inactiveOut), false);

    const missingOut = 'ERROR: The system was unable to find the specified registry key or value.';
    assert.equal(parseMsiStatus(missingOut), false);
  });

  await t.test('parseDevicePriority maps priority DWORD to textual label', () => {
    assert.deepEqual(parseDevicePriority('    DevicePriority    REG_DWORD    0x3'), { prio: 3, text: 'High' });
    assert.deepEqual(parseDevicePriority('    DevicePriority    REG_DWORD    0x2'), { prio: 2, text: 'Normal' });
    assert.deepEqual(parseDevicePriority('    DevicePriority    REG_DWORD    0x1'), { prio: 1, text: 'Low' });
    assert.deepEqual(parseDevicePriority('ERROR: The system was unable to find...'), { prio: 0, text: 'Default' });
  });
});
