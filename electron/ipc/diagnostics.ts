import { ipcMain } from 'electron';
import { LatencyDiagnosticsEngine } from '../engine/latencyDiagnosticsEngine';
import { BootDiagnosticsEngine } from '../engine/bootDiagnosticsEngine';
import { HostsEngine } from '../engine/hostsEngine';

export function registerDiagnosticsIpc() {
  // DPC & ISR Latency Diagnostics
  ipcMain.handle('diagnostics:getDpcIsrReport', async () => {
    return await LatencyDiagnosticsEngine.getDiagnosticsReport();
  });

  // System Boot Time Breakdown Analyzer
  ipcMain.handle('diagnostics:getBootBreakdown', async () => {
    return await BootDiagnosticsEngine.getBootBreakdown();
  });

  // Windows Hosts File Viewer & Default Restorer
  ipcMain.handle('hosts:getReport', async () => {
    return HostsEngine.getHostsReport();
  });

  ipcMain.handle('hosts:restoreDefault', async () => {
    return await HostsEngine.restoreDefaultHosts();
  });
}
