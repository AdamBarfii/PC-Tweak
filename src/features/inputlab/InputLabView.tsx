import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mouse,
  Zap,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useInputStore } from '@/stores/inputStore';
import { TweakRow } from './components/TweakRow';
import { HighPollingBufferCard } from './components/HighPollingBufferCard';
import { AutoRevertModal } from './components/AutoRevertModal';
import { PageLoadingState } from '@/components/common/PageLoadingState';

export const InputLabView: React.FC = () => {
  const { i18n } = useTranslation();
  const isFa = i18n.language === 'fa';

  const {
    optimizerState,
    isLoading,
    activeTweakIdInProgress,
    autoRevertDialog,
    healthAlert,
    loadOptimizerState,
    toggleTweak,
    revertTweak,
    undoAll,
    resetToDefaults,
    confirmAutoRevertKeep,
    triggerAutoRevertNow,
    openDisplaySettings,
  } = useInputStore();

  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  const [group1Open, setGroup1Open] = useState(true);
  const [group2Open, setGroup2Open] = useState(true);
  const [group3Open, setGroup3Open] = useState(false);

  useEffect(() => {
    loadOptimizerState();
  }, [loadOptimizerState]);

  const handleUndoAll = async () => {
    setUndoStatus(isFa ? 'در حال بازگردانی...' : 'Undoing...');
    const ok = await undoAll();
    setUndoStatus(ok ? (isFa ? 'انجام شد' : 'Done') : (isFa ? 'ناموفق' : 'Failed'));
    setTimeout(() => setUndoStatus(null), 2500);
  };

  const handleResetDefaults = async () => {
    setResetStatus(isFa ? 'در حال بازنشانی...' : 'Resetting...');
    const ok = await resetToDefaults();
    setResetStatus(ok ? (isFa ? 'بازنشانی شد' : 'Reset') : (isFa ? 'ناموفق' : 'Failed'));
    setTimeout(() => setResetStatus(null), 2500);
  };

  const group1Tweaks = optimizerState?.tweaks.filter((t) => t.group === 'mouse_keyboard') || [];
  const group2Tweaks = optimizerState?.tweaks.filter((t) => t.group === 'system_latency') || [];
  const group3Tweaks = optimizerState?.tweaks.filter((t) => t.group === 'advanced') || [];

  if (isLoading && !optimizerState) {
    return (
      <PageLoadingState
        title={isFa ? 'در حال بارگذاری بهینه‌ساز تأخیر ورودی...' : 'Loading Input Lag Optimizer...'}
        subtitle={
          isFa
            ? 'در حال خواندن وضعیت شتاب ماوس، نرخ تکرار کیبورد و تأخیر سیستم...'
            : 'Querying mouse precision, keyboard repeat, and system latency states...'
        }
        icon={Zap}
        variant="checklist"
      />
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-16 select-none animate-in fade-in duration-150">
      {/* 1. TOP HERO HEADER & ACTION CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl glass-panel-elevated">
        {/* Left: Brand Title & Subtitle */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.25)]">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>{isFa ? 'بهینه‌ساز تأخیر ورودی' : 'Input Lag Optimizer'}</span>
            </h1>
            <p className="text-xs text-muted-foreground font-normal">
              {isFa
                ? 'کاهش تأخیر و وقفه ماوس و کیبورد با تنظیمات بهینه‌شده.'
                : 'Reduce input lag and delay with optimized settings.'}
            </p>
          </div>
        </div>

        {/* Right: Top Action Bar (Restore Point, Undo All, Reset to Defaults) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Restore Point Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-chip text-foreground text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {optimizerState?.restorePointStatus.available
                ? isFa
                  ? 'نقطه بازیابی ایجاد شده'
                  : 'Restore Point Created'
                : isFa
                ? 'آماده‌سازی نقطه بازیابی'
                : 'Restore Point Ready'}
            </span>
          </div>

          {/* Undo All Changes Button */}
          <button
            onClick={handleUndoAll}
            disabled={isLoading || !optimizerState?.hasReversibleChanges}
            title={isFa ? 'بازگردانی تمام تغییرات به حالت قبل' : 'Undo all changes made in this session'}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
              optimizerState?.hasReversibleChanges
                ? 'bg-primary/15 hover:bg-primary/25 border-primary/40 text-primary shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                : 'bg-muted/40 text-muted-foreground border-white/10 cursor-not-allowed opacity-50'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{undoStatus || (isFa ? 'بازگردانی همه' : 'Undo All Changes')}</span>
          </button>

          {/* Reset Everything to Windows Defaults Button */}
          <button
            onClick={handleResetDefaults}
            disabled={isLoading}
            title={isFa ? 'تنظیم مجدد تمام موارد به حالت اولیه ویندوز' : 'Reset all options to Microsoft defaults'}
            className="px-3 py-1.5 rounded-lg glass-chip hover:text-foreground text-muted-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{resetStatus || (isFa ? 'تنظیمات پیش‌فرض' : 'Reset to Defaults')}</span>
          </button>
        </div>
      </div>

      {/* HEALTH ALERT BANNER */}
      {healthAlert && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="font-semibold">{isFa ? healthAlert.messageFa : healthAlert.message}</span>
          </div>
          <button
            onClick={() => useInputStore.setState({ healthAlert: null })}
            className="text-amber-500 hover:text-foreground p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* GROUP 1: MOUSE & KEYBOARD (Safe, No Admin) */}
      {/* ========================================== */}
      <div className="rounded-xl glass-panel overflow-hidden">
        {/* Group Header */}
        <div
          onClick={() => setGroup1Open(!group1Open)}
          className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-white/10 dark:border-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]">
              <Mouse className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                <span>{isFa ? 'ماوس و کیبورد' : 'Mouse & Keyboard'}</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isFa
                  ? 'بهینه‌سازی تنظیمات ماوس و کیبورد بدون نیاز به دسترسی ادمین.'
                  : 'Optimize your input devices for lower latency.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              <ShieldCheck className="w-3 h-3" />
              <span>{isFa ? 'ایمن' : 'Safe'}</span>
            </span>
            {group1Open ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Group Rows List */}
        {group1Open && (
          <div className="p-3.5 space-y-2 animate-in fade-in duration-100">
            {group1Tweaks.map((tweak) => (
              <TweakRow
                key={tweak.id}
                tweak={tweak}
                isBusy={activeTweakIdInProgress === tweak.id}
                onToggle={toggleTweak}
                onRevert={revertTweak}
              />
            ))}
          </div>
        )}
      </div>

      {/* High-Polling Buffer Queue Engine */}
      <HighPollingBufferCard />

      {/* ========================================== */}
      {/* GROUP 2: SYSTEM LATENCY (Safe / Moderate)  */}
      {/* ========================================== */}
      <div className="rounded-xl glass-panel overflow-hidden">
        {/* Group Header */}
        <div
          onClick={() => setGroup2Open(!group2Open)}
          className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-white/10 dark:border-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                <span>{isFa ? 'تأخیر سیستم' : 'System Latency'}</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isFa
                  ? 'بهینه‌سازی سیستم‌عامل برای کاهش تأخیر پردازش و مدیریت توان پردازنده.'
                  : 'Windows system optimizations for reduced processing and power throttling overhead.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
              <AlertTriangle className="w-3 h-3" />
              <span>{isFa ? 'متوسط' : 'Moderate'}</span>
            </span>
            {group2Open ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Group Rows List */}
        {group2Open && (
          <div className="p-3.5 space-y-2 animate-in fade-in duration-100">
            {group2Tweaks.map((tweak) => (
              <TweakRow
                key={tweak.id}
                tweak={tweak}
                isBusy={activeTweakIdInProgress === tweak.id}
                onToggle={toggleTweak}
                onRevert={revertTweak}
                onAction={openDisplaySettings}
              />
            ))}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* GROUP 3: ADVANCED (Reboot, Collapsed Default) */}
      {/* ========================================== */}
      <div className="rounded-xl glass-panel border-destructive/40 overflow-hidden">
        {/* Group Header (Collapsed by Default) */}
        <div
          onClick={() => setGroup3Open(!group3Open)}
          className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-white/10 dark:border-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/25 flex items-center justify-center text-destructive">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground flex items-center gap-2">
                <span>{isFa ? 'بهینه‌سازی‌های پیشرفته' : 'Advanced Optimizations'}</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isFa
                  ? 'تنظیمات سطح سخت‌افزار نیازمند راه‌اندازی مجدد سیستم و دسترسی ادمین.'
                  : 'Hardware-level adjustments requiring system reboot and administrator privileges.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/15 text-rose-400 border border-destructive/25">
              <AlertTriangle className="w-3 h-3" />
              <span>{isFa ? 'پیشرفته (نیازمند ری‌استارت)' : 'Advanced (Reboot Required)'}</span>
            </span>
            {group3Open ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Group Rows List */}
        {group3Open && (
          <div className="p-3.5 space-y-2 bg-destructive/5 animate-in fade-in duration-100">
            {group3Tweaks.map((tweak) => (
              <TweakRow
                key={tweak.id}
                tweak={tweak}
                isBusy={activeTweakIdInProgress === tweak.id}
                onToggle={toggleTweak}
                onRevert={revertTweak}
              />
            ))}
          </div>
        )}
      </div>

      {/* FLOATING 15-SECOND TEST & AUTO-REVERT MODAL */}
      <AutoRevertModal
        dialog={autoRevertDialog}
        onKeep={confirmAutoRevertKeep}
        onRevert={triggerAutoRevertNow}
      />
    </div>
  );
};
