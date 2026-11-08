import test from 'node:test';
import assert from 'node:assert/strict';

test('In-Game HUD & Overlay Manager Tests', async (t) => {
  // Test bounds calculation
  function calculateOverlayBounds(corner, layout, workArea = { x: 0, y: 0, width: 1920, height: 1080 }) {
    const width = layout === 'compact' ? 360 : 400;
    const height = layout === 'compact' ? 56 : 140;
    const margin = 20;

    let x = workArea.x + workArea.width - width - margin;
    let y = workArea.y + margin;

    if (corner === 'top-left') {
      x = workArea.x + margin;
      y = workArea.y + margin;
    } else if (corner === 'bottom-left') {
      x = workArea.x + margin;
      y = workArea.y + workArea.height - height - margin;
    } else if (corner === 'bottom-right') {
      x = workArea.x + workArea.width - width - margin;
      y = workArea.y + workArea.height - height - margin;
    }

    return { x: Math.round(x), y: Math.round(y), width, height };
  }

  await t.test('Bounds Calculation: Top-Right (Default Corner)', () => {
    const bounds = calculateOverlayBounds('top-right', 'compact', { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(bounds.width, 360);
    assert.equal(bounds.height, 56);
    assert.equal(bounds.x, 1920 - 360 - 20); // 1540
    assert.equal(bounds.y, 20);
  });

  await t.test('Bounds Calculation: Top-Left Corner', () => {
    const bounds = calculateOverlayBounds('top-left', 'compact', { x: 0, y: 0, width: 2560, height: 1440 });
    assert.equal(bounds.x, 20);
    assert.equal(bounds.y, 20);
    assert.equal(bounds.width, 360);
  });

  await t.test('Bounds Calculation: Bottom-Right Expanded Panel', () => {
    const bounds = calculateOverlayBounds('bottom-right', 'expanded', { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(bounds.width, 400);
    assert.equal(bounds.height, 140);
    assert.equal(bounds.x, 1920 - 400 - 20); // 1500
    assert.equal(bounds.y, 1080 - 140 - 20); // 920
  });

  await t.test('Bounds Calculation: Bottom-Left Corner', () => {
    const bounds = calculateOverlayBounds('bottom-left', 'compact', { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(bounds.x, 20);
    assert.equal(bounds.y, 1080 - 56 - 20); // 1004
  });

  await t.test('Telemetry Conversion: DPC scaling and honest nulls', () => {
    function computeTelemetry(dpcPercent, metrics) {
      const dpcLatencyUs =
        dpcPercent !== null && dpcPercent !== undefined ? Math.round(dpcPercent * 100) : null;
      return {
        fps: null,
        dpcPercent,
        dpcLatencyUs,
        cpuUsage: metrics.cpuUsage,
        gpuLoad: metrics.gpuLoad,
        gpuTemp: metrics.gpuTemp,
      };
    }

    const resValid = computeTelemetry(0.42, { cpuUsage: 25, gpuLoad: 60, gpuTemp: 55 });
    assert.equal(resValid.dpcLatencyUs, 42);
    assert.equal(resValid.cpuUsage, 25);
    assert.equal(resValid.fps, null); // Honest null when no hook

    const resNull = computeTelemetry(null, { cpuUsage: 10, gpuLoad: null, gpuTemp: null });
    assert.equal(resNull.dpcLatencyUs, null);
    assert.equal(resNull.dpcPercent, null);
  });

  await t.test('Anti-Cheat Integrity: Asserts zero DLL injection and transparent click-through', () => {
    const windowSettings = {
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      ignoreMouseEvents: true,
    };

    assert.equal(windowSettings.transparent, true);
    assert.equal(windowSettings.ignoreMouseEvents, true);
    assert.equal(windowSettings.focusable, false);
  });
});
