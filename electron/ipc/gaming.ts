import { ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GamingEngine } from '../engine/gamingEngine';
import { GameSessionEngine, GameSessionConfig } from '../engine/gameSessionEngine';

export function registerGamingIpc() {
  // Initialize background watcher and restore any crash snapshots
  GameSessionEngine.init().catch((err) => {
    console.error('Failed to initialize GameSessionEngine:', err);
  });

  ipcMain.handle('gaming:getSessionStatus', async () => {
    return GameSessionEngine.getStatus();
  });

  ipcMain.handle('gaming:updateSessionConfig', async (_event, config: Partial<GameSessionConfig>) => {
    return GameSessionEngine.updateConfig(config);
  });

  ipcMain.handle('gaming:triggerSession', async (_event, gameName: string) => {
    await GameSessionEngine.triggerSession(gameName);
    return GameSessionEngine.getStatus();
  });

  ipcMain.handle('gaming:endSession', async () => {
    await GameSessionEngine.endSession();
    return GameSessionEngine.getStatus();
  });
  ipcMain.handle('gaming:getFullState', async () => {
    return await GamingEngine.getFullState();
  });

  ipcMain.handle('gaming:setActivePowerPlan', async (_event, guid: string) => {
    return await GamingEngine.setActivePowerPlan(guid);
  });

  ipcMain.handle('gaming:createCustomGamingPlan', async () => {
    return await GamingEngine.createCustomGamingPlan();
  });

  ipcMain.handle('gaming:applyTweak', async (_event, tweakId: string) => {
    return await GamingEngine.applyTweak(tweakId);
  });

  ipcMain.handle('gaming:revertTweak', async (_event, tweakId: string) => {
    return await GamingEngine.revertTweak(tweakId);
  });

  ipcMain.handle('gaming:undoAll', async () => {
    return await GamingEngine.undoAll();
  });

  ipcMain.handle('gaming:resetDefaults', async () => {
    return await GamingEngine.resetToWindowsDefaults();
  });

  ipcMain.handle('gaming:runBottleneckAudit', async () => {
    return await GamingEngine.runBottleneckAudit();
  });

  ipcMain.handle('gaming:fixBottleneck', async (_event, actionId: string) => {
    return await GamingEngine.fixBottleneck(actionId);
  });

  ipcMain.handle('gaming:scanGames', async () => {
    return await GamingEngine.scanInstalledGames();
  });

  ipcMain.handle(
    'gaming:setGameSetting',
    async (
      _event,
      payload: {
        exePath: string;
        exeName: string;
        setting: 'gpu_preference' | 'disable_fso' | 'high_priority';
        enabled: boolean;
      }
    ) => {
      return await GamingEngine.setGameSetting(
        payload.exePath,
        payload.exeName,
        payload.setting,
        payload.enabled
      );
    }
  );

  ipcMain.handle('gaming:addCustomGame', async (_event, exePath: string) => {
    return await GamingEngine.addCustomGame(exePath);
  });

  ipcMain.handle('gaming:browseExe', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Select Game Executable',
      filters: [{ name: 'Executable Files', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('gaming:openPanicRecoveryFolder', async () => {
    try {
      const userDocs = path.join(os.homedir(), 'Documents', 'PCTweak', 'Recovery');
      if (!fs.existsSync(userDocs)) {
        fs.mkdirSync(userDocs, { recursive: true });
      }

      const batPath = path.join(userDocs, 'Panic-Recovery.bat');
      const regPath = path.join(userDocs, 'Panic-Recovery.reg');

      if (!fs.existsSync(batPath)) {
        const batContent = `@echo off
echo ========================================================
echo        PC TWEAK SAFE MODE PANIC RECOVERY SCRIPT
echo ========================================================
echo.
echo Restoring Windows Default Power Scheme (Balanced)...
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e
echo.
echo Resetting BCD boot settings...
bcdedit /set hypervisorlaunchtype auto >nul 2>&1
bcdedit /deletevalue useplatformclock >nul 2>&1
echo.
echo Restoring default registry configurations...
reg import "%~dp0Panic-Recovery.reg" >nul 2>&1
echo.
echo Recovery complete. Please reboot your computer normally.
pause
`;
        fs.writeFileSync(batPath, batContent, 'utf8');
      }

      if (!fs.existsSync(regPath)) {
        const regContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Microsoft\\GameBar]
"AutoGameModeEnabled"=dword:00000001
"ShowStartupPanel"=dword:00000001

[HKEY_CURRENT_USER\\System\\GameConfigStore]
"GameDVR_Enabled"=dword:00000001

[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling]
"PowerThrottlingOff"=-

[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel]
"GlobalTimerResolutionRequests"=-
`;
        fs.writeFileSync(regPath, regContent, 'utf8');
      }

      await shell.openPath(userDocs);
      return { success: true, path: userDocs };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
