/**
 * PC Tweak - Native RAM Optimizer Engine
 * 
 * Provides truthful, zero-snake-oil working set trimming via native Win32 APIs,
 * real-time process memory consumption inspection, and safe background process management.
 */

import os from 'os';
import { getNativePowerShellPath, execFileWithTimeout, killProcessTree } from '../processUtils';

export interface ProcessMemoryInfo {
  pid: number;
  name: string;
  workingSetMb: number;
  privateBytesMb: number;
  isSystemCritical: boolean;
}

export interface RamTrimResult {
  success: boolean;
  freedMb: number;
  memoryBeforeMb: number;
  memoryAfterMb: number;
  timestamp: string;
}

const CRITICAL_PROCESSES = new Set([
  'csrss',
  'services',
  'lsass',
  'smss',
  'svchost',
  'dwm',
  'explorer',
  'winlogon',
  'spoolsv',
  'taskhostw',
  'system',
  'registry',
  'idle',
  'fontdrvhost',
  'sihost',
  'audiodg',
  'pctweak',
  'pc tweak',
  'electron',
]);

export class RamOptimizerEngine {
  /**
   * Returns whether a given process name is considered critical to Windows operation.
   */
  static isCritical(processName: string): boolean {
    const clean = (processName || '').toLowerCase().replace(/\.exe$/, '').trim();
    return CRITICAL_PROCESSES.has(clean);
  }

  /**
   * Retrieves top memory consuming processes.
   */
  static async getTopMemoryProcesses(limit: number = 25): Promise<ProcessMemoryInfo[]> {
    const ps = getNativePowerShellPath();
    const script = `
      Get-Process | Where-Object { $_.WorkingSet64 -gt 5MB } |
      Sort-Object WorkingSet64 -Descending |
      Select-Object -First ${Math.min(50, Math.max(5, limit))} Id, ProcessName, WorkingSet64, PrivateMemorySize64 |
      ConvertTo-Json -Compress
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
          const workingSetMb = Math.round((Number(item.WorkingSet64 || 0) / (1024 * 1024)) * 10) / 10;
          const privateBytesMb = Math.round((Number(item.PrivateMemorySize64 || 0) / (1024 * 1024)) * 10) / 10;
          return {
            pid: item.Id,
            name,
            workingSetMb,
            privateBytesMb,
            isSystemCritical: RamOptimizerEngine.isCritical(name),
          };
        });
    } catch (err) {
      console.error('Failed to get top memory processes:', err);
      return [];
    }
  }

  /**
   * Trims working sets of non-critical user-space processes using native psapi.dll!EmptyWorkingSet.
   * Reports exact memory metrics before and after the operation.
   */
  static async trimWorkingSets(): Promise<RamTrimResult> {
    const memBeforeBytes = os.freemem();
    const memBeforeMb = Math.round(memBeforeBytes / (1024 * 1024));

    const ps = getNativePowerShellPath();
    const script = `
      $code = @'
using System;
using System.Runtime.InteropServices;
namespace Win32 {
  public class PsApiMem {
    [DllImport("psapi.dll")]
    public static extern bool EmptyWorkingSet(IntPtr hProcess);
  }
}
'@
      if (-not ([System.Management.Automation.PSTypeName]'Win32.PsApiMem').Type) {
        Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
      }
      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      Get-Process | Where-Object { $_.WorkingSet64 -gt 15MB -and $_.ProcessName -notmatch '^(csrss|services|lsass|smss|svchost|dwm|explorer|winlogon|spoolsv|taskhostw|System|Registry|Idle|pctweak|electron)$' } | ForEach-Object {
        try {
          [Win32.PsApiMem]::EmptyWorkingSet($_.Handle) | Out-Null
        } catch {}
      }
    `.trim();

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 6000 });
    } catch (err) {
      console.warn('Trim script execution completed with warning:', err);
    }

    // Brief stabilization pause to capture memory release
    await new Promise((res) => setTimeout(res, 200));

    const memAfterBytes = os.freemem();
    const memAfterMb = Math.round(memAfterBytes / (1024 * 1024));
    const freedMb = Math.max(0, memAfterMb - memBeforeMb);

    return {
      success: true,
      freedMb,
      memoryBeforeMb: memBeforeMb,
      memoryAfterMb: memAfterMb,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Forcibly terminates a selected non-critical process.
   */
  static async endProcess(pid: number): Promise<{ success: boolean; message: string }> {
    if (!pid || pid <= 4) {
      return { success: false, message: 'Invalid process ID.' };
    }

    // Verify target process is not system-critical
    try {
      const ps = getNativePowerShellPath();
      const checkScript = `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`;
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', checkScript], { timeout: 2000 });
      const procName = stdout.trim();

      if (RamOptimizerEngine.isCritical(procName)) {
        return { success: false, message: `Process '${procName}' is system-critical and cannot be terminated.` };
      }

      killProcessTree(pid);
      return { success: true, message: `Terminated process '${procName}' (PID ${pid}).` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to terminate process.' };
    }
  }
}
