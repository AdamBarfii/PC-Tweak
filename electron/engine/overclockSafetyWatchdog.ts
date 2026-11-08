import { AuditStore } from '../storage/auditStore';
import { OverclockStore } from '../storage/overclockStore';

export interface WatchdogStatus {
  isRunning: boolean;
  pollIntervalMs: number;
  gpuTempThresholdC: number;
  gpuHotspotThresholdC: number;
  cpuTempThresholdC: number;
  lastGpuTemp: number | null;
  lastCpuTemp: number | null;
  tripwireTriggered: boolean;
  lastTripwireReason: string | null;
}

export type RevertHandler = (reason: string) => Promise<void> | void;

export class OverclockSafetyWatchdog {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;
  private static pollIntervalMs = 100; // 100ms high-precision tripwire
  private static gpuTempThresholdC = 80; // Hard limit 80°C
  private static gpuHotspotThresholdC = 92; // Hard limit 92°C
  private static cpuTempThresholdC = 85; // Hard limit 85°C

  private static lastGpuTemp: number | null = null;
  private static lastCpuTemp: number | null = null;
  private static tripwireTriggered = false;
  private static lastTripwireReason: string | null = null;

  private static revertHandler: RevertHandler | null = null;
  private static tempSampler: (() => Promise<{ gpuTemp: number | null; hotspotTemp?: number | null; cpuTemp?: number | null }>) | null = null;

  static setTempSampler(
    sampler: (() => Promise<{ gpuTemp: number | null; hotspotTemp?: number | null; cpuTemp?: number | null }>) | null
  ): void {
    this.tempSampler = sampler;
  }

  static setRevertHandler(handler: RevertHandler | null): void {
    this.revertHandler = handler;
  }

  static setThresholdsForTesting(limits: {
    gpu?: number;
    hotspot?: number;
    cpu?: number;
    intervalMs?: number;
  }): void {
    if (limits.gpu !== undefined) this.gpuTempThresholdC = limits.gpu;
    if (limits.hotspot !== undefined) this.gpuHotspotThresholdC = limits.hotspot;
    if (limits.cpu !== undefined) this.cpuTempThresholdC = limits.cpu;
    if (limits.intervalMs !== undefined) this.pollIntervalMs = limits.intervalMs;
  }

  static start(onRevert?: RevertHandler): void {
    if (onRevert) {
      this.revertHandler = onRevert;
    }
    if (this.isRunning) return;

    this.isRunning = true;
    this.tripwireTriggered = false;
    this.lastTripwireReason = null;

    this.timer = setInterval(async () => {
      await this.tick();
    }, this.pollIntervalMs);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  static getStatus(): WatchdogStatus {
    return {
      isRunning: this.isRunning,
      pollIntervalMs: this.pollIntervalMs,
      gpuTempThresholdC: this.gpuTempThresholdC,
      gpuHotspotThresholdC: this.gpuHotspotThresholdC,
      cpuTempThresholdC: this.cpuTempThresholdC,
      lastGpuTemp: this.lastGpuTemp,
      lastCpuTemp: this.lastCpuTemp,
      tripwireTriggered: this.tripwireTriggered,
      lastTripwireReason: this.lastTripwireReason,
    };
  }

  static async tick(): Promise<void> {
    if (!this.tempSampler) return;

    try {
      const temps = await this.tempSampler();
      if (!temps) return;

      if (temps.gpuTemp !== null && temps.gpuTemp !== undefined) {
        this.lastGpuTemp = temps.gpuTemp;
        OverclockStore.recordPeakTemp(temps.gpuTemp);

        if (temps.gpuTemp >= this.gpuTempThresholdC) {
          await this.triggerEmergencyRevert(
            `GPU thermal tripwire breached (${temps.gpuTemp}°C >= ${this.gpuTempThresholdC}°C)`
          );
          return;
        }
      }

      if (temps.hotspotTemp !== null && temps.hotspotTemp !== undefined) {
        if (temps.hotspotTemp >= this.gpuHotspotThresholdC) {
          await this.triggerEmergencyRevert(
            `GPU hotspot thermal tripwire breached (${temps.hotspotTemp}°C >= ${this.gpuHotspotThresholdC}°C)`
          );
          return;
        }
      }

      if (temps.cpuTemp !== null && temps.cpuTemp !== undefined) {
        this.lastCpuTemp = temps.cpuTemp;
        if (temps.cpuTemp >= this.cpuTempThresholdC) {
          await this.triggerEmergencyRevert(
            `CPU package thermal tripwire breached (${temps.cpuTemp}°C >= ${this.cpuTempThresholdC}°C)`
          );
          return;
        }
      }
    } catch (err) {
      console.error('[OverclockWatchdog] Tick error:', err);
    }
  }

  static async triggerEmergencyRevert(reason: string): Promise<void> {
    this.tripwireTriggered = true;
    this.lastTripwireReason = reason;

    console.warn(`[OverclockWatchdog] EMERGENCY REVERT TRIGGERED: ${reason}`);

    OverclockStore.recordRollback();

    try {
      AuditStore.record({
        category: 'system',
        action: 'EMERGENCY_OVERCLOCK_ROLLBACK',
        details: reason,
        reversible: false,
      });
    } catch {}

    if (this.revertHandler) {
      try {
        await this.revertHandler(reason);
      } catch (err) {
        console.error('[OverclockWatchdog] Revert handler failed:', err);
      }
    }
  }

  static reportTdrEvent(details = 'Display driver reset event detected'): Promise<void> {
    OverclockStore.recordTdrEvent();
    return this.triggerEmergencyRevert(`TDR Driver Recovery: ${details}`);
  }
}
