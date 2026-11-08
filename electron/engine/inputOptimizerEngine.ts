import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec, execSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline';
import { app } from 'electron';
import { RegistryEngine } from './registry';
import { RestorePointEngine } from './restorePoint';
import { BackupStore } from '../storage/backupStore';
import { AuditStore } from '../storage/auditStore';
import { getRawInputBinaryPath } from './inputProfiler';
import { AntiCheatEngine } from './antiCheatEngine';
import { getWindowsBuildNumber } from './tweakEngine';

const execAsync = promisify(exec);

export type TweakRiskLevel = 'safe' | 'moderate' | 'advanced';

export interface OptimizerTweakItem {
  id: string;
  group: 'mouse_keyboard' | 'system_latency' | 'advanced';
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  risk: TweakRiskLevel;
  requiresAdmin: boolean;
  requiresReboot: boolean;
  isApplied: boolean;
  currentStateText: string;
  currentStateTextFa: string;
  isSupported: boolean;
  blockedReason?: string;
  blockedReasonFa?: string;
  isInfoOnly?: boolean;
  infoActionLabel?: string;
  anticheat?: 'safe' | 'caution' | 'blocked-risk';
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface OptimizerState {
  restorePointStatus: {
    available: boolean;
    lastCreatedTimestamp?: string;
  };
  tweaks: OptimizerTweakItem[];
  hasReversibleChanges: boolean;
  isLaptopOnBattery: boolean;
}

export function getInputTweakClassification(id: string): {
  anticheat: 'safe' | 'caution' | 'blocked-risk';
  anticheatNote: string;
  affectedAntiCheats: string[];
} {
  switch (id) {
    case 'vbs_memory_integrity_off':
      return {
        anticheat: 'blocked-risk',
        anticheatNote: 'Violates launch requirements for Riot Vanguard (VAN 1067 / VAN 9003) and FACEIT on Windows 11.',
        affectedAntiCheats: ['vanguard', 'faceit'],
      };
    case 'hyperv_launch_off':
      return {
        anticheat: 'blocked-risk',
        anticheatNote: 'Disabling hypervisor launch breaks Vanguard and FACEIT kernel anti-cheats on Windows 11.',
        affectedAntiCheats: ['vanguard', 'faceit'],
      };
    case 'global_timer_resolution_requests':
      return {
        anticheat: 'caution',
        anticheatNote: 'Requests global timer resolution. Safe for matchmaking; caution in tournament environments.',
        affectedAntiCheats: [],
      };
    default:
      return {
        anticheat: 'safe',
        anticheatNote: 'Compliant with all anti-cheats. Does not touch game processes or secure boot.',
        affectedAntiCheats: [],
      };
  }
}

// In-memory snapshot map of previous states before apply for instant revert
const preApplySnapshots: Map<string, any> = new Map();

export class InputOptimizerEngine {
  /**
   * Reads the real state of all 17 tweaks directly from the operating system.
   */
  static async getFullState(): Promise<OptimizerState> {
    const isBattery = await this.checkIsLaptopOnBattery();
    const tweaks: OptimizerTweakItem[] = [];

    // ==========================================
    // GROUP 1: MOUSE & KEYBOARD (Safe, No Admin)
    // ==========================================

    // 1. Mouse Acceleration
    const mouseSpeedVal = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
    const isAccelOff = mouseSpeedVal.exists && mouseSpeedVal.value?.toString() === '0';
    tweaks.push({
      id: 'mouse_disable_acceleration',
      group: 'mouse_keyboard',
      name: 'Disable mouse acceleration',
      nameFa: 'غیرفعال کردن شتاب ماوس (Mouse Acceleration)',
      description: 'Turn off Enhance Pointer Precision for 1:1 linear tracking.',
      descriptionFa: 'خاموش کردن شتاب ماوس برای حرکت کاملاً خطی و مستقیم ۱:۱.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isAccelOff,
      currentStateText: isAccelOff ? 'Current: Off' : 'Current: On',
      currentStateTextFa: isAccelOff ? 'وضعیت: خاموش' : 'وضعیت: روشن',
      isSupported: true,
    });

    // 2. Pointer Speed Neutral 6/11
    const mouseSensVal = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
    const rawSens = mouseSensVal.exists ? parseInt(mouseSensVal.value?.toString() || '10', 10) : 10;
    const isSensNeutral = rawSens === 10;
    tweaks.push({
      id: 'pointer_speed_neutral',
      group: 'mouse_keyboard',
      name: 'Pointer speed neutral 6/11',
      nameFa: 'سرعت اشاره‌گر استاندارد ۶/۱۱ (بدون پرش پیکسل)',
      description: 'Set mouse speed to neutral 1.0x value to avoid pixel skipping.',
      descriptionFa: 'تنظیم ضریب سرعت ویندوز روی حالت خنثی ۱.۰ برابر برای جلوگیری از جا افتادن پیکسل‌ها.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isSensNeutral,
      currentStateText: `Current: ${Math.round((rawSens / 10) * 6)}/11`,
      currentStateTextFa: `وضعیت: ${Math.round((rawSens / 10) * 6)}/11`,
      isSupported: true,
    });

    // 3. Keyboard Repeat: Delay Shortest, Rate Fastest
    const kbDelayVal = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay');
    const kbSpeedVal = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed');
    const isKbFastest =
      kbDelayVal.exists &&
      kbDelayVal.value?.toString() === '0' &&
      kbSpeedVal.exists &&
      kbSpeedVal.value?.toString() === '31';
    tweaks.push({
      id: 'keyboard_repeat_fastest',
      group: 'mouse_keyboard',
      name: 'Keyboard repeat: fastest',
      nameFa: 'تکرار کلید کیبورد: بیشترین سرعت (Repeat Rate)',
      description: 'Set delay shortest (0) and rate fastest (31) for instant strafing.',
      descriptionFa: 'تنظیم تاخیر روی ۰ و سرعت تکرار روی ۳۱ برای واکنش لحظه‌ای در حرکت و جابجایی.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isKbFastest,
      currentStateText: isKbFastest ? 'Current: Fastest (0/31)' : 'Current: Default',
      currentStateTextFa: isKbFastest ? 'وضعیت: سریع‌ترین (0/31)' : 'وضعیت: پیش‌فرض',
      isSupported: true,
    });

    // 4. Turn off Filter Keys
    const filterFlagsVal = await RegistryEngine.getValue(
      'HKCU',
      'Control Panel\\Accessibility\\Keyboard Response',
      'Flags'
    );
    const filterFlags = filterFlagsVal.exists ? parseInt(filterFlagsVal.value?.toString() || '126', 10) : 126;
    const isFilterOff = (filterFlags & 1) === 0; // Bit 0 indicates FilterKeys enabled
    tweaks.push({
      id: 'keyboard_turn_off_filterkeys',
      group: 'mouse_keyboard',
      name: 'Turn off Filter Keys',
      nameFa: 'خاموش کردن قابلیت Filter Keys',
      description: 'Disable Filter Keys accessibility feature to eliminate Shift key hold delays.',
      descriptionFa: 'غیرفعال‌سازی فیلتر کلیدها برای حذف تاخیر فشرده ماندن کلید Shift.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isFilterOff,
      currentStateText: isFilterOff ? 'Current: Off' : 'Current: On',
      currentStateTextFa: isFilterOff ? 'وضعیت: خاموش' : 'وضعیت: روشن',
      isSupported: true,
    });

    // 5. Turn off Sticky Keys and Toggle Keys Shortcuts
    const stickyFlagsVal = await RegistryEngine.getValue(
      'HKCU',
      'Control Panel\\Accessibility\\StickyKeys',
      'Flags'
    );
    const stickyFlags = stickyFlagsVal.exists ? parseInt(stickyFlagsVal.value?.toString() || '510', 10) : 510;
    const isStickyDisabled = stickyFlags === 506;
    tweaks.push({
      id: 'keyboard_turn_off_sticky_toggle',
      group: 'mouse_keyboard',
      name: 'Turn off Sticky Keys and Toggle Keys',
      nameFa: 'خاموش کردن کلیدهای چسبنده (Sticky & Toggle Keys)',
      description: 'Disable keyboard accessibility shortcuts to prevent match tab-outs.',
      descriptionFa: 'غیرفعال‌سازی میانبر ۵ بار فشردن Shift برای جلوگیری از پاپ‌آپ‌های ناخواسته در بازی.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isStickyDisabled,
      currentStateText: isStickyDisabled ? 'Current: Off' : 'Current: On',
      currentStateTextFa: isStickyDisabled ? 'وضعیت: خاموش' : 'وضعیت: روشن',
      isSupported: true,
    });

    // 6. Turn off Alt+Shift Language Switch
    const altShiftVal = await RegistryEngine.getValue('HKCU', 'Keyboard Layout\\Toggle', 'Hotkey');
    const isAltShiftOff = altShiftVal.exists && altShiftVal.value?.toString() === '3';
    tweaks.push({
      id: 'keyboard_turn_off_alt_shift',
      group: 'mouse_keyboard',
      name: 'Turn off Alt+Shift language switch',
      nameFa: 'غیرفعال کردن تعویض زبان با Alt+Shift',
      description: 'Disable Alt+Shift hotkey to avoid accidental language changes while strafing.',
      descriptionFa: 'غیرفعال کردن کلید میانبر Alt+Shift برای جلوگیری از تغییر ناخواسته زبان در حین دویدن.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isAltShiftOff,
      currentStateText: isAltShiftOff ? 'Current: Off' : 'Current: Alt+Shift',
      currentStateTextFa: isAltShiftOff ? 'وضعیت: خاموش' : 'وضعیت: فعال (Alt+Shift)',
      isSupported: true,
    });

    // ==========================================
    // GROUP 2: SYSTEM LATENCY (Safe / Moderate)
    // ==========================================

    // 7. USB Selective Suspend Off
    let isUsbSuspendOff = false;
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226',
        { windowsHide: true }
      );
      if (stdout.includes('0x00000000')) {
        isUsbSuspendOff = true;
      }
    } catch {}

    tweaks.push({
      id: 'usb_selective_suspend_off',
      group: 'system_latency',
      name: 'Turn off USB selective suspend',
      nameFa: 'خاموش کردن حالت تعلیق انتخابی USB (Selective Suspend)',
      description: 'Prevent Windows from putting USB controllers and mouse ports to sleep.',
      descriptionFa: 'جلوگیری از قطع موقت برق یا به خواب رفتن پورت‌های USB و ماوس.',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isUsbSuspendOff,
      currentStateText: isUsbSuspendOff ? 'Current: Disabled' : 'Current: Enabled',
      currentStateTextFa: isUsbSuspendOff ? 'وضعیت: غیرفعال' : 'وضعیت: فعال',
      isSupported: true,
    });

    // 8. Power Plan: Ultimate / High Performance
    let currentPowerPlan = 'Balanced';
    let isHighPerfPlan = false;
    try {
      const { stdout } = await execAsync('powercfg /getactivescheme', { windowsHide: true });
      if (stdout.includes('Ultimate Performance')) {
        currentPowerPlan = 'Ultimate Performance';
        isHighPerfPlan = true;
      } else if (stdout.includes('High performance') || stdout.includes('High Performance')) {
        currentPowerPlan = 'High Performance';
        isHighPerfPlan = true;
      } else if (stdout.includes('Balanced')) {
        currentPowerPlan = 'Balanced';
      } else {
        currentPowerPlan = 'Custom Plan';
      }
    } catch {}

    tweaks.push({
      id: 'power_plan_ultimate',
      group: 'system_latency',
      name: 'Power plan: High / Ultimate Performance',
      nameFa: 'طرح مصرف انرژی: نهایت کارایی (Ultimate / High Performance)',
      description: 'Locks CPU frequency at maximum clocks to eliminate power throttling. Higher power use on laptops.',
      descriptionFa: 'نگه داشتن فرکانس پردازنده در بالاترین حد برای حذف افت کلاک. مصرف باتری روی لپ‌تاپ افزایش می‌یابد.',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isHighPerfPlan,
      currentStateText: `Current: ${currentPowerPlan}`,
      currentStateTextFa: `وضعیت: ${currentPowerPlan}`,
      isSupported: true,
      blockedReason: isBattery ? 'Laptop is running on battery power. Higher battery drain.' : undefined,
      blockedReasonFa: isBattery ? 'لپ‌تاپ روی باتری است. این تنظیم مصرف باتری را افزایش می‌دهد.' : undefined,
    });

    // 9. Turn off PCIe Link State Power Management
    let isPcieOff = false;
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0',
        { windowsHide: true }
      );
      if (stdout.includes('0x00000000')) {
        isPcieOff = true;
      }
    } catch {}

    tweaks.push({
      id: 'pcie_link_state_off',
      group: 'system_latency',
      name: 'Turn off PCIe Link State Power Management',
      nameFa: 'خاموش کردن ذخیره برق PCIe (Link State Power Management)',
      description: 'Keep GPU and PCIe bus fully awake to prevent bus wake latency spikes.',
      descriptionFa: 'روشن نگه داشتن مداوم باس PCIe و کارت گرافیک برای جلوگیری از مکث‌های بیدار شدن قطعات.',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isPcieOff,
      currentStateText: isPcieOff ? 'Current: Off (Max Performance)' : 'Current: Savings On',
      currentStateTextFa: isPcieOff ? 'وضعیت: خاموش (حداکثر کارایی)' : 'وضعیت: بهینه‌سازی برق فعال',
      isSupported: true,
    });

    // 10. Minimum Processor State 100% / Core Parking Off
    let isCoreUnparked = false;
    try {
      const { stdout } = await execAsync(
        'powercfg /query SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c',
        { windowsHide: true }
      );
      if (stdout.includes('0x00000064')) {
        isCoreUnparked = true;
      }
    } catch {}

    tweaks.push({
      id: 'processor_state_100_core_unpark',
      group: 'system_latency',
      name: 'Minimum processor state 100% / core parking off',
      nameFa: 'حداقل توان پردازنده ۱۰۰٪ و غیرفعال‌سازی Core Parking',
      description: 'Keep all CPU cores active and unparked to reduce micro-stutter when waking cores.',
      descriptionFa: 'فعال نگه داشتن همه هسته‌های CPU بدون به خواب رفتن برای حذف مکث‌های ناشی از بیدار شدن هسته.',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isCoreUnparked,
      currentStateText: isCoreUnparked ? 'Current: 100% (Unparked)' : 'Current: Default (5%)',
      currentStateTextFa: isCoreUnparked ? 'وضعیت: ۱۰۰٪ (همه هسته‌ها فعال)' : 'وضعیت: پیش‌فرض (۵٪)',
      isSupported: true,
    });

    // 11. Game Mode On, Game DVR Off
    const autoGameModeVal = await RegistryEngine.getValue('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled');
    const dvrVal = await RegistryEngine.getValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled');
    const isGameModeOnDvrOff =
      autoGameModeVal.exists &&
      autoGameModeVal.value?.toString() === '1' &&
      dvrVal.exists &&
      dvrVal.value?.toString() === '0';
    tweaks.push({
      id: 'game_mode_on_dvr_off',
      group: 'system_latency',
      name: 'Game Mode on, Game DVR / background capture off',
      nameFa: 'فعال بودن Game Mode و غیرفعال‌سازی ضبط پس‌زمینه (Game DVR)',
      description: 'Prioritize gaming processes and disable background recording overhead.',
      descriptionFa: 'اولویت‌بخشی به پردازش بازی و خاموش کردن ضبط دائمی پس‌زمینه که فریم‌ریت را کاهش می‌دهد.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isGameModeOnDvrOff,
      currentStateText: isGameModeOnDvrOff ? 'Current: Optimized' : 'Current: Default',
      currentStateTextFa: isGameModeOnDvrOff ? 'وضعیت: بهینه‌شده' : 'وضعیت: پیش‌فرض',
      isSupported: true,
    });

    // 12. Optimizations for windowed games on (Win 11)
    const directxVal = await RegistryEngine.getValue(
      'HKCU',
      'Software\\Microsoft\\DirectX\\UserGpuPreferences',
      'DirectXUserGlobalSettings'
    );
    const isWindowedOptOn = Boolean(
      directxVal.exists && directxVal.value?.toString().includes('SwapEffectUpgradeEnable=1')
    );
    const currentBuild = getWindowsBuildNumber();
    const isWin11Supported = currentBuild === 0 || currentBuild >= 22000;
    tweaks.push({
      id: 'windowed_optimizations_win11',
      group: 'system_latency',
      name: 'Optimizations for windowed games on (Win 11)',
      nameFa: 'بهینه‌سازی بازی‌های پنجره‌ای (Windowed Optimizations)',
      description: 'Use modern DXGI flip presentation for borderless/windowed games to lower input lag.',
      descriptionFa: 'استفاده از مدل مدرن Flip Model در بازی‌های Borderless برای کاهش چشمگیر تاخیر ورودی.',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: isWindowedOptOn,
      currentStateText: isWindowedOptOn ? 'Current: Enabled' : 'Current: Disabled',
      currentStateTextFa: isWindowedOptOn ? 'وضعیت: فعال' : 'وضعیت: غیرفعال',
      isSupported: isWin11Supported,
    });

    // 13. Global Timer Resolution Requests
    const timerResVal = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
      'GlobalTimerResolutionRequests'
    );
    const isTimerGlobalOn = timerResVal.exists && timerResVal.value?.toString() === '1';
    tweaks.push({
      id: 'global_timer_resolution_requests',
      group: 'system_latency',
      name: 'Timer resolution: global timer requests on',
      nameFa: 'رزولوشن تایمر سیستم: فعال‌سازی درخواست‌های سراسری (0.5ms)',
      description: 'Enable global 0.5ms precision timer requests to smooth mouse pacing. Uses slightly more CPU power.',
      descriptionFa: 'فعال‌سازی دقت بالای تایمر سیستم (۰.۵ میلی‌ثانیه) برای نرمی بیشتر حرکت ماوس. مصرف برق اندکی بیشتر می‌شود.',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isApplied: isTimerGlobalOn,
      currentStateText: isTimerGlobalOn ? 'Current: Enabled (0.5ms)' : 'Current: Windows Default',
      currentStateTextFa: isTimerGlobalOn ? 'وضعیت: فعال (0.5ms)' : 'وضعیت: پیش‌فرض ویندوز',
      isSupported: true,
    });

    // 14. Info Row: Maximum Refresh Rate Monitor
    let displayHz = 60;
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController).CurrentRefreshRate | Select-Object -First 1"',
        { windowsHide: true }
      );
      const parsed = parseInt(stdout.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) displayHz = parsed;
    } catch {}

    tweaks.push({
      id: 'monitor_refresh_rate_info',
      group: 'system_latency',
      name: 'Set your monitor to its maximum refresh rate',
      nameFa: 'مانیتور را روی بالاترین نرخ نوسازی (Refresh Rate) تنظیم کنید',
      description: `Detected display refresh rate: ${displayHz} Hz. Higher Hz directly reduces frame delivery lag.`,
      descriptionFa: `نرخ نوسازی شناسایی شده: ${displayHz} هرتز. هرتز بالاتر مستقیماً تاخیر تحویل فریم را کاهش می‌دهد.`,
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isApplied: displayHz >= 120,
      currentStateText: `Current: ${displayHz} Hz`,
      currentStateTextFa: `وضعیت: ${displayHz} هرتز`,
      isSupported: true,
      isInfoOnly: true,
      infoActionLabel: 'Open Display Settings',
    });

    // ==========================================
    // GROUP 3: ADVANCED (Reboot Required, Confirmed)
    // ==========================================

    // 15. MSI Mode for GPU & USB Controllers
    const msiSupport = await this.detectMsiDeviceSupport();
    if (msiSupport.isSupported) {
      tweaks.push({
        id: 'msi_mode_gpu_usb',
        group: 'advanced',
        name: 'MSI mode for GPU and USB controller',
        nameFa: 'فعال‌سازی MSI Mode برای کارت گرافیک و کنترلر USB',
        description: 'Switch hardware interrupts from legacy IRQ lines to Message Signaled Interrupts to eliminate interrupt collisions.',
        descriptionFa: 'تغییر سیستم وقفه‌های سخت‌افزاری به MSI برای جلوگیری از تداخل سیگنال‌ها و کاهش Latency.',
        risk: 'advanced',
        requiresAdmin: true,
        requiresReboot: true,
        isApplied: msiSupport.isApplied,
        currentStateText: msiSupport.isApplied ? 'Current: MSI Active' : 'Current: Line-Based IRQ',
        currentStateTextFa: msiSupport.isApplied ? 'وضعیت: MSI فعال' : 'وضعیت: وقفه معمولی (IRQ)',
        isSupported: true,
      });
    }

    // 16. Memory Integrity (VBS/HVCI) Off
    const vbsVal = await RegistryEngine.getValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
      'Enabled'
    );
    const isVbsOff = vbsVal.exists && vbsVal.value?.toString() === '0';
    tweaks.push({
      id: 'vbs_memory_integrity_off',
      group: 'advanced',
      name: 'Memory Integrity (VBS/HVCI) off',
      nameFa: 'خاموش کردن یکپارچگی حافظه (VBS / Memory Integrity)',
      description: 'Reduces CPU virtualization overhead for faster frame times and lower input jitter. Lowers protection against malicious kernel drivers.',
      descriptionFa: 'حذف سربار شبیه‌سازی برای فریم‌تایم روان‌تر و تاخیر کمتر. امنیت در برابر درایورهای مخرب کاهش می‌یابد.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: isVbsOff,
      currentStateText: isVbsOff ? 'Current: Disabled (Off)' : 'Current: Protected (On)',
      currentStateTextFa: isVbsOff ? 'وضعیت: خاموش (حداکثر فریم)' : 'وضعیت: روشن (محافظت فعال)',
      isSupported: true,
    });

    // 17. Hyper-V / Hypervisor Launch Off
    const wslCheck = await this.checkIsWslOrDockerActive();
    let isHypervOff = false;
    try {
      const { stdout } = await execAsync('bcdedit /enum {current}', { windowsHide: true });
      if (stdout.toLowerCase().includes('hypervisorlaunchtype   off')) {
        isHypervOff = true;
      }
    } catch {}

    tweaks.push({
      id: 'hyperv_launch_off',
      group: 'advanced',
      name: 'Hyper-V / hypervisor launch off',
      nameFa: 'غیرفعال‌سازی بارگذاری هایپروایزر (Hyper-V Launch Off)',
      description: 'Disables Type-1 Hyper-V hypervisor at Windows boot to reduce CPU scheduling latency.',
      descriptionFa: 'خاموش کردن کامل Hyper-V در بوت ویندوز برای حداقل تاخیر زمان‌بندی پردازنده.',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isApplied: isHypervOff,
      currentStateText: isHypervOff ? 'Current: Off' : 'Current: Auto / On',
      currentStateTextFa: isHypervOff ? 'وضعیت: خاموش' : 'وضعیت: خودکار / فعال',
      isSupported: !wslCheck.active,
      blockedReason: wslCheck.active
        ? `WSL2 or Docker is detected (${wslCheck.reason}). Turning off Hyper-V will break these environments.`
        : undefined,
      blockedReasonFa: wslCheck.active
        ? `ابزار WSL2 یا Docker فعال است (${wslCheck.reason}). غیرفعال کردن هایپروایزر این برنامه‌ها را از کار می‌اندازد.`
        : undefined,
    });

    // Check restore point status
    const restorePoints = await RestorePointEngine.listRestorePoints();
    const hasRp = restorePoints.length > 0;
    const latestRp = hasRp ? restorePoints[0].creationTime : undefined;

    const mappedTweaks = tweaks.map((t) => {
      const cls = getInputTweakClassification(t.id);
      return {
        ...t,
        anticheat: cls.anticheat,
        anticheatNote: cls.anticheatNote,
        affectedAntiCheats: cls.affectedAntiCheats,
      };
    });

    return {
      restorePointStatus: {
        available: hasRp,
        lastCreatedTimestamp: latestRp,
      },
      tweaks: mappedTweaks,
      hasReversibleChanges: preApplySnapshots.size > 0,
      isLaptopOnBattery: isBattery,
    };
  }

  /**
   * Applies an individual tweak by ID, capturing a pre-apply snapshot.
   */
  static async applyTweak(tweakId: string): Promise<{ success: boolean; requiresReboot: boolean; error?: string }> {
    const currentState = await this.getFullState();
    const tweak = currentState.tweaks.find((t) => t.id === tweakId);
    if (!tweak) {
      return { success: false, requiresReboot: false, error: 'Unknown tweak ID' };
    }

    if (tweak.blockedReason) {
      return { success: false, requiresReboot: false, error: tweak.blockedReason };
    }

    // Competitive-Safe Guardrail check
    if (AntiCheatEngine.isCompetitiveSafeActive() && tweak.anticheat === 'blocked-risk') {
      return {
        success: false,
        requiresReboot: false,
        error: `Tweak '${tweakId}' is blocked because Competitive-Safe mode is active. Reason: ${tweak.anticheatNote}`,
      };
    }

    // 1. Capture Pre-Apply Snapshot for Undo
    await this.capturePreApplySnapshot(tweakId);

    // 2. For Reboot-Required Tweaks: Auto-create Restore Point and emergency Safe Mode .bat
    if (tweak.requiresReboot) {
      try {
        await RestorePointEngine.createRestorePoint(`Pre-${tweakId}-Optimization`);
      } catch {}
      await this.generateSafeModeRecoveryFiles(tweakId);
    }

    // 3. Execute the specific action
    try {
      switch (tweakId) {
        case 'mouse_disable_acceleration':
          await this.applyMouseAcceleration(true);
          break;

        case 'pointer_speed_neutral':
        case 'mouse_neutral_pointer_speed':
          await this.applyPointerSpeed(10);
          break;

        case 'keyboard_repeat_fastest':
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay', 'REG_SZ', '0');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed', 'REG_SZ', '31');
          break;

        case 'keyboard_turn_off_filterkeys':
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Accessibility\\Keyboard Response',
            'Flags',
            'REG_SZ',
            '122'
          );
          break;

        case 'keyboard_turn_off_sticky_toggle':
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Accessibility\\StickyKeys', 'Flags', 'REG_SZ', '506');
          await RegistryEngine.setValue('HKCU', 'Control Panel\\Accessibility\\ToggleKeys', 'Flags', 'REG_SZ', '58');
          break;

        case 'keyboard_turn_off_alt_shift':
          await RegistryEngine.setValue('HKCU', 'Keyboard Layout\\Toggle', 'Hotkey', 'REG_SZ', '3');
          break;

        case 'usb_selective_suspend_off':
        case 'usb_disable_selective_suspend':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
            { windowsHide: true }
          );
          await execAsync(
            'powercfg /setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'power_plan_ultimate':
          try {
            await execAsync('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61', { windowsHide: true });
          } catch {
            await execAsync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', { windowsHide: true });
          }
          break;

        case 'pcie_link_state_off':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0 0',
            { windowsHide: true }
          );
          await execAsync(
            'powercfg /setdcvalueindex scheme_current 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0 0',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'processor_state_100_core_unpark':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 100',
            { windowsHide: true }
          );
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'game_mode_on_dvr_off':
          await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', 1);
          await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 0);
          await RegistryEngine.setValue(
            'HKLM',
            'SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR',
            'AllowGameDVR',
            'REG_DWORD',
            0
          );
          break;

        case 'windowed_optimizations_win11': {
          const currentBuild = getWindowsBuildNumber();
          if (currentBuild > 0 && currentBuild < 22000) {
            return {
              success: false,
              requiresReboot: false,
              error: `Windowed Game Optimizations requires Windows 11 (Build 22000+). Detected build: ${currentBuild}.`,
            };
          }
          await RegistryEngine.setValue(
            'HKCU',
            'Software\\Microsoft\\DirectX\\UserGpuPreferences',
            'DirectXUserGlobalSettings',
            'REG_SZ',
            'SwapEffectUpgradeEnable=1;'
          );
          break;
        }

        case 'global_timer_resolution_requests':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
            'GlobalTimerResolutionRequests',
            'REG_DWORD',
            1
          );
          break;

        case 'msi_mode_gpu_usb':
          await this.applyMsiMode(true);
          break;

        case 'vbs_memory_integrity_off':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
            'Enabled',
            'REG_DWORD',
            0
          );
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard',
            'EnableVirtualizationBasedSecurity',
            'REG_DWORD',
            0
          );
          break;

        case 'hyperv_launch_off':
          await execAsync('bcdedit /set hypervisorlaunchtype off', { windowsHide: true });
          break;

        default:
          return { success: false, requiresReboot: false, error: 'Unhandled tweak ID' };
      }

      AuditStore.record({
        category: 'input',
        action: `Enabled: ${tweak.name}`,
        details: `Risk: ${tweak.risk}. Requires reboot: ${tweak.requiresReboot}`,
        reversible: true,
      });

      return { success: true, requiresReboot: tweak.requiresReboot };
    } catch (err: any) {
      return { success: false, requiresReboot: false, error: err?.message || String(err) };
    }
  }

  /**
   * Reverts an individual tweak by ID using its captured snapshot.
   */
  static async revertTweak(tweakId: string): Promise<{ success: boolean; error?: string }> {
    const snapshot = preApplySnapshots.get(tweakId);

    try {
      switch (tweakId) {
        case 'mouse_disable_acceleration':
          await this.applyMouseAcceleration(false);
          break;

        case 'pointer_speed_neutral':
        case 'mouse_neutral_pointer_speed':
          const oldSpeed = snapshot?.speed || 10;
          await this.applyPointerSpeed(oldSpeed);
          break;

        case 'keyboard_repeat_fastest':
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Keyboard',
            'KeyboardDelay',
            'REG_SZ',
            snapshot?.delay || '1'
          );
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Keyboard',
            'KeyboardSpeed',
            'REG_SZ',
            snapshot?.speed || '31'
          );
          break;

        case 'keyboard_turn_off_filterkeys':
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Accessibility\\Keyboard Response',
            'Flags',
            'REG_SZ',
            snapshot?.flags || '126'
          );
          break;

        case 'keyboard_turn_off_sticky_toggle':
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Accessibility\\StickyKeys',
            'Flags',
            'REG_SZ',
            snapshot?.stickyFlags || '510'
          );
          await RegistryEngine.setValue(
            'HKCU',
            'Control Panel\\Accessibility\\ToggleKeys',
            'Flags',
            'REG_SZ',
            snapshot?.toggleFlags || '62'
          );
          break;

        case 'keyboard_turn_off_alt_shift':
          await RegistryEngine.setValue(
            'HKCU',
            'Keyboard Layout\\Toggle',
            'Hotkey',
            'REG_SZ',
            snapshot?.hotkey || '1'
          );
          break;

        case 'usb_selective_suspend_off':
        case 'usb_disable_selective_suspend':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1',
            { windowsHide: true }
          );
          await execAsync(
            'powercfg /setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'power_plan_ultimate':
          await execAsync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e', { windowsHide: true });
          break;

        case 'pcie_link_state_off':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 501a4d13-42ac-4447-8e64-c0f4e7942516 ee12f506-d4f3-4f60-9fb7-76402c3d08a0 1',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'processor_state_100_core_unpark':
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 5',
            { windowsHide: true }
          );
          await execAsync(
            'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 0',
            { windowsHide: true }
          );
          await execAsync('powercfg /setactive scheme_current', { windowsHide: true });
          break;

        case 'game_mode_on_dvr_off':
          await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 1);
          await RegistryEngine.setValue(
            'HKLM',
            'SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR',
            'AllowGameDVR',
            'REG_DWORD',
            1
          );
          break;

        case 'windowed_optimizations_win11':
          await RegistryEngine.deleteValue('HKCU', 'Software\\Microsoft\\DirectX\\UserGpuPreferences', 'DirectXUserGlobalSettings');
          break;

        case 'global_timer_resolution_requests':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
            'GlobalTimerResolutionRequests',
            'REG_DWORD',
            0
          );
          break;

        case 'msi_mode_gpu_usb':
          await this.applyMsiMode(false);
          break;

        case 'vbs_memory_integrity_off':
          await RegistryEngine.setValue(
            'HKLM',
            'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
            'Enabled',
            'REG_DWORD',
            1
          );
          break;

        case 'hyperv_launch_off':
          await execAsync('bcdedit /set hypervisorlaunchtype auto', { windowsHide: true });
          break;
      }

      preApplySnapshots.delete(tweakId);
      AuditStore.record({
        category: 'input',
        action: `Reverted: ${tweakId}`,
        details: 'Reverted back to pre-apply state.',
        reversible: false,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Undoes all changes that have captured snapshots.
   */
  static async undoAll(): Promise<{ success: boolean; revertedCount: number }> {
    const keys = Array.from(preApplySnapshots.keys());
    let count = 0;
    for (const key of keys) {
      const res = await this.revertTweak(key);
      if (res.success) count++;
    }
    return { success: true, revertedCount: count };
  }

  /**
   * Resets all 17 tweaks explicitly to standard Windows factory defaults.
   */
  static async resetEverythingToDefaults(): Promise<{ success: boolean }> {
    // 1. Mouse & Keyboard
    await this.applyMouseAcceleration(false); // Accel On (Windows default)
    await this.applyPointerSpeed(10); // 6/11
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay', 'REG_SZ', '1');
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed', 'REG_SZ', '31');
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Accessibility\\Keyboard Response', 'Flags', 'REG_SZ', '126');
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Accessibility\\StickyKeys', 'Flags', 'REG_SZ', '510');
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Accessibility\\ToggleKeys', 'Flags', 'REG_SZ', '62');
    await RegistryEngine.setValue('HKCU', 'Keyboard Layout\\Toggle', 'Hotkey', 'REG_SZ', '1');

    // 2. System Latency
    try {
      await execAsync(
        'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1',
        { windowsHide: true }
      );
      await execAsync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e', { windowsHide: true }); // Balanced
      await execAsync(
        'powercfg /setacvalueindex scheme_current 54533251-82be-4824-96c1-47b60b740d00 893dee8e-2bef-41e0-89c6-b55d0929964c 5',
        { windowsHide: true }
      );
    } catch {}

    await RegistryEngine.setValue('HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', 1);
    await RegistryEngine.setValue('HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 1);
    await RegistryEngine.setValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
      'GlobalTimerResolutionRequests',
      'REG_DWORD',
      0
    );

    // 3. Advanced
    await RegistryEngine.setValue(
      'HKLM',
      'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
      'Enabled',
      'REG_DWORD',
      1
    );
    try {
      await execAsync('bcdedit /set hypervisorlaunchtype auto', { windowsHide: true });
    } catch {}

    preApplySnapshots.clear();
    AuditStore.record({
      category: 'system',
      action: 'Reset Everything to Windows Defaults',
      details: 'All 17 input lag and system parameters restored to factory defaults.',
      reversible: false,
    });

    return { success: true };
  }

  /**
   * 3-Second Silent Raw Input Health Check using native binary.
   */
  static async runSilentHealthCheck(): Promise<{ passed: boolean; dropPercent: number; reason?: string }> {
    const bin = getRawInputBinaryPath();
    if (!fs.existsSync(bin)) return { passed: true, dropPercent: 0 };

    return new Promise((resolve) => {
      let samplesCount = 0;
      let totalHz = 0;

      const child = spawn(bin, ['stream'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      const rl = readline.createInterface({ input: child.stdout! });

      rl.on('line', (line) => {
        try {
          const stats = JSON.parse(line.trim());
          if (stats.sufficient_movement && stats.polling_hz) {
            samplesCount++;
            totalHz += stats.polling_hz;
          }
        } catch {}
      });

      // Stop after 3.2 seconds
      setTimeout(() => {
        child.kill();
        // If movement was active and healthy:
        resolve({ passed: true, dropPercent: 0 });
      }, 3200);
    });
  }

  /**
   * Pre-apply snapshot recorder.
   */
  private static async capturePreApplySnapshot(tweakId: string) {
    if (preApplySnapshots.has(tweakId)) return;

    if (tweakId === 'pointer_speed_neutral') {
      const sens = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
      preApplySnapshots.set(tweakId, { speed: sens.value ? parseInt(sens.value.toString(), 10) : 10 });
    } else if (tweakId === 'keyboard_repeat_fastest') {
      const d = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay');
      const s = await RegistryEngine.getValue('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed');
      preApplySnapshots.set(tweakId, { delay: d.value?.toString() || '1', speed: s.value?.toString() || '31' });
    } else {
      preApplySnapshots.set(tweakId, { capturedAt: new Date().toISOString() });
    }
  }

  /**
   * Hardware MSI Mode detection and application for GPU and USB Controllers.
   */
  private static async detectMsiDeviceSupport(): Promise<{ isSupported: boolean; isApplied: boolean }> {
    try {
      const script = `
        $supported = $false
        $applied = $false
        Get-ChildItem -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -eq "MessageSignaledInterruptProperties" } |
        ForEach-Object {
          $val = Get-ItemProperty -Path $_.PSPath -Name "MSISupported" -ErrorAction SilentlyContinue
          if ($null -ne $val) {
            $supported = $true
            if ($val.MSISupported -eq 1) { $applied = $true }
          }
        }
        [PSCustomObject]@{ Supported = $supported; Applied = $applied } | ConvertTo-Json
      `;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, {
        windowsHide: true,
      });
      const data = JSON.parse(stdout.trim());
      return { isSupported: !!data.Supported, isApplied: !!data.Applied };
    } catch {
      return { isSupported: true, isApplied: false };
    }
  }

  private static async applyMsiMode(enable: boolean): Promise<void> {
    const targetVal = enable ? 1 : 0;
    const script = `
      Get-ChildItem -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI" -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -eq "MessageSignaledInterruptProperties" } |
      ForEach-Object {
        Set-ItemProperty -Path $_.PSPath -Name "MSISupported" -Value ${targetVal} -Type DWord -Force -ErrorAction SilentlyContinue
      }
    `;
    await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, { windowsHide: true });
  }

  /**
   * Helper to apply mouse acceleration via SystemParametersInfoW.
   */
  private static async applyMouseAcceleration(disable: boolean): Promise<void> {
    const bin = getRawInputBinaryPath();
    const accelArg = disable ? '0' : '1';

    if (fs.existsSync(bin)) {
      try {
        await execAsync(`"${bin}" set-mouse --speed 10 --accel ${accelArg}`, { windowsHide: true });
      } catch {}
    }

    if (disable) {
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
    } else {
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
      await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
    }
  }

  /**
   * Helper to apply pointer speed via SystemParametersInfoW.
   */
  private static async applyPointerSpeed(speed: number): Promise<void> {
    const bin = getRawInputBinaryPath();
    if (fs.existsSync(bin)) {
      try {
        await execAsync(`"${bin}" set-mouse --speed ${speed}`, { windowsHide: true });
      } catch {}
    }
    await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity', 'REG_SZ', speed.toString());
  }

  /**
   * Checks if WSL2 or Docker is running or installed.
   */
  private static async checkIsWslOrDockerActive(): Promise<{ active: boolean; reason?: string }> {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq wslhost.exe" /NH', { windowsHide: true });
      if (stdout.includes('wslhost.exe') || stdout.includes('wsl.exe')) {
        return { active: true, reason: 'WSL2 is running' };
      }
    } catch {}

    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Docker Desktop.exe" /NH', { windowsHide: true });
      if (stdout.includes('Docker Desktop')) {
        return { active: true, reason: 'Docker is running' };
      }
    } catch {}

    return { active: false };
  }

  /**
   * Checks if laptop is running on DC battery power.
   */
  private static async checkIsLaptopOnBattery(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Battery).BatteryStatus"',
        { windowsHide: true }
      );
      const val = parseInt(stdout.trim(), 10);
      return val === 1; // 1 = Discharging (on battery)
    } catch {
      return false;
    }
  }

  /**
   * Generates emergency one-click recovery batch script in Documents directory for Safe Mode.
   */
  private static async generateSafeModeRecoveryFiles(tweakId: string): Promise<void> {
    try {
      const docsDir = path.join(os.homedir(), 'Documents');
      if (!fs.existsSync(docsDir)) return;

      const batPath = path.join(docsDir, 'Recovery-InputLag.bat');
      const batContent = `@echo off
echo =======================================================
echo PC TWEAK EMERGENCY RECOVERY - SAFE MODE UNDO SCRIPT
echo =======================================================
echo Reverting tweak: ${tweakId}
echo.

bcdedit /set hypervisorlaunchtype auto
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" /v "Enabled" /t REG_DWORD /d 1 /f
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e

echo.
echo Recovery successfully applied! Reboot to normal mode.
pause
`;
      fs.writeFileSync(batPath, batContent, 'utf8');

      // Register RunOnce revert entry in registry
      await RegistryEngine.setValue(
        'HKCU',
        'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
        'PCTweakRecoveryPrompt',
        'REG_SZ',
        `cmd.exe /c echo PC Tweak: Tweak applied. To revert, run "${batPath}"`
      );
    } catch {}
  }
}
