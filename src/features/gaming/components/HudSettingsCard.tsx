import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Eye,
  Sliders,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Command,
  Layout,
  RefreshCw,
  Gauge,
  Check,
  Info,
} from 'lucide-react';
import { Switch } from '@/components/common/Switch';
import type { OverlayConfig, OverlayCorner, OverlayLayout } from '@/types/electron';

interface HudSettingsCardProps {
  onNotify?: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const HudSettingsCard: React.FC<HudSettingsCardProps> = ({ onNotify }) => {
  const [config, setConfig] = useState<OverlayConfig>({
    enabled: false,
    corner: 'top-right',
    layout: 'compact',
    opacity: 90,
    showFps: true,
    showDpc: true,
    showCpu: true,
    showGpu: true,
    showRam: true,
    hotkey: 'CommandOrControl+Shift+O',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getOverlayConfig) {
      window.electronAPI.getOverlayConfig().then((cfg) => {
        if (cfg) setConfig(cfg);
      });
    }

    const unbind = window.electronAPI?.onOverlayConfigUpdate?.((updatedCfg) => {
      setConfig(updatedCfg);
    });

    return () => unbind?.();
  }, []);

  const updateConfig = async (changes: Partial<OverlayConfig>) => {
    const updated = { ...config, ...changes };
    setConfig(updated);
    setIsSaving(true);
    try {
      if (window.electronAPI?.saveOverlayConfig) {
        await window.electronAPI.saveOverlayConfig(changes);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async () => {
    if (window.electronAPI?.toggleOverlay) {
      setIsSaving(true);
      try {
        const isNowActive = await window.electronAPI.toggleOverlay();
        setConfig((prev) => ({ ...prev, enabled: isNowActive }));
        onNotify?.(
          isNowActive
            ? 'In-Game HUD Overlay launched on your screen. Press Ctrl+Shift+O anytime to toggle.'
            : 'In-Game HUD Overlay hidden.',
          isNowActive ? 'success' : 'warning'
        );
      } finally {
        setIsSaving(false);
      }
    }
  };

  const hotkeyDisplay = config.hotkey.replace('CommandOrControl', 'Ctrl');

  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-slate-950/75 backdrop-blur-md overflow-hidden shadow-xl transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100">In-Game HUD & Hardware Overlay</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                  config.enabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {config.enabled ? 'Active' : 'Disabled'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Anti-Cheat Safe
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Transparent, click-through hardware telemetry overlay for games. Zero DLL injection, safe from Vanguard & FACEIT bans.
            </p>
          </div>
        </div>

        {/* Master Toggle & Hotkey Button */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
            <Command className="w-3.5 h-3.5 text-cyan-400" />
            <span>{hotkeyDisplay}</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              size="md"
              checked={config.enabled}
              onChange={handleToggle}
              isLoading={isSaving}
              colorScheme="blue"
              ariaLabel="Toggle In-Game HUD Overlay"
            />
            <button
              type="button"
              onClick={handleToggle}
              disabled={isSaving}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 ${
                config.enabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/25'
              }`}
            >
              {config.enabled ? 'Hide Overlay' : 'Launch Overlay'}
            </button>
          </div>
        </div>
      </div>

      {/* Critical In-Game Display Notice Banner */}
      <div className="mx-6 mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-start gap-2.5 text-xs text-cyan-200 leading-relaxed">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300 font-semibold block mb-0.5">
            How to make the overlay visible inside your games:
          </strong>
          Set your game video mode to <span className="underline font-bold text-white">Borderless Windowed</span> or <span className="underline font-bold text-white">Windowed Fullscreen</span>. Because PC Tweak avoids anti-cheat bans by never injecting DLL hooks into your game processes, it renders via Windows DWM Topmost transparency. Legacy Exclusive Fullscreen mode monopolizes the display driver and hides all desktop overlays.
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Interactive Preview Box (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                Live Screen Preview
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Placement: {config.corner}
              </span>
            </div>

            {/* Simulated 16:9 Display Monitor */}
            <div className="relative w-full aspect-video rounded-lg bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/70 border border-slate-700/60 overflow-hidden flex flex-col justify-between p-2 shadow-inner">
              {/* Background Mockup Screen Elements */}
              <div className="absolute inset-0 opacity-15 pointer-events-none flex items-center justify-center">
                <Monitor className="w-16 h-16 text-slate-400" />
              </div>

              {/* Simulated HUD Pill positioned by Corner */}
              <div
                className={`z-10 transition-all duration-300 ${
                  config.corner === 'top-left'
                    ? 'self-start'
                    : config.corner === 'top-right'
                    ? 'self-end'
                    : config.corner === 'bottom-left'
                    ? 'self-start mt-auto'
                    : 'self-end mt-auto'
                }`}
                style={{ opacity: (config.opacity || 90) / 100 }}
              >
                {config.layout === 'compact' ? (
                  <div className="px-2 py-1 rounded-lg bg-slate-950/90 border border-cyan-500/50 shadow-lg text-[9px] font-mono flex items-center gap-1.5 text-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {config.showFps && <span className="font-bold text-cyan-300">144 FPS</span>}
                    {config.showDpc && <span className="text-emerald-400 font-bold">120μs</span>}
                    {config.showGpu && <span className="text-slate-300">GPU 58°</span>}
                    {config.showCpu && <span className="text-emerald-300">CPU 24%</span>}
                  </div>
                ) : (
                  <div className="p-1.5 rounded-lg bg-slate-950/95 border border-cyan-500/50 shadow-lg text-[8px] font-mono flex flex-col gap-1 text-slate-200 w-36">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-0.5">
                      <span className="text-cyan-400 font-bold">PC TWEAK OSD</span>
                      <span className="text-emerald-400 text-[7px]">SAFE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[8px]">
                      {config.showFps && <span>FPS: <strong className="text-cyan-300">144</strong></span>}
                      {config.showDpc && <span>DPC: <strong className="text-emerald-400">120μs</strong></span>}
                      {config.showGpu && <span>GPU: <strong>62%</strong></span>}
                      {config.showCpu && <span>CPU: <strong>28%</strong></span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Watermark in Preview */}
              <div className="text-[8px] text-slate-600 font-mono tracking-widest text-center self-center mt-auto">
                SIMULATED BORDERLESS GAME WINDOW
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              The HUD floats seamlessly on top of your games. Mouse clicks pass through completely to your crosshairs with zero latency.
            </p>
          </div>

          {/* Right Column: Customization Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* 1. Corner Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-200 block">
                Screen Corner Position
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'top-left' as OverlayCorner, label: 'Top-Left' },
                  { id: 'top-right' as OverlayCorner, label: 'Top-Right (Default)' },
                  { id: 'bottom-left' as OverlayCorner, label: 'Bottom-Left' },
                  { id: 'bottom-right' as OverlayCorner, label: 'Bottom-Right' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateConfig({ corner: item.id })}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                      config.corner === item.id
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Layout & Opacity Slider */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Layout Mode */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-200 block">
                  Layout Style
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateConfig({ layout: 'compact' })}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      config.layout === 'compact'
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Compact Pill
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig({ layout: 'expanded' })}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      config.layout === 'expanded'
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Expanded Panel
                  </button>
                </div>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span>Background Opacity</span>
                  <span className="font-mono text-cyan-400">{config.opacity || 90}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={config.opacity || 90}
                  onChange={(e) => updateConfig({ opacity: parseInt(e.target.value, 10) })}
                  className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>
            </div>

            {/* 3. Metrics Checklist */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 block">
                Visible Telemetry Metrics
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { key: 'showFps' as const, label: 'Framerate (FPS)' },
                  { key: 'showDpc' as const, label: 'DPC Driver Latency (μs)' },
                  { key: 'showGpu' as const, label: 'GPU Load & Temp' },
                  { key: 'showCpu' as const, label: 'CPU Usage (%)' },
                  { key: 'showRam' as const, label: 'System RAM (%)' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 cursor-pointer text-xs select-none transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(config[item.key])}
                      onChange={(e) => updateConfig({ [item.key]: e.target.checked })}
                      className="w-4 h-4 rounded text-cyan-600 accent-cyan-500 bg-slate-800 border-slate-700"
                    />
                    <span className="text-slate-300 font-medium">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
