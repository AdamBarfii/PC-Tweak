/**
 * PC Tweak - DirectX Presentation & GPU Low-Latency Render Pipeline Engine
 *
 * Implements:
 * 1. MaxFrameLatency = 1: Restricts render queue to 1 frame ahead (Ultra-Low Input Lag)
 * 2. DXGI Modern Flip Model: Upgrades legacy windowed presentation to Flip Model (0ms borderless latency)
 * 3. TdrDelay = 8s: Extends GPU timeout detection to avoid micro-freeze resets during shader compilations
 * 4. DirectX Shader Cache Boost = 10GB: Prevents cache purging in modern shooters (CS2, Apex, CoD)
 * 5. One-Click Competitive Low-Latency Preset application with snapshot rollback
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DirectXPresentationStatus {
  maxFrameLatency: number; // 1 = 1 frame, 0 or null = system default (typically 3)
  isMaxFrameLatencyActive: boolean;
  swapEffectUpgradeEnable: boolean; // true = modern Flip Model active
  tdrDelay: number; // 8 = 8 seconds, 2 = default
  isTdrDelayExtended: boolean;
  shaderCacheSizeMb: number; // 10240 = 10GB
  isShaderCacheBoosted: boolean;
  isCompetitivePresetActive: boolean;
}

export interface DirectXPresentationSnapshot {
  originalMaxFrameLatency: number | null;
  originalDirectXUserGlobalSettings: string | null;
  originalTdrDelay: number | null;
  originalShaderCacheSize: number | null;
  timestamp: string;
}

function getStoragePath(): string {
  const userDataDir = app ? app.getPath('userData') : process.cwd();
  const dir = path.join(userDataDir, 'storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'directXPresentationSnapshot.json');
}

function loadSnapshot(): DirectXPresentationSnapshot | null {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load DirectX presentation snapshot:', err);
  }
  return null;
}

function saveSnapshot(snapshot: DirectXPresentationSnapshot): void {
  try {
    fs.writeFileSync(getStoragePath(), JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save DirectX presentation snapshot:', err);
  }
}

export async function getDirectXPresentationStatus(): Promise<DirectXPresentationStatus> {
  let maxFrameLatency = 0;
  let isMaxFrameLatencyActive = false;
  let swapEffectUpgradeEnable = false;
  let tdrDelay = 2;
  let isTdrDelayExtended = false;
  let shaderCacheSizeMb = 1024;
  let isShaderCacheBoosted = false;

  // 1. Check MaxFrameLatency & DirectXUserGlobalSettings in HKCU\Software\Microsoft\DirectX\UserGpuPreferences
  try {
    const { stdout: dxPrefOut } = await execFileAsync('reg', [
      'query',
      'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
    ]);

    const mflMatch = dxPrefOut.match(/MaxFrameLatency\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (mflMatch) {
      maxFrameLatency = parseInt(mflMatch[1], 16);
      isMaxFrameLatencyActive = maxFrameLatency === 1;
    }

    const settingsMatch = dxPrefOut.match(/DirectXUserGlobalSettings\s+REG_SZ\s+(.*)/i);
    if (settingsMatch) {
      const globalStr = settingsMatch[1].trim();
      if (/SwapEffectUpgradeEnable=1/i.test(globalStr) || !/SwapEffectUpgradeEnable=0/i.test(globalStr)) {
        swapEffectUpgradeEnable = true;
      }
      if (/MaxFrameLatency=1/i.test(globalStr)) {
        isMaxFrameLatencyActive = true;
        maxFrameLatency = 1;
      }
    } else {
      // Default in modern Windows 11 is enabled
      swapEffectUpgradeEnable = true;
    }
  } catch {
    swapEffectUpgradeEnable = true;
  }

  // 2. Check TdrDelay in HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers
  try {
    const { stdout: tdrOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
      '/v',
      'TdrDelay',
    ]);
    const tdrMatch = tdrOut.match(/TdrDelay\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (tdrMatch) {
      tdrDelay = parseInt(tdrMatch[1], 16);
      isTdrDelayExtended = tdrDelay >= 8;
    }
  } catch {
    tdrDelay = 2;
    isTdrDelayExtended = false;
  }

  // 3. Check DirectXShaderCacheSize in HKLM\SOFTWARE\Microsoft\DirectX
  try {
    const { stdout: cacheOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\DirectX',
      '/v',
      'DirectXShaderCacheSize',
    ]);
    const cacheMatch = cacheOut.match(/DirectXShaderCacheSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (cacheMatch) {
      shaderCacheSizeMb = parseInt(cacheMatch[1], 16);
      isShaderCacheBoosted = shaderCacheSizeMb >= 10240;
    }
  } catch {
    shaderCacheSizeMb = 1024;
    isShaderCacheBoosted = false;
  }

  const isCompetitivePresetActive =
    isMaxFrameLatencyActive &&
    swapEffectUpgradeEnable &&
    isTdrDelayExtended &&
    isShaderCacheBoosted;

  return {
    maxFrameLatency,
    isMaxFrameLatencyActive,
    swapEffectUpgradeEnable,
    tdrDelay,
    isTdrDelayExtended,
    shaderCacheSizeMb,
    isShaderCacheBoosted,
    isCompetitivePresetActive,
  };
}

async function captureSnapshotBeforeEdit(): Promise<void> {
  const existing = loadSnapshot();
  if (existing) return; // Keep the earliest baseline

  let originalMfl: number | null = null;
  let originalSettings: string | null = null;
  let originalTdr: number | null = null;
  let originalCache: number | null = null;

  try {
    const { stdout: dxOut } = await execFileAsync('reg', [
      'query',
      'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
    ]);
    const mflMatch = dxOut.match(/MaxFrameLatency\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (mflMatch) originalMfl = parseInt(mflMatch[1], 16);

    const sMatch = dxOut.match(/DirectXUserGlobalSettings\s+REG_SZ\s+(.*)/i);
    if (sMatch) originalSettings = sMatch[1].trim();
  } catch {}

  try {
    const { stdout: tdrOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
      '/v',
      'TdrDelay',
    ]);
    const tdrMatch = tdrOut.match(/TdrDelay\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (tdrMatch) originalTdr = parseInt(tdrMatch[1], 16);
  } catch {}

  try {
    const { stdout: cacheOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\DirectX',
      '/v',
      'DirectXShaderCacheSize',
    ]);
    const cacheMatch = cacheOut.match(/DirectXShaderCacheSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (cacheMatch) originalCache = parseInt(cacheMatch[1], 16);
  } catch {}

  saveSnapshot({
    originalMaxFrameLatency: originalMfl,
    originalDirectXUserGlobalSettings: originalSettings,
    originalTdrDelay: originalTdr,
    originalShaderCacheSize: originalCache,
    timestamp: new Date().toISOString(),
  });
}

export async function setMaxFrameLatency(enabled: boolean): Promise<{ success: boolean; message: string }> {
  try {
    await captureSnapshotBeforeEdit();
    const val = enabled ? '1' : '0';

    await execFileAsync('reg', [
      'add',
      'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
      '/v',
      'MaxFrameLatency',
      '/t',
      'REG_DWORD',
      '/d',
      val,
      '/f',
    ]);

    // Also update DirectXUserGlobalSettings string for modern D3D12/D3D11 runtimes
    try {
      const { stdout: curSettings } = await execFileAsync('reg', [
        'query',
        'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
        '/v',
        'DirectXUserGlobalSettings',
      ]);
      const sMatch = curSettings.match(/DirectXUserGlobalSettings\s+REG_SZ\s+(.*)/i);
      let settingsStr = sMatch ? sMatch[1].trim() : 'SwapEffectUpgradeEnable=1;';

      if (enabled) {
        if (!/MaxFrameLatency=/i.test(settingsStr)) {
          settingsStr += 'MaxFrameLatency=1;';
        } else {
          settingsStr = settingsStr.replace(/MaxFrameLatency=\d+;/i, 'MaxFrameLatency=1;');
        }
      } else {
        settingsStr = settingsStr.replace(/MaxFrameLatency=\d+;/i, '');
      }

      await execFileAsync('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
        '/v',
        'DirectXUserGlobalSettings',
        '/t',
        'REG_SZ',
        '/d',
        settingsStr,
        '/f',
      ]);
    } catch {}

    return {
      success: true,
      message: enabled
        ? 'DirectX MaxFrameLatency set to 1 (Ultra-Low Render Queue).'
        : 'DirectX MaxFrameLatency reset to default.',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update MaxFrameLatency' };
  }
}

export async function setFlipModelUpgrade(enabled: boolean): Promise<{ success: boolean; message: string }> {
  try {
    await captureSnapshotBeforeEdit();

    let settingsStr = 'SwapEffectUpgradeEnable=1;VRROptimize=1;';
    try {
      const { stdout: curSettings } = await execFileAsync('reg', [
        'query',
        'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
        '/v',
        'DirectXUserGlobalSettings',
      ]);
      const sMatch = curSettings.match(/DirectXUserGlobalSettings\s+REG_SZ\s+(.*)/i);
      if (sMatch) settingsStr = sMatch[1].trim();
    } catch {}

    if (enabled) {
      if (!/SwapEffectUpgradeEnable=/i.test(settingsStr)) {
        settingsStr += 'SwapEffectUpgradeEnable=1;';
      } else {
        settingsStr = settingsStr.replace(/SwapEffectUpgradeEnable=\d+;/i, 'SwapEffectUpgradeEnable=1;');
      }
    } else {
      settingsStr = settingsStr.replace(/SwapEffectUpgradeEnable=\d+;/i, 'SwapEffectUpgradeEnable=0;');
    }

    await execFileAsync('reg', [
      'add',
      'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
      '/v',
      'DirectXUserGlobalSettings',
      '/t',
      'REG_SZ',
      '/d',
      settingsStr,
      '/f',
    ]);

    return {
      success: true,
      message: enabled
        ? 'DXGI Modern Flip Model presentation enforced for borderless games.'
        : 'DXGI Modern Flip Model presentation disabled.',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update Flip Model settings' };
  }
}

export async function setTdrDelay(extended: boolean): Promise<{ success: boolean; message: string }> {
  try {
    await captureSnapshotBeforeEdit();
    if (extended) {
      await execFileAsync('reg', [
        'add',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
        '/v',
        'TdrDelay',
        '/t',
        'REG_DWORD',
        '/d',
        '8',
        '/f',
      ]);
      return { success: true, message: 'GPU TdrDelay extended to 8 seconds to prevent timeout hitches.' };
    } else {
      try {
        await execFileAsync('reg', [
          'delete',
          'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
          '/v',
          'TdrDelay',
          '/f',
        ]);
      } catch {}
      return { success: true, message: 'GPU TdrDelay reset to Windows default (2 seconds).' };
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update TdrDelay. Run as Administrator.' };
  }
}

export async function setShaderCacheBoost(boosted: boolean): Promise<{ success: boolean; message: string }> {
  try {
    await captureSnapshotBeforeEdit();
    if (boosted) {
      // 10240 MB = 10 GB
      await execFileAsync('reg', [
        'add',
        'HKLM\\SOFTWARE\\Microsoft\\DirectX',
        '/v',
        'DirectXShaderCacheSize',
        '/t',
        'REG_DWORD',
        '/d',
        '10240',
        '/f',
      ]);
      return { success: true, message: 'DirectX Shader Cache boundary uncapped to 10 GB to eliminate in-game stutter.' };
    } else {
      try {
        await execFileAsync('reg', [
          'delete',
          'HKLM\\SOFTWARE\\Microsoft\\DirectX',
          '/v',
          'DirectXShaderCacheSize',
          '/f',
        ]);
      } catch {}
      return { success: true, message: 'DirectX Shader Cache reset to Windows default.' };
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update Shader Cache settings. Run as Administrator.' };
  }
}

export async function applyCompetitiveDirectXPreset(): Promise<{ success: boolean; appliedCount: number; message: string }> {
  try {
    await captureSnapshotBeforeEdit();
    let appliedCount = 0;

    const r1 = await setMaxFrameLatency(true);
    if (r1.success) appliedCount++;

    const r2 = await setFlipModelUpgrade(true);
    if (r2.success) appliedCount++;

    const r3 = await setTdrDelay(true);
    if (r3.success) appliedCount++;

    const r4 = await setShaderCacheBoost(true);
    if (r4.success) appliedCount++;

    return {
      success: true,
      appliedCount,
      message: `Competitive DirectX Low-Latency Preset applied (${appliedCount}/4 parameters optimized).`,
    };
  } catch (err: any) {
    return { success: false, appliedCount: 0, message: err?.message || 'Failed to apply preset' };
  }
}

export async function revertDirectXPresentation(): Promise<{ success: boolean; message: string }> {
  try {
    const snapshot = loadSnapshot();
    if (!snapshot) {
      // Fallback defaults
      await setMaxFrameLatency(false);
      await setTdrDelay(false);
      await setShaderCacheBoost(false);
      return { success: true, message: 'DirectX settings reverted to Windows defaults.' };
    }

    if (snapshot.originalMaxFrameLatency !== null) {
      await execFileAsync('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
        '/v',
        'MaxFrameLatency',
        '/t',
        'REG_DWORD',
        '/d',
        String(snapshot.originalMaxFrameLatency),
        '/f',
      ]);
    } else {
      try {
        await execFileAsync('reg', [
          'delete',
          'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
          '/v',
          'MaxFrameLatency',
          '/f',
        ]);
      } catch {}
    }

    if (snapshot.originalDirectXUserGlobalSettings !== null) {
      await execFileAsync('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
        '/v',
        'DirectXUserGlobalSettings',
        '/t',
        'REG_SZ',
        '/d',
        snapshot.originalDirectXUserGlobalSettings,
        '/f',
      ]);
    }

    if (snapshot.originalTdrDelay !== null) {
      await execFileAsync('reg', [
        'add',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
        '/v',
        'TdrDelay',
        '/t',
        'REG_DWORD',
        '/d',
        String(snapshot.originalTdrDelay),
        '/f',
      ]);
    } else {
      try {
        await execFileAsync('reg', [
          'delete',
          'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
          '/v',
          'TdrDelay',
          '/f',
        ]);
      } catch {}
    }

    if (snapshot.originalShaderCacheSize !== null) {
      await execFileAsync('reg', [
        'add',
        'HKLM\\SOFTWARE\\Microsoft\\DirectX',
        '/v',
        'DirectXShaderCacheSize',
        '/t',
        'REG_DWORD',
        '/d',
        String(snapshot.originalShaderCacheSize),
        '/f',
      ]);
    } else {
      try {
        await execFileAsync('reg', [
          'delete',
          'HKLM\\SOFTWARE\\Microsoft\\DirectX',
          '/v',
          'DirectXShaderCacheSize',
          '/f',
        ]);
      } catch {}
    }

    return { success: true, message: 'DirectX render queue and presentation restored to baseline.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to revert DirectX settings' };
  }
}
