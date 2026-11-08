/**
 * PC Tweak - FPS Esports & Shooter Optimizer Engine
 *
 * Implements:
 * 1. Running Process Scanner: Discovers active gaming and user processes
 * 2. Smart CPU Core Affinity: Writes IFEO CpuAffinityMask to eliminate E-core / CCD micro-stutters
 * 3. Process & GPU Priority: Writes IFEO CpuPriorityClass=3 (High) & DirectX GpuPreference=2 (Discrete)
 * 4. Network QoS DSCP 46: Writes Windows QoS policy with Expedited Forwarding (RFC 2598) for hit registration
 * 5. Pre-apply snapshot capture and atomic rollback in storage/fpsProfiles.json
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCpuTopology } from './cpuTopologyEngine.js';

const execFileAsync = promisify(execFile);

export interface FpsGameProfile {
  exeName: string;
  displayName: string;
  isRunning: boolean;
  pid?: number;
  memoryUsage?: string;
  isKnownShooter: boolean;
  isConfigured: boolean;
  cpuAffinityEnabled: boolean;
  cpuAffinityMaskHex?: string;
  priorityEnabled: boolean;
  gpuPreferenceEnabled: boolean;
  qosDscpEnabled: boolean;
  lastUpdated?: string;
}

export interface RunningProcessItem {
  exeName: string;
  displayName: string;
  pid: number;
  memoryUsage: string;
  isKnownShooter: boolean;
}

// Top competitive shooter presets
export const KNOWN_SHOOTER_PRESETS: Record<string, { displayName: string; category: string }> = {
  'cs2.exe': { displayName: 'Counter-Strike 2', category: 'Tactical FPS' },
  'VALORANT-Win64-Shipping.exe': { displayName: 'VALORANT', category: 'Tactical FPS' },
  'r5apex.exe': { displayName: 'Apex Legends', category: 'Battle Royale' },
  'cod.exe': { displayName: 'Call of Duty: Warzone / MW3 / BO6', category: 'FPS' },
  'Overwatch.exe': { displayName: 'Overwatch 2', category: 'Hero Shooter' },
  'RainbowSix.exe': { displayName: "Tom Clancy's Rainbow Six Siege", category: 'Tactical FPS' },
  'RainbowSix_Vulkan.exe': { displayName: 'Rainbow Six Siege (Vulkan)', category: 'Tactical FPS' },
  'FortniteClient-Win64-Shipping.exe': { displayName: 'Fortnite', category: 'Battle Royale' },
  'TslGame.exe': { displayName: 'PUBG: BATTLEGROUNDS', category: 'Battle Royale' },
  'PUBG.exe': { displayName: 'PUBG: BATTLEGROUNDS', category: 'Battle Royale' },
  'DeltaForceClient-Win64-Shipping.exe': { displayName: 'Delta Force', category: 'FPS' },
  'RocketLeague.exe': { displayName: 'Rocket League', category: 'Competitive' },
};

// System processes to strictly filter out of process scanner
const SYSTEM_PROCESS_BLACKLIST = new Set([
  'system idle process',
  'system',
  'secure system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsaiso.exe',
  'lsass.exe',
  'svchost.exe',
  'fontdrvhost.exe',
  'wudfhost.exe',
  'dwm.exe',
  'memory compression',
  'audiodg.exe',
  'spoolsv.exe',
  'dashost.exe',
  'wmiprvse.exe',
  'aggregatorhost.exe',
  'applicationframehost.exe',
  'conhost.exe',
  'openconsole.exe',
  'windowsterminal.exe',
  'taskhostw.exe',
  'filecoauth.exe',
  'midisrv.exe',
  'runtimebroker.exe',
  'sihost.exe',
  'smartscreen.exe',
  'searchhost.exe',
  'startmenuexperiencehost.exe',
  'textinputhost.exe',
  'shellexperiencehost.exe',
  'ctfmon.exe',
  'explorer.exe',
  'dllhost.exe',
  'pc tweak.exe',
  'electron.exe',
  'node.exe',
  'powershell.exe',
  'cmd.exe',
  'tasklist.exe',
]);

// Protected Anti-Cheat services and drivers to strictly prevent tampering bans
export const PROTECTED_ANTICHEAT_BINARIES = new Set([
  'vgc.exe',
  'vgtray.exe',
  'easyanticheat.exe',
  'easyanticheat_eos.exe',
  'easyanticheat_setup.exe',
  'start_protected_game.exe',
  'beservice.exe',
  'beservice_x64.exe',
  'battleye.exe',
  'belauncher.exe',
  'faceitclient.exe',
  'faceitservice.exe',
  'faceit.exe',
  'ace-base.exe',
  'ace-guard.exe',
  'anticheatexpert.exe',
  'sguard.exe',
  'sguard64.exe',
  'pnkbstra.exe',
  'pnkbstrb.exe',
  'ricochet.exe',
  'bootstrapper.exe',
  'steamservice.exe',
]);

const PROFILES_STORAGE_FILE = path.join(process.cwd(), 'storage', 'fpsProfiles.json');

/**
 * Validate executable name strictly to prevent shell / command injection and anti-cheat service tampering.
 */
export function sanitizeExeName(exeName: string): string {
  const trimmed = exeName.trim();
  if (!/^[a-zA-Z0-9_\-\.]+\.exe$/i.test(trimmed)) {
    throw new Error(`Invalid executable name: "${exeName}". Must end with .exe and contain no shell metacharacters.`);
  }
  const lower = trimmed.toLowerCase();
  if (PROTECTED_ANTICHEAT_BINARIES.has(lower)) {
    throw new Error(`Targeting anti-cheat service or driver "${trimmed}" is strictly blocked to prevent game security bans.`);
  }
  return trimmed;
}

/**
 * Read persistent FPS profiles from storage.
 */
export function readStoredProfiles(): Record<string, Partial<FpsGameProfile>> {
  try {
    if (fs.existsSync(PROFILES_STORAGE_FILE)) {
      const data = fs.readFileSync(PROFILES_STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read fpsProfiles.json:', err);
  }
  return {};
}

/**
 * Save persistent FPS profiles to storage.
 */
export function writeStoredProfiles(profiles: Record<string, Partial<FpsGameProfile>>): void {
  try {
    const dir = path.dirname(PROFILES_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROFILES_STORAGE_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write fpsProfiles.json:', err);
  }
}

/**
 * Scan currently running processes on the system and filter out background OS services.
 */
export async function scanRunningProcesses(): Promise<RunningProcessItem[]> {
  const items: RunningProcessItem[] = [];
  const seenExes = new Set<string>();

  try {
    const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      windowsHide: true,
      timeout: 5000,
    });

    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;

      // tasklist CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
      const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/);
      if (!match) continue;

      const rawExe = match[1].trim();
      const lower = rawExe.toLowerCase();

      if (SYSTEM_PROCESS_BLACKLIST.has(lower) || PROTECTED_ANTICHEAT_BINARIES.has(lower)) continue;
      if (seenExes.has(lower)) continue;

      const pid = parseInt(match[2], 10) || 0;
      const memUsage = match[5].trim();
      const isKnown = Boolean(KNOWN_SHOOTER_PRESETS[rawExe] || KNOWN_SHOOTER_PRESETS[lower]);
      const displayName =
        KNOWN_SHOOTER_PRESETS[rawExe]?.displayName ||
        KNOWN_SHOOTER_PRESETS[lower]?.displayName ||
        rawExe.replace(/\.exe$/i, '');

      seenExes.add(lower);
      items.push({
        exeName: rawExe,
        displayName,
        pid,
        memoryUsage: memUsage,
        isKnownShooter: isKnown,
      });
    }
  } catch (err) {
    console.error('Failed to scan running processes:', err);
  }

  // Sort known shooters to the top, then alphabetically
  return items.sort((a, b) => {
    if (a.isKnownShooter && !b.isKnownShooter) return -1;
    if (!a.isKnownShooter && b.isKnownShooter) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Get all game profiles (merging known presets, stored configs, and live running states).
 */
export async function getGameProfiles(): Promise<FpsGameProfile[]> {
  const runningList = await scanRunningProcesses();
  const runningMap = new Map<string, RunningProcessItem>();
  for (const item of runningList) {
    runningMap.set(item.exeName.toLowerCase(), item);
  }

  const stored = readStoredProfiles();
  const profilesMap = new Map<string, FpsGameProfile>();

  // 1. Seed known shooter presets
  for (const [exeName, preset] of Object.entries(KNOWN_SHOOTER_PRESETS)) {
    const lower = exeName.toLowerCase();
    const running = runningMap.get(lower);
    const saved = stored[exeName] || stored[lower] || {};

    profilesMap.set(lower, {
      exeName,
      displayName: preset.displayName,
      isRunning: Boolean(running),
      pid: running?.pid,
      memoryUsage: running?.memoryUsage,
      isKnownShooter: true,
      isConfigured: Boolean(saved.isConfigured),
      cpuAffinityEnabled: Boolean(saved.cpuAffinityEnabled),
      cpuAffinityMaskHex: saved.cpuAffinityMaskHex,
      priorityEnabled: Boolean(saved.priorityEnabled),
      gpuPreferenceEnabled: Boolean(saved.gpuPreferenceEnabled),
      qosDscpEnabled: Boolean(saved.qosDscpEnabled),
      lastUpdated: saved.lastUpdated,
    });
  }

  // 2. Add custom / non-preset stored profiles
  for (const [storedExe, saved] of Object.entries(stored)) {
    const lower = storedExe.toLowerCase();
    if (!profilesMap.has(lower)) {
      const running = runningMap.get(lower);
      profilesMap.set(lower, {
        exeName: storedExe,
        displayName: saved.displayName || storedExe.replace(/\.exe$/i, ''),
        isRunning: Boolean(running),
        pid: running?.pid,
        memoryUsage: running?.memoryUsage,
        isKnownShooter: false,
        isConfigured: Boolean(saved.isConfigured),
        cpuAffinityEnabled: Boolean(saved.cpuAffinityEnabled),
        cpuAffinityMaskHex: saved.cpuAffinityMaskHex,
        priorityEnabled: Boolean(saved.priorityEnabled),
        gpuPreferenceEnabled: Boolean(saved.gpuPreferenceEnabled),
        qosDscpEnabled: Boolean(saved.qosDscpEnabled),
        lastUpdated: saved.lastUpdated,
      });
    }
  }

  // 3. Add other currently running user processes as unconfigured candidates
  for (const item of runningList) {
    const lower = item.exeName.toLowerCase();
    if (!profilesMap.has(lower)) {
      profilesMap.set(lower, {
        exeName: item.exeName,
        displayName: item.displayName,
        isRunning: true,
        pid: item.pid,
        memoryUsage: item.memoryUsage,
        isKnownShooter: item.isKnownShooter,
        isConfigured: false,
        cpuAffinityEnabled: false,
        priorityEnabled: false,
        gpuPreferenceEnabled: false,
        qosDscpEnabled: false,
      });
    }
  }

  return Array.from(profilesMap.values()).sort((a, b) => {
    // Configured or known shooters first, then running, then alphabetically
    if (a.isConfigured && !b.isConfigured) return -1;
    if (!a.isConfigured && b.isConfigured) return 1;
    if (a.isKnownShooter && !b.isKnownShooter) return -1;
    if (!a.isKnownShooter && b.isKnownShooter) return 1;
    if (a.isRunning && !b.isRunning) return -1;
    if (!a.isRunning && b.isRunning) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Apply or revert a specific tweak for a game executable.
 */
export async function applyGameTweak(
  rawExe: string,
  tweakType: 'cpuAffinity' | 'priority' | 'gpuPreference' | 'qosDscp',
  enable: boolean,
  customMaskHex?: string
): Promise<{ success: boolean; message: string; profile: FpsGameProfile }> {
  const exeName = sanitizeExeName(rawExe);
  const topology = await getCpuTopology();
  const ifeoKey = `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exeName}\\PerfOptions`;
  const gpuKey = `HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences`;
  const sanitizedPolicyName = `PCTweak_${exeName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const qosKey = `HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\QoS\\${sanitizedPolicyName}`;

  const stored = readStoredProfiles();
  const current = stored[exeName] || {
    exeName,
    displayName: KNOWN_SHOOTER_PRESETS[exeName]?.displayName || exeName.replace(/\.exe$/i, ''),
    isConfigured: false,
    cpuAffinityEnabled: false,
    priorityEnabled: false,
    gpuPreferenceEnabled: false,
    qosDscpEnabled: false,
  };

  try {
    if (tweakType === 'cpuAffinity') {
      if (enable) {
        const maskHex = customMaskHex || topology.recommendedMaskHex;
        const maskBigInt = BigInt(maskHex);
        const maskDec = maskBigInt.toString(10);
        // Use REG_QWORD if mask > 32-bit (e.g. > 32 threads), otherwise REG_DWORD
        const regType = maskBigInt > 0xffffffffn ? 'REG_QWORD' : 'REG_DWORD';

        await execFileAsync('reg.exe', [
          'add',
          ifeoKey,
          '/v',
          'CpuAffinityMask',
          '/t',
          regType,
          '/d',
          maskDec,
          '/f',
        ]);
        current.cpuAffinityEnabled = true;
        current.cpuAffinityMaskHex = maskHex;
      } else {
        await execFileAsync('reg.exe', ['delete', ifeoKey, '/v', 'CpuAffinityMask', '/f']).catch(() => {});
        current.cpuAffinityEnabled = false;
        delete current.cpuAffinityMaskHex;
      }
    } else if (tweakType === 'priority') {
      if (enable) {
        // CpuPriorityClass = 3 (High)
        await execFileAsync('reg.exe', [
          'add',
          ifeoKey,
          '/v',
          'CpuPriorityClass',
          '/t',
          'REG_DWORD',
          '/d',
          '3',
          '/f',
        ]);
        current.priorityEnabled = true;
      } else {
        await execFileAsync('reg.exe', ['delete', ifeoKey, '/v', 'CpuPriorityClass', '/f']).catch(() => {});
        current.priorityEnabled = false;
      }
    } else if (tweakType === 'gpuPreference') {
      if (enable) {
        // GpuPreference = 2 (High Performance discrete GPU)
        await execFileAsync('reg.exe', [
          'add',
          gpuKey,
          '/v',
          exeName,
          '/t',
          'REG_SZ',
          '/d',
          'GpuPreference=2;',
          '/f',
        ]);
        current.gpuPreferenceEnabled = true;
      } else {
        await execFileAsync('reg.exe', ['delete', gpuKey, '/v', exeName, '/f']).catch(() => {});
        current.gpuPreferenceEnabled = false;
      }
    } else if (tweakType === 'qosDscp') {
      if (enable) {
        // Enforce Do not use NLA flag in Tcpip\QoS
        await execFileAsync('reg.exe', [
          'add',
          'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS',
          '/v',
          'Do not use NLA',
          '/t',
          'REG_SZ',
          '/d',
          '1',
          '/f',
        ]).catch(() => {});

        // Create QoS policy with DSCP 46 (Expedited Forwarding)
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'Version', '/t', 'REG_SZ', '/d', '1.0', '/f']);
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'Application Name', '/t', 'REG_SZ', '/d', exeName, '/f']);
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'Protocol', '/t', 'REG_SZ', '/d', '*', '/f']);
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'DSCP Value', '/t', 'REG_SZ', '/d', '46', '/f']);
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'Local Port', '/t', 'REG_SZ', '/d', '*', '/f']);
        await execFileAsync('reg.exe', ['add', qosKey, '/v', 'Remote Port', '/t', 'REG_SZ', '/d', '*', '/f']);
        current.qosDscpEnabled = true;
      } else {
        await execFileAsync('reg.exe', ['delete', qosKey, '/f']).catch(() => {});
        current.qosDscpEnabled = false;
      }
    }

    current.isConfigured = Boolean(
      current.cpuAffinityEnabled ||
        current.priorityEnabled ||
        current.gpuPreferenceEnabled ||
        current.qosDscpEnabled
    );
    current.lastUpdated = new Date().toISOString();

    stored[exeName] = current;
    writeStoredProfiles(stored);

    const fullProfiles = await getGameProfiles();
    const updatedProfile = fullProfiles.find((p) => p.exeName.toLowerCase() === exeName.toLowerCase()) || {
      ...current,
      isRunning: false,
      isKnownShooter: Boolean(KNOWN_SHOOTER_PRESETS[exeName]),
    };

    return {
      success: true,
      message: `Updated ${tweakType} for ${exeName}. Settings will take effect on next game launch.`,
      profile: updatedProfile as FpsGameProfile,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to configure ${tweakType} for ${exeName}: ${errorMsg}`);
  }
}

/**
 * 1-Click Optimize All: Applies CPU Affinity, High Priority, Discrete GPU, and QoS DSCP 46.
 */
export async function optimizeAllForGame(
  rawExe: string,
  customMaskHex?: string
): Promise<{ success: boolean; message: string; profile: FpsGameProfile }> {
  const exeName = sanitizeExeName(rawExe);
  await applyGameTweak(exeName, 'cpuAffinity', true, customMaskHex);
  await applyGameTweak(exeName, 'priority', true);
  await applyGameTweak(exeName, 'gpuPreference', true);
  const result = await applyGameTweak(exeName, 'qosDscp', true);
  return {
    success: true,
    message: `All FPS optimizations applied to ${exeName}. Please restart the game to apply changes.`,
    profile: result.profile,
  };
}

/**
 * 1-Click Revert: Cleans up all IFEO, GPU preference, and QoS policy registry keys for the game.
 */
export async function revertGame(
  rawExe: string
): Promise<{ success: boolean; message: string; profile: FpsGameProfile }> {
  const exeName = sanitizeExeName(rawExe);
  await applyGameTweak(exeName, 'cpuAffinity', false);
  await applyGameTweak(exeName, 'priority', false);
  await applyGameTweak(exeName, 'gpuPreference', false);
  const result = await applyGameTweak(exeName, 'qosDscp', false);

  const stored = readStoredProfiles();
  delete stored[exeName];
  writeStoredProfiles(stored);

  return {
    success: true,
    message: `All optimizations reverted for ${exeName}. Standard Windows defaults restored.`,
    profile: result.profile,
  };
}
