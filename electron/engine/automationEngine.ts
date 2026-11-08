/**
 * PC Tweak - Native Background Automation Engine
 * 
 * Periodically evaluates system telemetry against user automation rules:
 * - Trims bloated working sets when RAM exceeds threshold (with cooldown guardrails).
 * - Cleans safe temporary junk when storage threshold is exceeded (skips during gameplay).
 * - Runs weekly SSD TRIM in the background.
 * - Guards against telemetry services resurrection following Windows updates.
 */

import os from 'os';
import { AutomationStore } from '../storage/automationStore';
import { RamOptimizerEngine } from './ramOptimizerEngine';
import { DiskOptimizerEngine } from './diskOptimizerEngine';
import { ServiceOptimizerEngine } from './serviceOptimizerEngine';
import { GameSessionEngine } from './gameSessionEngine';

export class AutomationEngine {
  private static workerTimer: NodeJS.Timeout | null = null;
  private static lastRamTrimTimestamp = 0;
  private static lastDiskCheckTimestamp = 0;
  private static lastTelemetryCheckTimestamp = 0;
  private static isEvaluating = false;

  /**
   * Initializes and starts the background automation worker loop.
   */
  public static start(intervalMs: number = 30000): void {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      this.evaluateRules().catch((err) => {
        console.warn('Automation engine tick encountered an error:', err);
      });
    }, Math.max(10000, intervalMs));
  }

  /**
   * Stops the background automation worker loop.
   */
  public static stop(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  /**
   * Core rule evaluation loop.
   */
  public static async evaluateRules(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const config = AutomationStore.getConfig();
      if (!config.masterEnabled) return;

      const isGameActive = GameSessionEngine.getStatus().isActive;
      const now = Date.now();

      // 1. RAM Rule Evaluation
      if (config.autoTrimRam.enabled) {
        const cooldownMs = config.autoTrimRam.cooldownMinutes * 60 * 1000;
        if (now - this.lastRamTrimTimestamp >= cooldownMs) {
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const memPercentage = Math.round((usedMem / totalMem) * 100);

          if (memPercentage >= config.autoTrimRam.thresholdPercent) {
            const trimResult = await RamOptimizerEngine.trimWorkingSets();
            this.lastRamTrimTimestamp = now;

            if (trimResult.freedMb > 0) {
              AutomationStore.addLog({
                type: 'ram_trim',
                title: 'Automated RAM Working Set Trim',
                detail: `RAM was at ${memPercentage}%. Reclaimed ${trimResult.freedMb} MB memory without disturbing open applications.`,
                reclaimedBytes: trimResult.freedMb * 1024 * 1024,
              });
            }
          }
        }
      }

      // 2. Storage Junk Rule Evaluation (skip if game is active to avoid disk I/O latency)
      if (config.autoCleanDisk.enabled && !isGameActive) {
        // Run disk check every 15 minutes
        if (now - this.lastDiskCheckTimestamp >= 15 * 60 * 1000) {
          this.lastDiskCheckTimestamp = now;
          const categories = await DiskOptimizerEngine.scanCategories();
          const targetIds = new Set(config.autoCleanDisk.categories);

          const eligibleBytes = categories
            .filter((c) => targetIds.has(c.id) && c.id !== 'recycle_bin')
            .reduce((acc, c) => acc + c.sizeBytes, 0);

          const thresholdBytes = config.autoCleanDisk.thresholdMb * 1024 * 1024;

          if (eligibleBytes >= thresholdBytes) {
            const cleanResult = await DiskOptimizerEngine.cleanCategories(Array.from(targetIds));
            if (cleanResult.reclaimedBytes > 0) {
              const reclaimedMb = Math.round(cleanResult.reclaimedBytes / (1024 * 1024));
              AutomationStore.addLog({
                type: 'disk_clean',
                title: 'Automated Storage Junk Clean',
                detail: `Junk threshold of ${config.autoCleanDisk.thresholdMb} MB reached. Cleaned ${cleanResult.filesDeleted} files and reclaimed ${reclaimedMb} MB.`,
                reclaimedBytes: cleanResult.reclaimedBytes,
              });
            }
          }
        }
      }

      // 3. SSD Weekly TRIM Evaluation
      if (config.autoTrimSsd.enabled && !isGameActive) {
        const lastRun = config.autoTrimSsd.lastRunTimestamp
          ? new Date(config.autoTrimSsd.lastRunTimestamp).getTime()
          : 0;
        const intervalMs = config.autoTrimSsd.frequencyDays * 24 * 3600 * 1000;

        if (now - lastRun >= intervalMs) {
          const driveStatus = await DiskOptimizerEngine.getDriveStatus('C');
          if (driveStatus.mediaType === 'SSD') {
            await DiskOptimizerEngine.optimizeDrive('C');
            AutomationStore.updateConfig({
              autoTrimSsd: {
                ...config.autoTrimSsd,
                lastRunTimestamp: new Date().toISOString(),
              },
            });
            AutomationStore.addLog({
              type: 'ssd_trim',
              title: 'Scheduled SSD TRIM Optimization',
              detail: 'Completed scheduled TRIM maintenance pass on Drive C: to preserve NAND write performance.',
            });
          }
        }
      }

      // 4. Telemetry Sentinel Evaluation (hourly check)
      if (config.autoTelemetrySentinel.enabled) {
        if (now - this.lastTelemetryCheckTimestamp >= 60 * 60 * 1000) {
          this.lastTelemetryCheckTimestamp = now;
          const services = await ServiceOptimizerEngine.scanServices();
          const diagTrack = services.find((s) => s.name.toLowerCase() === 'diagtrack');

          if (diagTrack && diagTrack.startupType !== 'Disabled') {
            if (config.autoTelemetrySentinel.autoDisableOnDetect) {
              await ServiceOptimizerEngine.setServiceStartup('DiagTrack', 'Disabled');
              AutomationStore.addLog({
                type: 'telemetry_silenced',
                title: 'Telemetry Sentinel: DiagTrack Silenced',
                detail: 'Windows Connected User Experiences and Telemetry service was active and has been disabled automatically.',
              });
            }
          }
        }
      }
    } finally {
      this.isEvaluating = false;
    }
  }
}
