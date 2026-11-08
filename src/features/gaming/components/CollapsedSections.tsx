import React, { useState } from 'react';
import {
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';

export const CollapsedSections: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* G. Game Session Mode (Phase 5 placeholder) */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-slate-100">G. Game Session Mode</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Safe
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically apply settings when a game starts.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {isOpen && (
          <div className="p-6 pt-2 border-t border-slate-800/60 text-xs text-slate-400 space-y-2">
            <p className="text-slate-300">
              Watches running processes, suspends background tasks (Discord, browsers), activates Focus Assist, and restores previous states on game exit.
            </p>
            <p className="text-slate-500 italic">
              Configured for Phase 5 deployment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
