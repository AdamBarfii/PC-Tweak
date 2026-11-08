import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, AlertOctagon, X, Loader2 } from 'lucide-react';
import { AntiCheatDetectionResult } from '@/types/electron';

interface CompetitiveSafeToggleProps {
  onStatusChange?: (result: AntiCheatDetectionResult) => void;
}

export const CompetitiveSafeToggle: React.FC<CompetitiveSafeToggleProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<AntiCheatDetectionResult | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchStatus = async () => {
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.getAntiCheatStatus();
        setStatus(res);
        onStatusChange?.(res);
      }
    } catch (err) {
      console.error('Failed to get anti-cheat status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleToggleClick = () => {
    if (!status) return;

    if (status.isCompetitiveSafeActive) {
      // User wants to turn OFF -> Show one-time warning modal
      setShowWarningModal(true);
    } else {
      // User wants to turn ON -> immediate
      applyStateChange(true);
    }
  };

  const applyStateChange = async (enable: boolean) => {
    setIsUpdating(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.setCompetitiveSafeMode(enable);
        const updated = await window.electronAPI.getAntiCheatStatus(true);
        setStatus(updated);
        onStatusChange?.(updated);
      }
    } catch (err) {
      console.error('Failed to change competitive-safe mode:', err);
    } finally {
      setIsUpdating(false);
      setShowWarningModal(false);
    }
  };

  if (!status) return null;

  const isActive = status.isCompetitiveSafeActive;
  const acCount = status.detectedAntiCheats.length;

  return (
    <>
      <button
        onClick={handleToggleClick}
        disabled={isUpdating}
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer select-none no-drag ${
          isActive
            ? 'bg-blue-600/15 border border-blue-500/35 text-blue-300 hover:bg-blue-600/25'
            : 'bg-slate-800/60 border border-amber-500/30 text-amber-300 hover:bg-slate-800/90'
        }`}
        title={
          isActive
            ? `Competitive-Safe Mode: ON (${acCount} anti-cheats detected). Blocked-risk tweaks are safely locked.`
            : 'Competitive-Safe Mode: OFF. Guardrails disengaged.'
        }
      >
        {isUpdating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" />
        ) : isActive ? (
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        ) : (
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        )}
        <span className="truncate max-w-[170px]">
          {isActive
            ? `Comp-Safe: ON (${acCount > 0 ? `${acCount} Detected` : 'Active'})`
            : 'Comp-Safe: OFF'}
        </span>
      </button>

      {/* Disabling Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in no-drag">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Disable Competitive-Safe Mode?</h3>
                  <p className="text-xs text-rose-300/80">Kernel Guardrails Disengagement</p>
                </div>
              </div>
              <button
                onClick={() => setShowWarningModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                Disabling Competitive-Safe mode unlocks deep tweaks (like disabling VBS/HVCI or custom BCD boot entries).
              </p>
              <p className="text-rose-300 font-medium">
                Warning: If you play games protected by <strong>Riot Vanguard</strong>, <strong>FACEIT</strong>, or <strong>EasyAntiCheat</strong>, disabling security features will prevent those games from launching (e.g. error codes VAN 1067 / VAN 9003).
              </p>
              <p className="text-slate-400 text-[11px] italic">
                Requirements change frequently; verify on the game&apos;s official page.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Keep Protected
              </button>
              <button
                onClick={() => applyStateChange(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-600/30"
              >
                I Understand, Turn Off
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
