import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Telemetry Integrity: Zero hardcoded mock hardware strings in source code', () => {
  const filesToCheck = [
    path.join(rootDir, 'electron/main.ts'),
    path.join(rootDir, 'src/features/dashboard/DashboardView.tsx'),
    path.join(rootDir, 'src/stores/uiStore.ts'),
  ];

  const forbiddenMockStrings = [
    'NVIDIA GeForce GTX 1660 SUPER',
    '12th Gen Intel',
    'Dual Channel DDR',
    '221670',
  ];

  for (const filePath of filesToCheck) {
    assert.ok(fs.existsSync(filePath), `File exists: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const forbidden of forbiddenMockStrings) {
      assert.ok(
        !content.includes(forbidden),
        `Found forbidden hardcoded mock string '${forbidden}' in ${path.relative(rootDir, filePath)}`
      );
    }
  }
});

test('Telemetry Performance: Zero blocking execSync nvidia-smi in telemetry loop', () => {
  const mainTsPath = path.join(rootDir, 'electron/main.ts');
  const content = fs.readFileSync(mainTsPath, 'utf8');

  // Verify that execSync is not used for nvidia-smi queries
  const hasBlockingNvidiaSmi = /execSync\([^)]*nvidia-smi[^)]*\)/.test(content);
  assert.equal(
    hasBlockingNvidiaSmi,
    false,
    'Blocking execSync nvidia-smi must be eliminated from main.ts telemetry loop'
  );

  // Verify non-blocking execFile is used
  assert.ok(
    content.includes('queryGpuStatsAsync'),
    'main.ts must define non-blocking queryGpuStatsAsync'
  );
  assert.ok(
    content.includes('execFile'),
    'main.ts must use execFile for asynchronous query'
  );
});

test('Telemetry Metrics Initial State: Honest nulls and zeros without fake sparkline arrays', () => {
  const uiStorePath = path.join(rootDir, 'src/stores/uiStore.ts');
  const content = fs.readFileSync(uiStorePath, 'utf8');

  // uiStore must initialize with truthful nulls/zeros
  assert.ok(content.includes('cpuUsage: 0'), 'Initial cpuUsage must be 0');
  assert.ok(content.includes('cpuSpeedGhz: null'), 'Initial cpuSpeedGhz must be null');
  assert.ok(content.includes('gpuLoad: null'), 'Initial gpuLoad must be null');
  assert.ok(content.includes('gpuTemp: null'), 'Initial gpuTemp must be null');
  assert.ok(content.includes('uptimeSeconds: 0'), 'Initial uptimeSeconds must be 0');

  // DashboardView sparkline buffers must initialize as empty arrays
  const dashboardPath = path.join(rootDir, 'src/features/dashboard/DashboardView.tsx');
  const dashContent = fs.readFileSync(dashboardPath, 'utf8');
  assert.ok(dashContent.includes('useState<number[]>([])'), 'Sparkline history buffers must initialize empty');
  assert.ok(
    !dashContent.includes('[14, 18, 12, 16, 20'),
    'DashboardView must not contain hardcoded sparkline arrays'
  );
});
