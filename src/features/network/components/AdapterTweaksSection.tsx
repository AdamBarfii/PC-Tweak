import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Zap,
  Power,
  Leaf,
  ArrowDownUp,
  RotateCcw,
  Check,
  AlertCircle,
  HelpCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Laptop,
  Gauge,
  Wifi,
} from 'lucide-react';
import {
  NetworkAdapterInfo,
  AdapterDetailsInfo,
  AdapterTweakItem,
} from '@/types/electron';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';

interface AdapterTweaksSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
  onRequestAutoRevert: (name: string, onRevert: () => Promise<void>) => void;
}

export const AdapterTweaksSection: React.FC<AdapterTweaksSectionProps> = ({
  adapter,
  onNotify,
  onRequestAutoRevert,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [details, setDetails] = useState<AdapterDetailsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<string>('0');
  const [expandedHelpId, setExpandedHelpId] = useState<string | null>(null);

  const loadDetails = async () => {
    if (!adapter?.name || !window.electronAPI?.getAdapterDetails) return;
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getAdapterDetails(adapter.name);
      setDetails(data);
      setSelectedSpeed(data.speedDuplex.currentValue);
    } catch (err: any) {
      console.error('Failed to load adapter details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [adapter?.name]);

  const handleToggleTweak = async (tweak: AdapterTweakItem) => {
    if (!adapter?.name || !window.electronAPI) return;
    setBusyTweakId(tweak.id);

    try {
      if (tweak.isApplied) {
        // Revert
        const res = await window.electronAPI.revertAdapterTweak({
          adapterName: adapter.name,
          tweakId: tweak.id,
        });
        if (res.success) {
          onNotify(`Reverted "${tweak.name}" to Windows default.`, 'success');
        } else {
          onNotify(res.error || 'Failed to revert tweak.', 'error');
        }
        await loadDetails();
      } else {
        // Apply
        const res = await window.electronAPI.applyAdapterTweak({
          adapterName: adapter.name,
          tweakId: tweak.id,
        });

        if (res.success) {
          if (res.requiresAutoRevert) {
            onRequestAutoRevert(tweak.name, async () => {
              await window.electronAPI?.revertAdapterTweak({
                adapterName: adapter.name,
                tweakId: tweak.id,
              });
              await loadDetails();
            });
          } else {
            onNotify(`Applied "${tweak.name}" successfully.`, 'success');
          }
        } else {
          onNotify(res.error || 'Failed to apply tweak.', 'error');
        }
        await loadDetails();
      }
    } catch (err: any) {
      onNotify(err.message || 'Operation failed', 'error');
    } finally {
      setBusyTweakId(null);
    }
  };

  const handleSpeedDuplexChange = async (newValue: string) => {
    if (!adapter?.name || !window.electronAPI) return;
    const option = details?.speedDuplex.validOptions.find((o) => o.value === newValue);
    const label = option ? option.label : newValue;
    setSelectedSpeed(newValue);

    try {
      const res = await window.electronAPI.applyAdapterTweak({
        adapterName: adapter.name,
        tweakId: 'adapter_speed_duplex',
        value: newValue,
      });

      if (res.success) {
        onRequestAutoRevert(`Speed & Duplex: ${label}`, async () => {
          await window.electronAPI?.revertAdapterTweak({
            adapterName: adapter.name,
            tweakId: 'adapter_speed_duplex',
          });
          await loadDetails();
        });
        await loadDetails();
      } else {
        onNotify(res.error || 'Failed to change Speed & Duplex', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Speed change error', 'error');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all">
      {/* Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-100">C. Adapter Tweaks</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Safe / Moderate
              </span>
              {details?.isLaptop && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                  <Laptop className="w-3 h-3" />
                  Laptop Detected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fine-tune hardware driver properties, low-power sleep modes, and interface routing metrics.
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
          {/* Adapter Telemetry Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Speed & Duplex Controller */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-blue-400" />
                  Speed & Duplex
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                  Moderate (20s test)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSpeed}
                  onChange={(e) => handleSpeedDuplexChange(e.target.value)}
                  disabled={isLoading || !details?.speedDuplex.validOptions.length}
                  className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {details?.speedDuplex.validOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-slate-500">
                Current driver setting: <strong className="text-slate-300">{details?.speedDuplex.currentDisplay || 'Auto'}</strong>
              </p>
            </div>

            {/* Interface Routing Priority */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <ArrowDownUp className="w-3.5 h-3.5 text-emerald-400" />
                Interface Metric
              </span>
              <div className="text-xs font-mono font-bold text-slate-200 pt-1">
                Metric {details?.interfaceMetric ?? 'Auto'} (
                {details?.automaticMetric ? 'Automatic' : 'Manual Priority'})
              </div>
              <p className="text-[10px] text-slate-500">
                Lower metric gives higher OS routing priority for games and outbound packets.
              </p>
            </div>

            {/* Connection Cost (Metered Status) */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Connection Cost
              </span>
              <div className="text-xs font-semibold text-slate-200 pt-1 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    details?.isMetered ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                {details?.isMetered ? 'Metered Connection' : 'Unmetered (Full Speed)'}
              </div>
              <p className="text-[10px] text-slate-500">
                Metered restricts background bandwidth; unmetered allows full gaming throughput.
              </p>
            </div>
          </div>

          {/* Tweak Rows List */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
              Hardware & Power Tweaks
            </h4>

            {details?.tweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;

              // Hide rows driver explicitly does not expose
              if (!tweak.isSupported) {
                return (
                  <div
                    key={tweak.id}
                    className="p-3.5 rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-center justify-between opacity-60"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400">{tweak.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                          Not Exposed by Driver
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
                      ? 'bg-emerald-950/20 border-emerald-500/30 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">{tweak.name}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            tweak.impact === 'safe'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {tweak.impact === 'safe' ? 'Safe' : 'Moderate'}
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
                                ? 'bg-emerald-600 text-white shadow-sm'
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
                        Status: <span className={tweak.isApplied ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{tweak.currentValueDisplay}</span>
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
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
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
                          'Optimize'
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
