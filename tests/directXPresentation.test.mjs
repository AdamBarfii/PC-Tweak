import test from 'node:test';
import assert from 'node:assert/strict';

function parseMaxFrameLatency(output) {
  const mflMatch = output.match(/MaxFrameLatency\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
  if (mflMatch) {
    const val = parseInt(mflMatch[1], 16);
    return { val, active: val === 1 };
  }
  if (/MaxFrameLatency=1/i.test(output)) {
    return { val: 1, active: true };
  }
  return { val: 0, active: false };
}

function parseFlipModelUpgrade(settingsStr) {
  if (/SwapEffectUpgradeEnable=0/i.test(settingsStr) || /SwapEffectUpgradeDisable=1/i.test(settingsStr)) {
    return false;
  }
  return true;
}

function parseTdrDelay(output) {
  const tdrMatch = output.match(/TdrDelay\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
  if (tdrMatch) {
    const delay = parseInt(tdrMatch[1], 16);
    return { delay, extended: delay >= 8 };
  }
  return { delay: 2, extended: false };
}

function parseShaderCacheSize(output) {
  const match = output.match(/DirectXShaderCacheSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
  if (match) {
    const mb = parseInt(match[1], 16);
    return { mb, boosted: mb >= 10240 };
  }
  return { mb: 1024, boosted: false };
}

function isCompetitivePresetActive(status) {
  return (
    status.isMaxFrameLatencyActive &&
    status.swapEffectUpgradeEnable &&
    status.isTdrDelayExtended &&
    status.isShaderCacheBoosted
  );
}

test('DirectX Low-Latency Presentation Engine Tests', async (t) => {
  await t.test('parseMaxFrameLatency identifies 1 frame ultra-low queue', () => {
    assert.deepEqual(parseMaxFrameLatency('    MaxFrameLatency    REG_DWORD    0x1'), { val: 1, active: true });
    assert.deepEqual(parseMaxFrameLatency('    MaxFrameLatency    REG_DWORD    0x3'), { val: 3, active: false });
    assert.deepEqual(parseMaxFrameLatency('    DirectXUserGlobalSettings    REG_SZ    SwapEffectUpgradeEnable=1;MaxFrameLatency=1;'), { val: 1, active: true });
    assert.deepEqual(parseMaxFrameLatency(''), { val: 0, active: false });
  });

  await t.test('parseFlipModelUpgrade verifies modern DXGI presentation', () => {
    assert.equal(parseFlipModelUpgrade('SwapEffectUpgradeEnable=1;VRROptimize=1;'), true);
    assert.equal(parseFlipModelUpgrade('SwapEffectUpgradeEnable=0;'), false);
    assert.equal(parseFlipModelUpgrade('SwapEffectUpgradeDisable=1;'), false);
    assert.equal(parseFlipModelUpgrade(''), true); // Windows 11 default
  });

  await t.test('parseTdrDelay detects 8-second extension threshold', () => {
    assert.deepEqual(parseTdrDelay('    TdrDelay    REG_DWORD    0x8'), { delay: 8, extended: true });
    assert.deepEqual(parseTdrDelay('    TdrDelay    REG_DWORD    0xa'), { delay: 10, extended: true });
    assert.deepEqual(parseTdrDelay('    TdrDelay    REG_DWORD    0x2'), { delay: 2, extended: false });
    assert.deepEqual(parseTdrDelay('ERROR: value not found'), { delay: 2, extended: false });
  });

  await t.test('parseShaderCacheSize validates 10GB boundary', () => {
    // 10240 MB = 0x2800
    assert.deepEqual(parseShaderCacheSize('    DirectXShaderCacheSize    REG_DWORD    0x2800'), { mb: 10240, boosted: true });
    assert.deepEqual(parseShaderCacheSize('    DirectXShaderCacheSize    REG_DWORD    0x400'), { mb: 1024, boosted: false });
    assert.deepEqual(parseShaderCacheSize(''), { mb: 1024, boosted: false });
  });

  await t.test('isCompetitivePresetActive enforces all 4 parameters simultaneously', () => {
    const full = {
      isMaxFrameLatencyActive: true,
      swapEffectUpgradeEnable: true,
      isTdrDelayExtended: true,
      isShaderCacheBoosted: true,
    };
    assert.equal(isCompetitivePresetActive(full), true);

    const partial = {
      isMaxFrameLatencyActive: true,
      swapEffectUpgradeEnable: true,
      isTdrDelayExtended: false, // missing
      isShaderCacheBoosted: true,
    };
    assert.equal(isCompetitivePresetActive(partial), false);
  });
});
