import fs from 'node:fs';
import crypto from 'node:crypto';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { ProfileStore, TuningProfile } from '../storage/profileStore';
import { RegistryEngine } from '../engine/registry';
import { TweakEngine } from '../engine/tweakEngine';
import { BackupStore, BackupRecord } from '../storage/backupStore';
import {
  setFlipModelUpgrade,
  setMaxFrameLatency,
  setShaderCacheBoost,
  revertDirectXPresentation,
} from '../engine/directXPresentationEngine';

export function registerProfileIpc() {
  ipcMain.handle('profiles:list', async () => {
    return ProfileStore.getAllProfiles();
  });

  ipcMain.handle('profiles:save', async (_event, profile: TuningProfile) => {
    return ProfileStore.saveProfile(profile);
  });

  ipcMain.handle('profiles:delete', async (_event, profileId: string) => {
    return ProfileStore.deleteProfile(profileId);
  });

  ipcMain.handle('profiles:apply', async (_event, profile: TuningProfile) => {
    try {
      let appliedCount = 0;
      let requiresReboot = false;

      // 1. "Windows Default / Revert All" Special Handling
      if (
        profile.id === 'windows_default' ||
        profile.id === 'windows_default_revert' ||
        profile.category === 'default'
      ) {
        const allTweaks = TweakEngine.loadAllTweaks();
        for (const tweak of allTweaks) {
          try {
            const revRes = await TweakEngine.revertTweak(tweak.id);
            if (revRes.success) {
              appliedCount++;
              if (revRes.requiresReboot) requiresReboot = true;
            }
          } catch {}
        }

        // Revert DirectX
        try {
          await revertDirectXPresentation();
        } catch (dxErr) {
          console.error('Failed to revert DirectX presentation:', dxErr);
        }

        // Revert Mouse to standard defaults (Sensitivity 10, Speed 1, Thresholds 6 & 10)
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity', 'REG_SZ', '10');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseTrails', 'REG_SZ', '0');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Desktop', 'WheelScrollLines', 'REG_SZ', '3');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'DoubleClickSpeed', 'REG_SZ', '550');

        return {
          success: true,
          appliedCount,
          requiresReboot,
          message: 'Windows defaults restored successfully.',
        };
      }

      // 2. Normal Profile Application: Apply Tweak IDs from Catalogs
      if (profile.tweakIds && Array.isArray(profile.tweakIds)) {
        for (const tweakId of profile.tweakIds) {
          try {
            const res = await TweakEngine.applyTweak(tweakId);
            if (res.success) {
              appliedCount++;
              if (res.requiresReboot) requiresReboot = true;
            }
          } catch (tweakErr) {
            console.error(`Failed to apply tweak ${tweakId}:`, tweakErr);
          }
        }
      }

      // 3. Apply DirectX Low-Latency Presentation
      if (profile.directX) {
        if (profile.directX.flipModel !== undefined) {
          await setFlipModelUpgrade(profile.directX.flipModel);
        }
        if (profile.directX.maxFrameLatency !== undefined) {
          await setMaxFrameLatency(profile.directX.maxFrameLatency);
        }
        if (profile.directX.shaderCacheBoost !== undefined) {
          await setShaderCacheBoost(profile.directX.shaderCacheBoost);
        }
      }

      // 4. Apply Mouse Settings
      if (profile.mouseSettings) {
        const ms = profile.mouseSettings;

        // Pointer Speed (1-11 slider -> 1-20 registry; 6 is 10)
        if (ms.pointerSpeed !== undefined) {
          const rawSpeed = typeof ms.pointerSpeed === 'number' && Number.isFinite(ms.pointerSpeed)
            ? ms.pointerSpeed
            : 6;
          const sensitivity = Math.max(1, Math.min(20, Math.round((rawSpeed / 6) * 10)));
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Mouse',
            'MouseSensitivity',
            'REG_SZ',
            sensitivity.toString()
          );
        }

        // Acceleration / Precision
        const isPrecision = ms.enhancePointerAccuracy || ms.pointerPrecision || !ms.disableAcceleration;
        if (isPrecision) {
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
        } else {
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
        }

        if (ms.scrollSpeed !== undefined) {
          const rawScroll = typeof ms.scrollSpeed === 'number' && Number.isFinite(ms.scrollSpeed)
            ? ms.scrollSpeed
            : 3;
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Desktop',
            'WheelScrollLines',
            'REG_SZ',
            rawScroll.toString()
          );
        }

        if (ms.doubleClickSpeed !== undefined) {
          const rawDoubleClick = typeof ms.doubleClickSpeed === 'number' && Number.isFinite(ms.doubleClickSpeed)
            ? ms.doubleClickSpeed
            : 550;
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Mouse',
            'DoubleClickSpeed',
            'REG_SZ',
            rawDoubleClick.toString()
          );
        }

        if (ms.disableTrails !== undefined) {
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Mouse',
            'MouseTrails',
            'REG_SZ',
            ms.disableTrails ? '0' : '2'
          );
        }
      }

      // 5. Apply Keyboard Tweaks
      if (profile.keyboardTweaks && Array.isArray(profile.keyboardTweaks)) {
        for (const tweakId of profile.keyboardTweaks) {
          try {
            const kbRes = await TweakEngine.applyTweak(tweakId);
            if (kbRes.success) {
              appliedCount++;
              if (kbRes.requiresReboot) requiresReboot = true;
            }
          } catch {}
        }
      }

      // 6. Record Profile Application in BackupStore
      const backupRecord: BackupRecord = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        title: `Applied profile: ${profile.name}`,
        type: 'profile_apply',
        tweakIds: profile.tweakIds || [],
        snapshots: [],
        status: 'active',
      };
      BackupStore.saveBackup(backupRecord);

      return {
        success: true,
        appliedCount,
        requiresReboot,
        message: `Profile '${profile.name}' applied successfully.`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Export to .pctweak.json via Save Dialog
  ipcMain.handle('profiles:export', async (_event, profile: TuningProfile) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const defaultName = `${profile.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.pctweak.json`;
      const saveOptions = {
        title: 'Export Tuning Profile',
        defaultPath: defaultName,
        filters: [
          { name: 'PC Tweak Profile (*.pctweak.json, *.json)', extensions: ['pctweak.json', 'json'] },
        ],
      };

      const result = win
        ? await dialog.showSaveDialog(win, saveOptions)
        : await dialog.showSaveDialog(saveOptions);

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const content = ProfileStore.exportProfileToJson(profile);
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Import from file via Open Dialog
  ipcMain.handle('profiles:import', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const openOptions = {
        title: 'Import Tuning Profile',
        filters: [
          { name: 'PC Tweak Profile (*.pctweak.json, *.json)', extensions: ['pctweak.json', 'json'] },
        ],
        properties: ['openFile' as const],
      };

      const result = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions);

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      return ProfileStore.importProfileFromJson(content);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Headless Import JSON directly
  ipcMain.handle('profiles:importJson', async (_event, jsonContent: string) => {
    return ProfileStore.importProfileFromJson(jsonContent);
  });
}
