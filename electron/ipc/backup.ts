import { ipcMain } from 'electron';
import { BackupStore } from '../storage/backupStore';
import { RestorePointEngine } from '../engine/restorePoint';
import { TweakEngine } from '../engine/tweakEngine';

export function registerBackupIpc() {
  ipcMain.handle('backup:list', () => {
    return BackupStore.listBackups();
  });

  ipcMain.handle('backup:restore', async (_event, backupId: string) => {
    return await TweakEngine.restoreBackup(backupId);
  });

  ipcMain.handle('backup:delete', (_event, backupId: string) => {
    return BackupStore.deleteBackup(backupId);
  });

  ipcMain.handle('restorePoint:isAvailable', async () => {
    return await RestorePointEngine.isRestoreEnabled();
  });

  ipcMain.handle('restorePoint:enable', async () => {
    return await RestorePointEngine.enableRestore();
  });

  ipcMain.handle('restorePoint:create', async (_event, description: string) => {
    return await RestorePointEngine.createRestorePoint(description);
  });

  ipcMain.handle('restorePoint:list', async () => {
    return await RestorePointEngine.listRestorePoints();
  });
}
