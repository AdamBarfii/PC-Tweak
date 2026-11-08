import React, { useState, useEffect } from 'react';
import {
  Star,
  RotateCcw,
  Check,
  AlertOctagon,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Zap,
  Sliders,
  Layers,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  NetworkAdapterInfo,
  AdvancedNetworkOverview,
  AdvancedNetworkTweakItem,
} from '@/types/electron';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';

interface AdvancedTweaksSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
  onRequestAutoRevert: (name: string, onRevert: () => Promise<void>) => void;
}

export const AdvancedTweaksSection: React.FC<AdvancedTweaksSectionProps> = ({
  adapter,
  onNotify,
  onRequestAutoRevert,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default as per rule
  const [data, setData] = useState<AdvancedNetworkOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null);
  const [expandedHelpId, setExpandedHelpId] = useState<string | null>(null);

  // Guided MTU state
  const [isProbingMtu, setIsProbingMtu] = useState(false);
  const [probedMtuResult, setProbedMtuResult] = useState<{
    optimalMtu: number;
    unfragmentedPayload: number;
    isDefault1500: boolean;
  } | null>(null);

  const loadData = async () => {
    if (!adapter?.name || !window.electronAPI?.getAdvancedNetworkState) return;
    setIsLoading(true);
    try {
      const res = await window.electronAPI.getAdvancedNetworkState(adapter.name);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load advanced network state:', err);
    } finally {
      setIsLoading(false);
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
        // Revert
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
        // Apply
        const res = await window.electronAPI.applyAdvancedNetworkTweak({
          adapterName: adapter.name,
          tweakId: tweak.id,
        });

        if (res.success) {
          if (res.requiresAutoRevert) {
            onRequestAutoRevert(tweak.name, async () => {
              await window.electronAPI?.revertAdvancedNetworkTweak({
                adapterName: adapter.name,
                tweakId: tweak.id,
              });
              await loadData();
            });
          } else {
            onNotify(`Applied "${tweak.name}" successfully.`, 'success');
          }
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

  const handleProbeMtu = async () => {
    if (!window.electronAPI?.detectOptimalMtu) return;
    setIsProbingMtu(true);
    try {
      const res = await window.electronAPI.detectOptimalMtu(adapter?.defaultGateway || '1.1.1.1');
      setProbedMtuResult(res);
      onNotify(`Optimal unfragmented MTU detected: ${res.optimalMtu} bytes.`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'MTU probe failed', 'error');
    } finally {
      setIsProbingMtu(false);
    }
  };

  const handleApplyMtu = async (mtu: number) => {
    if (!adapter?.name || !window.electronAPI?.setNetworkMtu) return;
    try {
      const res = await window.electronAPI.setNetworkMtu({
        adapterName: adapter.name,
        mtu,
      });
      if (res.success) {
        onRequestAutoRevert(`MTU: ${mtu}`, async () => {
          await window.electronAPI?.setNetworkMtu({
            adapterName: adapter.name,
            mtu: 1500,
          });
          await loadData();
        });
        await loadData();
      } else {
        onNotify(res.error || res.message, 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed to set MTU', 'error');
    }
  };

  const driverAndStackTweaks = data?.tweaks.filter((t) => t.category !== 'experimental') || [];

  return (
    <div className="rounded-2xl border border-red-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all">
      {/* Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
            <Star className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-100">E. Advanced Tweaks</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" />
                Advanced (Revertible)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Interrupt moderation, TCP segmentation offloads, Nagle's algorithm, and guided MTU detection.
            </p>
          </div>
        </div>

        <button type="button" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-5 animate-in fade-in duration-150">
          {/* Guided MTU Detector Card */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100">Guided MTU Packet Analyzer</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                  Current MTU: {data?.currentMtu || 1500}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Pings your gateway with the Do-Not-Fragment bit set to calculate the exact maximum payload size without packet splitting.
              </p>
              {probedMtuResult && (
                <div className="text-[11px] text-emerald-400 font-semibold pt-1 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Optimal Unfragmented MTU: <strong>{probedMtuResult.optimalMtu} bytes</strong> ({probedMtuResult.unfragmentedPayload} payload + 28 header)
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-end md:self-center">
              <button
                type="button"
                onClick={handleProbeMtu}
                disabled={isProbingMtu}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isProbingMtu ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Probing...
                  </>
                ) : (
                  'Probe Optimal MTU'
                )}
              </button>

              {probedMtuResult && probedMtuResult.optimalMtu !== data?.currentMtu && (
                <button
                  type="button"
                  onClick={() => handleApplyMtu(probedMtuResult.optimalMtu)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
                >
                  Apply {probedMtuResult.optimalMtu} MTU
                </button>
              )}
            </div>
          </div>

          {/* TCP Global Parameters Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500">Auto-Tuning</span>
              <div className="text-xs font-bold text-slate-200 capitalize mt-0.5">
                {data?.tcpGlobal.autotuning || 'Normal'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500">ECN Capability</span>
              <div className="text-xs font-bold text-slate-200 capitalize mt-0.5">
                {data?.tcpGlobal.ecn || 'Disabled'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500">RFC 1323 Timestamps</span>
              <div className="text-xs font-bold text-slate-200 capitalize mt-0.5">
                {data?.tcpGlobal.timestamps || 'Allowed'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500">Receive-Side Scaling</span>
              <div className="text-xs font-bold text-slate-200 capitalize mt-0.5">
                {data?.tcpGlobal.rss || 'Enabled'}
              </div>
            </div>
          </div>

          {/* Tweaks List */}
          <div className="space-y-2.5">
            {driverAndStackTweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;

              if (!tweak.isSupported) {
                return (
                  <div
                    key={tweak.id}
                    className="p-3.5 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-center justify-between opacity-60"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400">{tweak.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                          Not Exposed by Hardware
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{tweak.unsupportedReason || tweak.description}</p>
                    </div>
                  </div>
                );
              }

              const guidance = getTweakGuidance(tweak.id);
              const isHelpOpen = expandedHelpId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                    tweak.isApplied
                      ? 'bg-red-950/20 border-red-500/30 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">{tweak.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          Advanced
                        </span>
                        {tweak.requiresAutoRevert && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            20s Test
                          </span>
                        )}
                        {guidance && (
                          <button
                            type="button"
                            onClick={() => setExpandedHelpId(isHelpOpen ? null : tweak.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                              isHelpOpen
                                ? 'bg-red-600 text-white shadow-sm'
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
                        Status: <span className={tweak.isApplied ? 'text-red-400 font-bold' : 'text-slate-400'}>{tweak.currentValueDisplay}</span>
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
                            ? 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30'
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
                          'Configure'
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
