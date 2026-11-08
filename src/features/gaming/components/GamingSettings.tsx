import React, { useState } from 'react';
import {
  Gamepad2,
  Tv,
  Zap,
  Video,
  Monitor,
  Flame,
  Clock,
  Sun,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { GamingTweakItem, HardwareSpecs } from '@/types/electron';
import { AntiCheatBadge } from '@/features/anticheat/components/AntiCheatBadge';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';
import { Switch } from '@/components/common/Switch';

interface GamingSettingsProps {
  tweaks: GamingTweakItem[];
  hardware: HardwareSpecs | null;
  onToggleTweak: (tweakId: string, willEnable: boolean) => Promise<void>;
  onRevertTweak: (tweakId: string) => Promise<void>;
}

export const GamingSettings: React.FC<GamingSettingsProps> = ({
  tweaks,
  hardware,
  onToggleTweak,
  onRevertTweak,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null);
  const [expandedHelpId, setExpandedHelpId] = useState<string | null>(null);

  const handleToggle = async (tweak: GamingTweakItem) => {
    setBusyTweakId(tweak.id);
    try {
      if (tweak.isApplied) {
        await onRevertTweak(tweak.id);
      } else {
        await onToggleTweak(tweak.id, true);
      }
    } finally {
      setBusyTweakId(null);
    }
  };

  const getTweakIcon = (id: string) => {
    switch (id) {
      case 'game_mode_on_dvr_off':
        return <Gamepad2 className="w-4 h-4 text-emerald-400" />;
      case 'windowed_optimizations_win11':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'hardware_accelerated_gpu_scheduling_hags':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'game_dvr_background_recording_off':
        return <Video className="w-4 h-4 text-emerald-400" />;
      case 'variable_refresh_rate_vrr':
        return <Monitor className="w-4 h-4 text-cyan-400" />;
      case 'power_throttling_off':
        return <Cpu className="w-4 h-4 text-amber-400" />;
      case 'xbox_game_bar_off':
        return <Tv className="w-4 h-4 text-emerald-400" />;
      case 'auto_hdr':
        return <Sun className="w-4 h-4 text-cyan-400" />;
      case 'global_timer_resolution_requests':
        return <Clock className="w-4 h-4 text-amber-400" />;
      default:
        return <Gamepad2 className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Gamepad2 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">B. Gaming Settings</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Moderate
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Reduce unnecessary features and optimize for gaming.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4">
          {/* 3-Column Grid of Gaming Tweaks */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;
              const isSafe = tweak.risk === 'safe';
              const guidance = getTweakGuidance(tweak.id);
              const isHelpOpen = expandedHelpId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  className="rounded-xl p-3.5 bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex-shrink-0 mt-0.5">
                        {getTweakIcon(tweak.id)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-100 truncate" title={tweak.name}>
                          {tweak.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5" title={tweak.description}>
                          {tweak.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isSafe
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                        }`}
                      >
                        {isSafe ? 'Safe' : 'Moderate'}
                      </span>

                      {tweak.requiresReboot && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-0.5">
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reboot
                        </span>
                      )}

                      <AntiCheatBadge
                        level={tweak.anticheat}
                        note={tweak.anticheatNote}
                        affectedAntiCheats={tweak.affectedAntiCheats}
                        isLocked={tweak.anticheat === 'blocked-risk'}
                      />

                      {guidance && (
                        <button
                          type="button"
                          onClick={() => setExpandedHelpId(isHelpOpen ? null : tweak.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                            isHelpOpen
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
                          }`}
                          title="View guidance & impact analysis"
                        >
                          <HelpCircle className="w-3 h-3" />
                          <span>Help</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-medium text-slate-300">
                        {tweak.isApplied ? 'On' : 'Off'}
                      </span>

                      <Switch
                        checked={tweak.isApplied}
                        onChange={() => handleToggle(tweak)}
                        disabled={busyTweakId !== null || !tweak.isSupported || tweak.anticheat === 'blocked-risk'}
                        isLoading={isBusy}
                        colorScheme="blue"
                        ariaLabel={`Toggle ${tweak.name}`}
                      />
                    </div>
                  </div>

                  {isHelpOpen && guidance && (
                    <div className="mt-3">
                      <TweakGuidanceDrawer guidance={guidance} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Display & Hardware Info Row */}
          {hardware && (
            <div className="rounded-xl p-3.5 bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Monitor className="w-4 h-4 text-blue-400" />
                <span>Display & Hardware Info</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>

              <div className="flex flex-wrap items-center gap-4 lg:gap-8 text-[11px]">
                {/* Refresh Rate */}
                <div>
                  <span className="text-slate-500 block">Refresh Rate</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {hardware.display.refreshRate} Hz (Max {hardware.display.maxRefreshRate} Hz)
                  </span>
                </div>

                {/* Display Mode */}
                <div>
                  <span className="text-slate-500 block">Display Mode</span>
                  <span className="font-medium text-slate-200">
                    Fullscreen
                  </span>
                </div>

                {/* Resizable BAR */}
                <div>
                  <span className="text-slate-500 block">Resizable BAR</span>
                  <span
                    className={`font-semibold font-mono ${
                      hardware.display.rebarStatus === 'Enabled'
                        ? 'text-emerald-400'
                        : hardware.display.rebarStatus === 'Disabled'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {hardware.display.rebarStatus}
                  </span>
                </div>

                {/* XMP / EXPO */}
                <div>
                  <span className="text-slate-500 block">XMP / EXPO</span>
                  <span
                    className={`font-semibold font-mono ${
                      hardware.display.xmpStatus.enabled ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {hardware.display.xmpStatus.enabled ? 'Enabled' : 'Not Enabled'}{' '}
                    ({hardware.display.xmpStatus.speedMt} MT/s)
                  </span>
                </div>

                {/* GPU Driver Date */}
                <div>
                  <span className="text-slate-500 block">GPU Driver</span>
                  <span className="font-mono text-slate-300">
                    {hardware.display.driverDate}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
