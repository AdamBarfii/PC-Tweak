import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  EyeOff,
  Radio,
  MapPin,
  Activity,
  Sparkles,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import { TweakStatusItem } from '@/types/electron';
import { Switch } from '@/components/common/Switch';
import { ImpactBadge } from '@/components/common/ImpactBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import { useUIStore } from '@/stores/uiStore';

// Semantic icon map corresponding to the 6 privacy vectors
const getTweakIcon = (tweakId: string): React.ElementType => {
  switch (tweakId) {
    case 'disable_telemetry':
      return Activity;
    case 'disable_wer':
      return Radio;
    case 'disable_cortana_copilot':
      return Sparkles;
    case 'disable_advertising_id':
      return EyeOff;
    case 'disable_activity_history':
      return Shield;
    case 'disable_location_diagnostics':
      return MapPin;
    default:
      return Shield;
  }
};

export const PrivacyView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { tweakChangeVersion, notifyTweakChanged } = useUIStore();

  const [tweaks, setTweaks] = useState<TweakStatusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [isBatchReverting, setIsBatchReverting] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
    requiresReboot?: boolean;
  } | null>(null);

  // Standard ordered sequence for consistent rendering
  const canonicalOrder = useMemo(
    () => [
      'disable_telemetry',
      'disable_wer',
      'disable_cortana_copilot',
      'disable_advertising_id',
      'disable_activity_history',
      'disable_location_diagnostics',
    ],
    []
  );

  const loadTweaks = useCallback(
    async (isBackgroundSync = false) => {
      if (!isBackgroundSync && tweaks.length === 0) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }

      try {
        if (window.electronAPI?.getTweaksList) {
          const list = await window.electronAPI.getTweaksList('privacy');
          const sorted = [...list].sort((a, b) => {
            const indexA = canonicalOrder.indexOf(a.id);
            const indexB = canonicalOrder.indexOf(b.id);
            return (indexA !== -1 ? indexA : 99) - (indexB !== -1 ? indexB : 99);
          });
          setTweaks(sorted);
        }
      } catch (err: any) {
        console.error('Failed to query privacy tweaks:', err);
        setStatusBanner({
          type: 'error',
          text: err?.message || t('privacy.fetchError', 'Failed to retrieve live privacy status.'),
        });
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [canonicalOrder, t, tweaks.length]
  );

  useEffect(() => {
    loadTweaks();
  }, [loadTweaks]);

  // Synchronize when tweaks are toggled in other views (e.g., Gaming, Profiles)
  useEffect(() => {
    if (tweakChangeVersion > 0) {
      loadTweaks(true);
    }
  }, [tweakChangeVersion, loadTweaks]);

  // Toggle individual tweak
  const handleToggleTweak = async (tweak: TweakStatusItem, willApply: boolean) => {
    if (!window.electronAPI) return;
    setActionLoading((prev) => ({ ...prev, [tweak.id]: true }));
    setStatusBanner(null);

    try {
      const res = willApply
        ? await window.electronAPI.applyTweak(tweak.id)
        : await window.electronAPI.revertTweak(tweak.id);

      if (res.success) {
        setTweaks((prev) =>
          prev.map((item) => (item.id === tweak.id ? { ...item, isApplied: willApply } : item))
        );

        setStatusBanner({
          type: 'success',
          text: willApply
            ? t('privacy.tweakAppliedSuccess', 'Protection activated successfully.')
            : t('privacy.tweakRevertedSuccess', 'Protection reverted to Windows default.'),
          requiresReboot: res.requiresReboot,
        });

        notifyTweakChanged();
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error || t('privacy.actionFailed', 'Failed to update tweak setting.'),
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || t('privacy.actionFailed', 'Failed to update tweak setting.'),
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [tweak.id]: false }));
    }
  };

  // Quick Action: Maximize Privacy (Batch apply unapplied tweaks)
  const handleMaximizePrivacy = async () => {
    if (!window.electronAPI) return;
    if (tweaks.length === 0) return;
    const unapplied = tweaks.filter((t) => !t.isApplied);
    if (unapplied.length === 0) {
      setStatusBanner({
        type: 'info',
        text: t('privacy.alreadyMaximized', 'All privacy protections are already active.'),
      });
      return;
    }

    setIsBatchApplying(true);
    setStatusBanner(null);

    try {
      const unappliedIds = unapplied.map((t) => t.id);
      const anyRequiresReboot = unapplied.some((t) => t.requiresReboot);

      if (window.electronAPI.batchApplyTweaks) {
        const result = await window.electronAPI.batchApplyTweaks(unappliedIds, true);
        if (result.success && result.count === unappliedIds.length) {
          setStatusBanner({
            type: 'success',
            text: t('privacy.maximizeSuccess', 'All 6 privacy protections have been successfully enabled.'),
            requiresReboot: anyRequiresReboot,
          });
        } else {
          setStatusBanner({
            type: 'warning',
            text: t('privacy.batchPartialError', 'Some tweaks could not be applied.'),
          });
        }
      } else {
        // Fallback sequential application
        let appliedCount = 0;
        for (const id of unappliedIds) {
          const res = await window.electronAPI.applyTweak(id);
          if (res.success) appliedCount++;
        }
        if (appliedCount === unappliedIds.length) {
          setStatusBanner({
            type: 'success',
            text: t('privacy.maximizeSuccess', 'All 6 privacy protections have been successfully enabled.'),
            requiresReboot: anyRequiresReboot,
          });
        } else {
          setStatusBanner({
            type: 'warning',
            text: t('privacy.batchPartialError', 'Some tweaks could not be applied.'),
          });
        }
      }

      notifyTweakChanged();
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || t('privacy.maximizeError', 'Failed to maximize privacy.'),
      });
    } finally {
      setIsBatchApplying(false);
    }
  };

  // Quick Action: Revert All (Batch revert applied tweaks)
  const handleRevertAllConfirm = async () => {
    setShowRevertDialog(false);
    if (!window.electronAPI) return;

    const applied = tweaks.filter((t) => t.isApplied);
    if (applied.length === 0) return;

    setIsBatchReverting(true);
    setStatusBanner(null);

    try {
      let failed = 0;
      for (const tweak of applied) {
        const res = await window.electronAPI.revertTweak(tweak.id);
        if (!res.success) failed++;
      }

      notifyTweakChanged();

      if (failed === 0) {
        setStatusBanner({
          type: 'success',
          text: t('privacy.revertSuccess', 'All privacy tweaks have been restored to Windows defaults.'),
        });
      } else {
        setStatusBanner({
          type: 'warning',
          text: t('privacy.revertPartialError', 'Some tweaks encountered issues during rollback.'),
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || t('privacy.revertError', 'Failed to revert privacy tweaks.'),
      });
    } finally {
      setIsBatchReverting(false);
    }
  };

  // Calculations for Protection Health Meter
  const appliedCount = tweaks.filter((t) => t.isApplied).length;
  const totalCount = tweaks.length || 6;
  const protectionPercentage = Math.round((appliedCount / totalCount) * 100);

  if (isLoading) {
    return (
      <PageLoadingState
        title={t('privacy.loadingTitle', 'Scanning Windows Privacy Policies...')}
        subtitle={t('privacy.loadingSubtitle', 'Reading live telemetry states, DiagTrack, WerSvc, and Windows diagnostic policies...')}
        icon={Shield}
        variant="cards"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* View Header with Shield Glow & Protection Summary */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl glass-panel relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/30 text-primary shadow-[0_0_16px_rgba(0,240,255,0.2)]">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {t('privacy.title', 'Privacy & Security')}
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                {t('privacy.zeroCloudTag', '100% Local')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-xl">
              {t(
                'privacy.subtitle',
                'Block intrusive Windows telemetry, crash log uploading, advertising tracking, and diagnostic harvesting with 100% rollback guarantee.'
              )}
            </p>
          </div>
        </div>

        {/* Protection Score Meter */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
          <div className="text-end">
            <div className="text-xs font-semibold text-foreground tabular-nums">
              {t('privacy.activeCount', '{{active}} of {{total}} Protected', {
                active: appliedCount,
                total: totalCount,
              })}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {appliedCount === totalCount
                ? t('privacy.fullyHardened', 'Maximum Hardening')
                : t('privacy.partiallyHardened', 'Partial Telemetry Active')}
            </div>
          </div>
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                className="text-white/10 fill-none"
              />
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={113}
                strokeDashoffset={113 - (113 * protectionPercentage) / 100}
                className="text-primary transition-all duration-500 fill-none"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[11px] font-mono font-bold text-primary">
              {protectionPercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl glass-panel">
        <div className="flex items-center gap-2">
          {/* Maximize Privacy Button */}
          <button
            type="button"
            onClick={handleMaximizePrivacy}
            disabled={isBatchApplying || isBatchReverting || appliedCount === totalCount}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm ${
              appliedCount === totalCount
                ? 'opacity-50 cursor-not-allowed bg-white/5 text-muted-foreground'
                : 'neon-btn-primary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isBatchApplying
                ? t('common.loading', 'Applying...')
                : t('privacy.maximize', 'Maximize Privacy')}
            </span>
          </button>

          {/* Revert All Button */}
          <button
            type="button"
            onClick={() => setShowRevertDialog(true)}
            disabled={isBatchApplying || isBatchReverting || appliedCount === 0}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-white/10 hover:border-red-500/30 text-muted-foreground hover:text-red-400 bg-white/[0.02] hover:bg-red-500/10 ${
              appliedCount === 0 ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {isBatchReverting
                ? t('common.loading', 'Reverting...')
                : t('privacy.revertAll', 'Revert All')}
            </span>
          </button>
        </div>

        {/* Sync / Refresh Button */}
        <button
          type="button"
          onClick={() => loadTweaks(true)}
          disabled={isSyncing}
          title={t('common.refresh', 'Sync Status')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
          <span className="hidden sm:inline">{t('common.refresh', 'Sync')}</span>
        </button>
      </div>

      {/* Dynamic Status / Alert Banner */}
      {statusBanner && (
        <div
          className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs transition-all ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : statusBanner.type === 'error'
              ? 'bg-red-500/10 border-red-500/25 text-red-300'
              : statusBanner.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
              : 'bg-blue-500/10 border-blue-500/25 text-blue-300'
          }`}
        >
          {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusBanner.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusBanner.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusBanner.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-relaxed">{statusBanner.text}</p>
            {statusBanner.requiresReboot && (
              <p className="text-[11px] opacity-90 font-mono flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                {t('privacy.rebootNotice', 'A Windows restart is recommended to complete service detachment.')}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={t('common.close', 'Dismiss notification')}
            onClick={() => setStatusBanner(null)}
            className="text-muted-foreground hover:text-foreground text-xs px-1 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* 6 Privacy Tweak Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tweaks.map((tweak) => {
          const Icon = getTweakIcon(tweak.id);
          const isTweakBusy = !!actionLoading[tweak.id] || isBatchApplying || isBatchReverting;

          return (
            <div
              key={tweak.id}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 ${
                tweak.isApplied
                  ? 'glass-panel-elevated border-primary/30 shadow-[0_0_12px_rgba(0,240,255,0.08)]'
                  : 'glass-panel border-white/10 hover:border-white/20'
              }`}
            >
              <div>
                {/* Card Top: Icon, Title & Switch */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        tweak.isApplied
                          ? 'bg-primary/15 text-primary border border-primary/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                          : 'bg-white/5 text-muted-foreground border border-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-foreground leading-snug">
                        {t(tweak.nameKey)}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {/* Live Status Chip */}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            tweak.isApplied
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : 'bg-muted/40 text-muted-foreground border-white/5'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              tweak.isApplied ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
                            }`}
                          />
                          {tweak.isApplied
                            ? t('privacy.statusApplied', 'Blocked')
                            : t('privacy.statusReverted', 'Default')}
                        </span>

                        {/* Impact Level Badge */}
                        <ImpactBadge impact={tweak.impact} />

                        {/* Reboot Required Badge */}
                        {tweak.requiresReboot && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {t('app.rebootRequired', 'Reboot')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interactive Switch */}
                  <div className="pt-0.5">
                    <Switch
                      checked={tweak.isApplied}
                      onChange={(checked) => handleToggleTweak(tweak, checked)}
                      isLoading={isTweakBusy}
                      size="md"
                      colorScheme="primary"
                      ariaLabel={t(tweak.nameKey)}
                    />
                  </div>
                </div>

                {/* Card Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-2.5 border-t border-white/5">
                  {t(tweak.descriptionKey)}
                </p>
              </div>

              {/* Anticheat Safe Guarantee */}
              <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  {t('privacy.anticheatSafe', 'Kernel Anti-Cheat Safe')}
                </span>
                <span className="text-[9px] opacity-60">ID: {tweak.id}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Revert All Action */}
      <ConfirmDialog
        isOpen={showRevertDialog}
        title={t('privacy.revertDialogTitle', 'Revert All Privacy Protections?')}
        message={t(
          'privacy.revertDialogMessage',
          'Are you sure you want to revert all privacy tweaks? Windows Error Reporting, Telemetry, Cortana/Copilot, Advertising ID, Activity Feed, and Location Sensor access will be restored to their factory Windows settings.'
        )}
        confirmLabel={t('privacy.revertDialogConfirm', 'Yes, Revert All')}
        cancelLabel={t('privacy.revertDialogCancel', 'Cancel')}
        isDestructive={true}
        onConfirm={handleRevertAllConfirm}
        onCancel={() => setShowRevertDialog(false)}
      />
    </div>
  );
};

export default PrivacyView;
