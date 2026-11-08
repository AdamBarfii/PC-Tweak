import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { AntiCheatSafetyLevel } from '@/types/electron';

interface AntiCheatBadgeProps {
  level?: AntiCheatSafetyLevel;
  note?: string;
  affectedAntiCheats?: string[];
  isLocked?: boolean;
}

export const AntiCheatBadge: React.FC<AntiCheatBadgeProps> = ({
  level = 'caution',
  note,
  affectedAntiCheats = [],
  isLocked = false,
}) => {
  if (level === 'blocked-risk' || isLocked) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold tracking-wide"
        title={note || 'Violates kernel anti-cheat launch requirements.'}
      >
        <ShieldAlert className="w-3 h-3 text-rose-400 flex-shrink-0" />
        <span>Locked (Risk)</span>
        {affectedAntiCheats.length > 0 && (
          <span className="text-[9px] text-rose-300/80 bg-rose-500/20 px-1 py-0.2 rounded font-mono">
            {affectedAntiCheats.join(', ')}
          </span>
        )}
      </div>
    );
  }

  if (level === 'caution') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold tracking-wide"
        title={note || 'Touches system scheduling or mitigations. Requires confirmation.'}
      >
        <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <span>Caution</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold tracking-wide"
      title={note || '100% compliant with all anti-cheats.'}
    >
      <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
      <span>AC-Safe</span>
    </div>
  );
};
