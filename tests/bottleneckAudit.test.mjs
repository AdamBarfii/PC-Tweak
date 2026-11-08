import test from 'node:test';
import assert from 'node:assert/strict';

// Pure diagnostic evaluation functions matching GamingEngine
function evaluateRam(clock, rated) {
  const isBottleneck = clock < rated || clock <= 2400;
  return {
    status: isBottleneck ? 'warning' : 'optimal',
    currentValue: `${clock} MT/s${isBottleneck ? ` (Rated: ${rated} MT/s)` : ''}`,
  };
}

function evaluateDisplayHz(currentHz, maxHz) {
  const isBottleneck = maxHz > 60 && currentHz < maxHz;
  return {
    status: isBottleneck ? 'warning' : 'optimal',
    currentValue: `${currentHz} Hz (Max: ${maxHz} Hz)`,
  };
}

function evaluateStorageCapacity(drives) {
  let criticalDrive = '';
  for (const drv of drives) {
    if (drv.freePercent < 15 || drv.freeGb < 10) {
      criticalDrive = `${drv.name}: (${drv.freeGb} GB, ${drv.freePercent}%)`;
      break;
    }
  }
  return {
    status: criticalDrive ? 'critical' : 'optimal',
    currentValue: criticalDrive ? `Low Space: ${criticalDrive}` : 'Sufficient Storage',
  };
}

function evaluateHags(hwSchMode) {
  const isActive = hwSchMode === 2;
  return {
    status: isActive ? 'optimal' : 'warning',
    currentValue: isActive ? 'Enabled (Active)' : 'Disabled / Default',
  };
}

function evaluateDriverAge(driverDateStr) {
  const d = new Date(driverDateStr);
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  const isOld = diffDays > 180;
  return {
    status: isOld ? 'warning' : 'optimal',
    daysOld: diffDays,
  };
}

test('RAM Diagnostic: flags warning when memory runs at base 2133/2400 MT/s below rated', () => {
  const underclocked = evaluateRam(2400, 3200);
  assert.equal(underclocked.status, 'warning');
  assert.equal(underclocked.currentValue, '2400 MT/s (Rated: 3200 MT/s)');

  const xmpEnabled = evaluateRam(3200, 3200);
  assert.equal(xmpEnabled.status, 'optimal');
  assert.equal(xmpEnabled.currentValue, '3200 MT/s');
});

test('Display Hz Diagnostic: flags warning when high-Hz monitor is capped at 60Hz', () => {
  const cappedMonitor = evaluateDisplayHz(60, 144);
  assert.equal(cappedMonitor.status, 'warning');
  assert.equal(cappedMonitor.currentValue, '60 Hz (Max: 144 Hz)');

  const optimalMonitor = evaluateDisplayHz(164, 164);
  assert.equal(optimalMonitor.status, 'optimal');
  assert.equal(optimalMonitor.currentValue, '164 Hz (Max: 164 Hz)');
});

test('Storage Capacity Diagnostic: flags critical when Drive C has <15% free space', () => {
  const lowSpaceSystem = evaluateStorageCapacity([
    { name: 'C', freeGb: 0.5, freePercent: 0.2 },
    { name: 'D', freeGb: 148, freePercent: 33 },
  ]);
  assert.equal(lowSpaceSystem.status, 'critical');
  assert.ok(lowSpaceSystem.currentValue.includes('C: (0.5 GB, 0.2%)'));

  const healthySystem = evaluateStorageCapacity([
    { name: 'C', freeGb: 80, freePercent: 35 },
    { name: 'D', freeGb: 200, freePercent: 50 },
  ]);
  assert.equal(healthySystem.status, 'optimal');
});

test('HAGS Diagnostic: flags warning when HwSchMode is not 2', () => {
  const hagsOff = evaluateHags(1);
  assert.equal(hagsOff.status, 'warning');

  const hagsOn = evaluateHags(2);
  assert.equal(hagsOn.status, 'optimal');
});

test('GPU Driver Diagnostic: flags warning when driver is older than 180 days', () => {
  const oldDriver = evaluateDriverAge('2023-01-01');
  assert.equal(oldDriver.status, 'warning');

  // Test with yesterday's date
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const freshDriver = evaluateDriverAge(yesterday);
  assert.equal(freshDriver.status, 'optimal');
});
