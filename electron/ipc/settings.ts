import { app, ipcMain } from 'electron';
import { SettingsStore, AppSettings } from '../storage/settingsStore';
import { RegistryEngine } from '../engine/registry';

export type PollingIntervalCallback = (intervalMs: number) => void;

let pollingIntervalCallback: PollingIntervalCallback | null = null;

export function setPollingIntervalCallback(cb: PollingIntervalCallback | null) {
  pollingIntervalCallback = cb;
}

export async function syncStartupSetting(enabled: boolean): Promise<void> {
  const openAtLogin = Boolean(enabled);

  // 1. Electron Native Login Item
  try {
    if (app && typeof app.setLoginItemSettings === 'function') {
      app.setLoginItemSettings({
        openAtLogin,
        path: process.execPath,
        args: openAtLogin ? ['--hidden'] : [],
      });
    }
  } catch (err) {
    console.warn('app.setLoginItemSettings failed:', err);
  }

  // 2. Windows HKCU Run key (for unpackaged runs & direct OS autostart)
  try {
    const RUN_KEY_PATH = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const APP_NAME = 'PCTweak';

    if (openAtLogin) {
      const execCommand = `"${process.execPath}" --hidden`;
      await RegistryEngine.setValue('HKCU', RUN_KEY_PATH, APP_NAME, 'REG_SZ', execCommand);
    } else {
      await RegistryEngine.deleteValue('HKCU', RUN_KEY_PATH, APP_NAME);
    }
  } catch (err) {
    console.warn('RegistryEngine startup sync failed:', err);
  }
}

export function registerSettingsIpc(onPollingIntervalChange?: PollingIntervalCallback) {
  if (onPollingIntervalChange) {
    setPollingIntervalCallback(onPollingIntervalChange);
  }

  ipcMain.handle('settings:get', async () => {
    return SettingsStore.getSettings();
  });

  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => {
    try {
      const res = SettingsStore.updateSettings(partial);
      if (!res.success) {
        return res;
      }

      if (partial.launchOnStartup !== undefined) {
        await syncStartupSetting(res.settings.launchOnStartup);
      }

      if (partial.hardwarePollingInterval !== undefined && pollingIntervalCallback) {
        pollingIntervalCallback(res.settings.hardwarePollingInterval);
      }

      return res;
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        settings: SettingsStore.getSettings(),
      };
    }
  });

  ipcMain.handle('settings:reset', async () => {
    try {
      const res = SettingsStore.resetToDefaults();

      await syncStartupSetting(res.settings.launchOnStartup);

      if (pollingIntervalCallback) {
        pollingIntervalCallback(res.settings.hardwarePollingInterval);
      }

      return res;
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        settings: SettingsStore.getSettings(),
      };
    }
  });

  ipcMain.handle('settings:resetAppData', async () => {
    try {
      const result = SettingsStore.resetAppData();

      const current = SettingsStore.getSettings();
      await syncStartupSetting(current.launchOnStartup);
      if (pollingIntervalCallback) {
        pollingIntervalCallback(current.hardwarePollingInterval);
      }

      return {
        success: true,
        clearedFiles: result.clearedFiles,
      };
    } catch (err: any) {
      return {
        success: false,
        clearedFiles: [],
        error: err.message,
      };
    }
  });
}
