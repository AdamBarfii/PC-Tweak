import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { RegistryEngine } from './registry';

const execAsync = promisify(exec);

export interface SystemRestorePoint {
  sequenceNumber: number;
  description: string;
  creationTime: string;
  restorePointType: string;
}

export class RestorePointEngine {
  /**
   * Disables the 24-hour creation frequency limit in Windows registry.
   */
  private static async bypassFrequencyLimit(): Promise<void> {
    await RegistryEngine.setValue(
      'HKLM',
      'Software\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore',
      'SystemRestorePointCreationFrequency',
      'REG_DWORD',
      0
    );
  }

  /**
   * Checks if System Restore is enabled on the system drive.
   */
  static async isRestoreEnabled(): Promise<boolean> {
    try {
      const script = `(Get-ComputerRestorePoint).Count -ge 0`;
      await execAsync(`powershell -NoProfile -Command "${script}"`, { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enables System Restore on C:\ drive.
   */
  static async enableRestore(): Promise<boolean> {
    try {
      const script = `Enable-ComputerRestore -Drive "C:\\"`;
      await execAsync(`powershell -NoProfile -Command "${script}"`, { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a Windows System Restore Point.
   */
  static async createRestorePoint(description: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.bypassFrequencyLimit();
      const safeDesc = description.replace(/["']/g, '');
      const script = `Checkpoint-Computer -Description "${safeDesc}" -RestorePointType "MODIFY_SETTINGS"`;
      await execAsync(`powershell -NoProfile -Command "${script}"`, { windowsHide: true });
      return { success: true, message: `Restore point "${safeDesc}" created successfully.` };
    } catch (err: any) {
      console.error('Failed to create restore point:', err);
      return {
        success: false,
        message: err?.message || 'Failed to create restore point. Ensure you are running as Administrator and System Restore is enabled on C:\\.',
      };
    }
  }

  /**
   * Lists existing Windows System Restore Points.
   */
  static async listRestorePoints(): Promise<SystemRestorePoint[]> {
    try {
      const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`, { windowsHide: true });
      if (!stdout.trim()) return [];

      const parsed = JSON.parse(stdout);
      const points = Array.isArray(parsed) ? parsed : [parsed];

      return points.map((p) => ({
        sequenceNumber: p.SequenceNumber,
        description: p.Description,
        creationTime: p.CreationTime,
        restorePointType: p.RestorePointType?.toString() || 'MODIFY_SETTINGS',
      }));
    } catch {
      return [];
    }
  }
}
