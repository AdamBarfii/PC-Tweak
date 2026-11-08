import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Network Undo All: Preload API and IPC handlers are registered end-to-end', () => {
  const preloadPath = path.join(rootDir, 'electron/preload.ts');
  const preloadContent = fs.readFileSync(preloadPath, 'utf8');

  // 1. Verify preload exposes undoAllNetwork
  assert.ok(
    preloadContent.includes('undoAllNetwork:'),
    'preload.ts must expose undoAllNetwork method'
  );
  assert.ok(
    preloadContent.includes("ipcRenderer.invoke('network:undoAll'"),
    'preload.ts must invoke network:undoAll IPC channel'
  );

  // 2. Verify electron.d.ts types are declared
  const dtsPath = path.join(rootDir, 'src/types/electron.d.ts');
  const dtsContent = fs.readFileSync(dtsPath, 'utf8');
  assert.ok(
    dtsContent.includes('undoAllNetwork:'),
    'src/types/electron.d.ts must declare undoAllNetwork signature'
  );

  // 3. Verify electron/ipc/network.ts registers network:undoAll
  const ipcPath = path.join(rootDir, 'electron/ipc/network.ts');
  const ipcContent = fs.readFileSync(ipcPath, 'utf8');
  assert.ok(
    ipcContent.includes("ipcMain.handle('network:undoAll'"),
    'electron/ipc/network.ts must register network:undoAll IPC handler'
  );
  assert.ok(
    ipcContent.includes('NetworkEngine.undoAll'),
    'IPC handler must delegate to NetworkEngine.undoAll'
  );

  // 4. Verify NetworkView.tsx invokes real window.electronAPI.undoAllNetwork
  const viewPath = path.join(rootDir, 'src/features/network/NetworkView.tsx');
  const viewContent = fs.readFileSync(viewPath, 'utf8');
  assert.ok(
    viewContent.includes('window.electronAPI.undoAllNetwork'),
    'NetworkView.tsx handleUndoAll must call window.electronAPI.undoAllNetwork'
  );
  assert.ok(
    !viewContent.includes("showBanner('Undo all network changes executed.', 'success');\n    await loadOverview();"),
    'Fake UI-only toast in handleUndoAll must be eliminated'
  );
});

test('Network Undo All: Engine iterates over DNS, Adapter, and Advanced tweaks', () => {
  const enginePath = path.join(rootDir, 'electron/engine/networkEngine.ts');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  assert.ok(
    engineContent.includes('static async undoAll('),
    'NetworkEngine must define static async undoAll method'
  );
  assert.ok(
    engineContent.includes('DnsEngine.revertDns') || engineContent.includes('DnsEngine.resetDnsToDhcp'),
    'undoAll must revert DNS or reset to DHCP'
  );
  assert.ok(
    engineContent.includes('AdapterTweaksEngine.revertTweak'),
    'undoAll must revert adapter tweaks'
  );
  assert.ok(
    engineContent.includes('AdvancedNetworkEngine.revertTweak'),
    'undoAll must revert advanced network tweaks'
  );
  assert.ok(
    engineContent.includes("action: 'Undo All Network Settings'"),
    'undoAll must record an audit log in AuditStore'
  );
});
