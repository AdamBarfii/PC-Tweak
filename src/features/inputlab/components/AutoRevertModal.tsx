import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, Check, RotateCcw } from 'lucide-react';
import type { AutoRevertState } from '@/stores/inputStore';

interface AutoRevertModalProps {
  dialog: AutoRevertState | null;
  onKeep: () => void;
  onRevert: () => void;
}

export const AutoRevertModal: React.FC<AutoRevertModalProps> = ({
  dialog,
  onKeep,
  onRevert,
}) => {
  const { i18n } = useTranslation();
  const isFa = i18n.language === 'fa';

  if (!dialog) return null;

  const tweakName = isFa ? dialog.tweakNameFa : dialog.tweakName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Clock className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {isFa ? 'نگه داشتن این تغییر؟' : 'Keep this change?'}
            </h3>
            <p className="text-xs text-slate-400">
              {isFa
                ? 'برای اطمینان از صحت عملکرد ماوس و کیبورد، تغییرات در حال آزمایش است.'
                : 'Testing input responsiveness to ensure your mouse and keyboard are fully functional.'}
            </p>
          </div>
        </div>

        {/* Tweak Details & Countdown Box */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
          <span className="text-xs font-bold text-white block">{tweakName}</span>
          <div className="text-2xl font-black text-amber-400 font-mono tracking-tight flex items-center justify-center gap-2">
            <span>{isFa ? 'بازگردانی خودکار در' : 'Reverting in'}</span>
            <span className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-300">
              {dialog.secondsRemaining}s
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {isFa
              ? 'اگر کلیک نکنید یا ورودی قطع شده باشد، تنظیم خودکار بازگردانده می‌شود.'
              : 'If you do not click Keep or if input stops responding, the tweak will automatically revert.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onRevert}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isFa ? 'بازگردانی' : 'Revert Now'}</span>
          </button>

          <button
            onClick={onKeep}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isFa ? 'نگه داشتن تغییر' : 'Keep'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
