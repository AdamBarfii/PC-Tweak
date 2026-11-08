import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sliders, Lock, Zap, Gauge, Flame, Check, RotateCcw } from 'lucide-react';
import { OverclockCapabilities } from '@/types/electron';

interface GpuClockControlsProps {
  capabilities: OverclockCapabilities | null;
  appliedCoreOffset: number;
  appliedMemOffset: number;
  appliedPowerLimit: number;
  appliedFanSpeed?: number;
  onApply: (offsets: {
    coreOffsetMhz: number;
    memOffsetMhz: number;
    powerLimitPct: number;
    fanSpeedPct: number;
  }) => Promise<void>;
  onReset: () => Promise<void>;
  isApplying?: boolean;
}

export const GpuClockControls: React.FC<GpuClockControlsProps> = ({
  capabilities,
  appliedCoreOffset,
  appliedMemOffset,
  appliedPowerLimit,
  appliedFanSpeed = 0,
  onApply,
  onReset,
  isApplying,
}) => {
  const { t } = useTranslation();

  const [coreOffset, setCoreOffset] = useState<number>(appliedCoreOffset);
  const [memOffset, setMemOffset] = useState<number>(appliedMemOffset);
  const [powerLimit, setPowerLimit] = useState<number>(appliedPowerLimit || 100);
  const [fanSpeed, setFanSpeed] = useState<number>(appliedFanSpeed || 0);

  useEffect(() => {
    setCoreOffset(appliedCoreOffset);
    setMemOffset(appliedMemOffset);
    setPowerLimit(appliedPowerLimit || 100);
    setFanSpeed(appliedFanSpeed || 0);
  }, [appliedCoreOffset, appliedMemOffset, appliedPowerLimit, appliedFanSpeed]);

  const maxCore = capabilities?.maxCoreOffsetMhz ?? 120;
  const minCore = capabilities?.minCoreOffsetMhz ?? -50;
  const maxMem = capabilities?.maxMemOffsetMhz ?? 350;
  const minMem = capabilities?.minMemOffsetMhz ?? 0;
  const maxPower = capabilities?.maxPowerLimitPct ?? 105;
  const minPower = capabilities?.minPowerLimitPct ?? 100;

  const handleApply = async () => {
    await onApply({
      coreOffsetMhz: coreOffset,
      memOffsetMhz: memOffset,
      powerLimitPct: powerLimit,
      fanSpeedPct: fanSpeed,
    });
  };

  const applyPreset = (core: number, mem: number, power: number, fan: number) => {
    setCoreOffset(core);
    setMemOffset(mem);
    setPowerLimit(power);
    setFanSpeed(fan);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 shadow-lg space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Sliders className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('overclock.controls.title', 'Manual Safe Offset Sliders')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {capabilities?.gpuName || t('overclock.controls.detectingGpu', 'Detecting GPU Hardware...')}
            </p>
          </div>
        </div>

        {/* Vendor Chip */}
        {capabilities?.gpuVendor && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/5 border border-white/10 text-cyan-300">
            {capabilities.gpuVendor}
          </span>
        )}
      </div>

      {/* Safe Presets */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('overclock.presets.title', 'Quick Safe Presets')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyPreset(0, 0, 100, 0)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left ${
              coreOffset === 0 && memOffset === 0
                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
            }`}
          >
            <div className="text-[11px] font-bold">{t('overclock.presets.stock', 'Stock')}</div>
            <div className="text-[10px] opacity-70">0 MHz / 0 MHz</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset(30, 100, 100, 0)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left ${
              coreOffset === 30 && memOffset === 100
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
            }`}
          >
            <div className="text-[11px] font-bold">{t('overclock.presets.safe', 'Safe Daily')}</div>
            <div className="text-[10px] opacity-70">+30 / +100 MHz</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset(60, 200, 103, 65)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left ${
              coreOffset === 60 && memOffset === 200
                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
            }`}
          >
            <div className="text-[11px] font-bold">{t('overclock.presets.esports', 'Esports Peak')}</div>
            <div className="text-[10px] opacity-70">+60 / +200 MHz</div>
          </button>
        </div>
      </div>

      {/* Sliders Container */}
      <div className="space-y-4 pt-1">
        {/* Core Clock Offset */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              {t('overclock.sliders.coreClock', 'GPU Core Clock Offset')}
            </span>
            <span className="font-mono font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
              {coreOffset > 0 ? `+${coreOffset}` : coreOffset} MHz
            </span>
          </div>
          <input
            type="range"
            min={minCore}
            max={maxCore}
            step={5}
            value={coreOffset}
            onChange={(e) => setCoreOffset(Number(e.target.value))}
            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{minCore} MHz</span>
            <span>0 MHz</span>
            <span className="text-emerald-400 font-medium">Safe Max: +{maxCore} MHz</span>
          </div>
        </div>

        {/* Memory Clock Offset */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              {t('overclock.sliders.memClock', 'GPU Memory Clock Offset')}
            </span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              +{memOffset} MHz
            </span>
          </div>
          <input
            type="range"
            min={minMem}
            max={maxMem}
            step={10}
            value={memOffset}
            onChange={(e) => setMemOffset(Number(e.target.value))}
            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 MHz</span>
            <span>+150 MHz</span>
            <span className="text-emerald-400 font-medium">Safe Max: +{maxMem} MHz</span>
          </div>
        </div>

        {/* Power Target */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              {t('overclock.sliders.powerTarget', 'Power Target Limit')}
            </span>
            <span className="font-mono font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
              {powerLimit}%
            </span>
          </div>
          <input
            type="range"
            min={minPower}
            max={maxPower}
            step={1}
            value={powerLimit}
            onChange={(e) => setPowerLimit(Number(e.target.value))}
            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>100% (Default)</span>
            <span className="text-amber-400 font-medium">Safe Clamped Ceiling: 105%</span>
          </div>
        </div>

        {/* Locked Voltage Indicator */}
        <div className="rounded-xl border border-white/5 bg-black/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-xs font-semibold text-foreground">
                {t('overclock.sliders.voltage', 'Core Voltage Modification')}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {t('overclock.sliders.voltageLockedNotice', 'Strictly locked at stock (+0 mV) to guarantee zero silicon degradation.')}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            LOCKED +0 mV
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 active:scale-98 transition shadow-[0_0_20px_rgba(0,240,255,0.3)] disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          {isApplying ? t('common.applying', 'Applying...') : t('overclock.actions.applyOffsets', 'Apply Safe Offsets')}
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={isApplying}
          className="py-2.5 px-3 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 border border-white/10 active:scale-98 transition"
          title={t('overclock.actions.resetSliders', 'Reset Sliders to Current Applied')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
