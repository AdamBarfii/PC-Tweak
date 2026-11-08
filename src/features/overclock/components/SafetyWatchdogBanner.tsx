import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, RotateCcw, Lock, AlertCircle, Zap } from 'lucide-react';

interface SafetyWatchdogBannerProps {
  onRevertStock: () => void;
  isReverting?: boolean;
  rollbackCount: number;
}

export const SafetyWatchdogBanner: React.FC<SafetyWatchdogBannerProps> = ({
  onRevertStock,
  isReverting,
  rollbackCount,
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/20 via-background/60 to-cyan-950/20 p-4 shadow-[0_0_25px_rgba(16,185,129,0.1)] backdrop-blur-md">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Guardrail summary */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground tracking-wide">
                {t('overclock.safety.title', 'Zero-Harm Hardware Safety Active')}
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t('overclock.safety.watchdogActive', '100ms Tripwire Armed')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">
              {t(
                'overclock.safety.description',
                'Offsets run purely in active memory with locked voltage (+0 mV). In the event of high temperatures (>80°C) or driver recovery, settings automatically revert to factory stock.'
              )}
            </p>

            {/* Micro Badges */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/40 text-muted-foreground border border-white/5">
                <Lock className="w-3 h-3 text-cyan-400" />
                {t('overclock.safety.voltageLocked', 'Voltage: Locked (+0 mV)')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/40 text-muted-foreground border border-white/5">
                <Zap className="w-3 h-3 text-emerald-400" />
                {t('overclock.safety.bootImmunity', 'Boot-Loop Immune (In-Memory)')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/40 text-muted-foreground border border-white/5">
                <AlertCircle className="w-3 h-3 text-amber-400" />
                {t('overclock.safety.thermalCeiling', 'Thermal Tripwire: 80°C GPU / 85°C CPU')}
              </span>
              {rollbackCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {t('overclock.safety.autoRollbacks', 'Protected Rollbacks: {{count}}', { count: rollbackCount })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Instant Stock Revert Button */}
        <div className="shrink-0 self-end md:self-center">
          <button
            onClick={onRevertStock}
            disabled={isReverting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-foreground bg-white/5 hover:bg-white/10 active:scale-95 border border-white/15 hover:border-white/30 transition-all duration-200 shadow-sm"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-cyan-400 ${isReverting ? 'animate-spin' : ''}`} />
            {t('overclock.actions.revertStock', 'Revert to Factory Stock')}
          </button>
        </div>
      </div>
    </div>
  );
};
