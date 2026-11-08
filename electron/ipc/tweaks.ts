import { ipcMain } from 'electron';
import { TweakEngine } from '../engine/tweakEngine';

export function registerTweakIpc() {
  ipcMain.handle('tweaks:list', async (_event, category?: string) => {
    return await TweakEngine.getTweaksWithStatus(category);
  });

  ipcMain.handle('tweaks:apply', async (_event, tweakId: string) => {
    return await TweakEngine.applyTweak(tweakId);
  });

  ipcMain.handle('tweaks:revert', async (_event, tweakId: string) => {
    return await TweakEngine.revertTweak(tweakId);
  });

  ipcMain.handle('tweaks:batchApply', async (_event, tweakIds: string[], createRestorePoint: boolean) => {
    return await TweakEngine.batchApply(tweakIds, createRestorePoint);
  });
}
