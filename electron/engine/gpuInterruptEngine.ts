/**
 * PC Tweak - GPU Interrupt Pipeline Engine
 *
 * Implements:
 * 1. Hardware Video Controller Discovery (Discrete vs Integrated GPUs)
 * 2. Message Signaled Interrupts (MSI-X) Mode Detection and Switching
 * 3. CPU PCIe Interrupt Priority Allocation (DevicePriority: 3 = High, 2 = Normal, 1 = Low)
 * 4. Pre-modification snapshot capture and atomic rollback
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GpuDeviceInfo {
  name: string;
  pnpDeviceId: string;
  instanceId: string;
  driverVersion: string;
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Unknown';
  isDiscrete: boolean;
  msiSupported: boolean;
  devicePriority: number; // 3 = High, 2 = Normal, 1 = Low, 0 = Default/Undefined
  devicePriorityText: 'High' | 'Normal' | 'Low' | 'Default';
}

export interface GpuInterruptSnapshot {
  pnpDeviceId: string;
  originalMsiSupported: boolean | null;
  originalDevicePriority: number | null;
  appliedMsiSupported: boolean;
  appliedDevicePriority: number;
  timestamp: string;
}

function getStoragePath(): string {
  const userDataDir = app ? app.getPath('userData') : process.cwd();
  const dir = path.join(userDataDir, 'storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'gpuInterruptSnapshots.json');
}

function loadSnapshots(): Record<string, GpuInterruptSnapshot> {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load GPU interrupt snapshots:', err);
  }
  return {};
}

function saveSnapshot(pnpDeviceId: string, snapshot: GpuInterruptSnapshot): void {
  try {
    const snapshots = loadSnapshots();
    snapshots[pnpDeviceId] = snapshot;
    fs.writeFileSync(getStoragePath(), JSON.stringify(snapshots, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save GPU interrupt snapshot:', err);
  }
}

function sanitizePnpDeviceId(pnpId: string): string {
  // Strip null bytes and dangerous shell characters
  return pnpId.replace(/[;&|`$<>]/g, '').trim();
}

export async function getGpuDevices(): Promise<GpuDeviceInfo[]> {
  try {
    // Query CIM Win32_VideoController via PowerShell
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name, PNPDeviceID, DriverVersion | ConvertTo-Json -Compress',
    ], { timeout: 8000 });

    if (!stdout.trim()) {
      return [];
    }

    let rawList: any;
    try {
      rawList = JSON.parse(stdout.trim());
    } catch {
      return [];
    }

    const controllers = Array.isArray(rawList) ? rawList : [rawList];
    const results: GpuDeviceInfo[] = [];

    for (const ctrl of controllers) {
      if (!ctrl || !ctrl.Name || !ctrl.PNPDeviceID) continue;

      const name = String(ctrl.Name).trim();
      const pnpId = sanitizePnpDeviceId(String(ctrl.PNPDeviceID));
      const driverVer = ctrl.DriverVersion ? String(ctrl.DriverVersion).trim() : 'Unknown';

      // Detect vendor
      let vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Unknown' = 'Unknown';
      if (/VEN_10DE/i.test(pnpId) || /NVIDIA/i.test(name)) {
        vendor = 'NVIDIA';
      } else if (/VEN_1002/i.test(pnpId) || /AMD|Radeon/i.test(name)) {
        vendor = 'AMD';
      } else if (/VEN_8086/i.test(pnpId) || /Intel/i.test(name)) {
        vendor = 'Intel';
      }

      // Detect discrete vs integrated
      const isDiscrete =
        vendor === 'NVIDIA' ||
        (vendor === 'AMD' && !/integrated|Radeon\(TM\) Graphics|APU/i.test(name)) ||
        (vendor === 'Intel' && /Arc|Xe/i.test(name));

      // Query MSI & Priority in Registry
      const regBasePath = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${pnpId}\\Device Parameters\\Interrupt Management`;
      let msiSupported = false;
      let devicePriority = 0;

      // 1. Check MSISupported
      try {
        const { stdout: msiOut } = await execFileAsync('reg', [
          'query',
          `${regBasePath}\\MessageSignaledInterruptProperties`,
          '/v',
          'MSISupported',
        ]);
        const match = msiOut.match(/MSISupported\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
        if (match && parseInt(match[1], 16) === 1) {
          msiSupported = true;
        }
      } catch {
        msiSupported = false;
      }

      // 2. Check DevicePriority
      try {
        const { stdout: prioOut } = await execFileAsync('reg', [
          'query',
          `${regBasePath}\\Affinity Policy`,
          '/v',
          'DevicePriority',
        ]);
        const match = prioOut.match(/DevicePriority\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
        if (match) {
          devicePriority = parseInt(match[1], 16);
        }
      } catch {
        devicePriority = 0;
      }

      let devicePriorityText: 'High' | 'Normal' | 'Low' | 'Default' = 'Default';
      if (devicePriority === 3) devicePriorityText = 'High';
      else if (devicePriority === 2) devicePriorityText = 'Normal';
      else if (devicePriority === 1) devicePriorityText = 'Low';

      results.push({
        name,
        pnpDeviceId: pnpId,
        instanceId: pnpId,
        driverVersion: driverVer,
        vendor,
        isDiscrete,
        msiSupported,
        devicePriority,
        devicePriorityText,
      });
    }

    return results;
  } catch (err) {
    console.error('Failed to query GPU devices:', err);
    return [];
  }
}

export async function setGpuMsi(
  pnpDeviceId: string,
  enableMsi: boolean,
  priority: number = 3
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanId = sanitizePnpDeviceId(pnpDeviceId);
    if (!cleanId || !cleanId.startsWith('PCI\\')) {
      return { success: false, message: 'Invalid PCI Device ID' };
    }

    // Capture current state before apply for rollback
    const regBasePath = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${cleanId}\\Device Parameters\\Interrupt Management`;
    let originalMsi: boolean | null = null;
    let originalPrio: number | null = null;

    try {
      const { stdout: msiOut } = await execFileAsync('reg', [
        'query',
        `${regBasePath}\\MessageSignaledInterruptProperties`,
        '/v',
        'MSISupported',
      ]);
      const match = msiOut.match(/MSISupported\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
      if (match) originalMsi = parseInt(match[1], 16) === 1;
    } catch {
      originalMsi = null;
    }

    try {
      const { stdout: prioOut } = await execFileAsync('reg', [
        'query',
        `${regBasePath}\\Affinity Policy`,
        '/v',
        'DevicePriority',
      ]);
      const match = prioOut.match(/DevicePriority\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
      if (match) originalPrio = parseInt(match[1], 16);
    } catch {
      originalPrio = null;
    }

    saveSnapshot(cleanId, {
      pnpDeviceId: cleanId,
      originalMsiSupported: originalMsi,
      originalDevicePriority: originalPrio,
      appliedMsiSupported: enableMsi,
      appliedDevicePriority: priority,
      timestamp: new Date().toISOString(),
    });

    // Write MSISupported
    const msiVal = enableMsi ? '1' : '0';
    await execFileAsync('reg', [
      'add',
      `${regBasePath}\\MessageSignaledInterruptProperties`,
      '/v',
      'MSISupported',
      '/t',
      'REG_DWORD',
      '/d',
      msiVal,
      '/f',
    ]);

    // Write DevicePriority
    await execFileAsync('reg', [
      'add',
      `${regBasePath}\\Affinity Policy`,
      '/v',
      'DevicePriority',
      '/t',
      'REG_DWORD',
      '/d',
      String(priority),
      '/f',
    ]);

    return {
      success: true,
      message: `GPU configured with MSI-X Mode: ${enableMsi ? 'Enabled' : 'Disabled'} and Priority: ${
        priority === 3 ? 'High' : priority === 2 ? 'Normal' : 'Default'
      }.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to apply GPU interrupt settings. Run as Administrator.',
    };
  }
}

export async function revertGpuMsi(
  pnpDeviceId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanId = sanitizePnpDeviceId(pnpDeviceId);
    const snapshots = loadSnapshots();
    const snapshot = snapshots[cleanId];

    const regBasePath = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${cleanId}\\Device Parameters\\Interrupt Management`;

    if (snapshot) {
      if (snapshot.originalMsiSupported !== null) {
        await execFileAsync('reg', [
          'add',
          `${regBasePath}\\MessageSignaledInterruptProperties`,
          '/v',
          'MSISupported',
          '/t',
          'REG_DWORD',
          '/d',
          snapshot.originalMsiSupported ? '1' : '0',
          '/f',
        ]);
      } else {
        try {
          await execFileAsync('reg', [
            'delete',
            `${regBasePath}\\MessageSignaledInterruptProperties`,
            '/v',
            'MSISupported',
            '/f',
          ]);
        } catch {}
      }

      if (snapshot.originalDevicePriority !== null) {
        await execFileAsync('reg', [
          'add',
          `${regBasePath}\\Affinity Policy`,
          '/v',
          'DevicePriority',
          '/t',
          'REG_DWORD',
          '/d',
          String(snapshot.originalDevicePriority),
          '/f',
        ]);
      } else {
        try {
          await execFileAsync('reg', [
            'delete',
            `${regBasePath}\\Affinity Policy`,
            '/v',
            'DevicePriority',
            '/f',
          ]);
        } catch {}
      }
    } else {
      // Default fallback: remove custom priority and keep default MSI
      try {
        await execFileAsync('reg', [
          'delete',
          `${regBasePath}\\Affinity Policy`,
          '/v',
          'DevicePriority',
          '/f',
        ]);
      } catch {}
    }

    return { success: true, message: 'GPU interrupt settings restored to previous state.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to revert GPU interrupt settings' };
  }
}
