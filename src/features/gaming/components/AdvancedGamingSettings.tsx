import React, { useState } from 'react';
import {
  Star,
  AlertOctagon,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  Cpu,
  Monitor,
  Flame,
  Layers,
  Shield,
  Lock,
  HelpCircle,
} from 'lucide-react';
import { GamingTweakItem } from '@/types/electron';
import { AntiCheatBadge } from '@/features/anticheat/components/AntiCheatBadge';
import { getTweakGuidance } from '@/data/tweakGuidance';
import { TweakGuidanceDrawer } from '@/components/common/TweakGuidanceDrawer';
import { Switch } from '@/components/common/Switch';

interface AdvancedGamingSettingsProps {
  tweaks: GamingTweakItem[];
  onToggleTweak: (tweakId: string, willEnable: boolean) => Promise<void>;
  onRevertTweak: (tweakId: string) => Promise<void>;
}

export const AdvancedGamingSettings: React.FC<AdvancedGamingSettingsProps> = ({
  tweaks,
  onToggleTweak,
  onRevertTweak,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null);
  const [expandedHelpId, setExpandedHelpId] = useState<string | null>(null);

  // Security confirmation modal for Spectre/Meltdown
  const [showSpectreModal, setShowSpectreModal] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');

  const handleToggle = async (tweak: GamingTweakItem) => {
    if (tweak.id === 'spectre_meltdown_mitigations_toggle' && !tweak.isApplied) {
      setShowSpectreModal(true);
      return;
    }

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

  const confirmSpectreToggle = async () => {
    if (typedConfirmation.trim().toLowerCase() !== 'i understand') return;
    setShowSpectreModal(false);
    setTypedConfirmation('');
    setBusyTweakId('spectre_meltdown_mitigations_toggle');
    try {
      await onToggleTweak('spectre_meltdown_mitigations_toggle', true);
    } finally {
      setBusyTweakId(null);
    }
  };

  const getTweakIcon = (id: string) => {
    switch (id) {
      case 'processor_idle_disable':
        return <Flame className="w-4 h-4 text-red-400" />;
      case 'mpo_multiplane_overlay_disable':
        return <Monitor className="w-4 h-4 text-amber-400" />;
      case 'spectre_meltdown_mitigations_toggle':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'memory_compression_off':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'msi_mode_gpu_usb':
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      case 'vbs_memory_integrity_off':
      case 'hyperv_launch_off':
        return <Lock className="w-4 h-4 text-red-400" />;
      default:
        return <Star className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
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
              <h2 className="text-sm font-bold text-slate-100">C. Advanced</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" />
                Advanced
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Powerful tweaks with potential risks and elevated heat. Use with caution.
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3.5">
            {tweaks.map((tweak) => {
              const isBusy = busyTweakId === tweak.id;
              const isBlocked = Boolean(tweak.blockedReason);
              const guidance = getTweakGuidance(tweak.id);
              const isHelpOpen = expandedHelpId === tweak.id;

              return (
                <div
                  key={tweak.id}
                  className={`rounded-xl p-4 border transition-all flex flex-col justify-between space-y-3 ${
                    isBlocked
                      ? 'bg-slate-900/40 border-slate-800 opacity-70'
                      : 'bg-slate-900/60 border-slate-800/90 hover:border-red-500/30'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex-shrink-0 mt-0.5">
                          {getTweakIcon(tweak.id)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-100 truncate" title={tweak.name}>
                            {tweak.name}
                          </h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                            {tweak.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Blocked or Warning Banner */}
                    {tweak.blockedReason && (
                      <div className="p-2 rounded-lg bg-red-950/40 border border-red-500/30 text-[10px] text-red-300 font-medium">
                        {tweak.blockedReason}
                      </div>
                    )}
                  </div>

                  {/* Bottom State & Toggle */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 border border-red-500/30 text-red-400">
                        Advanced
                      </span>

                      {tweak.requiresReboot && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-0.5">
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

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-medium text-slate-300">
                        {tweak.isApplied ? 'Active' : 'Off'}
                      </span>

                      <Switch
                        checked={tweak.isApplied}
                        onChange={() => handleToggle(tweak)}
                        disabled={busyTweakId !== null || isBlocked || tweak.anticheat === 'blocked-risk'}
                        isLoading={isBusy}
                        colorScheme="red"
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
        </div>
      )}

      {/* Typed Confirmation Modal for Spectre & Meltdown */}
      {showSpectreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 select-none">
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-red-500/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 flex-shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Security Vulnerability Confirmation</h3>
                <p className="text-[11px] text-red-300">High Risk Security Warning</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-red-950/30 p-3.5 rounded-xl border border-red-500/30">
              <p>
                Disabling Spectre (Variant 2) and Meltdown mitigations removes hardware kernel isolation protections against speculative execution side-channel attacks.
              </p>
              <p className="text-slate-400">
                This can recover CPU throughput on 8th Gen and older Intel CPUs, but exposes your passwords and memory to browser-based or malicious processes.
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-300 font-semibold block">
                Type <span className="font-mono text-red-400">I understand</span> to proceed:
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder="I understand"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSpectreModal(false);
                  setTypedConfirmation('');
                }}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSpectreToggle}
                disabled={typedConfirmation.trim().toLowerCase() !== 'i understand'}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-red-600/30"
              >
                Confirm Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
