import { ipcMain } from 'electron';
import { AntiCheatEngine } from '../engine/antiCheatEngine';
import { AntiCheatStore, AntiCheatRequirement } from '../storage/antiCheatStore';

export function registerAntiCheatIpc() {
  ipcMain.handle('anticheat:getStatus', async (_event, forceRefresh?: boolean) => {
    return await AntiCheatEngine.getFullAntiCheatStatus(forceRefresh);
  });

  ipcMain.handle('anticheat:setCompetitiveSafeMode', async (_event, enabled: boolean) => {
    AntiCheatEngine.setCompetitiveSafe(enabled);
    return { success: true, isCompetitiveSafeActive: enabled };
  });

  ipcMain.handle('anticheat:applyPreset', async () => {
    return await AntiCheatEngine.applyCompetitiveSafePreset();
  });

  ipcMain.handle('anticheat:getRequirements', async () => {
    return AntiCheatStore.getRequirements();
  });

  ipcMain.handle('anticheat:updateRequirement', async (_event, req: AntiCheatRequirement) => {
    const success = AntiCheatStore.updateRequirement(req);
    return { success };
  });
}
