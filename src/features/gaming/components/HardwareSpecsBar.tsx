import React from 'react';
import { Cpu, Monitor, Laptop, Zap, Leaf } from 'lucide-react';
import { HardwareSpecs } from '@/types/electron';

interface HardwareSpecsBarProps {
  hardware: HardwareSpecs | null;
}

export const HardwareSpecsBar: React.FC<HardwareSpecsBarProps> = ({ hardware }) => {
  if (!hardware) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 glass-panel rounded-xl" />
        ))}
      </div>
    );
  }

  const isDesktop = hardware.formFactor === 'Desktop';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* CPU Card */}
      <div className="flex items-center gap-3.5 px-4 py-3 glass-panel hover:border-cyan-400/40 transition-colors rounded-xl shadow-sm">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]">
          <Cpu className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">CPU</span>
          <p className="text-xs font-bold text-foreground truncate" title={hardware.cpu.name}>
            {hardware.cpu.name}
          </p>
          <p className="text-[10px] text-cyan-400 font-mono">
            {hardware.cpu.cores}C / {hardware.cpu.threads}T
          </p>
        </div>
      </div>

      {/* GPU Card */}
      <div className="flex items-center gap-3.5 px-4 py-3 glass-panel hover:border-cyan-400/40 transition-colors rounded-xl shadow-sm">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]">
          <Zap className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">GPU</span>
          <p className="text-xs font-bold text-foreground truncate" title={hardware.gpu.name}>
            {hardware.gpu.name}
          </p>
          <p className="text-[10px] text-cyan-400 font-mono">
            Driver: {hardware.gpu.driverVersion !== 'Unknown' ? hardware.gpu.driverVersion : 'Standard'}
          </p>
        </div>
      </div>

      {/* Form Factor Card */}
      <div className="flex items-center gap-3.5 px-4 py-3 glass-panel hover:border-purple-400/40 transition-colors rounded-xl shadow-sm">
        <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-400">
          {isDesktop ? <Monitor className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Form Factor</span>
          <p className="text-xs font-bold text-foreground">
            {hardware.formFactor}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {hardware.isLaptopOnBattery ? 'On Battery (Throttling)' : 'AC Plugged In'}
          </p>
        </div>
      </div>

      {/* Active Power Plan Card */}
      <div className="flex items-center gap-3.5 px-4 py-3 glass-panel hover:border-emerald-400/40 transition-colors rounded-xl shadow-sm">
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
          <Leaf className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Power Plan</span>
          <p className="text-xs font-bold text-foreground truncate" title={hardware.activePowerPlan}>
            {hardware.activePowerPlan}
          </p>
          <p className="text-[10px] text-emerald-400 font-mono">
            {hardware.activePowerPlanGuid.substring(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
};
