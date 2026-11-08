import test from 'node:test';
import assert from 'node:assert/strict';

function clampQueueSize(size) {
  return Math.max(50, Math.min(512, Math.round(Number(size) || 100)));
}

function parseQueueSize(output, valueName = 'MouseDataQueueSize') {
  const regex = new RegExp(`${valueName}\\s+REG_DWORD\\s+0x([0-9a-fA-F]+)`, 'i');
  const match = output.match(regex);
  const size = match ? parseInt(match[1], 16) : 100;
  return {
    size,
    isOptimized: size >= 128,
    isExtreme: size >= 256,
  };
}

test('High-Polling Input Queue Depth Engine Tests', async (t) => {
  await t.test('clampQueueSize strictly clamps values between 50 and 512', () => {
    assert.equal(clampQueueSize(100), 100);
    assert.equal(clampQueueSize(128), 128);
    assert.equal(clampQueueSize(256), 256);
    assert.equal(clampQueueSize(10), 50); // underflow clamped to 50
    assert.equal(clampQueueSize(1000), 512); // overflow clamped to 512
    assert.equal(clampQueueSize('invalid'), 100); // fallback
  });

  await t.test('parseQueueSize correctly extracts MouseDataQueueSize hex', () => {
    // 0xc8 = 200
    const out200 = '    MouseDataQueueSize    REG_DWORD    0xc8';
    assert.deepEqual(parseQueueSize(out200, 'MouseDataQueueSize'), {
      size: 200,
      isOptimized: true,
      isExtreme: false,
    });

    // 0x100 = 256
    const out256 = '    MouseDataQueueSize    REG_DWORD    0x100';
    assert.deepEqual(parseQueueSize(out256, 'MouseDataQueueSize'), {
      size: 256,
      isOptimized: true,
      isExtreme: true,
    });

    // 0x64 = 100 (Default)
    const out100 = '    MouseDataQueueSize    REG_DWORD    0x64';
    assert.deepEqual(parseQueueSize(out100, 'MouseDataQueueSize'), {
      size: 100,
      isOptimized: false,
      isExtreme: false,
    });
  });

  await t.test('parseQueueSize correctly extracts KeyboardDataQueueSize hex', () => {
    const outKbd = '    KeyboardDataQueueSize    REG_DWORD    0x80'; // 128
    assert.deepEqual(parseQueueSize(outKbd, 'KeyboardDataQueueSize'), {
      size: 128,
      isOptimized: true,
      isExtreme: false,
    });
  });
});
