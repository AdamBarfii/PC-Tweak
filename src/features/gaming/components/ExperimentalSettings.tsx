import React, { useState } from 'react';
import {
  FlaskConical,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Cpu,
  Wifi,
  Clock,
  AlertTriangle,
  Info,
  HelpCircle,
} from 'lucide-react';
import { GamingTweakItem } from '@/types/electron';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';
import { Switch } from '@/components/common/Switch';

interface ExperimentalSettingsProps {
  tweaks: GamingTweakItem[];
  onToggleTweak: (tweakId: string, willEnable: boolean) => Promise<void>;
  onRevertTweak: (tweakId: string) => Promise<void>;
}

export const ExperimentalSettings: React.FC<ExperimentalSettingsProps> = ({
  tweaks,
  onToggleTweak,
  onRevertTweak,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
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
      case 'win32_priority_separation':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case 'mmcss_system_responsiveness':
        return <Wifi className="w-4 h-4 text-indigo-400" />;
      case 'hpet_cleanup':
        return <Clock className="w-4 h-4 text-cyan-400" />;
      default:
        return <FlaskConical className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">D. Experimental</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300">
                Unverified Impact
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Little or unproven measured effect. Use only if you know why.
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
          {/* Transparent Honest Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-purple-200 leading-relaxed flex items-start gap-3">
            <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <p>
              These options modify legacy Windows scheduler quantum slices and network throttling indices. In modern GPU-bound gaming on modern multi-core CPUs, their measured impact is negligible. They are retained for specialized benchmarking.
            </p>
          </div>

          {/* LargeSystemCache Warning Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/30 text-xs flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-200 block mb-0.5">LargeSystemCache Policy</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Setting <code className="font-mono text-amber-300">LargeSystemCache = 1</code> forces Windows into server file-cache mode, ballooning disk buffer allocations and starving GPU drivers and gaming processes of RAM. PC Tweak intentionally leaves this setting off.
              </p>
            </div>
          </div>

          {/* Tweak Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;
              const guidance = getTweakGuidance(tweak.id);
              const isHelpOpen = expandedHelpId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  className="rounded-xl p-3.5 bg-slate-900/60 border border-slate-800/80 hover:border-purple-500/30 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex-shrink-0 mt-0.5">
                        {getTweakIcon(tweak.id)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-100 truncate" title={tweak.name}>
                          {tweak.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                          {tweak.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-2.5 py-1 rounded bg-slate-950/60 border border-slate-800/70 text-[10px] text-purple-300 font-mono">
                      {tweak.currentStateText}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 border border-purple-500/30 text-purple-300">
                        Experimental
                      </span>

                      {guidance && (
                        <button
                          type="button"
                          onClick={() => setExpandedHelpId(isHelpOpen ? null : tweak.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                            isHelpOpen
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
                          }`}
                          title="View guidance & impact analysis"
                        >
                          <HelpCircle className="w-3 h-3" />
                          <span>Help</span>
                        </button>
                      )}
                    </div>

                    <Switch
                      checked={tweak.isApplied}
                      onChange={() => handleToggle(tweak)}
                      disabled={busyTweakId !== null}
                      isLoading={isBusy}
                      colorScheme="purple"
                      ariaLabel={`Toggle ${tweak.name}`}
                    />
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
        </div>
      )}
    </div>
  );
};
