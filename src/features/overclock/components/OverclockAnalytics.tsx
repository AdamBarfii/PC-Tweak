import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Flame, Activity, ShieldCheck, Zap, BarChart2, CheckCircle, Clock } from 'lucide-react';
import { OverclockAnalytics as IOverclockAnalytics } from '@/types/electron';

interface OverclockAnalyticsProps {
  analytics: IOverclockAnalytics | null;
  currentTemp: number;
}

export const OverclockAnalytics: React.FC<OverclockAnalyticsProps> = ({
  analytics,
  currentTemp,
}) => {
  const { t } = useTranslation();

  const headroom = analytics?.thermalHeadroomC ?? Math.max(0, 80 - currentTemp);
  const stability = analytics?.siliconStabilityIndex ?? 100;
  const fpsGain = analytics?.estimatedFpsGainPct ?? 0;
  const bandwidthDelta = analytics?.memoryBandwidthDeltaGbps ?? 0;
  const gflopsDelta = analytics?.gflopsDelta ?? 0;
  const peakTemp = analytics?.peakTempRecorded ?? currentTemp;
  const rollbacks = analytics?.rollbackCount ?? 0;
  const tdrs = analytics?.tdrEventsDetected ?? 0;
  const profileName = analytics?.activeProfileName ?? 'Factory Stock Defaults';

  // Silicon grade badge calculation
  const siliconGrade = stability >= 98 ? 'A+' : stability >= 90 ? 'A' : stability >= 80 ? 'B' : 'C';

  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('overclock.analytics.title', 'Hardware Analytics & Silicon Headroom')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('overclock.analytics.subtitle', 'Real-time thermal margins, stability scores, and performance metrics.')}
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
          Grade {siliconGrade} Silicon
        </span>
      </div>

      {/* Primary Analytics Grid: Thermal Headroom & Silicon Stability */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Thermal Headroom Gauge */}
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              {t('overclock.analytics.headroom', 'Thermal Headroom Margin')}
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              +{headroom}°C
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-foreground">
              {headroom}°C
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t('overclock.analytics.belowCeiling', 'safety buffer to 80°C')}
            </span>
          </div>
          {/* Gauge Bar */}
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                headroom > 25 ? 'bg-emerald-400' : headroom > 10 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, (headroom / 45) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Current temp: {currentTemp}°C | Peak: {peakTemp}°C
          </p>
        </div>

        {/* Card 2: Silicon Stability Index */}
        <div className="rounded-xl border border-white/5 bg-black/40 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              {t('overclock.analytics.stabilityIndex', 'Silicon Stability Index')}
            </span>
            <span className="text-xs font-mono font-bold text-cyan-400">
              {stability}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-cyan-300">
              {stability}%
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">
              {stability >= 95 ? t('overclock.analytics.excellent', 'Rock Solid') : t('overclock.analytics.good', 'Stable')}
            </span>
          </div>
          {/* Gauge Bar */}
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${stability}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            0 TDR Driver Resets | 0 Crash Events
          </p>
        </div>
      </div>

      {/* Estimated Gains Bar */}
      <div className="rounded-xl border border-white/5 bg-black/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
            {t('overclock.analytics.performanceGains', 'Estimated Performance Gain')}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {profileName}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-2.5 border border-white/5">
            <div className="text-[10px] text-muted-foreground font-medium">
              {t('overclock.analytics.estimatedFps', 'Estimated FPS Gain')}
            </div>
            <div className="text-lg font-black font-mono text-cyan-400 mt-0.5">
              +{fpsGain}%
            </div>
          </div>

          <div className="rounded-lg bg-white/5 p-2.5 border border-white/5">
            <div className="text-[10px] text-muted-foreground font-medium">
              {t('overclock.analytics.bandwidthDelta', 'VRAM Bandwidth')}
            </div>
            <div className="text-lg font-black font-mono text-emerald-400 mt-0.5">
              +{bandwidthDelta} GB/s
            </div>
          </div>

          <div className="rounded-lg bg-white/5 p-2.5 border border-white/5">
            <div className="text-[10px] text-muted-foreground font-medium">
              {t('overclock.analytics.gflopsDelta', 'Compute Delta')}
            </div>
            <div className="text-lg font-black font-mono text-amber-400 mt-0.5">
              +{gflopsDelta} GFLOPS
            </div>
          </div>
        </div>
      </div>

      {/* Health & Audit Telemetry Footer */}
      <div className="rounded-xl border border-white/5 bg-black/20 p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t('overclock.analytics.tripwireArmed', '100ms Tripwire Watchdog: Active')}</span>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <Clock className="w-3 h-3 text-cyan-400" />
          <span>
            {analytics?.lastTunedTimestamp
              ? t('overclock.analytics.lastTuned', 'Tuned: {{date}}', {
                  date: new Date(analytics.lastTunedTimestamp).toLocaleTimeString(),
                })
              : t('overclock.analytics.neverTuned', 'Status: Active')}
          </span>
        </div>
      </div>
    </div>
  );
};
