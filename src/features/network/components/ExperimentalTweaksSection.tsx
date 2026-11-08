import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Info,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import {
  NetworkAdapterInfo,
  AdvancedNetworkOverview,
  AdvancedNetworkTweakItem,
} from '@/types/electron';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';

interface ExperimentalTweaksSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const ExperimentalTweaksSection: React.FC<ExperimentalTweaksSectionProps> = ({
  adapter,
  onNotify,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default
  const [data, setData] = useState<AdvancedNetworkOverview | null>(null);
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null);
  const [expandedHelpId, setExpandedHelpId] = useState<string | null>(null);

  const loadData = async () => {
    if (!adapter?.name || !window.electronAPI?.getAdvancedNetworkState) return;
    try {
      const res = await window.electronAPI.getAdvancedNetworkState(adapter.name);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load experimental network state:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [adapter?.name]);

  const handleToggleTweak = async (tweak: AdvancedNetworkTweakItem) => {
    if (!adapter?.name || !window.electronAPI) return;
    setBusyTweakId(tweak.id);

    try {
      if (tweak.isApplied) {
        const res = await window.electronAPI.revertAdvancedNetworkTweak({
          adapterName: adapter.name,
          tweakId: tweak.id,
        });
        if (res.success) {
          onNotify(`Reverted "${tweak.name}" to Windows default.`, 'success');
        } else {
          onNotify(res.error || 'Failed to revert tweak.', 'error');
        }
        await loadData();
      } else {
        const res = await window.electronAPI.applyAdvancedNetworkTweak({
          adapterName: adapter.name,
          tweakId: tweak.id,
        });
        if (res.success) {
          onNotify(`Applied "${tweak.name}" successfully.`, 'success');
        } else {
          onNotify(res.error || 'Failed to apply tweak.', 'error');
        }
        await loadData();
      }
    } catch (err: any) {
      onNotify(err.message || 'Operation failed', 'error');
    } finally {
      setBusyTweakId(null);
    }
  };

  const experimentalTweaks = data?.tweaks.filter((t) => t.category === 'experimental') || [];

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all">
      {/* Header */}
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
              <h3 className="text-sm font-bold text-slate-100">F. Experimental Tweaks</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300">
                Unverified Impact
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Little or unproven measured effect on modern Windows 11. Use only if you know why.
            </p>
          </div>
        </div>

        <button type="button" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4 animate-in fade-in duration-150">
          {/* QoS 20% Reserved Bandwidth Myth Explainer Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex-shrink-0 mt-0.5">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-bold text-slate-200">
                Technical Note: The Windows "20% Reserved QoS Bandwidth" Myth
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                A common internet tip suggests setting the registry key <code className="text-cyan-400 bg-slate-950 px-1 py-0.5 rounded">NonBestEffortLimit = 0</code> to unlock "20% hidden bandwidth".
                In reality, Windows Quality of Service (QoS) reserves <strong>0%</strong> bandwidth unless a specific QoS-aware application (such as VoIP or video broadcast) actively requests priority. Changing this setting does not increase your internet download or upload speed.
              </p>
            </div>
          </div>

          {/* Tweaks List */}
          <div className="space-y-2.5">
            {experimentalTweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;

              const guidance = getTweakGuidance(tweak.id);
              const isHelpOpen = expandedHelpId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                    tweak.isApplied
                      ? 'bg-purple-950/20 border-purple-500/30 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">{tweak.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
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
                      <p className="text-[11px] text-slate-400 leading-relaxed">{tweak.description}</p>
                      <div className="text-[10px] font-mono text-slate-500">
                        Status: <span className={tweak.isApplied ? 'text-purple-300 font-bold' : 'text-slate-400'}>{tweak.currentValueDisplay}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2.5 self-end md:self-center">
                      {tweak.isApplied && (
                        <button
                          type="button"
                          onClick={() => handleToggleTweak(tweak)}
                          disabled={isBusy}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Revert to Windows default"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleTweak(tweak)}
                        disabled={isBusy}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          tweak.isApplied
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {isBusy ? (
                          <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : tweak.isApplied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Applied
                          </>
                        ) : (
                          'Toggle'
                        )}
                      </button>
                    </div>
                  </div>

                  {isHelpOpen && guidance && (
                    <div className="mt-2">
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
