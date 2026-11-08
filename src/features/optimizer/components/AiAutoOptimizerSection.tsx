import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Sparkles,
  Zap,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Play,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Gauge,
  Cpu,
  HardDrive,
  Server,
  Globe,
  ChevronDown,
  ChevronUp,
  Layers,
  Check,
  Trophy,
  Flame,
  Timer,
  CheckCheck,
} from 'lucide-react';
import {
  AiOptimizationPlan,
  AiOptimizationSnapshot,
  AiActionItem,
} from '@/types/electron';

interface AiAutoOptimizerSectionProps {
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
  onTweakApplied?: () => void;
}

export const AiAutoOptimizerSection: React.FC<AiAutoOptimizerSectionProps> = ({
  onNotify,
  onTweakApplied,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [plan, setPlan] = useState<AiOptimizationPlan | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const [activeSnapshot, setActiveSnapshot] = useState<AiOptimizationSnapshot | null>(null);

  // Execution states
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ step: string; percent: number }>({
    step: '',
    percent: 0,
  });
  const [executionResult, setExecutionResult] = useState<{
    appliedCount: number;
    reclaimedRamMb: number;
    reclaimedDiskMb: number;
    preScore: number;
    postScore: number;
  } | null>(null);

  const [isUndoing, setIsUndoing] = useState(false);

  const scanSteps = useMemo(
    () => [
      isRtl ? 'در حال پایش معماری پردازنده و هسته‌ها...' : 'Profiling CPU Architecture & Topology...',
      isRtl ? 'بررسی ظرفیت کارت گرافیک و خط لوله اینتراپت...' : 'Measuring GPU Headroom & Interrupt Pipeline...',
      isRtl ? 'آنالیز فشار حافظه رم و حافظه آماده‌به‌کار (Standby)...' : 'Analyzing Memory Working Sets & Standby Cache...',
      isRtl ? 'اسکن فایل‌های زائد موقت و سلامت درایو ذخیره‌سازی...' : 'Scanning Temporary Junk & Storage Health...',
      isRtl ? 'بررسی سازگاری و امنیت آنتی‌چیت‌ها (Vanguard / EAC)...' : 'Verifying Anti-Cheat Compatibility (Vanguard / EAC)...',
      isRtl ? 'سنتز مشخصات سخت‌افزاری و تولید نقشه بهینه‌سازی هوش مصنوعی...' : 'Synthesizing AI Hardware Persona & Optimization Blueprint...',
    ],
    [isRtl]
  );

  const loadSnapshot = async () => {
    try {
      if (window.electronAPI?.aiOptimizerGetSnapshot) {
        const snap = await window.electronAPI.aiOptimizerGetSnapshot();
        setActiveSnapshot(snap);
      }
    } catch (err) {
      console.error('Failed to load AI snapshot:', err);
    }
  };

  useEffect(() => {
    loadSnapshot();

    // Listen for progress events
    const unbind = window.electronAPI?.onAiOptimizerProgress?.((data) => {
      setExecutionProgress(data);
    });

    return () => {
      unbind?.();
    };
  }, []);

  const runAiScan = async () => {
    if (!window.electronAPI?.aiOptimizerScanAndPlan) return;
    setIsScanning(true);
    setScanStepIndex(0);
    setExecutionResult(null);

    // Simulated radar animation through the 6 profiling steps
    const stepInterval = setInterval(() => {
      setScanStepIndex((prev) => (prev < scanSteps.length - 1 ? prev + 1 : prev));
    }, 380);

    try {
      const generatedPlan = await window.electronAPI.aiOptimizerScanAndPlan();
      clearInterval(stepInterval);
      setScanStepIndex(scanSteps.length - 1);
      setTimeout(() => {
        setPlan(generatedPlan);
        setSelectedActionIds(new Set(generatedPlan.actions.map((a) => a.id)));
        setIsScanning(false);
        onNotify(
          isRtl
            ? 'اسکن هوش مصنوعی با موفقیت کامل شد. نقشه بهینه‌سازی آماده است.'
            : 'AI Diagnostic complete. Optimization blueprint ready for review.',
          'success'
        );
      }, 500);
    } catch (err: any) {
      clearInterval(stepInterval);
      setIsScanning(false);
      onNotify(err?.message || 'AI Scan failed', 'error');
    }
  };

  const handleToggleAction = (id: string) => {
    setSelectedActionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!plan) return;
    setSelectedActionIds(new Set(plan.actions.map((a) => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedActionIds(new Set());
  };

  const handleExecutePlan = async () => {
    if (!window.electronAPI?.aiOptimizerExecute || !plan) return;
    if (selectedActionIds.size === 0) {
      onNotify(
        isRtl ? 'لطفاً حداقل یک بهینه‌سازی را انتخاب کنید.' : 'Please select at least one action to optimize.',
        'warning'
      );
      return;
    }

    setIsExecuting(true);
    setExecutionProgress({ step: 'Initializing AI Engine...', percent: 5 });

    try {
      const res = await window.electronAPI.aiOptimizerExecute({
        actionIds: Array.from(selectedActionIds),
      });

      if (res.success) {
        setExecutionResult({
          appliedCount: res.appliedCount,
          reclaimedRamMb: res.reclaimedRamMb,
          reclaimedDiskMb: res.reclaimedDiskMb,
          preScore: plan.currentScore,
          postScore: plan.projectedScore,
        });
        await loadSnapshot();
        onTweakApplied?.();
        onNotify(
          isRtl
            ? `بهینه‌سازی خودکار با موفقیت انجام شد: ${res.appliedCount} مورد اعمال گردید.`
            : `AI Auto-Tune complete: ${res.appliedCount} optimizations applied successfully.`,
          'success'
        );
      } else {
        onNotify(res.message || 'Execution failed', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'AI Auto-Tune execution failed', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!window.electronAPI?.aiOptimizerUndo) return;
    setIsUndoing(true);
    try {
      const res = await window.electronAPI.aiOptimizerUndo();
      if (res.success) {
        setActiveSnapshot(null);
        setExecutionResult(null);
        onTweakApplied?.();
        onNotify(
          isRtl
            ? 'تنظیمات با موفقیت به حالت اولیه بازگردانی شدند.'
            : 'AI Optimizations reverted to baseline configuration.',
          'success'
        );
        // Refresh plan
        runAiScan();
      } else {
        onNotify(res.message || 'Failed to revert AI optimizations', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Rollback failed', 'error');
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Cockpit Banner */}
      <div className="rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-card via-card/80 to-cyan-950/20 backdrop-blur-2xl p-6 shadow-2xl relative overflow-hidden">
        {/* Ambient Neon Glow */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center p-2.5 shadow-[0_0_20px_rgba(0,240,255,0.3)]">
              <Bot className="w-full h-full text-cyan-400 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-black text-foreground tracking-wide">
                  {isRtl ? 'تیونر و بهینه‌ساز هوشمند هوش مصنوعی' : 'AI Auto-Tweak & Intelligent Optimizer'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]">
                  Neural Heuristic
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  100% Anti-Cheat Safe
                </span>
              </div>
              <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                {isRtl
                  ? 'هوش مصنوعی سخت‌افزار، بازی‌ها و آنتی‌چیت‌های شما را پایش کرده و یک پکیج بهینه‌سازی اختصاصی و بدون ریسک تولید و با ۱ کلیک اعمال می‌کند.'
                  : 'Profiles your exact CPU topology, GPU, memory load, and installed anti-cheats to generate and apply a bespoke, zero-harm optimization plan in 1 click.'}
              </p>
            </div>
          </div>

          {/* Action Buttons Top Right */}
          <div className="flex items-center gap-3 flex-wrap">
            {activeSnapshot && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={isUndoing || isExecuting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
                <span>{isRtl ? 'بازگردانی تغییرات قبلی' : 'Undo AI Tweaks'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={runAiScan}
              disabled={isScanning || isExecuting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 fill-current ${isScanning ? 'animate-spin' : ''}`} />
              <span>
                {isScanning
                  ? isRtl ? 'در حال اسکن عمیق...' : 'Deep Scanning...'
                  : isRtl ? '⚡ اسکن و عیب‌یابی هوشمند' : '⚡ Run AI Diagnostic'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Holographic Radar Scanner View (During Active Scan) */}
      {isScanning && (
        <div className="rounded-3xl border border-cyan-500/30 bg-card/60 backdrop-blur-xl p-8 shadow-xl flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* Concentric Scanner Rings */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-ping opacity-40" />
            <div className="absolute inset-2 rounded-full border border-cyan-500/40 animate-pulse" />
            <div className="absolute inset-5 rounded-full border border-dashed border-cyan-400/60 animate-spin" />
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.5)]">
              <Sparkles className="w-6 h-6 text-cyan-300 animate-bounce" />
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">
              {isRtl ? 'پایش هوشمند و عیب‌یابی اختصاصی سیستم' : 'AI Deep System Telemetry Scan'}
            </h3>
            <p className="text-xs font-mono text-cyan-400 animate-pulse">
              {scanSteps[scanStepIndex]}
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex items-center gap-1.5">
            {scanSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === scanStepIndex
                    ? 'w-6 bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.7)]'
                    : i < scanStepIndex
                    ? 'w-3 bg-emerald-400'
                    : 'w-2 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Execution Progress Bar Modal / Stream */}
      {isExecuting && (
        <div className="p-5 rounded-2xl border border-cyan-500/40 bg-card/90 backdrop-blur-xl shadow-2xl space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>{executionProgress.step}</span>
            </span>
            <span className="font-mono font-bold text-cyan-400">{executionProgress.percent}%</span>
          </div>
          <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-300 ease-out rounded-full shadow-[0_0_12px_rgba(0,240,255,0.6)]"
              style={{ width: `${executionProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Celebratory Completion Report */}
      {executionResult && !isExecuting && (
        <div className="p-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-transparent shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-md">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {isRtl ? 'سیستم با موفقیت بهینه‌سازی شد!' : 'AI Auto-Tune Applied Successfully!'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRtl
                    ? `${executionResult.appliedCount} مورد بهینه‌سازی اختصاصی با ایمنی کامل اعمال گردید.`
                    : `${executionResult.appliedCount} tailored optimizations executed with zero-harm guardrails.`}
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-emerald-500 text-black shadow-md">
              Score: {executionResult.preScore} → {executionResult.postScore}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/40 text-xs">
            <div className="p-2.5 rounded-xl bg-card border border-border/60">
              <span className="text-[10px] text-muted-foreground">{isRtl ? 'بهینه‌سازی‌ها:' : 'Optimizations:'}</span>
              <p className="text-sm font-mono font-bold text-foreground">{executionResult.appliedCount} applied</p>
            </div>
            <div className="p-2.5 rounded-xl bg-card border border-border/60">
              <span className="text-[10px] text-muted-foreground">{isRtl ? 'رم آزاد شده:' : 'RAM Reclaimed:'}</span>
              <p className="text-sm font-mono font-bold text-emerald-400">+{executionResult.reclaimedRamMb} MB</p>
            </div>
            <div className="p-2.5 rounded-xl bg-card border border-border/60">
              <span className="text-[10px] text-muted-foreground">{isRtl ? 'فضای دیسک پاک‌شده:' : 'Disk Junk Cleaned:'}</span>
              <p className="text-sm font-mono font-bold text-cyan-400">+{executionResult.reclaimedDiskMb} MB</p>
            </div>
            <div className="p-2.5 rounded-xl bg-card border border-border/60">
              <span className="text-[10px] text-muted-foreground">{isRtl ? 'نقطه بازگردانی:' : 'Restore Point:'}</span>
              <p className="text-sm font-mono font-bold text-emerald-400 flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" />
                Protected
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Diagnostic Results & Plan Blueprint */}
      {plan && !isScanning && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Diagnostic Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Performance Index Gauge */}
            <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-4 flex flex-col justify-between gap-3 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  {isRtl ? 'شاخص عملکرد سیستم' : 'System Performance Score'}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Current vs Potential</span>
              </div>

              <div className="flex items-center justify-between px-2">
                <div className="text-center">
                  <span className="text-3xl font-black font-mono text-amber-400">{plan.currentScore}</span>
                  <p className="text-[10px] text-muted-foreground">{isRtl ? 'فعلی' : 'Current'}</p>
                </div>

                <div className="flex flex-col items-center">
                  <ArrowRight className="w-5 h-5 text-cyan-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    +{plan.projectedScore - plan.currentScore} pts
                  </span>
                </div>

                <div className="text-center">
                  <span className="text-3xl font-black font-mono text-emerald-400">{plan.projectedScore}</span>
                  <p className="text-[10px] text-emerald-300 font-semibold">{isRtl ? 'پس از تیونینگ' : 'AI Optimized'}</p>
                </div>
              </div>

              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 h-full rounded-full"
                  style={{ width: `${plan.projectedScore}%` }}
                />
              </div>
            </div>

            {/* Card 2: Persona & AI Diagnosis */}
            <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-4 flex flex-col justify-between gap-2 shadow-md md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                    {plan.personaTitle}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">{plan.personaDesc}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-cyan-400 mr-1.5">🧠 AI Diagnosis:</span>
                <span>{plan.aiDiagnosis}</span>
              </div>

              {/* Gains Projection Strip */}
              <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                <div className="p-1.5 rounded-lg bg-card border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">{isRtl ? 'فریم 1% Low:' : '1% Low FPS:'}</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">+{plan.estimatedGains.fpsBoostPct}%</span>
                </div>
                <div className="p-1.5 rounded-lg bg-card border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">{isRtl ? 'تاخیر ورودی:' : 'Input Delay:'}</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">-{plan.estimatedGains.latencyReductionMs} ms</span>
                </div>
                <div className="p-1.5 rounded-lg bg-card border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">{isRtl ? 'رم آزادشونده:' : 'RAM Headroom:'}</span>
                  <span className="text-xs font-mono font-bold text-purple-400">~{plan.estimatedGains.ramReclaimMb} MB</span>
                </div>
                <div className="p-1.5 rounded-lg bg-card border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">{isRtl ? 'پاک‌سازی دیسک:' : 'Disk Junk:'}</span>
                  <span className="text-xs font-mono font-bold text-amber-400">~{plan.estimatedGains.diskReclaimMb} MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Items Review & Toggles */}
          <div className="rounded-3xl border border-border bg-card/60 backdrop-blur-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
              <div>
                <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {isRtl
                      ? `اقدامات بهینه‌سازی پیشنهادی (${selectedActionIds.size} از ${plan.actions.length} انتخاب شده)`
                      : `Recommended Optimizations (${selectedActionIds.size} of ${plan.actions.length} selected)`}
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isRtl
                    ? 'همه بهینه‌سازی‌ها بر اساس سخت‌افزار شما سنجیده شده و ۱۰۰٪ با آنتی‌چیت‌ها سازگار هستند.'
                    : 'Each item is individually tailored and guaranteed anti-cheat safe. Uncheck any item to exclude.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  {isRtl ? 'انتخاب همه' : 'Select All'}
                </button>
                <span className="text-muted-foreground text-xs">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {isRtl ? 'عدم انتخاب' : 'Clear All'}
                </button>
              </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {plan.actions.map((action) => {
                const isSelected = selectedActionIds.has(action.id);

                return (
                  <div
                    key={action.id}
                    onClick={() => handleToggleAction(action.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-sm'
                        : 'bg-card/40 border-border/60 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent onClick
                      className="mt-1 w-4 h-4 rounded bg-muted border-border text-cyan-400 focus:ring-cyan-400 cursor-pointer"
                    />

                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground">{action.titleFallback}</span>

                        <div className="flex items-center gap-1.5">
                          {action.impact === 'high' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              High Impact
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Safe
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-snug">{action.descFallback}</p>

                      <div className="pt-1 flex items-center gap-1 text-[10px] text-cyan-300 font-medium">
                        <span className="font-bold">AI Rationale:</span>
                        <span>{action.reasonFallback}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom 1-Click Execution Bar */}
            <div className="pt-3 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isRtl
                    ? 'پیش از اعمال، نقطه بازگردانی خودکار (Restore Point) ویندوز ایجاد می‌شود.'
                    : 'A Windows System Restore Point is automatically created prior to optimization.'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleExecutePlan}
                disabled={isExecuting || selectedActionIds.size === 0}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {isRtl
                    ? `⚡ اعمال بهینه‌سازی هوشمند (${selectedActionIds.size} مورد)`
                    : `⚡ Apply AI Auto-Tune (${selectedActionIds.size} Optimizations)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
