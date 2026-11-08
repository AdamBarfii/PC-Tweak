/**
 * PC Tweak - Smart Auto-Suggestions Engine
 * 
 * Inspects live hardware metrics and Windows subsystem state to generate proactive,
 * high-impact, 1-click recommendations on the Dashboard and Optimizer views.
 */

import os from 'os';
import { DiskOptimizerEngine } from './diskOptimizerEngine';
import { RamOptimizerEngine } from './ramOptimizerEngine';
import { CpuOptimizerEngine } from './cpuOptimizerEngine';
import { ServiceOptimizerEngine } from './serviceOptimizerEngine';
import { TaskOptimizerEngine } from './taskOptimizerEngine';
import { TweakEngine } from './tweakEngine';
import { AutomationStore } from '../storage/automationStore';
import { BackupStore } from '../storage/backupStore';

export interface SmartSuggestion {
  id: string;
  category: 'storage' | 'memory' | 'gaming' | 'privacy' | 'performance';
  impact: 'safe' | 'moderate' | 'high';
  titleKey: string;
  descriptionKey: string;
  descriptionParams?: Record<string, any>;
  actionType:
    | 'clean_disk'
    | 'trim_ram'
    | 'set_power_plan'
    | 'disable_telemetry'
    | 'clean_orphans'
    | 'enable_game_mode'
    | 'run_trim';
  actionPayload?: any;
  isDismissed?: boolean;
}

export class SmartSuggestionsEngine {
  private static dismissedIds = new Set<string>();

  private static formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Scans system parameters and returns active smart suggestions.
   */
  public static async getSuggestions(): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];

    // 1. Storage Junk Evaluation
    try {
      const categories = await DiskOptimizerEngine.scanCategories();
      const safeCategories = ['user_temp', 'system_temp', 'windows_update_download', 'crash_dumps_wer', 'directx_shader_cache'];
      const totalJunkBytes = categories
        .filter((c) => safeCategories.includes(c.id))
        .reduce((acc, c) => acc + c.sizeBytes, 0);

      if (totalJunkBytes >= 400 * 1024 * 1024 && !this.dismissedIds.has('sug_disk_clean')) {
        suggestions.push({
          id: 'sug_disk_clean',
          category: 'storage',
          impact: 'safe',
          titleKey: 'suggestions.diskClean.title',
          descriptionKey: 'suggestions.diskClean.desc',
          descriptionParams: { size: this.formatBytes(totalJunkBytes) },
          actionType: 'clean_disk',
          actionPayload: { categories: safeCategories, sizeBytes: totalJunkBytes },
        });
      }
    } catch {}

    // 2. RAM Memory Load Evaluation
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercentage = Math.round((usedMem / totalMem) * 100);

      if (memPercentage >= 75 && !this.dismissedIds.has('sug_ram_trim')) {
        suggestions.push({
          id: 'sug_ram_trim',
          category: 'memory',
          impact: 'safe',
          titleKey: 'suggestions.ramTrim.title',
          descriptionKey: 'suggestions.ramTrim.desc',
          descriptionParams: { percent: memPercentage },
          actionType: 'trim_ram',
        });
      }
    } catch {}

    // 3. Power Scheme Evaluation
    try {
      const plans = await CpuOptimizerEngine.getPowerPlans();
      const activePlan = plans.find((p) => p.isActive);
      const isOptimal =
        activePlan &&
        (activePlan.isUltimate ||
          activePlan.name.toLowerCase().includes('high performance') ||
          activePlan.name.toLowerCase().includes('ultimate'));

      if (!isOptimal && !this.dismissedIds.has('sug_power_plan')) {
        suggestions.push({
          id: 'sug_power_plan',
          category: 'performance',
          impact: 'safe',
          titleKey: 'suggestions.powerPlan.title',
          descriptionKey: 'suggestions.powerPlan.desc',
          actionType: 'set_power_plan',
        });
      }
    } catch {}

    // 4. Telemetry Service Evaluation
    try {
      const services = await ServiceOptimizerEngine.scanServices();
      const diagTrack = services.find((s) => s.name.toLowerCase() === 'diagtrack');

      if (diagTrack && diagTrack.startupType !== 'Disabled' && !this.dismissedIds.has('sug_telemetry')) {
        suggestions.push({
          id: 'sug_telemetry',
          category: 'privacy',
          impact: 'safe',
          titleKey: 'suggestions.telemetry.title',
          descriptionKey: 'suggestions.telemetry.desc',
          actionType: 'disable_telemetry',
        });
      }

      // 5. Orphaned Service Entries Evaluation
      const orphanedCount = services.filter((s) => s.isOrphaned).length;
      if (orphanedCount > 0 && !this.dismissedIds.has('sug_orphans')) {
        suggestions.push({
          id: 'sug_orphans',
          category: 'performance',
          impact: 'safe',
          titleKey: 'suggestions.orphans.title',
          descriptionKey: 'suggestions.orphans.desc',
          descriptionParams: { count: orphanedCount },
          actionType: 'clean_orphans',
        });
      }
    } catch {}

    // 6. Windows Game Mode Evaluation
    try {
      const gamingTweaks = await TweakEngine.getTweaksWithStatus('gaming');
      const gm = gamingTweaks.find((t: { id: string }) => t.id === 'enable_game_mode');
      if (gm && !gm.isApplied && !this.dismissedIds.has('sug_game_mode')) {
        suggestions.push({
          id: 'sug_game_mode',
          category: 'gaming',
          impact: 'safe',
          titleKey: 'suggestions.gameMode.title',
          descriptionKey: 'suggestions.gameMode.desc',
          actionType: 'enable_game_mode',
        });
      }
    } catch {}

    return suggestions;
  }

  /**
   * Applies an individual suggestion by ID.
   */
  public static async applySuggestion(id: string): Promise<{ success: boolean; message: string }> {
    switch (id) {
      case 'sug_disk_clean': {
        const safeCategories = ['user_temp', 'system_temp', 'windows_update_download', 'crash_dumps_wer', 'directx_shader_cache'];
        const res = await DiskOptimizerEngine.cleanCategories(safeCategories);
        this.dismissedIds.add(id);
        const reclaimedMb = Math.round(res.reclaimedBytes / (1024 * 1024));
        AutomationStore.addLog({
          type: 'disk_clean',
          title: 'Smart Suggestion: Storage Junk Cleaned',
          detail: `Cleaned ${res.filesDeleted} files and reclaimed ${reclaimedMb} MB.`,
          reclaimedBytes: res.reclaimedBytes,
        });
        return { success: true, message: `Reclaimed ${reclaimedMb} MB of disk space.` };
      }

      case 'sug_ram_trim': {
        const res = await RamOptimizerEngine.trimWorkingSets();
        this.dismissedIds.add(id);
        AutomationStore.addLog({
          type: 'ram_trim',
          title: 'Smart Suggestion: Working Sets Trimmed',
          detail: `Reclaimed ${res.freedMb} MB RAM.`,
          reclaimedBytes: res.freedMb * 1024 * 1024,
        });
        return { success: true, message: `Successfully reclaimed ${res.freedMb} MB RAM.` };
      }

      case 'sug_power_plan': {
        const plans = await CpuOptimizerEngine.getPowerPlans();
        const ultimatePlan = plans.find((p) => p.isUltimate);
        if (ultimatePlan) {
          await CpuOptimizerEngine.setActivePowerPlan(ultimatePlan.guid);
        } else {
          await CpuOptimizerEngine.unlockUltimatePerformance();
        }
        this.dismissedIds.add(id);
        AutomationStore.addLog({
          type: 'game_boost',
          title: 'Smart Suggestion: Ultimate Performance Activated',
          detail: 'Activated Ultimate Performance power scheme.',
        });
        return { success: true, message: 'Activated Ultimate Performance power plan.' };
      }

      case 'sug_telemetry': {
        const res = await ServiceOptimizerEngine.setServiceStartup('DiagTrack', 'Disabled');
        this.dismissedIds.add(id);
        AutomationStore.addLog({
          type: 'telemetry_silenced',
          title: 'Smart Suggestion: DiagTrack Disabled',
          detail: 'Disabled Connected User Experiences and Telemetry service.',
        });
        return { success: true, message: res.message };
      }

      case 'sug_orphans': {
        const services = await ServiceOptimizerEngine.scanServices();
        const orphans = services.filter((s) => s.isOrphaned);
        let count = 0;
        for (const orphan of orphans) {
          const res = await ServiceOptimizerEngine.deleteOrphanedService(orphan.name);
          if (res.success) count++;
        }
        this.dismissedIds.add(id);
        return { success: true, message: `Cleaned ${count} orphaned service entries.` };
      }

      case 'sug_game_mode': {
        const res = await TweakEngine.applyTweak('enable_game_mode');
        this.dismissedIds.add(id);
        return { success: res.success, message: res.success ? 'Windows Game Mode enabled.' : 'Failed to enable Game Mode.' };
      }

      default:
        return { success: false, message: 'Unknown suggestion ID.' };
    }
  }

  /**
   * Applies all available safe suggestions in a batch.
   */
  public static async applyAllSafe(): Promise<{ success: boolean; appliedCount: number; message: string }> {
    const list = await this.getSuggestions();
    let appliedCount = 0;

    for (const item of list) {
      if (item.impact === 'safe') {
        const res = await this.applySuggestion(item.id);
        if (res.success) appliedCount++;
      }
    }

    return {
      success: true,
      appliedCount,
      message: `Successfully executed ${appliedCount} recommended optimizations.`,
    };
  }

  /**
   * Dismisses a suggestion from the active view.
   */
  public static dismiss(id: string): void {
    this.dismissedIds.add(id);
  }
}
