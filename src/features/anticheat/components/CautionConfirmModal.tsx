import React from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

interface CautionConfirmModalProps {
  isOpen: boolean;
  tweakName: string;
  tweakNote?: string;
  affectedAntiCheats?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const CautionConfirmModal: React.FC<CautionConfirmModalProps> = ({
  isOpen,
  tweakName,
  tweakNote,
  affectedAntiCheats = [],
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Competitive Caution Warning</h3>
              <p className="text-xs text-amber-300/80">Kernel / System Timing Modification</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
          <p className="text-xs font-semibold text-white">{tweakName}</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {tweakNote ||
              'This tweak modifies deep Windows process scheduling, mitigations, or timer behavior. While safe for casual matchmaking, it may be monitored during strict competitive tournament play.'}
          </p>

          {affectedAntiCheats.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Monitored by:</span>
              <div className="flex gap-1 flex-wrap">
                {affectedAntiCheats.map((ac) => (
                  <span
                    key={ac}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold"
                  >
                    {ac}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 italic">
          Requirements change frequently; verify on the game&apos;s official page.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg shadow-amber-500/20"
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  );
};
