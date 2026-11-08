/**
 * PC Tweak - Native Scheduled Task Optimizer Engine
 * 
 * Analyzes Windows Task Scheduler tasks, flags orphaned tasks pointing to deleted binaries,
 * isolates diagnostic and telemetry background tasks, safeguards critical OS maintenance tasks,
 * and creates XML export snapshots in BackupStore prior to modification.
 */

import fs from 'fs';
import { getNativePowerShellPath, execFileWithTimeout } from '../processUtils';
import { BackupStore } from '../storage/backupStore';

export interface ScheduledTaskItem {
  taskPath: string;
  taskName: string;
  fullPath: string;
  state: 'Ready' | 'Running' | 'Disabled';
  actionExecutable: string;
  isOrphaned: boolean;
  isCritical: boolean;
  category: 'telemetry' | 'orphan' | 'updater' | 'maintenance' | 'system';
  recommendation: 'disable' | 'clean' | 'keep';
  descriptionKey: string;
}

const CRITICAL_TASK_PREFIXES = [
  '\\microsoft\\windows\\registry\\',
  '\\microsoft\\windows\\chkdsk\\',
  '\\microsoft\\windows\\bitlocker\\',
  '\\microsoft\\windows\\time synchronization\\',
  '\\microsoft\\windows\\systemrestore\\',
  '\\microsoft\\windows\\memorydiagnostic\\',
  '\\microsoft\\windows\\servicing\\',
];

const KNOWN_TELEMETRY_TASKS: Record<string, string> = {
  '\\microsoft\\windows\\customer experience improvement program\\consolidator': 'optimizer.tasks.consolidatorDesc',
  '\\microsoft\\windows\\customer experience improvement program\\usbceip': 'optimizer.tasks.usbceipDesc',
  '\\microsoft\\windows\\application experience\\microsoft compatibility appraiser': 'optimizer.tasks.appraiserDesc',
  '\\microsoft\\windows\\application experience\\programdataupdater': 'optimizer.tasks.programdataDesc',
  '\\microsoft\\windows\\diskdiagnostic\\microsoft-windows-diskdiagnosticdatacollector': 'optimizer.tasks.diskdiagDesc',
  '\\microsoft\\windows\\feedback\\siuf\\dmclient': 'optimizer.tasks.dmclientDesc',
  '\\microsoft\\windows\\autochk\\proxy': 'optimizer.tasks.autochkDesc',
};

export class TaskOptimizerEngine {
  /**
   * Checks if a task path is critically protected.
   */
  static isCritical(fullPath: string): boolean {
    const lower = (fullPath || '').toLowerCase();
    return CRITICAL_TASK_PREFIXES.some((prefix) => lower.startsWith(prefix));
  }

  /**
   * Resolves binary path from scheduled task action execute command.
   */
  static resolveExecutablePath(rawAction: string): string | null {
    if (!rawAction || !rawAction.trim()) return null;

    let clean = rawAction.trim();
    clean = clean.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');

    if (clean.startsWith('"')) {
      const closing = clean.indexOf('"', 1);
      if (closing !== -1) {
        return clean.substring(1, closing).trim();
      }
    }

    const firstSpace = clean.indexOf(' ');
    if (firstSpace !== -1) {
      const candidate = clean.substring(0, firstSpace).trim();
      if (candidate.endsWith('.exe') || candidate.endsWith('.bat') || candidate.endsWith('.cmd')) {
        return candidate;
      }
    }

    return clean;
  }

  /**
   * Scans all Windows scheduled tasks.
   */
  static async scanTasks(): Promise<ScheduledTaskItem[]> {
    const ps = getNativePowerShellPath();
    const script = `
      try {
        Get-ScheduledTask | Select-Object TaskPath, TaskName, State, @{Name="Action";Expression={($_.Actions | Select-Object -First 1).Execute}} | ConvertTo-Json -Compress
      } catch {
        '[]'
      }
    `.trim();

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 8000 });
      if (!stdout || !stdout.trim()) return [];

      const parsed = JSON.parse(stdout.trim());
      const rawList = Array.isArray(parsed) ? parsed : [parsed];
      const results: ScheduledTaskItem[] = [];

      for (const item of rawList) {
        if (!item || !item.TaskName) continue;

        const taskPath = String(item.TaskPath || '\\').trim();
        const taskName = String(item.TaskName).trim();
        const fullPath = (taskPath.endsWith('\\') ? taskPath + taskName : `${taskPath}\\${taskName}`).toLowerCase();
        const isCritical = this.isCritical(fullPath);

        const rawState = String(item.State || '').toLowerCase();
        const state: 'Ready' | 'Running' | 'Disabled' =
          rawState === 'disabled' ? 'Disabled' : rawState === 'running' ? 'Running' : 'Ready';

        const actionExecutable = String(item.Action || '').trim();
        const resolvedExe = this.resolveExecutablePath(actionExecutable);

        let isOrphaned = false;
        if (resolvedExe && !isCritical) {
          const lowerExe = resolvedExe.toLowerCase();
          if (!lowerExe.includes('system32') && !lowerExe.includes('syswow64')) {
            try {
              if (!fs.existsSync(resolvedExe)) {
                isOrphaned = true;
              }
            } catch {}
          }
        }

        let category: 'telemetry' | 'orphan' | 'updater' | 'maintenance' | 'system' = 'system';
        let recommendation: 'disable' | 'clean' | 'keep' = 'keep';
        let descriptionKey = 'optimizer.tasks.defaultDesc';

        if (isOrphaned) {
          category = 'orphan';
          recommendation = 'clean';
          descriptionKey = 'optimizer.tasks.orphanDesc';
        } else if (KNOWN_TELEMETRY_TASKS[fullPath]) {
          category = 'telemetry';
          recommendation = 'disable';
          descriptionKey = KNOWN_TELEMETRY_TASKS[fullPath];
        } else if (fullPath.includes('update') || fullPath.includes('updater')) {
          category = 'updater';
          recommendation = 'disable';
          descriptionKey = 'optimizer.tasks.updaterDesc';
        } else if (isCritical) {
          category = 'maintenance';
          recommendation = 'keep';
          descriptionKey = 'optimizer.tasks.criticalDesc';
        }

        results.push({
          taskPath,
          taskName,
          fullPath,
          state,
          actionExecutable,
          isOrphaned,
          isCritical,
          category,
          recommendation,
          descriptionKey,
        });
      }

      return results;
    } catch (err) {
      console.error('Failed to scan scheduled tasks:', err);
      return [];
    }
  }

  /**
   * Exports task XML to BackupStore and updates enabled/disabled state.
   */
  static async setTaskState(
    taskPath: string,
    taskName: string,
    enabled: boolean
  ): Promise<{ success: boolean; message: string }> {
    const fullPath = `${taskPath}\\${taskName}`.toLowerCase();
    if (this.isCritical(fullPath)) {
      return { success: false, message: `Task '${taskName}' is system-critical and protected.` };
    }

    const ps = getNativePowerShellPath();

    // Export task XML for rollback
    try {
      const exportScript = `Export-ScheduledTask -TaskName '${taskName}' -TaskPath '${taskPath}' -ErrorAction SilentlyContinue`;
      const { stdout: xmlContent } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', exportScript], {
        timeout: 3000,
      });

      if (xmlContent && xmlContent.trim()) {
        BackupStore.saveBackup({
          id: `backup_task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          title: `Scheduled Task State: ${taskName}`,
          type: 'single_tweak',
          tweakIds: [`task_${taskName}`],
          status: 'active',
          snapshots: [
            {
              actionId: `task_${taskName}`,
              actionType: 'scheduled_task',
              targetIdentifier: `${taskPath}${taskName}`,
              originalValue: xmlContent,
              appliedValue: enabled ? 'Ready' : 'Disabled',
              metadata: { taskPath, taskName, wasEnabled: !enabled },
            },
          ],
        });
      }
    } catch {}

    const actionCmd = enabled
      ? `Enable-ScheduledTask -TaskName '${taskName}' -TaskPath '${taskPath}'`
      : `Disable-ScheduledTask -TaskName '${taskName}' -TaskPath '${taskPath}'`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', actionCmd], { timeout: 4000 });
      return {
        success: true,
        message: `Task '${taskName}' was successfully ${enabled ? 'enabled' : 'disabled'}.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update scheduled task.' };
    }
  }

  /**
   * Deletes an orphaned scheduled task after exporting its XML to BackupStore.
   */
  static async deleteOrphanedTask(
    taskPath: string,
    taskName: string
  ): Promise<{ success: boolean; message: string }> {
    const fullPath = `${taskPath}\\${taskName}`.toLowerCase();
    if (this.isCritical(fullPath)) {
      return { success: false, message: `Cannot delete critical maintenance task '${taskName}'.` };
    }

    const ps = getNativePowerShellPath();

    try {
      const exportScript = `Export-ScheduledTask -TaskName '${taskName}' -TaskPath '${taskPath}' -ErrorAction SilentlyContinue`;
      const { stdout: xmlContent } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', exportScript], {
        timeout: 3000,
      });

      BackupStore.saveBackup({
        id: `backup_taskdel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        title: `Deleted Orphaned Task: ${taskName}`,
        type: 'single_tweak',
        tweakIds: [`task_delete_${taskName}`],
        status: 'active',
        snapshots: [
          {
            actionId: `task_delete_${taskName}`,
            actionType: 'scheduled_task',
            targetIdentifier: `${taskPath}${taskName}`,
            originalValue: xmlContent || null,
            appliedValue: null,
            metadata: { taskPath, taskName },
          },
        ],
      });
    } catch {}

    const script = `Unregister-ScheduledTask -TaskName '${taskName}' -TaskPath '${taskPath}' -Confirm:$false`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 4000 });
      return { success: true, message: `Successfully deleted orphaned task '${taskName}'.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to delete task.' };
    }
  }
}
