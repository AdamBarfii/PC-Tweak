import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Gauge,
  Zap,
  Flame,
  Layers,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { OverlayConfig, OverlayTelemetry } from '@/types/electron';

export const OverlayView: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>({
    enabled: true,
    corner: 'top-right',
    layout: 'compact',
    opacity: 90,
    showFps: true,
    showDpc: true,
    showCpu: true,
    showGpu: true,
    showRam: true,
    hotkey: 'Ctrl+Shift+O',
  });

  const [telemetry, setTelemetry] = useState<OverlayTelemetry>({
    fps: null,
    dpcPercent: 0.3,
    dpcLatencyUs: 320,
    cpuUsage: 14,
    cpuSpeedGhz: 4.2,
    gpuLoad: 48,
    gpuTemp: 56,
    memoryPercentage: 38,
    memoryUsedGb: 12.2,
    uptimeSeconds: 7200,
  });

  useEffect(() => {
    // Force transparency and dark theme on host HTML/body
    document.documentElement.classList.add('dark', 'overlay-window');
    document.body.classList.add('overlay-window');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    // Initial config fetch
    if (window.electronAPI?.getOverlayConfig) {
      window.electronAPI.getOverlayConfig().then((cfg) => {
        if (cfg) setConfig(cfg);
      });
    }

    // Immediately fetch initial system metrics to avoid delay
    if (window.electronAPI?.getSystemMetrics) {
      window.electronAPI.getSystemMetrics().then((metrics) => {
        if (metrics) {
          setTelemetry((prev) => ({
            ...prev,
            cpuUsage: metrics.cpuUsage ?? prev.cpuUsage,
            cpuSpeedGhz: metrics.cpuSpeedGhz ?? prev.cpuSpeedGhz,
            gpuLoad: metrics.gpuLoad ?? prev.gpuLoad,
            gpuTemp: metrics.gpuTemp ?? prev.gpuTemp,
            memoryPercentage: metrics.memoryPercentage ?? prev.memoryPercentage,
            memoryUsedGb: metrics.memoryUsedGb ?? prev.memoryUsedGb,
            uptimeSeconds: metrics.uptimeSeconds ?? prev.uptimeSeconds,
          }));
        }
      });
    }

    // Subscribe to config updates
    const unbindConfig = window.electronAPI?.onOverlayConfigUpdate?.((updatedCfg) => {
      setConfig(updatedCfg);
    });

    // Subscribe to live telemetry stream
    const unbindTelemetry = window.electronAPI?.onOverlayTelemetry?.((data) => {
      setTelemetry((prev) => ({ ...prev, ...data }));
    });

    return () => {
      unbindConfig?.();
      unbindTelemetry?.();
    };
  }, []);

  const opacityValue = Math.max(0.4, Math.min(1, (config.opacity || 90) / 100));

  // Determine DPC latency severity color
  const dpcUs = telemetry.dpcLatencyUs ?? (telemetry.dpcPercent ? Math.round(telemetry.dpcPercent * 1000) : null);
  const getDpcColor = (us: number | null) => {
    if (us === null) return 'text-slate-400 border-slate-700/60 bg-slate-800/40';
    if (us < 500) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (us < 1000) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/15 animate-pulse';
  };

  const getGpuTempColor = (temp: number | null) => {
    if (temp === null) return 'text-slate-400';
    if (temp < 68) return 'text-emerald-400';
    if (temp < 80) return 'text-amber-400';
    return 'text-red-400 font-bold';
  };

  if (config.layout === 'compact') {
    return (
      <div
        className="h-screen w-screen p-1 flex items-center justify-center select-none overflow-hidden font-mono bg-transparent"
        style={{ opacity: opacityValue }}
      >
        <div className="w-full h-full rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-slate-700/80 shadow-2xl px-2.5 py-1 flex items-center justify-between gap-2 text-xs">
          {/* Brand Pill */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 font-sans">
              PC TWEAK
            </span>
          </div>

          {/* Metrics Pill Grid */}
          <div className="flex items-center gap-2 flex-1 justify-end text-[10px] font-semibold whitespace-nowrap">
            {/* FPS */}
            {config.showFps && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 shrink-0">
                <span className="text-slate-500 text-[9px]">FPS</span>
                <span className="font-bold text-cyan-300">
                  {telemetry.fps !== null ? telemetry.fps : '--'}
                </span>
              </div>
            )}

            {/* DPC Latency */}
            {config.showDpc && (
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] shrink-0 ${getDpcColor(
                  dpcUs
                )}`}
                title="DPC Driver Latency"
              >
                <Activity className="w-3 h-3 shrink-0" />
                <span className="font-bold">{dpcUs !== null ? `${dpcUs}μs` : '--'}</span>
              </div>
            )}

            {/* GPU Load & Temp */}
            {config.showGpu && (
              <div className="flex items-center gap-1 text-slate-300 shrink-0">
                <span className="text-slate-500 text-[9px]">GPU</span>
                <span className="font-bold text-slate-100">
                  {telemetry.gpuLoad !== null ? `${telemetry.gpuLoad}%` : '--'}
                </span>
                {telemetry.gpuTemp !== null && (
                  <span className={`text-[9px] ${getGpuTempColor(telemetry.gpuTemp)}`}>
                    {telemetry.gpuTemp}°
                  </span>
                )}
              </div>
            )}

            {/* CPU Load */}
            {config.showCpu && (
              <div className="flex items-center gap-1 text-slate-300 shrink-0">
                <span className="text-slate-500 text-[9px]">CPU</span>
                <span className="font-bold text-emerald-400">{telemetry.cpuUsage}%</span>
              </div>
            )}

            {/* RAM */}
            {config.showRam && (
              <div className="flex items-center gap-1 text-slate-300 shrink-0">
                <span className="text-slate-500 text-[9px]">RAM</span>
                <span className="font-bold text-purple-300">{telemetry.memoryPercentage}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Expanded Layout
  return (
    <div
      className="h-screen w-screen p-1 flex items-center justify-center select-none overflow-hidden font-mono bg-transparent"
      style={{ opacity: opacityValue }}
    >
      <div className="w-full h-full rounded-2xl bg-slate-950/90 backdrop-blur-2xl border border-slate-700/80 shadow-2xl p-3 flex flex-col justify-between text-xs">
        {/* Top Header Row */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[11px] font-black tracking-wider text-cyan-400 font-sans">
              PC TWEAK OSD
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-bold">
              SAFE
            </span>
          </div>

          <div className="text-[10px] text-slate-400">
            {config.hotkey.replace('CommandOrControl', 'Ctrl')} to Hide
          </div>
        </div>

        {/* Middle Stats Grid */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          {config.showFps && (
            <div className="p-1.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center">
              <span className="text-[9px] text-slate-500 uppercase">Framerate</span>
              <span className="text-base font-black text-cyan-300 font-mono">
                {telemetry.fps !== null ? telemetry.fps : '--'}
              </span>
            </div>
          )}

          {config.showDpc && (
            <div
              className={`p-1.5 rounded-xl border flex flex-col items-center ${getDpcColor(dpcUs)}`}
            >
              <span className="text-[9px] opacity-80 uppercase">DPC Jitter</span>
              <span className="text-base font-black font-mono">
                {dpcUs !== null ? `${dpcUs}μs` : '--'}
              </span>
            </div>
          )}

          {config.showGpu && (
            <div className="p-1.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center">
              <span className="text-[9px] text-slate-500 uppercase">GPU Load/Temp</span>
              <div className="flex items-center gap-1 text-sm font-bold">
                <span className="text-slate-100">
                  {telemetry.gpuLoad !== null ? `${telemetry.gpuLoad}%` : '--'}
                </span>
                <span className={`text-xs ${getGpuTempColor(telemetry.gpuTemp)}`}>
                  {telemetry.gpuTemp !== null ? `${telemetry.gpuTemp}°` : ''}
                </span>
              </div>
            </div>
          )}

          {config.showCpu && (
            <div className="p-1.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center">
              <span className="text-[9px] text-slate-500 uppercase">CPU Usage</span>
              <span className="text-base font-black text-emerald-400 font-mono">
                {telemetry.cpuUsage}%
              </span>
            </div>
          )}
        </div>

        {/* Bottom Sub-Strip */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 font-sans">
          <span>Memory: {telemetry.memoryUsedGb} GB ({telemetry.memoryPercentage}%)</span>
          <span className="text-slate-500">100% Anti-Cheat Guard Active</span>
        </div>
      </div>
    </div>
  );
};
