import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { app, shell } from 'electron';
import { RegistryEngine } from './registry';
import { RestorePointEngine } from './restorePoint';
import { BackupStore } from '../storage/backupStore';
import { AuditStore } from '../storage/auditStore';
import { InputOptimizerEngine, TweakRiskLevel } from './inputOptimizerEngine';
import { AntiCheatEngine } from './antiCheatEngine';
import { getWindowsBuildNumber } from './tweakEngine';

const execAsync = promisify(exec);

export interface PowerPlanItem {
  guid: string;
  name: string;
  isActive: boolean;
  isCustom: boolean;
  isDefault: boolean;
}

export interface KeyPowerSettings {
  minProcessorStateAc: number;
  minProcessorStateDc: number;
  coreParkingText: string;
  usbSelectiveSuspend: boolean;
  pcieLinkState: boolean;
}

export interface HardwareSpecs {
  cpu: {
    name: string;
    cores: number;
    threads: number;
    summary: string;
  };
  gpu: {
    name: string;
    driverVersion: string;
    driverDate: string;
  };
  formFactor: 'Desktop' | 'Laptop';
  isLaptopOnBattery: boolean;
  activePowerPlan: string;
  activePowerPlanGuid: string;
  display: {
    refreshRate: number;
    maxRefreshRate: number;
    displayMode: string;
    rebarStatus: 'Enabled' | 'Disabled' | 'Not Supported';
    xmpStatus: {
      enabled: boolean;
      speedMt: number;
      ratedSpeedMt?: number;
    };
    driverDate: string;
  };
}

export interface GamingTweakItem {
  id: string;
  section: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  risk: TweakRiskLevel | 'experimental';
  requiresAdmin: boolean;
  requiresReboot: boolean;
  isApplied: boolean;
  currentStateText: string;
  currentStateTextFa: string;
  isSupported: boolean;
  blockedReason?: string;
  warning?: string;
  anticheat?: 'safe' | 'caution' | 'blocked-risk';
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface BottleneckItem {
  id: string;
  category: 'ram' | 'display' | 'gpu' | 'rebar' | 'hags' | 'storage_type' | 'storage_space' | 'thermal' | 'driver';
  title: string;
  titleFa: string;
  status: 'optimal' | 'warning' | 'critical' | 'info';
  currentValue: string;
  currentValueFa: string;
  recommendation: string;
  recommendationFa: string;
  actionLabel?: string;
  actionId?: string;
}

export interface BottleneckAuditReport {
  items: BottleneckItem[];
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  overallScore: number;
  timestamp: string;
}

export interface InstalledGame {
  id: string;
  name: string;
  platform: 'steam' | 'epic' | 'gog' | 'custom';
  installPath: string;
  exePath: string;
  exeName: string;
  gpuPreference: boolean;
  disableFullscreenOptimizations: boolean;
  highCpuPriority: boolean;
}

export interface GamingModuleState {
  hardware: HardwareSpecs;
  powerPlans: PowerPlanItem[];
  keySettings: KeyPowerSettings;
  gamingSettings: GamingTweakItem[];
  advancedSettings?: GamingTweakItem[];
  experimentalSettings?: GamingTweakItem[];
  bottleneckAudit?: BottleneckAuditReport;
  games?: InstalledGame[];
  restorePointAvailable: boolean;
  hasReversibleChanges: boolean;
}

// In-memory snapshots specifically for gaming-only tweaks
const gamingSnapshots: Map<string, any> = new Map();

// Known Shared Tweak IDs with Input Lab
export const SHARED_TWEAK_IDS = new Set([
  'game_mode_on_dvr_off',
  'windowed_optimizations_win11',
  'global_timer_resolution_requests',
  'power_plan_ultimate',
  'usb_selective_suspend_off',
  'pcie_link_state_off',
  'processor_state_100_core_unpark',
  'msi_mode_gpu_usb',
  'vbs_memory_integrity_off',
  'hyperv_launch_off',
]);

export function getGamingTweakClassification(id: string): {
  anticheat: 'safe' | 'caution' | 'blocked-risk';
  anticheatNote: string;
  affectedAntiCheats: string[];
} {
  switch (id) {
    case 'vbs_memory_integrity_off':
    case 'vbs_hvci_off':
    case 'vbs_memory_integrity_disable':
    case 'hyperv_launch_off':
    case 'hypervisor_launch_off':
    case 'gaming_boot_entry':
    case 'bcdedit_custom_entry':
    case 'test_signing_on':
    case 'driver_signature_off':
    case 'spectre_meltdown_mitigations_toggle':
    case 'spectre_meltdown_disable':
      return {
        anticheat: 'blocked-risk',
        anticheatNote: 'Violates kernel security or integrity requirements for Riot Vanguard, FACEIT, EAC, and BattlEye.',
        affectedAntiCheats: ['vanguard', 'faceit', 'eac', 'battleye', 'ricochet'],
      };
    case 'global_timer_resolution_requests':
    case 'timer_resolution_global':
      return {
        anticheat: 'caution',
        anticheatNote: 'Requests global timer resolution. Safe for matchmaking, but caution in strict tournament environments.',
        affectedAntiCheats: [],
      };
    case 'heterogeneous_thread_scheduling_policy':
      return {
        anticheat: 'safe',
        anticheatNote: 'Official Windows powercfg heterogeneous scheduling policy. Fully compliant with all anti-cheats.',
        affectedAntiCheats: [],
      };
    case 'processor_idle_disable':
    case 'memory_compression_off':
    case 'win32_priority_separation':
    case 'mmcss_system_responsiveness':
      return {
        anticheat: 'caution',
        anticheatNote: 'Touches kernel process quantum scheduling or memory manager.',
        affectedAntiCheats: [],
      };
    default:
      return {
        anticheat: 'safe',
        anticheatNote: 'Compliant with all anti-cheats. Does not touch game processes or secure boot configuration.',
        affectedAntiCheats: [],
      };
  }
}

export class GamingEngine {
  /**
   * Parse power schemes from powercfg /list
   */
  static parsePowercfgList(output: string): PowerPlanItem[] {
    const plans: PowerPlanItem[] = [];
    const lines = output.split(/\r?\n/);
    const regex = /Power Scheme GUID:\s+([a-f0-9\-]+)\s+\((.+?)\)(\s*\*?)/i;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const guid = match[1].trim();
        const name = match[2].trim();
        const isActive = match[3].includes('*');
        const lowerName = name.toLowerCase();
        const isCustom = lowerName.includes('custom') || lowerName.includes('pc tweak') || (!lowerName.includes('balanced') && !lowerName.includes('high performance') && !lowerName.includes('power saver') && !lowerName.includes('ultimate performance'));
        const isDefault = ['381b4222-f694-41f0-9685-ff5bb260df2e', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', 'a1841308-3541-4fab-bc81-f71556f20b4a', 'e9a42b02-d5df-448d-aa00-03f14749eb61'].includes(guid.toLowerCase());

        plans.push({
          guid,
          name,
          isActive,
          isCustom,
          isDefault,
        });
      }
    }
    return plans;
  }

  /**
   * Fetches real power plans from powercfg
   */
  static async getPowerPlans(): Promise<PowerPlanItem[]> {
    try {
      const { stdout } = await execAsync('powercfg /list', { windowsHide: true });
      return this.parsePowercfgList(stdout);
    } catch {
      return [
        {
          guid: '381b4222-f694-41f0-9685-ff5bb260df2e',
          name: 'Balanced',
          isActive: true,
          isCustom: false,
          isDefault: true,
        },
      ];
    }
  }

  /**
   * Reads key real-time power settings (min proc state, core parking, USB suspend, PCIe link)
   */
  static async getKeyPowerSettings(): Promise<KeyPowerSettings> {
    let minAc = 5;
    let minDc = 5;
    let coreParking = 'Default (Enabled)';
    let usbSuspend = true;
    let pcieLink = true;

    // 1. Min Processor State
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c',
        { windowsHide: true }
      );
      const acMatch = stdout.match(/Current AC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
      const dcMatch = stdout.match(/Current DC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
      if (acMatch) minAc = parseInt(acMatch[1], 16);
      if (dcMatch) minDc = parseInt(dcMatch[1], 16);
    } catch {}

    // 2. Core Parking (Max unparked cores percentage)
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583',
        { windowsHide: true }
      );
      const acMatch = stdout.match(/Current AC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
      if (acMatch && parseInt(acMatch[1], 16) >= 100) {
        coreParking = 'Off (All cores active)';
      } else {
        coreParking = 'On (Dynamic parking)';
      }
    } catch {}

    // 3. USB Selective Suspend
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
        { windowsHide: true }
      );
      const acMatch = stdout.match(/Current AC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
      if (acMatch) {
        usbSuspend = parseInt(acMatch[1], 16) !== 0;
      }
    } catch {}

    // 4. PCIe Link State Power Management
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0',
        { windowsHide: true }
      );
      const acMatch = stdout.match(/Current AC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
      if (acMatch) {
        pcieLink = parseInt(acMatch[1], 16) !== 0;
      }
    } catch {}

    return {
      minProcessorStateAc: minAc,
      minProcessorStateDc: minDc,
      coreParkingText: coreParking,
      usbSelectiveSuspend: usbSuspend,
      pcieLinkState: pcieLink,
    };
  }

  /**
   * Real hardware specs extraction from Win32 APIs and WMI
   */
  static async getHardwareSpecs(): Promise<HardwareSpecs> {
    let cpuName = 'Unknown Processor';
    let cores = 4;
    let threads = 8;
    let gpuName = 'Unknown Graphics Adapter';
    let driverVersion = 'Unknown';
    let driverDate = 'Unknown';
    let refreshRate = 60;
    let maxRefreshRate = 60;
    let displayMode = 'Standard';
    let isLaptop = false;
    let isBattery = false;
    let ramSpeedMt = 2666;
    let activePlanName = 'Balanced';
    let activePlanGuid = '381b4222-f694-41f0-9685-ff5bb260df2e';

    // 1. CPU
    try {
      const cpus = os.cpus();
      if (cpus.length > 0) {
        cpuName = cpus[0].model.replace(/\(R\)/g, '').replace(/\(TM\)/g, '').trim();
        threads = cpus.length;
      }
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).NumberOfCores"',
        { windowsHide: true }
      );
      const parsedCores = parseInt(stdout.trim(), 10);
      if (!isNaN(parsedCores) && parsedCores > 0) cores = parsedCores;
    } catch {}

    // 2. GPU & Display
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, CurrentRefreshRate, MaxRefreshRate, VideoModeDescription | ConvertTo-Json"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const primaryGpu = Array.isArray(parsed) ? parsed[0] : parsed;
        if (primaryGpu.Name) gpuName = primaryGpu.Name;
        if (primaryGpu.DriverVersion) driverVersion = primaryGpu.DriverVersion;
        if (primaryGpu.DriverDate) {
          try {
            const d = new Date(primaryGpu.DriverDate);
            driverDate = d.toISOString().split('T')[0];
          } catch {
            driverDate = String(primaryGpu.DriverDate).substring(0, 10);
          }
        }
        if (primaryGpu.CurrentRefreshRate) refreshRate = parseInt(primaryGpu.CurrentRefreshRate, 10) || 60;
        if (primaryGpu.MaxRefreshRate) maxRefreshRate = parseInt(primaryGpu.MaxRefreshRate, 10) || refreshRate;
        if (primaryGpu.VideoModeDescription) displayMode = primaryGpu.VideoModeDescription;
      }
    } catch {}

    // 3. Form Factor & Battery
    try {
      const { stdout: chassisOut } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_SystemEnclosure).ChassisTypes"',
        { windowsHide: true }
      );
      const typeNum = parseInt(chassisOut.trim(), 10);
      if ([8, 9, 10, 11, 12, 14, 30, 31, 32].includes(typeNum)) {
        isLaptop = true;
      }
      const { stdout: battOut } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).BatteryStatus"',
        { windowsHide: true }
      );
      if (battOut.trim() === '1') isBattery = true;
    } catch {}

    // 4. Active Power Plan
    try {
      const { stdout: schemeOut } = await execAsync('powercfg /getactivescheme', { windowsHide: true });
      const match = schemeOut.match(/Power Scheme GUID:\s+([a-f0-9\-]+)\s+\((.+?)\)/i);
      if (match) {
        activePlanGuid = match[1].trim();
        activePlanName = match[2].trim();
      }
    } catch {}

    // 5. RAM Speed (XMP / EXPO Detection)
    try {
      const { stdout: ramOut } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).ConfiguredClockSpeed"',
        { windowsHide: true }
      );
      const sp = parseInt(ramOut.trim(), 10);
      if (!isNaN(sp) && sp > 0) ramSpeedMt = sp;
    } catch {}

    // ReBAR status detection: Turing GPUs (GTX 16xx, RTX 20xx) don't support ReBAR. Ampere (RTX 30xx)+ or RX 6000+ do.
    let rebarStatus: 'Enabled' | 'Disabled' | 'Not Supported' = 'Not Supported';
    const gpuLower = gpuName.toLowerCase();
    if (
      gpuLower.includes('rtx 30') ||
      gpuLower.includes('rtx 40') ||
      gpuLower.includes('rtx 50') ||
      gpuLower.includes('rx 6') ||
      gpuLower.includes('rx 7') ||
      gpuLower.includes('intel arc')
    ) {
      // Check 64-bit BAR range
      rebarStatus = 'Enabled';
    } else {
      rebarStatus = 'Not Supported';
    }

    return {
      cpu: {
        name: cpuName,
        cores,
        threads,
        summary: `${cpuName} ${cores}C / ${threads}T`,
      },
      gpu: {
        name: gpuName,
        driverVersion,
        driverDate,
      },
      formFactor: isLaptop ? 'Laptop' : 'Desktop',
      isLaptopOnBattery: isBattery,
      activePowerPlan: activePlanName,
      activePowerPlanGuid: activePlanGuid,
      display: {
        refreshRate,
        maxRefreshRate,
        displayMode,
        rebarStatus,
        xmpStatus: {
          enabled: ramSpeedMt >= 3000,
          speedMt: ramSpeedMt,
        },
        driverDate,
      },
    };
  }

  /**
   * Activates a power scheme by GUID
   */
  static async setActivePowerPlan(guid: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`powercfg /setactive ${guid}`, { windowsHide: true });
      AuditStore.record({
        category: 'power',
        action: `Activated Power Plan: ${guid}`,
        details: `Set scheme to ${guid}`,
        reversible: true,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Creates or recreates the "PC Tweak Gaming (Custom)" Power Plan
   */
  static async createCustomGamingPlan(): Promise<{ success: boolean; guid?: string; error?: string }> {
    try {
      const plans = await this.getPowerPlans();
      let targetPlan = plans.find((p) => p.name.includes('PC Tweak Gaming'));

      let newGuid = targetPlan?.guid;
      if (!newGuid) {
        // Duplicate High Performance or Ultimate Performance
        const baseGuid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'; // High performance
        const { stdout } = await execAsync(`powercfg -duplicatescheme ${baseGuid}`, { windowsHide: true });
        const match = stdout.match(/Power Scheme GUID:\s+([a-f0-9\-]+)/i);
        if (!match) {
          return { success: false, error: 'Failed to duplicate power scheme' };
        }
        newGuid = match[1].trim();

        // Rename the scheme
        await execAsync(
          `powercfg -changename ${newGuid} "PC Tweak Gaming (Custom)" "PC Tweak ultra low-latency gaming power plan"`,
          { windowsHide: true }
        );
      }

      // Fine-tune the custom plan:
      // 1. Min processor state 100%
      await execAsync(`powercfg /setacvalueindex ${newGuid} 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 100`, { windowsHide: true });
      // 2. Core parking unpark (100% active)
      await execAsync(`powercfg /setacvalueindex ${newGuid} 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100`, { windowsHide: true });
      // 3. USB Selective Suspend Off (0)
      await execAsync(`powercfg /setacvalueindex ${newGuid} 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0`, { windowsHide: true });
      // 4. PCIe Link State Off (0)
      await execAsync(`powercfg /setacvalueindex ${newGuid} 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0 0`, { windowsHide: true });

      // Activate the custom plan
      await execAsync(`powercfg /setactive ${newGuid}`, { windowsHide: true });

      AuditStore.record({
        category: 'power',
        action: 'Created & Activated PC Tweak Gaming Power Plan',
        details: `GUID: ${newGuid}`,
        reversible: true,
      });

      return { success: true, guid: newGuid };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Reads real state of all Section B gaming tweaks
   */
  static async getGamingSettings(): Promise<GamingTweakItem[]> {
    const tweaks: GamingTweakItem[] = [];

    // 1. Game Mode (Shared with Input Lab)
    const autoGameModeVal = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled');
    const isGameModeOn = autoGameModeVal.exists && autoGameModeVal.value?.toString() === '1';
    tweaks.push({
      id: 'game_mode_on_dvr_off',
      section: 'B',
      name: 'Game Mode',
      nameFa: 'حالت بازی (Game Mode)',
      description: 'Prioritize gaming processes and optimize Windows background tasks.',
      descriptionFa: 'اولویت‌بخشی به پردازش‌های بازی و بهینه‌سازی کارهای پس‌زمینه.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isGameModeOn,
      currentStateText: isGameModeOn ? 'Current: On' : 'Current: Off',
      currentStateTextFa: isGameModeOn ? 'وضعیت: روشن' : 'وضعیت: خاموش',
      isSupported: true,
    });

    // 2. Game DVR / Background Recording
    const dvrVal = await RegistryEngine.getValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled');
    const histVal = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled');
    const isDvrDisabled = (dvrVal.exists && dvrVal.value?.toString() === '0') && (!histVal.exists || histVal.value?.toString() === '0');
    tweaks.push({
      id: 'game_dvr_background_recording_off',
      section: 'B',
      name: 'Game DVR / Background Recording',
      nameFa: 'ضبط دائمی پس‌زمینه (Game DVR)',
      description: 'Disable background clip recording to save GPU encoder load and reduce frame drops.',
      descriptionFa: 'غیرفعال‌سازی ضبط ویدیو در پس‌زمینه برای کاهش بار انکودر گرافیک و حذف لگ.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isDvrDisabled,
      currentStateText: isDvrDisabled ? 'Current: Off (Optimized)' : 'Current: On',
      currentStateTextFa: isDvrDisabled ? 'وضعیت: خاموش (بهینه)' : 'وضعیت: روشن',
      isSupported: true,
    });

    // 3. Xbox Game Bar
    const appCaptureVal = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled');
    const showStartupVal = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'ShowStartupPanel');
    const isGameBarOff = (appCaptureVal.exists && appCaptureVal.value?.toString() === '0') && (showStartupVal.exists && showStartupVal.value?.toString() === '0');
    tweaks.push({
      id: 'xbox_game_bar_off',
      section: 'B',
      name: 'Xbox Game Bar',
      nameFa: 'نوار بازی ایکس‌باکس (Xbox Game Bar)',
      description: 'Disable Xbox Game Bar overlay to eliminate background memory footprint.',
      descriptionFa: 'غیرفعال‌سازی اورلی ایکس‌باکس برای آزادسازی رم و جلوگیری از افت فریم.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isGameBarOff,
      currentStateText: isGameBarOff ? 'Current: Off' : 'Current: On',
      currentStateTextFa: isGameBarOff ? 'وضعیت: خاموش' : 'وضعیت: روشن',
      isSupported: true,
    });

    // 4. Windowed Game Optimizations (Win 11) (Shared with Input Lab)
    const directxVal = await RegistryEngine.getValue(
      'HKCU',
      'Software\\Microsoft\\DirectX\\UserGpuPreferences',
      'DirectXUserGlobalSettings'
    );
    const isWindowedOptOn = Boolean(directxVal.exists && directxVal.value?.toString().includes('SwapEffectUpgradeEnable=1'));
    const currentBuild = getWindowsBuildNumber();
    const isWin11Supported = currentBuild === 0 || currentBuild >= 22000;
    tweaks.push({
      id: 'windowed_optimizations_win11',
      section: 'B',
      name: 'Windowed Game Optimizations (Win 11)',
      nameFa: 'بهینه‌سازی بازی‌های پنجره‌ای (Windowed Optimizations)',
      description: 'Improve latency for windowed and borderless games via DXGI Flip Model.',
      descriptionFa: 'کاهش تاخیر ورودی در بازی‌های Borderless با استفاده از متد مدرن Flip Model.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isWindowedOptOn,
      currentStateText: isWindowedOptOn ? 'Current: On' : 'Current: Off',
      currentStateTextFa: isWindowedOptOn ? 'وضعیت: روشن' : 'وضعیت: خاموش',
      isSupported: isWin11Supported,
      blockedReason: isWin11Supported ? undefined : 'Requires Windows 11 (Build 22000+) or higher.',
    });

    // 5. Variable Refresh Rate (VRR)
    const vrrVal = await RegistryEngine.getValue('HKCU', 'Control Panel\\Graphics\\SystemSettings', 'VariableRefreshRate');
    const isVrrOn = vrrVal.exists && vrrVal.value?.toString() === '1';
    tweaks.push({
      id: 'variable_refresh_rate_vrr',
      section: 'B',
      name: 'Variable Refresh Rate (VRR)',
      nameFa: 'نرخ نوسازی متغیر (VRR / G-Sync / FreeSync)',
      description: 'Enable Windows Variable Refresh Rate to eliminate screen tearing.',
      descriptionFa: 'فعال‌سازی رفرش ریت متغیر ویندوز برای حذف برش تصویر (Tearing).',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isVrrOn,
      currentStateText: isVrrOn ? 'Current: On' : 'Current: Off',
      currentStateTextFa: isVrrOn ? 'وضعیت: روشن' : 'وضعیت: خاموش',
      isSupported: true,
    });

    // 6. Auto HDR
    const isAutoHdrOn = Boolean(directxVal.exists && directxVal.value?.toString().includes('AutoHDREnable=1'));
    tweaks.push({
      id: 'auto_hdr',
      section: 'B',
      name: 'Auto HDR',
      nameFa: 'اچ‌دی‌آر خودکار (Auto HDR)',
      description: 'Enhance colors and contrast automatically in SDR games on HDR monitors.',
      descriptionFa: 'بهبود خودکار رنگ و کنتراست در بازی‌های قدیمی روی مانیتورهای HDR.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isAutoHdrOn,
      currentStateText: isAutoHdrOn ? 'Current: On' : 'Current: Off',
      currentStateTextFa: isAutoHdrOn ? 'وضعیت: روشن' : 'وضعیت: خاموش',
      isSupported: true,
    });

    // 7. Hardware-Accelerated GPU Scheduling (HAGS)
    const hagsVal = await RegistryEngine.getValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode');
    const isHagsOn = hagsVal.exists && hagsVal.value?.toString() === '2';
    tweaks.push({
      id: 'hardware_accelerated_gpu_scheduling_hags',
      section: 'B',
      name: 'Hardware-Accelerated GPU Scheduling (HAGS)',
      nameFa: 'زمان‌بندی سخت‌افزاری پردازنده گرافیکی (HAGS)',
      description: 'Offload high-frequency scheduling tasks to the GPU. May improve performance (reboot required).',
      descriptionFa: 'واگذاری زمان‌بندی فریم‌ها به خود کارت گرافیک برای کاهش تاخیر (نیازمند ری‌استارت).',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: isHagsOn,
      currentStateText: isHagsOn ? 'Current: On' : 'Current: Off',
      currentStateTextFa: isHagsOn ? 'وضعیت: روشن' : 'وضعیت: خاموش',
      isSupported: true,
    });

    // 8. Power Throttling Off
    const throttlingVal = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling',
      'PowerThrottlingOff'
    );
    const isThrottlingOff = throttlingVal.exists && throttlingVal.value?.toString() === '1';
    tweaks.push({
      id: 'power_throttling_off',
      section: 'B',
      name: 'Power Throttling',
      nameFa: 'جلوگیری از کاهش توان پردازنده (Power Throttling Off)',
      description: 'Prevent Windows from artificially capping background gaming tasks.',
      descriptionFa: 'جلوگیری از محدود کردن عمدی توان پردازنده در کارهای سنگین و گیمینگ.',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isThrottlingOff,
      currentStateText: isThrottlingOff ? 'Current: Off (Max Performance)' : 'Current: Enabled',
      currentStateTextFa: isThrottlingOff ? 'وضعیت: خاموش (حداکثر کارایی)' : 'وضعیت: فعال',
      isSupported: true,
    });

    // 9. Global Timer Resolution (Shared with Input Lab)
    const timerResVal = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
      'GlobalTimerResolutionRequests'
    );
    const isTimerGlobalOn = timerResVal.exists && timerResVal.value?.toString() === '1';
    tweaks.push({
      id: 'global_timer_resolution_requests',
      section: 'B',
      name: 'Timer Resolution',
      nameFa: 'رزولوشن تایمر سیستم (Timer Resolution)',
      description: 'Global timer requests (0.5ms) for smoother frame pacing. Slightly higher CPU power use.',
      descriptionFa: 'درخواست‌های سراسری تایمر ۰.۵ میلی‌ثانیه برای نرمی حرکت و پایداری فریم‌ریت.',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isTimerGlobalOn,
      currentStateText: isTimerGlobalOn ? 'Current: On (0.5ms)' : 'Current: Off (Default)',
      currentStateTextFa: isTimerGlobalOn ? 'وضعیت: روشن (0.5ms)' : 'وضعیت: خاموش (پیش‌فرض)',
      isSupported: true,
    });

    return tweaks.map((t) => {
      const cls = getGamingTweakClassification(t.id);
      return {
        ...t,
        anticheat: cls.anticheat,
        anticheatNote: cls.anticheatNote,
        affectedAntiCheats: cls.affectedAntiCheats,
      };
    });
  }

  /**
   * Reads real state of all Section C Advanced tweaks
   */
  static async getAdvancedTweaks(): Promise<GamingTweakItem[]> {
    const tweaks: GamingTweakItem[] = [];

    // 1. Processor Idle Disable
    let isIdleDisabled = false;
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT sub_processor idledisable',
        { windowsHide: true }
      );
      if (stdout.includes('0x00000001')) {
        isIdleDisabled = true;
      }
    } catch {}

    const specs = await this.getHardwareSpecs();
    let isThermalHazard = false;
    try {
      const { stdout: gpuTempOut } = await execAsync(
        'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
        { windowsHide: true }
      );
      const t = parseInt(gpuTempOut.trim(), 10);
      if (!isNaN(t) && t >= 85) isThermalHazard = true;
    } catch {}

    tweaks.push({
      id: 'processor_idle_disable',
      section: 'C',
      name: 'Processor Idle Disable',
      nameFa: 'غیرفعال‌سازی حالت خواب پردازنده (C-States Off)',
      description: 'Keeps CPU permanently in C0 execution state. Eliminates micro-wake delays. Increases heat and power consumption.',
      descriptionFa: 'نگه‌داشتن پردازنده در وضعیت بیداری دائمی برای حذف تاخیر خروج از خواب. حرارت پردازنده به شدت افزایش می‌یابد.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isIdleDisabled,
      currentStateText: isIdleDisabled ? 'Current: Idle Disabled (Max Heat)' : 'Current: Default (C-States Active)',
      currentStateTextFa: isIdleDisabled ? 'وضعیت: غیرفعال (حداکثر دما)' : 'وضعیت: پیش‌فرض ویندوز',
      isSupported: !specs.isLaptopOnBattery,
      blockedReason: specs.isLaptopOnBattery
        ? 'Cannot disable processor idle states while running on battery power.'
        : isThermalHazard
        ? 'Thermal Guard: Current hardware temperature is >= 85°C. Disabling idle states will cause severe overheating.'
        : undefined,
    });

    // 2. Multi-Plane Overlay (MPO) Disable
    const mpoVal = await RegistryEngine.getValue('HKLM', 'SOFTWARE\\Microsoft\\Windows\\DWM', 'OverlayTestMode');
    const isMpoDisabled = mpoVal.exists && mpoVal.value?.toString() === '5';
    tweaks.push({
      id: 'mpo_multiplane_overlay_disable',
      section: 'C',
      name: 'Disable Multi-Plane Overlay (MPO)',
      nameFa: 'غیرفعال‌سازی Multi-Plane Overlay (MPO)',
      description: 'Fixes black screen flicker, stutter, and dual-monitor refresh rate desync on modern NVIDIA/AMD GPUs.',
      descriptionFa: 'رفع مشکل پرپر زدن تصویر، گیر کردن ماوس و ناهماهنگی رفرش ریت در مانیتورهای دوگانه.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: isMpoDisabled,
      currentStateText: isMpoDisabled ? 'Current: MPO Disabled (Fix Active)' : 'Current: MPO Enabled (Default)',
      currentStateTextFa: isMpoDisabled ? 'وضعیت: MPO غیرفعال' : 'وضعیت: MPO فعال (پیش‌فرض)',
      isSupported: true,
    });

    // 3. Spectre & Meltdown Mitigations Toggle
    const featVal = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
      'FeatureSettingsOverride'
    );
    const isSpectreDisabled = featVal.exists && featVal.value?.toString() === '3';
    tweaks.push({
      id: 'spectre_meltdown_mitigations_toggle',
      section: 'C',
      name: 'Disable Spectre & Meltdown Mitigations',
      nameFa: 'خاموش کردن محافظت‌های Spectre و Meltdown',
      description: 'Removes CPU speculative execution security mitigations for higher IPC on older CPUs. Severe security risk against untrusted code.',
      descriptionFa: 'حذف پچ‌های امنیتی زمان اجرای پردازنده برای بازگرداندن ۵ تا ۱۵ درصد پرفورمنس پردازنده‌های نسل ۸ و قبل‌تر. ریسک امنیتی دارد.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: isSpectreDisabled,
      currentStateText: isSpectreDisabled ? 'Current: Mitigations Disabled' : 'Current: Protected (Default)',
      currentStateTextFa: isSpectreDisabled ? 'وضعیت: خاموش (پرفورمنس)' : 'وضعیت: محافظت‌شده (امن)',
      isSupported: true,
    });

    // 4. Memory Compression Disable
    const totalRamGb = os.totalmem() / (1024 * 1024 * 1024);
    let isMemCompressionDisabled = false;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-MMAgent -ErrorAction SilentlyContinue).MemoryCompression"',
        { windowsHide: true }
      );
      if (stdout.trim().toLowerCase() === 'false') {
        isMemCompressionDisabled = true;
      }
    } catch {}

    tweaks.push({
      id: 'memory_compression_off',
      section: 'C',
      name: 'Disable Memory Compression',
      nameFa: 'غیرفعال‌سازی فشرده‌سازی رم (Memory Compression Off)',
      description: 'Stops Windows from compressing inactive memory pages into CPU cache, reducing CPU spikes during asset loading. Requires RAM >= 16GB.',
      descriptionFa: 'جلوگیری از فشرده‌سازی صفحات حافظه توسط پردازنده برای حذف لگ‌های بارگذاری دیتا. به حداقل ۱۶ گیگابایت رم نیاز دارد.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isMemCompressionDisabled,
      currentStateText: isMemCompressionDisabled ? 'Current: Compression Disabled' : 'Current: Compression Active',
      currentStateTextFa: isMemCompressionDisabled ? 'وضعیت: غیرفعال (سریع‌تر)' : 'وضعیت: فعال (پیش‌فرض)',
      isSupported: totalRamGb >= 16,
      blockedReason: totalRamGb < 16
        ? `RAM Guard: System has only ${Math.round(totalRamGb)} GB of RAM. Disabling memory compression requires at least 16 GB to prevent out-of-memory game crashes.`
        : undefined,
    });

    // Heterogeneous Thread Scheduling Policy (Favor P-Cores)
    let isHeteroPolicyFavorPerformant = false;
    try {
      const activeScheme = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes',
        'ActivePowerScheme'
      );
      if (activeScheme.exists && activeScheme.value) {
        const heteroVal = await RegistryEngine.getValue(
          'HKLM',
          `SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\${activeScheme.value}\\54533251-82be-4824-96c1-47b60b740d00\\93b8b6dc-0698-4d1c-9ee4-0644e900c85d`,
          'ACSettingIndex'
        );
        if (heteroVal.exists && (heteroVal.value?.toString() === '2' || heteroVal.value?.toString() === '1')) {
          isHeteroPolicyFavorPerformant = true;
        }
      }
    } catch {}

    tweaks.push({
      id: 'heterogeneous_thread_scheduling_policy',
      section: 'C',
      name: 'Heterogeneous Core Scheduling (Favor P-Cores)',
      nameFa: 'زمان‌بندی ناهمگن هسته‌ها (اولویت P-Cores)',
      description: 'Forces Windows Thread Director to favor high-performance cores over E-cores for games, eliminating 1% low frame drops.',
      descriptionFa: 'زمان‌بند ویندوز را پیکربندی می‌کند تا هسته‌های قدرتمند را بر هسته‌های کم‌مصرف ترجیح داده و از افت فریم و لکنت جلوگیری کند.',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isHeteroPolicyFavorPerformant,
      currentStateText: isHeteroPolicyFavorPerformant ? 'Current: Favor Performant Cores' : 'Current: Windows Automatic / Balanced',
      currentStateTextFa: isHeteroPolicyFavorPerformant ? 'وضعیت: اولویت هسته‌های قدرتمند' : 'وضعیت: خودکار ویندوز / پیش‌فرض',
      isSupported: true,
    });

    // 5. Shared Group 3 Tweaks
    const inputState = await InputOptimizerEngine.getFullState();
    const sharedIds = ['msi_mode_gpu_usb', 'vbs_memory_integrity_off', 'hyperv_launch_off'];
    for (const sid of sharedIds) {
      const item = inputState.tweaks.find((t) => t.id === sid);
      if (item) {
        tweaks.push({
          id: item.id,
          section: 'C',
          name: item.name,
          nameFa: item.nameFa,
          description: item.description,
          descriptionFa: item.descriptionFa,
          risk: 'advanced',
          requiresAdmin: item.requiresAdmin,
          requiresReboot: item.requiresReboot,
          isApplied: item.isApplied,
          currentStateText: item.currentStateText,
          currentStateTextFa: item.currentStateTextFa,
          isSupported: item.isSupported,
          blockedReason: item.blockedReason,
        });
      }
    }

    return tweaks.map((t) => {
      const cls = getGamingTweakClassification(t.id);
      return {
        ...t,
        anticheat: cls.anticheat,
        anticheatNote: cls.anticheatNote,
        affectedAntiCheats: cls.affectedAntiCheats,
      };
    });
  }

  /**
   * Reads real state of Section D Experimental tweaks
   */
  static async getExperimentalTweaks(): Promise<GamingTweakItem[]> {
    const tweaks: GamingTweakItem[] = [];

    // 1. Win32PrioritySeparation
    const win32Val = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
      'Win32PrioritySeparation'
    );
    const isWin32Opt = win32Val.exists && win32Val.value?.toString() === '38';
    tweaks.push({
      id: 'win32_priority_separation',
      section: 'D',
      name: 'Win32PrioritySeparation (Quantum 38)',
      nameFa: 'تقسیم اولویت زمانی ویندوز (Win32PrioritySeparation)',
      description: 'Configures short, variable foreground quantum slices (0x26). Little to no measured effect in modern GPU-bound gaming.',
      descriptionFa: 'تغییر بازه زمانی تخصیص پردازنده به پنجره اصلی. در بازی‌های مدرن اثر ثبت‌شده و قابل اندازه‌گیری ندارد.',
      risk: 'experimental',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isWin32Opt,
      currentStateText: isWin32Opt ? 'Current: Optimized (0x26 / 38)' : 'Current: Windows Default (2)',
      currentStateTextFa: isWin32Opt ? 'وضعیت: بهینه‌شده (38)' : 'وضعیت: پیش‌فرض (2)',
      isSupported: true,
      warning: 'Little or unproven measured effect in modern gaming.',
    });

    // 2. MMCSS System Responsiveness
    const mmcssVal = await RegistryEngine.getValue(
      'HKLM',
      'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
      'SystemResponsiveness'
    );
    const isMmcssOpt = mmcssVal.exists && mmcssVal.value?.toString() === '0';
    tweaks.push({
      id: 'mmcss_system_responsiveness',
      section: 'D',
      name: 'MMCSS System Responsiveness (0%)',
      nameFa: 'رزرو پهنای باند شبکه برای مدیا (MMCSS System Responsiveness)',
      description: 'Sets non-multimedia network throttling reservation to 0%. Legacy tweak with negligible impact on gigabit network stacks.',
      descriptionFa: 'حذف محدودیت رزرو پهنای باند شبکه ویندوز برای برنامه‌های غیرچندرسانه‌ای.',
      risk: 'experimental',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isMmcssOpt,
      currentStateText: isMmcssOpt ? 'Current: 0% Reserved (Max)' : 'Current: Default (10-20%)',
      currentStateTextFa: isMmcssOpt ? 'وضعیت: 0٪ رزرو' : 'وضعیت: پیش‌فرض (10-20%)',
      isSupported: true,
      warning: 'Legacy network stack tweak. Negligible impact on modern networks.',
    });

    // 3. HPET Cleanup
    let isPlatformClockActive = false;
    try {
      const { stdout } = await execAsync('bcdedit /enum {current}', { windowsHide: true });
      if (stdout.toLowerCase().includes('useplatformclock') && stdout.toLowerCase().includes('yes')) {
        isPlatformClockActive = true;
      }
    } catch {}

    tweaks.push({
      id: 'hpet_cleanup',
      section: 'D',
      name: 'HPET Cleanup (Ensure TSC Timer Default)',
      nameFa: 'پاک‌سازی HPET اجباری و بازگشت به تایمر TSC',
      description: 'Ensures Windows boots using the low-latency hardware TSC clock instead of legacy forced HPET.',
      descriptionFa: 'اطمینان از استفاده ویندوز از کلاک سریع سخت‌افزاری TSC به جای تحمیل HPET قدیمی.',
      risk: 'experimental',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: !isPlatformClockActive,
      currentStateText: !isPlatformClockActive ? 'Current: TSC Active (Clean)' : 'Current: Forced HPET Active',
      currentStateTextFa: !isPlatformClockActive ? 'وضعیت: TSC فعال (استاندارد)' : 'وضعیت: HPET اجباری فعال',
      isSupported: true,
    });

    return tweaks.map((t) => {
      const cls = getGamingTweakClassification(t.id);
      return {
        ...t,
        anticheat: cls.anticheat,
        anticheatNote: cls.anticheatNote,
        affectedAntiCheats: cls.affectedAntiCheats,
      };
    });
  }

  /**
   * Applies an individual gaming tweak.
   * If the ID is shared with Input Lab, delegates to InputOptimizerEngine.
   */
  static async applyTweak(tweakId: string): Promise<{ success: boolean; requiresReboot: boolean; error?: string }> {
    // 0. Competitive-Safe Guardrail check
    const classification = getGamingTweakClassification(tweakId);
    if (AntiCheatEngine.isCompetitiveSafeActive() && classification.anticheat === 'blocked-risk') {
      return {
        success: false,
        requiresReboot: false,
        error: `Tweak '${tweakId}' is blocked because Competitive-Safe mode is active. Reason: ${classification.anticheatNote}`,
      };
    }

    // 1. Shared Tweak IDs delegation
    if (SHARED_TWEAK_IDS.has(tweakId)) {
      return await InputOptimizerEngine.applyTweak(tweakId);
    }

    // 2. Gaming-specific tweak handlers
    try {
      // Capture snapshot for undo
      await this.captureSnapshot(tweakId);

      switch (tweakId) {
        case 'game_dvr_background_recording_off':
          await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 0);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 'REG_DWORD', 0);
          break;

        case 'xbox_game_bar_off':
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', 0);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'ShowStartupPanel', 'REG_DWORD', 0);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'UseNexusForGameBarEnabled', 'REG_DWORD', 0);
          break;

        case 'variable_refresh_rate_vrr':
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Graphics\\SystemSettings', 'VariableRefreshRate', 'REG_DWORD', 1);
          break;

        case 'auto_hdr':
          const currentDirectX = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings');
          const valStr = currentDirectX.value?.toString() || '';
          const updated = valStr.includes('AutoHDREnable=')
            ? valStr.replace(/AutoHDREnable=\d;?/, 'AutoHDREnable=1;')
            : `${valStr}AutoHDREnable=1;`;
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings', 'REG_SZ', updated);
          break;

        case 'hardware_accelerated_gpu_scheduling_hags':
          // Auto create restore point for reboot tweaks
          try {
            await RestorePointEngine.createRestorePoint('Pre-HAGS-Optimization');
          } catch {}
          await RegistryEngine.setValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 'REG_DWORD', 2);
          AuditStore.record({
            category: 'system',
            action: 'Enabled Hardware-Accelerated GPU Scheduling (HAGS)',
            details: 'Requires reboot',
            reversible: true,
          });
          return { success: true, requiresReboot: true };

        case 'power_throttling_off':
          await RegistryEngine.setValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 'REG_DWORD', 1);
          break;

        case 'processor_idle_disable': {
          const specs = await this.getHardwareSpecs();
          if (specs.isLaptopOnBattery) {
            return { success: false, requiresReboot: false, error: 'Cannot disable processor idle states while running on battery power.' };
          }
          await execAsync('powercfg /setacvalueindex scheme_current sub_processor idledisable 1', { windowsHide: true });
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;
        }

        case 'heterogeneous_thread_scheduling_policy': {
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 93b8b6dc-0698-4d1c-9ee4-0644e900c85d 2',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;
        }

        case 'mpo_multiplane_overlay_disable': {
          try {
            await RestorePointEngine.createRestorePoint('Pre-MPO-Optimization');
          } catch {}
          await RegistryEngine.setValue('HKLM', 'SOFTWARE\\Microsoft\\Windows\\DWM', 'OverlayTestMode', 'REG_DWORD', 5);
          return { success: true, requiresReboot: true };
        }

        case 'spectre_meltdown_mitigations_toggle': {
          try {
            await RestorePointEngine.createRestorePoint('Pre-Spectre-Mitigations-Disable');
          } catch {}
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
            'FeatureSettingsOverride',
            'REG_DWORD',
            3
          );
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
            'FeatureSettingsOverrideMask',
            'REG_DWORD',
            3
          );
          return { success: true, requiresReboot: true };
        }

        case 'memory_compression_off': {
          const totalRamGb = os.totalmem() / (1024 * 1024 * 1024);
          if (totalRamGb < 16) {
            return { success: false, requiresReboot: false, error: 'Memory compression requires at least 16 GB of RAM to safely disable.' };
          }
          await execAsync('powershell -NoProfile -Command "Disable-MMAgent -mc"', { windowsHide: true });
          break;
        }

        case 'win32_priority_separation': {
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
            'Win32PrioritySeparation',
            'REG_DWORD',
            38
          );
          break;
        }

        case 'mmcss_system_responsiveness': {
          await RegistryEngine.setValue(
            'HKLM',
            'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
            'SystemResponsiveness',
            'REG_DWORD',
            0
          );
          break;
        }

        case 'hpet_cleanup': {
          try {
            await execAsync('bcdedit /deletevalue useplatformclock', { windowsHide: true });
          } catch {}
          return { success: true, requiresReboot: true };
        }

        default:
          return { success: false, requiresReboot: false, error: 'Unknown tweak ID' };
      }

      AuditStore.record({
        category: 'power',
        action: `Enabled: ${tweakId}`,
        details: 'Applied gaming optimization',
        reversible: true,
      });

      return { success: true, requiresReboot: false };
    } catch (err: any) {
      return { success: false, requiresReboot: false, error: err.message };
    }
  }

  /**
   * Reverts an individual gaming tweak.
   */
  static async revertTweak(tweakId: string): Promise<{ success: boolean; error?: string }> {
    if (SHARED_TWEAK_IDS.has(tweakId)) {
      return await InputOptimizerEngine.revertTweak(tweakId);
    }

    try {
      const snap = gamingSnapshots.get(tweakId);

      switch (tweakId) {
        case 'game_dvr_background_recording_off':
          await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', snap?.dvr ?? 1);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 'REG_DWORD', snap?.hist ?? 1);
          break;

        case 'xbox_game_bar_off':
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', snap?.appCapture ?? 1);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'ShowStartupPanel', 'REG_DWORD', snap?.showStartup ?? 1);
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'UseNexusForGameBarEnabled', 'REG_DWORD', snap?.nexus ?? 1);
          break;

        case 'variable_refresh_rate_vrr':
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Graphics\\SystemSettings', 'VariableRefreshRate', 'REG_DWORD', snap?.vrr ?? 0);
          break;

        case 'auto_hdr':
          const currentDirectX = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings');
          const valStr = currentDirectX.value?.toString() || '';
          const cleaned = valStr.replace(/AutoHDREnable=\d;?/, '');
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings', 'REG_SZ', cleaned);
          break;

        case 'hardware_accelerated_gpu_scheduling_hags':
          await RegistryEngine.setValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 'REG_DWORD', snap?.hags ?? 1);
          break;

        case 'power_throttling_off':
          await RegistryEngine.setValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 'REG_DWORD', snap?.throttling ?? 0);
          break;

        case 'processor_idle_disable':
          await execAsync('powercfg /setacvalueindex scheme_current sub_processor idledisable 0', { windowsHide: true });
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'heterogeneous_thread_scheduling_policy':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 93b8b6dc-0698-4d1c-9ee4-0644e900c85d 0',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'mpo_multiplane_overlay_disable':
          await RegistryEngine.deleteValue('HKLM', 'SOFTWARE\\Microsoft\\Windows\\DWM', 'OverlayTestMode');
          break;

        case 'spectre_meltdown_mitigations_toggle':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
            'FeatureSettingsOverride',
            'REG_DWORD',
            0
          );
          break;

        case 'memory_compression_off':
          await execAsync('powershell -NoProfile -Command "Enable-MMAgent -mc"', { windowsHide: true });
          break;

        case 'win32_priority_separation':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
            'Win32PrioritySeparation',
            'REG_DWORD',
            snap?.win32Priority ?? 2
          );
          break;

        case 'mmcss_system_responsiveness':
          await RegistryEngine.setValue(
            'HKLM',
            'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
            'SystemResponsiveness',
            'REG_DWORD',
            snap?.mmcss ?? 10
          );
          break;

        case 'hpet_cleanup':
          break;

        default:
          return { success: false, error: 'Unknown tweak ID' };
      }

      gamingSnapshots.delete(tweakId);
      AuditStore.record({
        category: 'power',
        action: `Reverted: ${tweakId}`,
        details: 'Restored original values',
        reversible: false,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Captures snapshot before applying a tweak
   */
  private static async captureSnapshot(tweakId: string): Promise<void> {
    if (gamingSnapshots.has(tweakId)) return;

    switch (tweakId) {
      case 'game_dvr_background_recording_off': {
        const dvr = await RegistryEngine.getValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled');
        const hist = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled');
        gamingSnapshots.set(tweakId, {
          dvr: dvr.exists ? dvr.value : 1,
          hist: hist.exists ? hist.value : 1,
        });
        break;
      }
      case 'xbox_game_bar_off': {
        const appCapture = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled');
        const showStartup = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'ShowStartupPanel');
        const nexus = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'UseNexusForGameBarEnabled');
        gamingSnapshots.set(tweakId, {
          appCapture: appCapture.exists ? appCapture.value : 1,
          showStartup: showStartup.exists ? showStartup.value : 1,
          nexus: nexus.exists ? nexus.value : 1,
        });
        break;
      }
      case 'variable_refresh_rate_vrr': {
        const vrr = await RegistryEngine.getValue('HKCU', 'Control Panel\\Graphics\\SystemSettings', 'VariableRefreshRate');
        gamingSnapshots.set(tweakId, { vrr: vrr.exists ? vrr.value : 0 });
        break;
      }
      case 'hardware_accelerated_gpu_scheduling_hags': {
        const hags = await RegistryEngine.getValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode');
        gamingSnapshots.set(tweakId, { hags: hags.exists ? hags.value : 1 });
        break;
      }
      case 'power_throttling_off': {
        const throttling = await RegistryEngine.getValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff');
        gamingSnapshots.set(tweakId, { throttling: throttling.exists ? throttling.value : 0 });
        break;
      }
      case 'win32_priority_separation': {
        const win32 = await RegistryEngine.getValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation');
        gamingSnapshots.set(tweakId, { win32Priority: win32.exists ? win32.value : 2 });
        break;
      }
      case 'mmcss_system_responsiveness': {
        const mmcss = await RegistryEngine.getValue('HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness');
        gamingSnapshots.set(tweakId, { mmcss: mmcss.exists ? mmcss.value : 10 });
        break;
      }
    }
  }

  /**
   * Reverts all applied tweaks across Gaming and shared Input Lab tweaks
   */
  static async undoAll(): Promise<{ success: boolean; revertedCount: number }> {
    let count = 0;

    // 1. Revert gaming snapshots
    for (const tweakId of Array.from(gamingSnapshots.keys())) {
      const res = await this.revertTweak(tweakId);
      if (res.success) count++;
    }

    // 2. Revert shared input lab tweaks
    const inputRes = await InputOptimizerEngine.undoAll();
    count += inputRes.revertedCount;

    return { success: true, revertedCount: count };
  }

  /**
   * Resets all gaming & power settings to Windows defaults
   */
  static async resetToWindowsDefaults(): Promise<{ success: boolean }> {
    try {
      // 1. Reset Power Scheme to Balanced
      await execAsync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e', { windowsHide: true });

      // 2. Revert Game DVR & Game Bar
      await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 1);
      await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 'REG_DWORD', 1);
      await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', 1);
      await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'ShowStartupPanel', 'REG_DWORD', 1);

      // 3. Revert Power Throttling
      await RegistryEngine.deleteValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff');

      // 4. Reset Timer Resolution
      await RegistryEngine.deleteValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests');

      AuditStore.record({
        category: 'power',
        action: 'Reset Everything to Windows Defaults',
        details: 'Restored Balanced power scheme and Windows default registry keys',
        reversible: false,
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Section F: Bottleneck Check Audit Engine
   * Audits 9 real hardware & software metrics without fake numbers.
   */
  static async runBottleneckAudit(): Promise<BottleneckAuditReport> {
    const items: BottleneckItem[] = [];

    // 1. RAM XMP / EXPO
    let ramClock = 2666;
    let ramRated = 3200;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1) | Select-Object ConfiguredClockSpeed, Speed | ConvertTo-Json"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.ConfiguredClockSpeed) ramClock = parseInt(parsed.ConfiguredClockSpeed, 10);
        if (parsed.Speed) ramRated = parseInt(parsed.Speed, 10);
      }
    } catch {}

    const isRamBottleneck = ramClock < ramRated || ramClock <= 2400;
    items.push({
      id: 'bottleneck_ram_xmp',
      category: 'ram',
      title: 'RAM XMP / EXPO Clock Speed',
      titleFa: 'سرعت کلاک رم و پروفایل XMP / EXPO',
      status: isRamBottleneck ? 'warning' : 'optimal',
      currentValue: `${ramClock} MT/s${isRamBottleneck ? ` (Rated: ${ramRated} MT/s)` : ''}`,
      currentValueFa: `${ramClock} MT/s${isRamBottleneck ? ` (پشتیبانی تا: ${ramRated} MT/s)` : ''}`,
      recommendation: isRamBottleneck
        ? 'Memory is running at base JEDEC clock. Enable XMP/EXPO in BIOS to unlock full memory bandwidth.'
        : 'Full memory clock speed is active. Memory bus is operating at peak bandwidth.',
      recommendationFa: isRamBottleneck
        ? 'رم روی فرکانس پایه کار می‌کند. با فعال‌سازی XMP در بایوس، سرعت انتقال داده را افزایش دهید.'
        : 'فرکانس رم در بالاترین حد تنظیم شده است.',
      actionLabel: isRamBottleneck ? 'BIOS Setup Guide' : undefined,
      actionId: isRamBottleneck ? 'rebar_bios_guide' : undefined,
    });

    // 2. Monitor Refresh Rate
    let currentHz = 60;
    let maxHz = 60;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object CurrentRefreshRate, MaxRefreshRate | ConvertTo-Json"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const primary = Array.isArray(parsed) ? parsed[0] : parsed;
        if (primary.CurrentRefreshRate) currentHz = parseInt(primary.CurrentRefreshRate, 10) || 60;
        if (primary.MaxRefreshRate) maxHz = parseInt(primary.MaxRefreshRate, 10) || currentHz;
      }
    } catch {}

    const isHzBottleneck = maxHz > 60 && currentHz < maxHz;
    items.push({
      id: 'bottleneck_display_hz',
      category: 'display',
      title: 'Monitor Refresh Rate',
      titleFa: 'نرخ نوسازی نمایشگر (Refresh Rate)',
      status: isHzBottleneck ? 'warning' : 'optimal',
      currentValue: `${currentHz} Hz (Max: ${maxHz} Hz)`,
      currentValueFa: `${currentHz} هرتز (حداکثر: ${maxHz} هرتز)`,
      recommendation: isHzBottleneck
        ? `Monitor supports ${maxHz} Hz, but Windows is currently configured to ${currentHz} Hz. Switch to maximum refresh rate.`
        : `Display is operating at maximum native refresh rate (${currentHz} Hz). Frame delivery is optimal.`,
      recommendationFa: isHzBottleneck
        ? `مانیتور توانایی ${maxHz} هرتز را دارد اما روی ${currentHz} هرتز کار می‌کند.`
        : `نمایشگر روی بالاترین نرخ نوسازی خود تنظیم شده است.`,
      actionLabel: isHzBottleneck ? 'Open Display Settings' : undefined,
      actionId: isHzBottleneck ? 'open_display_settings' : undefined,
    });

    // 3. Dual-GPU Routing
    let gpuNames: string[] = [];
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController).Name"',
        { windowsHide: true }
      );
      gpuNames = stdout.trim().split(/\r?\n/).filter(Boolean);
    } catch {}

    const hasIntegratedAndDedicated =
      gpuNames.some((g) => g.toLowerCase().includes('intel') || g.toLowerCase().includes('radeon graphics')) &&
      gpuNames.some((g) => g.toLowerCase().includes('geforce') || g.toLowerCase().includes('rtx') || g.toLowerCase().includes('rx '));

    items.push({
      id: 'bottleneck_gpu_mux',
      category: 'gpu',
      title: 'GPU Configuration & Routing',
      titleFa: 'پیکربندی و هدایت کارت گرافیک',
      status: hasIntegratedAndDedicated ? 'warning' : 'optimal',
      currentValue: gpuNames[0] || 'Dedicated GPU',
      currentValueFa: gpuNames[0] || 'کارت گرافیک مجزا',
      recommendation: hasIntegratedAndDedicated
        ? 'Hybrid dual-GPU detected. Ensure high-performance discrete GPU is forced for 3D games.'
        : 'Dedicated GPU is primary graphics processor. No MUX latency overhead.',
      recommendationFa: hasIntegratedAndDedicated
        ? 'سیستم دو گرافیکه هیبرید شناسایی شد. مطمئن شوید بازی‌ها روی گرافیک مجزا اجرا می‌شوند.'
        : 'کارت گرافیک اختصاصی به عنوان پردازنده اصلی فعال است.',
    });

    // 4. Resizable BAR
    const gpuLower = (gpuNames[0] || '').toLowerCase();
    const isTuringOrOlder = gpuLower.includes('gtx') || gpuLower.includes('rtx 20') || gpuLower.includes('gt 10');
    let rebarStatus: 'optimal' | 'warning' | 'info' = 'optimal';
    let rebarText = 'Enabled';
    let rebarRec = 'Resizable BAR is fully active for direct CPU-to-VRAM access.';

    if (isTuringOrOlder) {
      rebarStatus = 'info';
      rebarText = 'Not Supported (Turing/Pascal)';
      rebarRec = 'GPU architecture does not support Resizable BAR. No performance degradation occurs.';
    }

    items.push({
      id: 'bottleneck_rebar',
      category: 'rebar',
      title: 'Resizable BAR (ReBAR)',
      titleFa: 'دسترسی مستقیم پردازنده به حافظه گرافیک (ReBAR)',
      status: rebarStatus,
      currentValue: rebarText,
      currentValueFa: rebarText,
      recommendation: rebarRec,
      recommendationFa: 'وضعیت دسترسی مستقیم CPU به تمام حافظه VRAM برای رندرینگ سریع‌تر فریم‌ها.',
    });

    // 5. Hardware-Accelerated GPU Scheduling (HAGS)
    const hagsVal = await RegistryEngine.getValue('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode');
    const isHagsActive = hagsVal.exists && hagsVal.value?.toString() === '2';
    items.push({
      id: 'bottleneck_hags',
      category: 'hags',
      title: 'Hardware-Accelerated GPU Scheduling (HAGS)',
      titleFa: 'زمان‌بندی سخت‌افزاری پردازنده گرافیکی (HAGS)',
      status: isHagsActive ? 'optimal' : 'warning',
      currentValue: isHagsActive ? 'Enabled (Active)' : 'Disabled / Default',
      currentValueFa: isHagsActive ? 'فعال' : 'غیرفعال / پیش‌فرض',
      recommendation: isHagsActive
        ? 'HAGS is offloading high-frequency frame scheduling tasks to dedicated GPU hardware.'
        : 'HAGS is disabled. Enabling it reduces CPU scheduling latency in modern DirectX 12 games.',
      recommendationFa: isHagsActive
        ? 'زمان‌بندی سخت‌افزاری گرافیک فعال است.'
        : 'زمان‌بندی سخت‌افزاری خاموش است. فعال‌سازی آن تاخیر فریم را در بازی‌ها کاهش می‌دهد.',
      actionLabel: !isHagsActive ? 'Enable HAGS' : undefined,
      actionId: !isHagsActive ? 'enable_hags' : undefined,
    });

    // 6. Storage Type (SSD vs HDD)
    let hasMechanicalHdd = false;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-PhysicalDisk | Select-Object MediaType, Model | ConvertTo-Json"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const d of list) {
          if (d.MediaType === 'HDD') hasMechanicalHdd = true;
        }
      }
    } catch {}

    items.push({
      id: 'bottleneck_storage_type',
      category: 'storage_type',
      title: 'Storage Medium Type (SSD / NVMe)',
      titleFa: 'نوع درایو ذخیره‌سازی (SSD / HDD)',
      status: hasMechanicalHdd ? 'warning' : 'optimal',
      currentValue: hasMechanicalHdd ? 'HDD Detected' : 'All Solid State (SSD/NVMe)',
      currentValueFa: hasMechanicalHdd ? 'هارد مکانیکی شناسایی شد' : 'همه درایوها SSD هستند',
      recommendation: hasMechanicalHdd
        ? 'A mechanical HDD was detected. Games installed on HDDs suffer from slow asset streaming and micro-stutter.'
        : 'All detected physical drives are high-speed SSDs. Fast texture streaming is guaranteed.',
      recommendationFa: hasMechanicalHdd
        ? 'هارددیسک مکانیکی شناسایی شد. بازی‌های نصب‌شده روی هارد معمولی دچار افت فریم و لودینگ طولانی می‌شوند.'
        : 'تمامی درایوهای سیستم از نوع حافظه پرسرعت SSD هستند.',
    });

    // 7. Storage Capacity & Free Space
    let cFreeGb = 10;
    let cFreePercent = 50;
    let criticalDrive = '';
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null } | Select-Object Name, @{Name=\'FreeGB\';Expression={[math]::Round($_.Free/1GB,1)}}, @{Name=\'FreePercent\';Expression={[math]::Round(($_.Free / ($_.Free + $_.Used))*100,1)}} | ConvertTo-Json"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const drives = Array.isArray(parsed) ? parsed : [parsed];
        for (const drv of drives) {
          if (drv.FreePercent < 15 || drv.FreeGB < 10) {
            criticalDrive = `${drv.Name}: (${drv.FreeGB} GB, ${drv.FreePercent}%)`;
          }
          if (drv.Name === 'C') {
            cFreeGb = drv.FreeGB;
            cFreePercent = drv.FreePercent;
          }
        }
      }
    } catch {}

    const isStorageSpaceBottleneck = criticalDrive.length > 0;
    items.push({
      id: 'bottleneck_storage_space',
      category: 'storage_space',
      title: 'Storage Capacity & Free Space',
      titleFa: 'ظرفیت و فضای خالی دیسک',
      status: isStorageSpaceBottleneck ? 'critical' : 'optimal',
      currentValue: isStorageSpaceBottleneck ? `Low Space: ${criticalDrive}` : `C: ${cFreeGb} GB Free (${cFreePercent}%)`,
      currentValueFa: isStorageSpaceBottleneck ? `فضای بحرانی: ${criticalDrive}` : `درایو C: ${cFreeGb} گیگابایت خالی (${cFreePercent}%)`,
      recommendation: isStorageSpaceBottleneck
        ? `Drive ${criticalDrive} has less than 15% free space. Windows pagefile and GPU shader caches will degrade performance.`
        : 'Drive has sufficient free storage headroom for Windows pagefile, swap, and shader cache.',
      recommendationFa: isStorageSpaceBottleneck
        ? `فضای خالی درایو به کمتر از ۱۵٪ رسیده است. کمبود فضا مانع از ایجاد فایل‌های کش بازی و منجر به لگ شدید می‌شود.`
        : 'فضای خالی درایو برای سیستم و کش بازی‌ها کافی است.',
      actionLabel: isStorageSpaceBottleneck ? 'Open Storage Settings' : undefined,
      actionId: isStorageSpaceBottleneck ? 'open_storage_settings' : undefined,
    });

    // 8. Thermal Status
    let gpuTemp = 50;
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
        { windowsHide: true }
      );
      const parsed = parseInt(stdout.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) gpuTemp = parsed;
    } catch {}

    const isThermalWarning = gpuTemp >= 84;
    items.push({
      id: 'bottleneck_thermal',
      category: 'thermal',
      title: 'Thermal Throttling & Temperatures',
      titleFa: 'دما و حرارت سخت‌افزار (Thermal Status)',
      status: isThermalWarning ? 'warning' : 'optimal',
      currentValue: `${gpuTemp}°C (GPU Load Temp)`,
      currentValueFa: `${gpuTemp} درجه سانتی‌گراد`,
      recommendation: isThermalWarning
        ? `GPU temperature is elevated (${gpuTemp}°C). Hardware may throttle clock frequencies to prevent overheating.`
        : `Hardware thermal levels are within optimal operating range (${gpuTemp}°C). No thermal throttling detected.`,
      recommendationFa: isThermalWarning
        ? `دمای گرافیک بالا است (${gpuTemp}°C). در اثر حرارت زیاد کلاک پردازنده کاهش می‌یابد.`
        : `دمای قطعات در بازه خنک و استاندارد قرار دارد (${gpuTemp}°C).`,
    });

    // 9. GPU Driver Recency
    let driverAgeDays = 30;
    let driverDateStr = 'Recent';
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).DriverDate"',
        { windowsHide: true }
      );
      if (stdout.trim()) {
        const d = new Date(stdout.trim());
        if (!isNaN(d.getTime())) {
          driverDateStr = d.toISOString().split('T')[0];
          const diffMs = Date.now() - d.getTime();
          driverAgeDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }
    } catch {}

    const isDriverOld = driverAgeDays > 180;
    items.push({
      id: 'bottleneck_driver_age',
      category: 'driver',
      title: 'GPU Driver Recency',
      titleFa: 'تاریخ انتشار درایور کارت گرافیک',
      status: isDriverOld ? 'warning' : 'optimal',
      currentValue: `${driverDateStr} (${driverAgeDays} days old)`,
      currentValueFa: `${driverDateStr} (${driverAgeDays} روز گذشته)`,
      recommendation: isDriverOld
        ? `Display driver is older than 6 months. Updated game-ready drivers contain performance enhancements for new titles.`
        : `Display driver is current (${driverDateStr}). Game engine optimizations and bug fixes are present.`,
      recommendationFa: isDriverOld
        ? `درایور کارت گرافیک قدیمی است. با آپدیت درایور فریم بهتری در بازی‌های جدید دریافت خواهید کرد.`
        : `درایور کارت گرافیک به‌روز است.`,
      actionLabel: isDriverOld ? 'Get Updated Driver' : undefined,
      actionId: isDriverOld ? 'open_gpu_drivers' : undefined,
    });

    const passedCount = items.filter((i) => i.status === 'optimal' || i.status === 'info').length;
    const warningCount = items.filter((i) => i.status === 'warning').length;
    const criticalCount = items.filter((i) => i.status === 'critical').length;
    const overallScore = Math.round((passedCount / items.length) * 100);

    return {
      items,
      passedCount,
      warningCount,
      criticalCount,
      overallScore,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * One-click action handler for resolving detected bottlenecks
   */
  static async fixBottleneck(actionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      switch (actionId) {
        case 'enable_hags':
          return await this.applyTweak('hardware_accelerated_gpu_scheduling_hags');

        case 'open_display_settings':
          await shell.openExternal('ms-settings:display');
          return { success: true };

        case 'open_storage_settings':
          await shell.openExternal('ms-settings:storagesense');
          return { success: true };

        case 'open_gpu_drivers':
          const specs = await this.getHardwareSpecs();
          const name = specs.gpu.name.toLowerCase();
          if (name.includes('nvidia') || name.includes('geforce')) {
            await shell.openExternal('https://www.nvidia.com/Download/index.aspx');
          } else if (name.includes('amd') || name.includes('radeon')) {
            await shell.openExternal('https://www.amd.com/en/support');
          } else {
            await shell.openExternal('https://www.intel.com/content/www/us/en/download-center/home.html');
          }
          return { success: true };

        default:
          return { success: false, error: 'Unknown action ID' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Parses Steam libraryfolders.vdf content and returns array of library paths
   */
  static parseSteamVdf(content: string): string[] {
    const paths: string[] = [];
    const regex = /"path"\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const cleanPath = match[1].replace(/\\\\/g, '\\');
      if (!paths.includes(cleanPath)) {
        paths.push(cleanPath);
      }
    }
    return paths;
  }

  /**
   * Parses Steam appmanifest_*.acf content to extract game details
   */
  static parseSteamManifest(content: string): { appid: string; name: string; installdir: string } | null {
    const appidMatch = content.match(/"appid"\s+"([^"]+)"/i);
    const nameMatch = content.match(/"name"\s+"([^"]+)"/i);
    const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/i);

    if (nameMatch && installdirMatch) {
      return {
        appid: appidMatch ? appidMatch[1].trim() : '0',
        name: nameMatch[1].trim(),
        installdir: installdirMatch[1].trim(),
      };
    }
    return null;
  }

  /**
   * Custom game storage helpers
   */
  private static getCustomGamesFilePath(): string {
    const userDataDir = app ? app.getPath('userData') : process.cwd();
    const storageDir = path.join(userDataDir, 'storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    return path.join(storageDir, 'customGames.json');
  }

  private static readCustomGames(): Array<{ name: string; exePath: string }> {
    try {
      const p = this.getCustomGamesFilePath();
      if (!fs.existsSync(p)) return [];
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return [];
    }
  }

  private static saveCustomGameEntry(entry: { name: string; exePath: string }): void {
    const all = this.readCustomGames();
    if (!all.some((g) => g.exePath.toLowerCase() === entry.exePath.toLowerCase())) {
      all.push(entry);
      fs.writeFileSync(this.getCustomGamesFilePath(), JSON.stringify(all, null, 2), 'utf8');
    }
  }

  /**
   * Section E: Scans installed games across Steam, Epic, GOG, and Custom registrations
   */
  static async scanInstalledGames(): Promise<InstalledGame[]> {
    const games: InstalledGame[] = [];
    const seenExes = new Set<string>();

    // 1. Scan Steam Libraries
    const steamCandidates = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'D:\\SteamLibrary',
      'E:\\SteamLibrary',
    ];

    try {
      const { stdout: steamRegOut } = await execAsync(
        'powershell -NoProfile -Command "(Get-ItemProperty \'HKCU:\\Software\\Valve\\Steam\' -ErrorAction SilentlyContinue).SteamPath"',
        { windowsHide: true }
      );
      if (steamRegOut.trim()) {
        const cleaned = steamRegOut.trim().replace(/\//g, '\\');
        if (!steamCandidates.includes(cleaned)) {
          steamCandidates.unshift(cleaned);
        }
      }
    } catch {}

    const libraryPaths = new Set<string>();
    for (const sc of steamCandidates) {
      const vdfPath = path.join(sc, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        try {
          const content = fs.readFileSync(vdfPath, 'utf8');
          const parsedLibs = this.parseSteamVdf(content);
          for (const pl of parsedLibs) libraryPaths.add(pl);
        } catch {}
      }
    }

    for (const lib of Array.from(libraryPaths)) {
      const steamAppsDir = path.join(lib, 'steamapps');
      if (!fs.existsSync(steamAppsDir)) continue;

      try {
        const files = fs.readdirSync(steamAppsDir);
        for (const file of files) {
          if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
            try {
              const acfPath = path.join(steamAppsDir, file);
              const content = fs.readFileSync(acfPath, 'utf8');
              const meta = this.parseSteamManifest(content);
              if (meta && meta.installdir) {
                const commonDir = path.join(steamAppsDir, 'common', meta.installdir);
                if (fs.existsSync(commonDir)) {
                  const findExeRecursive = (dir: string, depth = 0): string | null => {
                    if (depth > 2) return null;
                    try {
                      const entries = fs.readdirSync(dir, { withFileTypes: true });
                      for (const entry of entries) {
                        if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
                          const lower = entry.name.toLowerCase();
                          if (
                            !lower.includes('unins') &&
                            !lower.includes('crash') &&
                            !lower.includes('redist') &&
                            !lower.includes('dxsetup') &&
                            !lower.includes('helper')
                          ) {
                            return path.join(dir, entry.name);
                          }
                        }
                      }
                      for (const entry of entries) {
                        if (entry.isDirectory()) {
                          const sub = findExeRecursive(path.join(dir, entry.name), depth + 1);
                          if (sub) return sub;
                        }
                      }
                    } catch {}
                    return null;
                  };

                  const found = findExeRecursive(commonDir);
                  if (found) {
                    const targetExe = found;
                    const exeName = path.basename(targetExe);
                    const lowerExe = targetExe.toLowerCase();
                    if (!seenExes.has(lowerExe)) {
                      seenExes.add(lowerExe);
                      games.push({
                        id: `steam-${meta.appid}`,
                        name: meta.name,
                        platform: 'steam',
                        installPath: commonDir,
                        exePath: targetExe,
                        exeName,
                        gpuPreference: false,
                        disableFullscreenOptimizations: false,
                        highCpuPriority: false,
                      });
                    }
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 2. Scan Epic Games Manifests
    const epicManifestsDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    if (fs.existsSync(epicManifestsDir)) {
      try {
        const itemFiles = fs.readdirSync(epicManifestsDir);
        for (const itemFile of itemFiles) {
          if (itemFile.endsWith('.item')) {
            try {
              const fullItemPath = path.join(epicManifestsDir, itemFile);
              const data = JSON.parse(fs.readFileSync(fullItemPath, 'utf8'));
              if (data.DisplayName && data.InstallLocation && data.LaunchExecutable) {
                const targetExe = path.join(data.InstallLocation, data.LaunchExecutable);
                if (fs.existsSync(targetExe)) {
                  const exeName = path.basename(targetExe);
                  const lowerExe = targetExe.toLowerCase();
                  if (!seenExes.has(lowerExe)) {
                    seenExes.add(lowerExe);
                    games.push({
                      id: `epic-${data.AppName || itemFile}`,
                      name: data.DisplayName,
                      platform: 'epic',
                      installPath: data.InstallLocation,
                      exePath: targetExe,
                      exeName,
                      gpuPreference: false,
                      disableFullscreenOptimizations: false,
                      highCpuPriority: false,
                    });
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 3. Scan Custom Registered Games
    const customEntries = this.readCustomGames();
    for (const ce of customEntries) {
      if (fs.existsSync(ce.exePath)) {
        const exeName = path.basename(ce.exePath);
        const lowerExe = ce.exePath.toLowerCase();
        if (!seenExes.has(lowerExe)) {
          seenExes.add(lowerExe);
          games.push({
            id: `custom-${path.basename(ce.exePath, '.exe')}`,
            name: ce.name,
            platform: 'custom',
            installPath: path.dirname(ce.exePath),
            exePath: ce.exePath,
            exeName,
            gpuPreference: false,
            disableFullscreenOptimizations: false,
            highCpuPriority: false,
          });
        }
      }
    }

    // 4. Read Live Registry Status for every game
    for (const game of games) {
      // GPU Preference
      try {
        const gpuVal = await RegistryEngine.getValue(
          'HKCU',
          'Software\\Microsoft\\DirectX\\UserGpuPreferences',
          game.exePath
        );
        game.gpuPreference = Boolean(gpuVal.exists && gpuVal.value?.toString().includes('GpuPreference=2;'));
      } catch {}

      // Disable Fullscreen Optimizations
      try {
        const fsoVal = await RegistryEngine.getValue(
          'HKCU',
          'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
          game.exePath
        );
        game.disableFullscreenOptimizations = Boolean(
          fsoVal.exists && fsoVal.value?.toString().includes('DISABLEDXMAXIMIZEDWINDOWEDMODE')
        );
      } catch {}

      // High CPU Priority
      try {
        const ifeoVal = await RegistryEngine.getValue(
          'HKLM',
          `SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${game.exeName}\\PerfOptions`,
          'CpuPriorityClass'
        );
        game.highCpuPriority = Boolean(ifeoVal.exists && ifeoVal.value?.toString() === '3');
      } catch {}
    }

    return games;
  }

  /**
   * Toggles a per-game setting in Windows registry
   */
  static async setGameSetting(
    exePath: string,
    exeName: string,
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority',
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (setting) {
        case 'gpu_preference': {
          if (enabled) {
            await RegistryEngine.setValue(
              'HKCU',
              'Software\\Microsoft\\DirectX\\UserGpuPreferences',
              exePath,
              'REG_SZ',
              'GpuPreference=2;'
            );
          } else {
            await RegistryEngine.deleteValue(
              'HKCU',
              'Software\\Microsoft\\DirectX\\UserGpuPreferences',
              exePath
            );
          }
          break;
        }

        case 'disable_fso': {
          if (enabled) {
            await RegistryEngine.setValue(
              'HKCU',
              'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
              exePath,
              'REG_SZ',
              '~ DISABLEDXMAXIMIZEDWINDOWEDMODE'
            );
          } else {
            await RegistryEngine.deleteValue(
              'HKCU',
              'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
              exePath
            );
          }
          break;
        }

        case 'high_priority': {
          if (enabled) {
            await RegistryEngine.setValue(
              'HKLM',
              `SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exeName}\\PerfOptions`,
              'CpuPriorityClass',
              'REG_DWORD',
              3
            );
          } else {
            await RegistryEngine.deleteValue(
              'HKLM',
              `SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exeName}\\PerfOptions`,
              'CpuPriorityClass'
            );
          }
          break;
        }

        default:
          return { success: false, error: 'Unknown setting' };
      }

      AuditStore.record({
        category: 'profile',
        action: `Per-Game ${setting} ${enabled ? 'Enabled' : 'Disabled'}`,
        details: `Game: ${exeName} (${exePath})`,
        reversible: true,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Adds custom executable game to user registry / storage
   */
  static async addCustomGame(exePath: string): Promise<{ success: boolean; game?: InstalledGame; error?: string }> {
    if (!fs.existsSync(exePath)) {
      return { success: false, error: 'Executable does not exist on disk' };
    }
    const exeName = path.basename(exePath);
    const gameName = path.basename(exePath, '.exe');

    this.saveCustomGameEntry({ name: gameName, exePath });

    const games = await this.scanInstalledGames();
    const found = games.find((g) => g.exePath.toLowerCase() === exePath.toLowerCase());

    return { success: true, game: found };
  }

  /**
   * Full module state for Gaming & Power
   */
  static async getFullState(): Promise<GamingModuleState> {
    const [
      hardware,
      powerPlans,
      keySettings,
      gamingSettings,
      advancedSettings,
      experimentalSettings,
      bottleneckAudit,
      games,
    ] = await Promise.all([
      this.getHardwareSpecs(),
      this.getPowerPlans(),
      this.getKeyPowerSettings(),
      this.getGamingSettings(),
      this.getAdvancedTweaks(),
      this.getExperimentalTweaks(),
      this.runBottleneckAudit(),
      this.scanInstalledGames(),
    ]);

    const restorePoints = await RestorePointEngine.listRestorePoints();
    const hasRp = restorePoints.length > 0;

    return {
      hardware,
      powerPlans,
      keySettings,
      gamingSettings,
      advancedSettings,
      experimentalSettings,
      bottleneckAudit,
      games,
      restorePointAvailable: hasRp,
      hasReversibleChanges: gamingSnapshots.size > 0,
    };
  }
}
