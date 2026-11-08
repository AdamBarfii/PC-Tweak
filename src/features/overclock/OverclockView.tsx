import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  Zap,
  Activity,
  Flame,
  Fan,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  OverclockCapabilities,
  OverclockTelemetry,
  AutoOverclockStep,
  OverclockAnalytics as IOverclockAnalytics,
} from '@/types/electron';
import { SafetyWatchdogBanner } from './components/SafetyWatchdogBanner';
import { GpuClockControls } from './components/GpuClockControls';
import { AutoOverclockScannerModal } from './components/AutoOverclockScannerModal';
import { OverclockAnalytics } from './components/OverclockAnalytics';

export const OverclockView: React.FC = () => {
  const { t } = useTranslation();

  const [capabilities, setCapabilities] = useState<OverclockCapabilities | null>(null);
  const [telemetry, setTelemetry] = useState<OverclockTelemetry>({
    coreClockMhz: 0,
    memClockMhz: 0,
    gpuTemp: 0,
    gpuHotspotTemp: null,
    powerWatts: 0,
    powerLimitPct: 100,
    fanSpeedPct: 0,
    fanRpm: null,
    gpuLoadPct: 0,
    voltageMv: 0,
    appliedCoreOffset: 0,
    appliedMemOffset: 0,
    watchdogActive: true,
    timestamp: 0,
  });
  const [analytics, setAnalytics] = useState<IOverclockAnalytics | null>(null);

  const [isApplying, setIsApplying] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [currentScanStep, setCurrentScanStep] = useState<AutoOverclockStep | null>(null);
  const [bannerAlert, setBannerAlert] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load capabilities & initial telemetry
  const refreshData = async () => {
    if (!window.electronAPI) return;
    try {
      const [caps, tel, ana] = await Promise.all([
        window.electronAPI.overclockGetCapabilities?.(),
        window.electronAPI.overclockGetTelemetry?.(),
        window.electronAPI.overclockGetAnalytics?.(),
      ]);
      if (caps) setCapabilities(caps);
      if (tel) setTelemetry(tel);
      if (ana) setAnalytics(ana);
    } catch (err) {
      console.error('Failed to refresh overclock telemetry:', err);
    }
  };

  useEffect(() => {
    refreshData();

    // Telemetry polling loop (1.5 seconds)
    pollIntervalRef.current = setInterval(async () => {
      if (window.electronAPI?.overclockGetTelemetry) {
        try {
          const tel = await window.electronAPI.overclockGetTelemetry();
          if (tel) setTelemetry(tel);
        } catch {}
      }
    }, 1500);

    // Listen to Auto-OC step events
    let unsubscribeScan: (() => void) | undefined;
    if (window.electronAPI?.onOverclockAutoScanStep) {
      unsubscribeScan = window.electronAPI.onOverclockAutoScanStep((step) => {
        setCurrentScanStep(step);
      });
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      unsubscribeScan?.();
    };
  }, []);

  const handleApplyOffsets = async (offsets: {
    coreOffsetMhz: number;
    memOffsetMhz: number;
    powerLimitPct: number;
    fanSpeedPct: number;
  }) => {
    if (!window.electronAPI?.overclockApplyOffset) return;
    setIsApplying(true);
    setBannerAlert(null);

    try {
      const res = await window.electronAPI.overclockApplyOffset(offsets);
      if (res.success) {
        setBannerAlert({
          text: t(
            'overclock.alerts.appliedSuccess',
            'Safe offsets applied: +{{core}} MHz Core, +{{mem}} MHz Memory, {{power}}% Power.',
            {
              core: res.applied.coreOffset,
              mem: res.applied.memOffset,
              power: res.applied.powerLimit,
            }
          ),
          type: 'success',
        });
        await refreshData();
      } else {
        setBannerAlert({
          text: res.error || t('overclock.alerts.applyFailed', 'Failed to apply offsets.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setBannerAlert({
        text: err?.message || t('overclock.alerts.applyFailed', 'Failed to apply offsets.'),
        type: 'error',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleRevertStock = async () => {
    if (!window.electronAPI?.overclockRevertStock) return;
    setIsReverting(true);
    setBannerAlert(null);

    try {
      const res = await window.electronAPI.overclockRevertStock();
      if (res.success) {
        setBannerAlert({
          text: t('overclock.alerts.stockRestored', 'Factory stock clock defaults restored.'),
          type: 'success',
        });
        await refreshData();
      }
    } catch (err: any) {
      setBannerAlert({
        text: err?.message || t('overclock.alerts.revertFailed', 'Failed to restore stock.'),
        type: 'error',
      });
    } finally {
      setIsReverting(false);
    }
  };

  const handleStartAutoScan = async () => {
    if (!window.electronAPI?.overclockStartAutoScan) return;
    setIsScanModalOpen(true);
    setCurrentScanStep({
      stage: 'preflight',
      currentStep: 1,
      totalSteps: 10,
      testedCoreOffset: 0,
      testedMemOffset: 0,
      currentTemp: telemetry.gpuTemp,
      stabilityScore: 100,
      statusMessage: t('overclock.modal.preflightCheck', 'Inspecting hardware guardrails: Voltage locked at +0 mV.'),
      isSafe: true,
    });

    try {
      const res = await window.electronAPI.overclockStartAutoScan();
      if (!res.success) {
        setCurrentScanStep((prev) =>
          prev
            ? {
                ...prev,
                stage: 'aborted',
                statusMessage: res.message,
              }
            : null
        );
      } else {
        await refreshData();
      }
    } catch (err: any) {
      setCurrentScanStep((prev) =>
        prev
          ? {
              ...prev,
              stage: 'aborted',
              statusMessage: err?.message || 'Auto-scan halted by safety watchdog.',
            }
          : null
      );
    }
  };

  const handleStopAutoScan = async () => {
    if (window.electronAPI?.overclockStopAutoScan) {
      await window.electronAPI.overclockStopAutoScan();
    }
    setCurrentScanStep((prev) =>
      prev
        ? {
            ...prev,
            stage: 'aborted',
            statusMessage: 'Auto-scan cancelled by user.',
          }
        : null
    );
  };

  return (
    <div className="space-y-6 pb-12 select-none">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center p-2 shadow-[0_0_20px_rgba(0,240,255,0.35)]">
              <Gauge className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                {t('overclock.title', 'Safe Overclocking & Analytics')}
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {t('overclock.badges.zeroHarm', 'Zero-Harm Architecture')}
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('overclock.subtitle', 'Non-destructive automated GPU frequency boost with 100ms thermal tripwire and boot-loop immunity.')}
              </p>
            </div>
          </div>
        </div>

        {/* 1-Click Auto-OC Hero Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleStartAutoScan}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 active:scale-95 transition-all shadow-[0_0_25px_rgba(0,240,255,0.4)]"
          >
            <Sparkles className="w-4 h-4 text-black animate-spin" />
            {t('overclock.actions.startAutoScan', '1-Click Safe Auto-OC')}
          </button>
        </div>
      </div>

      {/* Banner Notification Alert */}
      {bannerAlert && (
        <div
          className={`rounded-xl p-3 text-xs flex items-center justify-between border ${
            bannerAlert.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : bannerAlert.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerAlert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{bannerAlert.text}</span>
          </div>
          <button
            onClick={() => setBannerAlert(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Live Telemetry Cockpit (5 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Card 1: Core Clock */}
        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              {t('overclock.telemetry.coreClock', 'Core Clock')}
            </span>
            {telemetry.appliedCoreOffset !== 0 && (
              <span className="text-[10px] font-bold font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40">
                {telemetry.appliedCoreOffset > 0 ? `+${telemetry.appliedCoreOffset}` : telemetry.appliedCoreOffset} MHz
              </span>
            )}
          </div>
          <div className="text-xl font-black font-mono text-foreground">
            {telemetry.coreClockMhz > 0 ? `${telemetry.coreClockMhz} MHz` : 'Searching...'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Load: {telemetry.gpuLoadPct}%
          </div>
        </div>

        {/* Card 2: Memory Clock */}
        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              {t('overclock.telemetry.memClock', 'Memory Clock')}
            </span>
            {telemetry.appliedMemOffset > 0 && (
              <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
                +{telemetry.appliedMemOffset} MHz
              </span>
            )}
          </div>
          <div className="text-xl font-black font-mono text-foreground">
            {telemetry.memClockMhz > 0 ? `${telemetry.memClockMhz} MHz` : 'Searching...'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {capabilities?.gpuVendor || 'GPU'} VRAM
          </div>
        </div>

        {/* Card 3: GPU Temperature */}
        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              {t('overclock.telemetry.temp', 'GPU Temp')}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.gpuTemp < 65
                  ? 'bg-emerald-400'
                  : telemetry.gpuTemp < 78
                  ? 'bg-amber-400'
                  : 'bg-rose-500 animate-ping'
              }`}
            />
          </div>
          <div
            className={`text-xl font-black font-mono ${
              telemetry.gpuTemp < 65
                ? 'text-foreground'
                : telemetry.gpuTemp < 78
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {telemetry.gpuTemp > 0 ? `${telemetry.gpuTemp}°C` : 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Hotspot: {telemetry.gpuHotspotTemp ? `${telemetry.gpuHotspotTemp}°C` : 'Optimal'}
          </div>
        </div>

        {/* Card 4: Power Target / Draw */}
        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {t('overclock.telemetry.power', 'Power Draw')}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {telemetry.powerLimitPct}% Target
            </span>
          </div>
          <div className="text-xl font-black font-mono text-foreground">
            {telemetry.powerWatts > 0 ? `${telemetry.powerWatts} W` : 'Nominal'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Target Clamped: {telemetry.powerLimitPct}%
          </div>
        </div>

        {/* Card 5: Fan Speed */}
        <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 space-y-1 relative overflow-hidden group col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold flex items-center gap-1.5">
              <Fan className="w-3.5 h-3.5 text-cyan-400" />
              {t('overclock.telemetry.fan', 'Fan Speed')}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {telemetry.fanSpeedPct > 0 ? `${telemetry.fanSpeedPct}%` : 'Auto'}
            </span>
          </div>
          <div className="text-xl font-black font-mono text-foreground">
            {telemetry.fanRpm ? `${telemetry.fanRpm} RPM` : telemetry.fanSpeedPct > 0 ? `${telemetry.fanSpeedPct}%` : 'Auto Curve'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Acoustics Optimized
          </div>
        </div>
      </div>

      {/* Safety Watchdog Banner */}
      <SafetyWatchdogBanner
        onRevertStock={handleRevertStock}
        isReverting={isReverting}
        rollbackCount={analytics?.rollbackCount || 0}
      />

      {/* Main 2-Column Split: Sliders & Controls on Left, Analytics on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Manual Offset Sliders */}
        <GpuClockControls
          capabilities={capabilities}
          appliedCoreOffset={telemetry.appliedCoreOffset}
          appliedMemOffset={telemetry.appliedMemOffset}
          appliedPowerLimit={telemetry.powerLimitPct}
          appliedFanSpeed={telemetry.fanSpeedPct}
          onApply={handleApplyOffsets}
          onReset={refreshData}
          isApplying={isApplying}
        />

        {/* Right Column: Analytics & Silicon Headroom */}
        <OverclockAnalytics
          analytics={analytics}
          currentTemp={telemetry.gpuTemp}
        />
      </div>

      {/* Auto-OC Step Scanner Modal */}
      <AutoOverclockScannerModal
        isOpen={isScanModalOpen}
        currentStep={currentScanStep}
        onCancel={handleStopAutoScan}
        onClose={() => setIsScanModalOpen(false)}
      />
    </div>
  );
};
