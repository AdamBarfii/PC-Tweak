import React, { useEffect, useState, useRef } from 'react';
import {
  Gamepad2,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GamingModuleState, GamingTweakItem } from '@/types/electron';
import { HardwareSpecsBar } from './components/HardwareSpecsBar';
import { PowerPlanManager } from './components/PowerPlanManager';
import { GamingSettings } from './components/GamingSettings';
import { AdvancedGamingSettings } from './components/AdvancedGamingSettings';
import { ExperimentalSettings } from './components/ExperimentalSettings';
import { PerGameSettings } from './components/PerGameSettings';
import { FpsEsportsCard } from './components/FpsEsportsCard';
import { GpuPipelineCard } from './components/GpuPipelineCard';
import { HudSettingsCard } from './components/HudSettingsCard';
import { BottleneckCheck } from './components/BottleneckCheck';
import { GameSessionMode } from './components/GameSessionMode';
import { AntiCheatCompatibilityCard } from '@/features/anticheat/components/AntiCheatCompatibilityCard';
import { DpcIsrDiagnosticsCard } from './components/DpcIsrDiagnosticsCard';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import { useUIStore } from '@/stores/uiStore';

export const GamingView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { tweakChangeVersion, notifyTweakChanged } = useUIStore();
  const [state, setState] = useState<GamingModuleState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // 15-second Auto Revert State
  const [autoRevertDialog, setAutoRevertDialog] = useState<{
    tweakId: string;
    tweakName: string;
    secondsRemaining: number;
  } | null>(null);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadState = async (isBackgroundSync = false) => {
    if (!isBackgroundSync && !state) {
      setIsLoading(true);
    }
    try {
      if (window.electronAPI?.getGamingState) {
        const data = await window.electronAPI.getGamingState();
        setState(data);
      }
    } catch (err: any) {
      console.error('Failed to load gaming state:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  // Silent background re-fetch when tweaks are changed in other tabs
  useEffect(() => {
    if (tweakChangeVersion > 0) {
      loadState(true);
    }
  }, [tweakChangeVersion]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const showBanner = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setBannerMessage({ text, type });
    setTimeout(() => setBannerMessage(null), 5000);
  };

  // ----------------------------------------------------
  // Power Plan Actions
  // ----------------------------------------------------
  const handleActivatePlan = async (guid: string) => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.setActivePowerPlan(guid);
    if (res.success) {
      showBanner('Power plan activated successfully.');
      await loadState();
    } else {
      showBanner(res.error || 'Failed to activate power plan', 'error');
    }
  };

  const handleCreateCustomPlan = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.createCustomGamingPlan();
    if (res.success) {
      showBanner('PC Tweak Gaming power plan created and activated.');
      await loadState();
    } else {
      showBanner(res.error || 'Failed to create custom power plan', 'error');
    }
  };

  // ----------------------------------------------------
  // Tweak Toggle & Revert
  // ----------------------------------------------------
  const handleToggleTweak = async (tweakId: string, willEnable: boolean) => {
    if (!window.electronAPI || !state) return;
    const allTweaks = [
      ...(state.gamingSettings || []),
      ...(state.advancedSettings || []),
      ...(state.experimentalSettings || []),
    ];
    const tweak = allTweaks.find((t) => t.id === tweakId);
    if (!tweak) return;

    // Run silent health check before applying
    try {
      const check = await window.electronAPI.runSilentHealthCheck();
      if (!check.passed) {
        showBanner(`Safety Warning: Input drop detected (${check.dropPercent}%). Proceed with caution.`, 'warning');
      }
    } catch {}

    const res = await window.electronAPI.applyGamingTweak(tweakId);
    if (!res.success) {
      showBanner(res.error || 'Failed to apply tweak', 'error');
      return;
    }

    await loadState();
    notifyTweakChanged();

    if (res.requiresReboot) {
      showBanner('Tweak enabled. A system reboot is required for changes to take full effect.', 'warning');
      return;
    }

    // Trigger 15-second Auto-Revert modal for moderate tweaks
    if (tweak.risk === 'moderate') {
      startAutoRevertCountdown(tweak.id, tweak.name);
    } else {
      showBanner(`Enabled ${tweak.name}.`);
    }
  };

  const handleRevertTweak = async (tweakId: string) => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.revertGamingTweak(tweakId);
    if (res.success) {
      showBanner('Tweak reverted successfully.');
      await loadState();
      notifyTweakChanged();
    } else {
      showBanner(res.error || 'Failed to revert tweak', 'error');
    }
  };

  // ----------------------------------------------------
  // Auto-Revert Modal Mechanics
  // ----------------------------------------------------
  const startAutoRevertCountdown = (tweakId: string, tweakName: string) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    setAutoRevertDialog({
      tweakId,
      tweakName,
      secondsRemaining: 15,
    });

    countdownTimerRef.current = setInterval(async () => {
      setAutoRevertDialog((prev) => {
        if (!prev) return null;
        if (prev.secondsRemaining <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          handleRevertTweak(prev.tweakId);
          showBanner(`Auto-reverted ${prev.tweakName} (Safety timeout expired).`, 'warning');
          return null;
        }
        return {
          ...prev,
          secondsRemaining: prev.secondsRemaining - 1,
        };
      });
    }, 1000);
  };

  const handleKeepTweak = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (autoRevertDialog) {
      showBanner(`Saved ${autoRevertDialog.tweakName}.`);
    }
    setAutoRevertDialog(null);
  };

  const handleConfirmRevert = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (autoRevertDialog) {
      await handleRevertTweak(autoRevertDialog.tweakId);
    }
    setAutoRevertDialog(null);
  };

  // ----------------------------------------------------
  // Top Action Bar Handlers
  // ----------------------------------------------------
  const handleCreateRestorePoint = async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.createRestorePoint('Gaming-and-Power-Manual');
      if (res.success) {
        showBanner('System Restore Point created successfully.');
        await loadState();
      } else {
        showBanner('System Restore Point creation failed. Check Admin rights.', 'error');
      }
    } catch (err: any) {
      showBanner(err?.message || 'Restore point failed', 'error');
    }
  };

  const handleUndoAll = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.undoAllGaming();
    if (res.success) {
      showBanner(`Reverted ${res.revertedCount} tweak(s).`);
      await loadState();
      notifyTweakChanged();
    }
  };

  const handleResetDefaults = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.resetGamingDefaults();
    if (res.success) {
      showBanner('All gaming and power settings reset to Windows defaults.');
      await loadState();
      notifyTweakChanged();
    }
  };

  const handleRunAudit = async () => {
    if (!window.electronAPI) return;
    try {
      const report = await window.electronAPI.runBottleneckAudit();
      setState((prev) => (prev ? { ...prev, bottleneckAudit: report } : null));
      showBanner(`System audit complete: ${report.passedCount}/${report.items.length} checks optimal.`);
    } catch (err: any) {
      showBanner(err?.message || 'Audit failed', 'error');
    }
  };

  const handleFixBottleneck = async (actionId: string) => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.fixBottleneck(actionId);
      if (res.success) {
        showBanner('Action executed successfully.');
        await handleRunAudit();
        await loadState();
      } else {
        showBanner(res.error || 'Failed to execute action', 'error');
      }
    } catch (err: any) {
      showBanner(err?.message || 'Action failed', 'error');
    }
  };

  const handleScanGames = async () => {
    if (!window.electronAPI) return;
    try {
      const games = await window.electronAPI.scanInstalledGames();
      setState((prev) => (prev ? { ...prev, games } : null));
      showBanner(`Found ${games.length} game(s) across Steam and Epic Games.`);
    } catch (err: any) {
      showBanner(err?.message || 'Library scan failed', 'error');
    }
  };

  const handleToggleGameSetting = async (
    exePath: string,
    exeName: string,
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority',
    enabled: boolean
  ) => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.setGameSetting({
        exePath,
        exeName,
        setting,
        enabled,
      });
      if (res.success) {
        showBanner(`Updated ${exeName}: ${setting.replace('_', ' ')} ${enabled ? 'enabled' : 'disabled'}.`);
        await handleScanGames();
      } else {
        showBanner(res.error || 'Failed to update game setting', 'error');
      }
    } catch (err: any) {
      showBanner(err?.message || 'Update failed', 'error');
    }
  };

  const handleAddCustomGame = async () => {
    if (!window.electronAPI) return;
    try {
      const browse = await window.electronAPI.browseGameExe();
      if (!browse.canceled && browse.filePath) {
        const res = await window.electronAPI.addCustomGame(browse.filePath);
        if (res.success) {
          showBanner(`Added custom game: ${browse.filePath}`);
          await handleScanGames();
        } else {
          showBanner(res.error || 'Failed to add game', 'error');
        }
      }
    } catch (err: any) {
      showBanner(err?.message || 'File selection failed', 'error');
    }
  };

  const handlePanicRecovery = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openPanicRecoveryFolder();
    if (res.success) {
      showBanner(`Opened Safe Mode Panic Recovery folder: ${res.path}`);
    } else {
      showBanner(res.error || 'Failed to open recovery folder', 'error');
    }
  };

  if (isLoading) {
    return (
      <PageLoadingState
        title={isRtl ? 'در حال بارگذاری تنظیمات گیمینگ و توان...' : 'Loading Gaming & Power State...'}
        subtitle={
          isRtl
            ? 'در حال پایش طرح‌های مصرف برق، تنظیمات گرافیک و بررسی باتلنک...'
            : 'Querying Windows power plans, GPU preferences, and system bottlenecks...'
        }
        icon={Gamepad2}
        variant="cards"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200">
      {/* Banner Notifications */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : bannerMessage.type === 'warning'
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
              : 'bg-red-950/60 border-red-500/40 text-red-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* Header & Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl glass-panel-elevated">
        {/* Module Title */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.25)]">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Gaming & Power</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-normal">
              Optimize power, gaming settings and system behavior for better performance.
            </p>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Restore Point Status / Create Button */}
          <button
            type="button"
            onClick={handleCreateRestorePoint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold glass-chip hover:border-emerald-500/30 text-emerald-400 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Restore Point Created</span>
          </button>

          {/* Undo All Changes */}
          <button
            type="button"
            onClick={handleUndoAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold neon-btn-primary transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo All Changes</span>
          </button>

          {/* Reset to Windows Defaults */}
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold glass-chip hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset to Windows Defaults</span>
          </button>

          {/* Panic Recovery */}
          <button
            type="button"
            onClick={handlePanicRecovery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive/15 hover:bg-destructive/25 text-rose-400 border border-destructive/30 transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Panic Recovery</span>
          </button>
        </div>
      </div>

      {/* Hardware Specs Strip */}
      <HardwareSpecsBar hardware={state?.hardware || null} />

      {/* Anti-Cheat Safety & Compatibility Diagnostic Card */}
      <AntiCheatCompatibilityCard onPresetApplied={loadState} />

      {/* Section A: Power Plan Manager */}
      {state && (
        <PowerPlanManager
          plans={state.powerPlans}
          keySettings={state.keySettings}
          activePlanGuid={state.hardware.activePowerPlanGuid}
          onActivatePlan={handleActivatePlan}
          onCreateCustomPlan={handleCreateCustomPlan}
        />
      )}

      {/* Section B: Gaming Settings */}
      {state && (
        <GamingSettings
          tweaks={state.gamingSettings}
          hardware={state.hardware}
          onToggleTweak={handleToggleTweak}
          onRevertTweak={handleRevertTweak}
        />
      )}

      {/* Section C: Advanced */}
      {state && (
        <AdvancedGamingSettings
          tweaks={state.advancedSettings || []}
          onToggleTweak={handleToggleTweak}
          onRevertTweak={handleRevertTweak}
        />
      )}

      {/* Section D: Experimental */}
      {state && (
        <ExperimentalSettings
          tweaks={state.experimentalSettings || []}
          onToggleTweak={handleToggleTweak}
          onRevertTweak={handleRevertTweak}
        />
      )}

      {/* FPS Esports & Shooter Optimizer */}
      <FpsEsportsCard onNotify={showBanner} />

      {/* GPU Render Pipeline & Low-Latency Engine */}
      <GpuPipelineCard onNotify={showBanner} />

      {/* Section E: Per-Game Settings */}
      {state && (
        <PerGameSettings
          games={state.games || []}
          onScanGames={handleScanGames}
          onToggleSetting={handleToggleGameSetting}
          onAddGame={handleAddCustomGame}
        />
      )}

      {/* In-Game HUD & Hardware Overlay */}
      <HudSettingsCard onNotify={showBanner} />

      {/* DPC & ISR Driver Latency Diagnostic */}
      <DpcIsrDiagnosticsCard />

      {/* Section F: Bottleneck Check */}
      {state && (
        <BottleneckCheck
          auditReport={state.bottleneckAudit || null}
          onRunAudit={handleRunAudit}
          onFixBottleneck={handleFixBottleneck}
        />
      )}

      {/* Section G: Game Session Mode */}
      <GameSessionMode onNotify={showBanner} />

      {/* 15-Second Test & Auto-Revert Countdown Modal */}
      {autoRevertDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
          <div className="relative w-full max-w-md rounded-lg bg-card border border-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Keep this gaming optimization?</h3>
                <p className="text-xs text-muted-foreground">
                  Testing responsiveness to ensure system stability.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-muted/40 border border-border text-center space-y-2">
              <span className="text-xs font-semibold text-foreground block">{autoRevertDialog.tweakName}</span>
              <div className="text-2xl font-bold text-amber-500 dark:text-amber-400 font-mono tracking-tight flex items-center justify-center gap-2">
                <span>Reverting in</span>
                <span className="w-9 h-9 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-300">
                  {autoRevertDialog.secondsRemaining}s
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                If not confirmed within 15 seconds, this setting will automatically revert to protect your system.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleConfirmRevert}
                className="w-full py-2 px-3 rounded-md text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span>Revert Now</span>
              </button>

              <button
                type="button"
                onClick={handleKeepTweak}
                className="w-full py-2 px-3 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Keep Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
