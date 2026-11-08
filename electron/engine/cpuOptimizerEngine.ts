/**
 * PC Tweak - Native CPU Optimizer Engine
 * 
 * Manages Windows power plans (including Ultimate Performance unlocking),
 * inspects top CPU-consuming processes, manages process priorities, and tunes core parking settings.
 */

import { getNativePowerShellPath, execFileWithTimeout } from '../processUtils';
import { RamOptimizerEngine } from './ramOptimizerEngine';

export interface CpuPowerPlan {
  guid: string;
  name: string;
  isActive: boolean;
  isUltimate: boolean;
}

export interface ProcessCpuInfo {
  pid: number;
  name: string;
  cpuSeconds: number;
  priorityClass: string;
  isSystemCritical: boolean;
}

export class CpuOptimizerEngine {
  /**
   * Retrieves all available power plans and indicates which is currently active.
   */
  static async getPowerPlans(): Promise<CpuPowerPlan[]> {
    const ps = getNativePowerShellPath();
    const script = `powercfg /list`;

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 3000 });
      const lines = stdout.split(/\r?\n/);
      const plans: CpuPowerPlan[] = [];

      const regex = /GUID:\s*([a-f0-9-]+)\s+\(([^)]+)\)(\s+\*)?/i;

      for (const line of lines) {
        const match = line.match(regex);
        if (match) {
          const guid = match[1].trim();
          const name = match[2].trim();
          const isActive = Boolean(match[3]);
          const isUltimate =
            guid.toLowerCase() === 'e9a42b02-d5df-448d-aa00-03f14749eb61' ||
            name.toLowerCase().includes('ultimate');

          plans.push({
            guid,
            name,
            isActive,
            isUltimate,
          });
        }
      }

      return plans;
    } catch (err) {
      console.error('Failed to get power plans:', err);
      return [];
    }
  }

  /**
   * Activates a specified power plan by GUID.
   */
  static async setActivePowerPlan(guid: string): Promise<{ success: boolean; message: string }> {
    const cleanGuid = (guid || '').trim().replace(/[^a-f0-9-]/gi, '');
    if (!cleanGuid) {
      return { success: false, message: 'Invalid power plan GUID.' };
    }

    const ps = getNativePowerShellPath();
    const script = `powercfg /setactive ${cleanGuid}`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 3000 });
      return { success: true, message: `Activated power plan ${cleanGuid}.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to activate power plan.' };
    }
  }

  /**
   * Unlocks the Windows Ultimate Performance power plan and activates it.
   */
  static async unlockUltimatePerformance(): Promise<{ success: boolean; guid?: string; message: string }> {
    const ps = getNativePowerShellPath();
    const script = `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61`;

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 4000 });
      const match = stdout.match(/GUID:\s*([a-f0-9-]+)/i);
      const guid = match ? match[1].trim() : 'e9a42b02-d5df-448d-aa00-03f14749eb61';

      await this.setActivePowerPlan(guid);
      return {
        success: true,
        guid,
        message: 'Successfully unlocked and activated the Ultimate Performance power plan.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to unlock Ultimate Performance power scheme.',
      };
    }
  }

  /**
   * Retrieves top CPU consuming processes.
   */
  static async getTopCpuProcesses(limit: number = 20): Promise<ProcessCpuInfo[]> {
    const ps = getNativePowerShellPath();
    const script = `
      try {
        Get-Process | Where-Object { $_.CPU -gt 0.5 } |
        Sort-Object CPU -Descending |
        Select-Object -First ${Math.min(30, Math.max(5, limit))} Id, ProcessName, CPU, PriorityClass |
        ConvertTo-Json -Compress
      } catch {
        '[]'
      }
    `.trim();

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 4000 });
      if (!stdout || !stdout.trim()) return [];

      const parsed = JSON.parse(stdout.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items
        .filter((item: any) => item && typeof item.Id === 'number')
        .map((item: any) => {
          const name = String(item.ProcessName || 'Unknown');
          return {
            pid: item.Id,
            name,
            cpuSeconds: Math.round(Number(item.CPU || 0) * 10) / 10,
            priorityClass: String(item.PriorityClass || 'Normal'),
            isSystemCritical: RamOptimizerEngine.isCritical(name),
          };
        });
    } catch (err) {
      console.error('Failed to get CPU processes:', err);
      return [];
    }
  }

  /**
   * Sets the priority class of a process.
   */
  static async setProcessPriority(
    pid: number,
    priority: 'Idle' | 'BelowNormal' | 'Normal' | 'AboveNormal' | 'High'
  ): Promise<{ success: boolean; message: string }> {
    if (!pid || pid <= 4) {
      return { success: false, message: 'Invalid process ID.' };
    }

    const ps = getNativePowerShellPath();
    const script = `
      $proc = Get-Process -Id ${pid} -ErrorAction Stop
      $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priority}
    `.trim();

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 2500 });
      return { success: true, message: `Set process ${pid} priority to ${priority}.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update process priority.' };
    }
  }
}
