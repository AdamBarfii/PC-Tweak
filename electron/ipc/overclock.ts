/**
 * PC Tweak - Safe Overclocking & Telemetry Analytics IPC Module
 *
 * Exposes non-destructive auto-overclocking, clamped safe offsets,
 * real-time telemetry, and safety watchdog commands to the renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { OverclockEngine } from '../engine/overclockEngine';
import { OverclockStore } from '../storage/overclockStore';
import { OverclockProfile } from '../../src/types/electron';

export function registerOverclockIpc(): void {
  // Initialize hardware detection & watchdog in engine
  OverclockEngine.init().catch((err) => {
    console.error('Failed to initialize OverclockEngine:', err);
  });

  ipcMain.handle('overclock:getCapabilities', async () => {
    return OverclockEngine.getCapabilities();
  });

  ipcMain.handle('overclock:getTelemetry', async () => {
    return await OverclockEngine.getTelemetry();
  });

  ipcMain.handle('overclock:applyOffset', async (_event, payload: {
    coreOffsetMhz: number;
    memOffsetMhz: number;
    powerLimitPct?: number;
    fanSpeedPct?: number;
    voltageMv?: number;
  }) => {
    return await OverclockEngine.applyOffsets(payload);
  });

  ipcMain.handle('overclock:revertStock', async () => {
    return await OverclockEngine.revertToStock();
  });

  ipcMain.handle('overclock:startAutoScan', async (_event) => {
    return await OverclockEngine.startAutoScan((step) => {
      // Broadcast step updates to all open windows
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('overclock:scanStep', step);
        }
      });
    });
  });

  ipcMain.handle('overclock:stopAutoScan', async () => {
    return OverclockEngine.stopAutoScan();
  });

  ipcMain.handle('overclock:getAnalytics', async () => {
    return await OverclockEngine.getAnalytics();
  });

  ipcMain.handle('overclock:listProfiles', async () => {
    return OverclockStore.listProfiles();
  });

  ipcMain.handle('overclock:saveProfile', async (_event, profile: Omit<OverclockProfile, 'id' | 'createdAt'>) => {
    const saved = OverclockStore.saveProfile(profile);
    return { success: true, profile: saved };
  });
}
