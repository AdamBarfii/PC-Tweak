/**
 * PC Tweak - Native Service Optimizer Engine
 * 
 * Inspects Windows services, detects orphaned service registrations (whose target executable is missing),
 * identifies telemetry and bloat services, enforces strict whitelists of critical OS services,
 * and maintains transactional backups before any configuration changes.
 */

import fs from 'fs';
import path from 'path';
import { getNativePowerShellPath, execFileWithTimeout } from '../processUtils';
import { RegistryEngine } from './registry';
import { BackupStore } from '../storage/backupStore';

export interface WindowsServiceItem {
  name: string;
  displayName: string;
  status: 'Running' | 'Stopped';
  startupType: 'Automatic' | 'Manual' | 'Disabled';
  imagePath: string;
  isOrphaned: boolean;
  isCritical: boolean;
  category: 'telemetry' | 'bloat' | 'orphan' | 'system' | 'third_party';
  recommendation: 'disable' | 'manual' | 'clean' | 'keep';
  descriptionKey: string;
}

const CRITICAL_SERVICES = new Set([
  'rpcss',
  'rpceptmapper',
  'dcomlaunch',
  'plugplay',
  'audiosrv',
  'audioendpointbuilder',
  'dhcp',
  'dnscache',
  'cryptsvc',
  'eventlog',
  'schedule',
  'windefend',
  'mpssvc',
  'samss',
  'lsm',
  'power',
  'themes',
  'lanmanworkstation',
  'lanmanserver',
  'coremessagingregistrar',
  'keyiso',
  'vaultsvc',
  'brokerinfrastructure',
  'systemeventsbroker',
  'wuauserv',
  'bits',
]);

const KNOWN_OPTIMIZATIONS: Record<
  string,
  {
    category: 'telemetry' | 'bloat' | 'third_party';
    recommendation: 'disable' | 'manual' | 'keep';
    descriptionKey: string;
  }
> = {
  diagtrack: {
    category: 'telemetry',
    recommendation: 'disable',
    descriptionKey: 'optimizer.services.diagtrackDesc',
  },
  dmwappushservice: {
    category: 'telemetry',
    recommendation: 'disable',
    descriptionKey: 'optimizer.services.dmwappushDesc',
  },
  retaildemo: {
    category: 'bloat',
    recommendation: 'disable',
    descriptionKey: 'optimizer.services.retaildemoDesc',
  },
  mapsbroker: {
    category: 'bloat',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.mapsbrokerDesc',
  },
  wpcmoncsvc: {
    category: 'bloat',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.wpcmonDesc',
  },
  remoteregistry: {
    category: 'telemetry',
    recommendation: 'disable',
    descriptionKey: 'optimizer.services.remoteregistryDesc',
  },
  xblauthmanager: {
    category: 'bloat',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.xblauthDesc',
  },
  xboxgipsvc: {
    category: 'bloat',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.xboxgipDesc',
  },
  xblgamesave: {
    category: 'bloat',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.xblgamesaveDesc',
  },
  edgeupdate: {
    category: 'third_party',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.edgeupdateDesc',
  },
  edgeupdatem: {
    category: 'third_party',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.edgeupdateDesc',
  },
  gupdate: {
    category: 'third_party',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.gupdateDesc',
  },
  gupdatem: {
    category: 'third_party',
    recommendation: 'manual',
    descriptionKey: 'optimizer.services.gupdateDesc',
  },
};

export class ServiceOptimizerEngine {
  /**
   * Checks if a service is critically protected.
   */
  static isCritical(serviceName: string): boolean {
    return CRITICAL_SERVICES.has((serviceName || '').toLowerCase().trim());
  }

  /**
   * Resolves the executable path from a service ImagePath registry string.
   */
  static resolveExecutablePath(rawImagePath: string): string | null {
    if (!rawImagePath || !rawImagePath.trim()) return null;

    let clean = rawImagePath.trim();
    // Expand environment variables
    clean = clean.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');

    // Handle quoted paths: "C:\Path with spaces\file.exe" -arg1
    if (clean.startsWith('"')) {
      const closingQuote = clean.indexOf('"', 1);
      if (closingQuote !== -1) {
        return clean.substring(1, closingQuote).trim();
      }
    }

    // Split on first space if not quoted
    const firstSpace = clean.indexOf(' ');
    if (firstSpace !== -1) {
      const candidate = clean.substring(0, firstSpace).trim();
      if (candidate.endsWith('.exe') || candidate.endsWith('.sys')) {
        return candidate;
      }
    }

    return clean;
  }

  /**
   * Scans all Windows services, detects orphaned entries, and maps telemetry/bloatware recommendations.
   */
  static async scanServices(): Promise<WindowsServiceItem[]> {
    const ps = getNativePowerShellPath();
    const script = `
      try {
        Get-CimInstance -ClassName Win32_Service | Select-Object Name, DisplayName, State, StartMode, PathName | ConvertTo-Json -Compress
      } catch {
        '[]'
      }
    `.trim();

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 6000 });
      if (!stdout || !stdout.trim()) return [];

      const parsed = JSON.parse(stdout.trim());
      const rawList = Array.isArray(parsed) ? parsed : [parsed];
      const results: WindowsServiceItem[] = [];

      for (const item of rawList) {
        if (!item || !item.Name) continue;

        const name = String(item.Name).trim();
        const lowerName = name.toLowerCase();
        const isCritical = this.isCritical(lowerName);
        const displayName = String(item.DisplayName || name).trim();
        const rawStatus = String(item.State || '').toLowerCase();
        const status: 'Running' | 'Stopped' = rawStatus === 'running' ? 'Running' : 'Stopped';

        const rawStartMode = String(item.StartMode || '').toLowerCase();
        const startupType: 'Automatic' | 'Manual' | 'Disabled' =
          rawStartMode === 'auto'
            ? 'Automatic'
            : rawStartMode === 'disabled'
            ? 'Disabled'
            : 'Manual';

        const imagePath = String(item.PathName || '').trim();
        const resolvedExe = this.resolveExecutablePath(imagePath);

        let isOrphaned = false;
        if (resolvedExe && !isCritical) {
          // If path is specified and not svchost, check if file exists
          if (!resolvedExe.toLowerCase().includes('svchost.exe')) {
            try {
              if (!fs.existsSync(resolvedExe)) {
                isOrphaned = true;
              }
            } catch {}
          }
        }

        const known = KNOWN_OPTIMIZATIONS[lowerName];
        let category: 'telemetry' | 'bloat' | 'orphan' | 'system' | 'third_party' = 'system';
        let recommendation: 'disable' | 'manual' | 'clean' | 'keep' = 'keep';
        let descriptionKey = 'optimizer.services.defaultDesc';

        if (isOrphaned) {
          category = 'orphan';
          recommendation = 'clean';
          descriptionKey = 'optimizer.services.orphanDesc';
        } else if (known) {
          category = known.category;
          recommendation = known.recommendation;
          descriptionKey = known.descriptionKey;
        } else if (isCritical) {
          category = 'system';
          recommendation = 'keep';
          descriptionKey = 'optimizer.services.criticalDesc';
        }

        results.push({
          name,
          displayName,
          status,
          startupType,
          imagePath,
          isOrphaned,
          isCritical,
          category,
          recommendation,
          descriptionKey,
        });
      }

      return results;
    } catch (err) {
      console.error('Failed to scan services:', err);
      return [];
    }
  }

  /**
   * Updates startup type of a service with pre-change backup.
   */
  static async setServiceStartup(
    serviceName: string,
    startupType: 'Automatic' | 'Manual' | 'Disabled'
  ): Promise<{ success: boolean; message: string }> {
    const cleanName = (serviceName || '').trim();
    if (this.isCritical(cleanName)) {
      return { success: false, message: `Service '${cleanName}' is system-critical and protected.` };
    }

    // Capture current Start registry value for backup
    const regPath = `System\\CurrentControlSet\\Services\\${cleanName}`;
    const currentStart = await RegistryEngine.getValue('HKLM', regPath, 'Start');

    if (currentStart !== null) {
      BackupStore.saveBackup({
        id: `backup_srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        title: `Service Configuration: ${cleanName}`,
        type: 'single_tweak',
        tweakIds: [`service_${cleanName}`],
        status: 'active',
        snapshots: [
          {
            actionId: `service_${cleanName}_start`,
            actionType: 'service',
            targetIdentifier: cleanName,
            originalValue: currentStart,
            appliedValue: startupType === 'Automatic' ? 2 : startupType === 'Manual' ? 3 : 4,
            metadata: { serviceName: cleanName, previousStartup: currentStart },
          },
        ],
      });
    }

    const ps = getNativePowerShellPath();
    const script = `Set-Service -Name '${cleanName}' -StartupType ${startupType}`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 5000 });

      // If disabled and running, gracefully stop service
      if (startupType === 'Disabled') {
        try {
          await execFileWithTimeout(ps, ['-NoProfile', '-Command', `Stop-Service -Name '${cleanName}' -Force`], {
            timeout: 5000,
          });
        } catch {}
      }

      return { success: true, message: `Successfully updated '${cleanName}' to ${startupType}.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update service.' };
    }
  }

  /**
   * Removes an orphaned service entry from the registry after creating a backup.
   */
  static async deleteOrphanedService(serviceName: string): Promise<{ success: boolean; message: string }> {
    const cleanName = (serviceName || '').trim();
    if (this.isCritical(cleanName)) {
      return { success: false, message: `Cannot delete critical system service '${cleanName}'.` };
    }

    const regPath = `System\\CurrentControlSet\\Services\\${cleanName}`;
    const imagePath = await RegistryEngine.getValue('HKLM', regPath, 'ImagePath');
    const startVal = await RegistryEngine.getValue('HKLM', regPath, 'Start');

    // Create backup record
    BackupStore.saveBackup({
      id: `backup_srvdel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      title: `Orphaned Service Deletion: ${cleanName}`,
      type: 'single_tweak',
      tweakIds: [`service_delete_${cleanName}`],
      status: 'active',
      snapshots: [
        {
          actionId: `service_delete_${cleanName}`,
          actionType: 'service',
          targetIdentifier: cleanName,
          originalValue: { ImagePath: imagePath, Start: startVal },
          appliedValue: null,
          metadata: { serviceName: cleanName },
        },
      ],
    });

    const ps = getNativePowerShellPath();
    const script = `sc.exe delete '${cleanName}'`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 4000 });
      return { success: true, message: `Successfully deleted orphaned service '${cleanName}'.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to delete service.' };
    }
  }
}
