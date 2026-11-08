import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Lock,
  RefreshCw,
  ExternalLink,
  MousePointer,
  Crosshair,
  Keyboard,
  Filter,
  SlidersHorizontal,
  Globe,
  Zap,
  Cpu,
  Monitor,
  Flame,
  HardDrive,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { AntiCheatBadge } from '@/features/anticheat/components/AntiCheatBadge';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';
import { Switch } from '@/components/common/Switch';
import type { OptimizerTweakItem } from '@/types/electron';

interface TweakRowProps {
  tweak: OptimizerTweakItem;
  isBusy: boolean;
  onToggle: (id: string) => void;
  onRevert: (id: string) => void;
  onAction?: () => void;
}

// Icon mapper for clean visual identity
function getTweakIcon(id: string) {
  switch (id) {
    case 'mouse_disable_acceleration':
      return Crosshair;
    case 'pointer_speed_neutral':
      return MousePointer;
    case 'keyboard_repeat_fastest':
      return Keyboard;
    case 'keyboard_turn_off_filterkeys':
      return Filter;
    case 'keyboard_turn_off_sticky_toggle':
      return SlidersHorizontal;
    case 'keyboard_turn_off_alt_shift':
      return Globe;
    case 'usb_selective_suspend_off':
      return Zap;
    case 'power_plan_ultimate':
      return Flame;
    case 'pcie_link_state_off':
      return Layers;
    case 'processor_state_100_core_unpark':
      return Cpu;
    case 'game_mode_on_dvr_off':
      return Zap;
    case 'windowed_optimizations_win11':
      return Monitor;
    case 'global_timer_resolution_requests':
      return SlidersHorizontal;
    case 'monitor_refresh_rate_info':
      return Monitor;
    case 'msi_mode_gpu_usb':
      return Zap;
    case 'vbs_memory_integrity_off':
      return AlertTriangle;
    case 'hyperv_launch_off':
      return Cpu;
    default:
      return Zap;
  }
}

export const TweakRow: React.FC<TweakRowProps> = ({
  tweak,
  isBusy,
  onToggle,
  onRevert,
  onAction,
}) => {
  const { i18n } = useTranslation();
  const isFa = i18n.language === 'fa';
  const Icon = getTweakIcon(tweak.id);

  const [showHelp, setShowHelp] = useState(false);
  const guidance = getTweakGuidance(tweak.id);

  const displayName = isFa ? tweak.nameFa : tweak.name;
  const displayDesc = isFa ? tweak.descriptionFa : tweak.description;
  const displayState = isFa ? tweak.currentStateTextFa : tweak.currentStateText;
  const displayBlockedReason = isFa ? tweak.blockedReasonFa : tweak.blockedReason;

  return (
    <div
      className={`p-3 rounded-lg transition-colors border flex flex-col justify-between gap-2 text-card-foreground ${
        tweak.blockedReason
          ? 'bg-card/40 border-border/50 opacity-60'
          : 'bg-card border-border hover:border-primary/40 shadow-sm'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Icon & Text & Badges */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground tracking-wide truncate">
                {displayName}
              </span>

              {/* Risk Badge */}
              {tweak.risk === 'safe' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{isFa ? 'ایمن' : 'Safe'}</span>
                </span>
              )}
              {tweak.risk === 'moderate' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{isFa ? 'متوسط' : 'Moderate'}</span>
                </span>
              )}
              {tweak.risk === 'advanced' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/30">
                  <AlertCircle className="w-3 h-3" />
                  <span>{isFa ? 'پیشرفته' : 'Advanced'}</span>
                </span>
              )}

              {/* Anti-Cheat Safety Badge */}
              <AntiCheatBadge
                level={tweak.anticheat}
                note={tweak.anticheatNote}
                affectedAntiCheats={tweak.affectedAntiCheats}
                isLocked={tweak.anticheat === 'blocked-risk'}
              />

              {/* Flags */}
              {tweak.requiresAdmin && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{isFa ? 'ادمین' : 'Admin'}</span>
                </span>
              )}
              {tweak.requiresReboot && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>{isFa ? 'نیازمند ریستارت' : 'Reboot'}</span>
                </span>
              )}

              {/* Guidance / Help Button */}
              {guidance && (
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                    showHelp
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted border border-border'
                  }`}
                  title={isFa ? 'مشاهده راهنما و میزان اثرگذاری' : 'View guidance & impact analysis'}
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>{isFa ? 'راهنما' : 'Help & Impact'}</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">{displayDesc}</p>

            {/* Blocked / Incompatibility Warning */}
            {displayBlockedReason && (
              <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1 mt-0.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{displayBlockedReason}</span>
              </p>
            )}
          </div>
        </div>

        {/* Right: State & Toggle & Per-Row Revert */}
        <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 sm:border-s sm:border-border sm:ps-4">
          {/* Current State Text */}
          <span
            className={`text-xs font-mono font-semibold ${
              tweak.isApplied ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            {displayState}
          </span>

          {/* If Info Only (e.g. Monitor Refresh Rate) */}
          {tweak.isInfoOnly ? (
            <button
              onClick={onAction}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 active:scale-98 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <span>{isFa ? 'تنظیمات نمایشگر' : tweak.infoActionLabel || 'Open Settings'}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          ) : (
            <>
              {/* Toggle Switch */}
              <Switch
                checked={tweak.isApplied}
                onChange={() => onToggle(tweak.id)}
                disabled={isBusy || Boolean(tweak.blockedReason) || tweak.anticheat === 'blocked-risk'}
                isLoading={isBusy}
                ariaLabel={`Toggle ${tweak.name}`}
              />

              {/* Per-Row Revert Button */}
              <button
                onClick={() => onRevert(tweak.id)}
                disabled={isBusy || !tweak.isApplied}
                title={isFa ? 'بازگردانی این تنظیم' : 'Revert this tweak'}
                className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-all ${
                  tweak.isApplied
                    ? 'bg-muted border-border text-foreground hover:bg-muted/80 cursor-pointer'
                    : 'bg-muted/30 border-border/40 text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{isFa ? 'بازگردانی' : 'Revert'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expandable Guidance Drawer */}
      {showHelp && guidance && <TweakGuidanceDrawer guidance={guidance} />}
    </div>
  );
};
