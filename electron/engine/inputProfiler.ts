import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { RegistryEngine } from './registry';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export function getRawInputBinaryPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'resources', 'pctweak-rawinput.exe'),
    path.join(process.resourcesPath || '', 'pctweak-rawinput.exe'),
    path.join(app ? app.getAppPath() : process.cwd(), 'resources', 'pctweak-rawinput.exe'),
    path.join(app ? app.getAppPath() : process.cwd(), 'crates', 'pctweak-rawinput', 'target', 'release', 'pctweak-rawinput.exe'),
    path.join(process.cwd(), 'resources', 'pctweak-rawinput.exe'),
    path.join(process.cwd(), 'crates', 'pctweak-rawinput', 'target', 'release', 'pctweak-rawinput.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export interface DetectedInputDevice {
  id: string;
  name: string;
  type: 'mouse' | 'keyboard' | 'other';
  connection: 'usb' | 'bluetooth' | 'wireless_2_4g' | 'internal' | 'unknown';
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
}

export interface SystemInputFactors {
  timerResolutionMs: number;
  displayRefreshRateHz: number;
  mouseAccelerationEnabled: boolean;
  pointerSpeedLevel: number; // 1-11
  mouseQueueSize: number;
  keyboardDelay: number;
  keyboardSpeed: number;
  stickyKeysActive: boolean;
  filterKeysActive: boolean;
  altShiftToggleDisabled: boolean;
  activePowerPlan: string;
  runningVendorSoftware: string[];
}

export class InputProfiler {
  /**
   * Queries connected mouse and keyboard devices.
   */
  static async getConnectedDevices(): Promise<DetectedInputDevice[]> {
    try {
      const script = `
        $devices = @()
        Get-CimInstance Win32_PointingDevice | ForEach-Object {
          $conn = "usb"
          if ($_.PNPDeviceID -match "BTHENUM|BTH") { $conn = "bluetooth" }
          elseif ($_.PNPDeviceID -match "ACPI") { $conn = "internal" }
          
          $vid = ""
          $pid = ""
          if ($_.PNPDeviceID -match "VID_([0-9A-Fa-f]{4})") { $vid = "VID_" + $matches[1] }
          if ($_.PNPDeviceID -match "PID_([0-9A-Fa-f]{4})") { $pid = "PID_" + $matches[1] }

          $devices += [PSCustomObject]@{
            id = $_.DeviceID
            name = $_.Name
            type = "mouse"
            connection = $conn
            vendorId = $vid
            productId = $pid
            manufacturer = $_.Manufacturer
          }
        }

        Get-CimInstance Win32_Keyboard | ForEach-Object {
          $conn = "usb"
          if ($_.PNPDeviceID -match "BTHENUM|BTH") { $conn = "bluetooth" }
          elseif ($_.PNPDeviceID -match "ACPI") { $conn = "internal" }

          $vid = ""
          $pid = ""
          if ($_.PNPDeviceID -match "VID_([0-9A-Fa-f]{4})") { $vid = "VID_" + $matches[1] }
          if ($_.PNPDeviceID -match "PID_([0-9A-Fa-f]{4})") { $pid = "PID_" + $matches[1] }

          $devices += [PSCustomObject]@{
            id = $_.DeviceID
            name = $_.Name
            type = "keyboard"
            connection = $conn
            vendorId = $vid
            productId = $pid
            manufacturer = $_.Manufacturer
          }
        }

        $devices | ConvertTo-Json -Compress
      `;

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, { windowsHide: true });
      if (!stdout.trim()) return [];

      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      return list.map((item: any) => ({
        id: item.id || 'unknown',
        name: item.name || 'Generic Input Device',
        type: item.type || 'other',
        connection: item.connection || 'usb',
        vendorId: item.vendorId || undefined,
        productId: item.productId || undefined,
        manufacturer: item.manufacturer || undefined,
      }));
    } catch (err) {
      console.error('Failed to enumerate input devices:', err);
      return [
        {
          id: 'default_mouse',
          name: 'Standard Windows Pointing Device',
          type: 'mouse',
          connection: 'usb',
        },
        {
          id: 'default_keyboard',
          name: 'Standard PS/2 or USB Keyboard',
          type: 'keyboard',
          connection: 'usb',
        },
      ];
    }
  }

  /**
   * Reads Windows input factors affecting latency and behavior.
   */
  static async getSystemInputFactors(): Promise<SystemInputFactors> {
    // 1. Mouse speed & acceleration
    const mouseSpeedRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
    const mouseSensRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
    const queueSizeRes = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
      'MouseDataQueueSize'
    );

    // 2. Keyboard repeat & accessibility
    const kbDelayRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay');
    const kbSpeedRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed');
    const stickyFlagsRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Accessibility\\StickyKeys', 'Flags');
    const filterFlagsRes = await RegistryEngine.getValue('HKCU', 'Control Panel\\Accessibility\\Keyboard Response', 'Flags');
    const altShiftToggleRes = await RegistryEngine.getValue('HKCU', 'Keyboard Layout\\Toggle', 'Hotkey');

    // 3. Detect vendor software processes
    const runningVendorSoftware: string[] = [];
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-Process -Name lghub, lghub_agent, *razer*, steelseries*, icue, armourycrate -ErrorAction SilentlyContinue).ProcessName | Select-Object -Unique"',
        { windowsHide: true }
      );
      const lines = stdout.toLowerCase();
      if (lines.includes('lghub')) runningVendorSoftware.push('Logitech G HUB');
      if (lines.includes('razer')) runningVendorSoftware.push('Razer Synapse');
      if (lines.includes('steelseries')) runningVendorSoftware.push('SteelSeries GG');
      if (lines.includes('icue')) runningVendorSoftware.push('Corsair iCUE');
      if (lines.includes('armourycrate')) runningVendorSoftware.push('ASUS Armoury Crate');
    } catch {}

    // 4. Power plan
    let activePowerPlan = 'Balanced';
    try {
      const { stdout } = await execAsync('powercfg /getactivescheme', { windowsHide: true });
      if (stdout.includes('High performance')) activePowerPlan = 'High Performance';
      else if (stdout.includes('Ultimate Performance')) activePowerPlan = 'Ultimate Performance';
      else if (stdout.includes('Power saver')) activePowerPlan = 'Power Saver';
    } catch {}

    // 4. Timer resolution via native Win32 NtQueryTimerResolution
    let measuredTimerMs = 1.0;
    try {
      const bin = getRawInputBinaryPath();
      if (fs.existsSync(bin)) {
        const { stdout } = await execFileAsync(bin, ['get-timer'], { windowsHide: true });
        const data = JSON.parse(stdout.trim());
        if (typeof data.current_ms === 'number' && data.current_ms > 0) {
          measuredTimerMs = data.current_ms;
        }
      }
    } catch {}

    // 5. Display refresh rate (via PowerShell)
    let displayHz = 60;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance -ClassName Win32_VideoController).CurrentRefreshRate | Select-Object -First 1"',
        { windowsHide: true }
      );
      const parsedHz = parseInt(stdout.trim(), 10);
      if (!isNaN(parsedHz) && parsedHz > 0) displayHz = parsedHz;
    } catch {}

    const isAccelOn = mouseSpeedRes.exists && mouseSpeedRes.value?.toString() !== '0';
    const sensLevel = mouseSensRes.exists ? parseInt(mouseSensRes.value?.toString() || '10', 10) : 10;
    const queueSize = queueSizeRes.exists ? (queueSizeRes.value as number) : 100;
    const kbDelay = kbDelayRes.exists ? parseInt(kbDelayRes.value?.toString() || '1', 10) : 1;
    const kbSpeed = kbSpeedRes.exists ? parseInt(kbSpeedRes.value?.toString() || '31', 10) : 31;
    const isStickyOn = stickyFlagsRes.exists && stickyFlagsRes.value?.toString() !== '506';
    const isFilterOn = filterFlagsRes.exists && filterFlagsRes.value?.toString() !== '98';
    const isAltShiftDisabled = altShiftToggleRes.exists && altShiftToggleRes.value?.toString() === '3';

    return {
      timerResolutionMs: measuredTimerMs,
      displayRefreshRateHz: displayHz,
      mouseAccelerationEnabled: isAccelOn,
      pointerSpeedLevel: sensLevel,
      mouseQueueSize: queueSize,
      keyboardDelay: kbDelay,
      keyboardSpeed: kbSpeed,
      stickyKeysActive: isStickyOn,
      filterKeysActive: isFilterOn,
      altShiftToggleDisabled: isAltShiftDisabled,
      activePowerPlan,
      runningVendorSoftware,
    };
  }
}
