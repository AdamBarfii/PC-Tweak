import React, { useState, useEffect } from 'react';
import {
  Mouse,
  Keyboard,
  Cpu,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InputQueueStatus } from '@/types/electron';

interface HighPollingBufferCardProps {
  onNotify?: (text: string, type?: 'success' | 'warning' | 'error') => void;
}

export const HighPollingBufferCard: React.FC<HighPollingBufferCardProps> = ({ onNotify }) => {
  const { i18n } = useTranslation();
  const isFa = i18n.language === 'fa';

  const [status, setStatus] = useState<InputQueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showRebootNotice, setShowRebootNotice] = useState(false);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.getInputQueueStatus();
        setStatus(res);
      }
    } catch (err) {
      console.error('Failed to load Input Queue status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSetMouseQueue = async (size: number) => {
    setActionInProgress('mouse');
    try {
      const res = await window.electronAPI?.setMouseQueueSize(size);
      if (res?.success) {
        setShowRebootNotice(true);
        onNotify?.(
          isFa ? `بافر صف ماوس با موفقیت روی ${size} تنظیم شد. راه‌اندازی مجدد برای اعمال کامل پیشنهاد می‌شود.` : res.message,
          'success'
        );
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to update mouse buffer', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSetKeyboardQueue = async (size: number) => {
    setActionInProgress('keyboard');
    try {
      const res = await window.electronAPI?.setKeyboardQueueSize(size);
      if (res?.success) {
        setShowRebootNotice(true);
        onNotify?.(
          isFa ? `بافر صف کیبورد با موفقیت روی ${size} تنظیم شد.` : res.message,
          'success'
        );
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to update keyboard buffer', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevert = async () => {
    setActionInProgress('revert');
    try {
      const res = await window.electronAPI?.revertInputQueue();
      if (res?.success) {
        setShowRebootNotice(true);
        onNotify?.(
          isFa ? 'بافر صف ورودی به حالت پیش‌فرض ویندوز بازگردانده شد.' : res.message,
          'success'
        );
        await loadData();
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error reverting buffers', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-card border border-border animate-pulse space-y-2">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-16 bg-muted/40 rounded-md" />
      </div>
    );
  }

  const mouseSize = status?.mouseQueueSize ?? 100;
  const kbdSize = status?.keyboardQueueSize ?? 100;

  return (
    <div className="p-5 rounded-xl glass-panel space-y-4 text-foreground">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 dark:border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0 shadow-[0_0_8px_rgba(0,240,255,0.15)]">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-foreground">
                {isFa ? 'عمق بافر ورودی ماوس و کیبورد با نرخ پاسخ بالا (Input Queue Depth)' : 'High-Polling Input Buffer Engine'}
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30">
                1000Hz - 8000Hz
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isFa
                ? 'جلوگیری از افت پکت‌های حرکتی و پرش ماوس‌های گیمینگ در بارهای پردازشی سنگین.'
                : 'Prevents dropped mouse reports and micro-stutter on high polling rate gaming peripherals.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRevert}
          disabled={Boolean(actionInProgress)}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold glass-chip hover:text-foreground text-muted-foreground transition-colors cursor-pointer flex items-center gap-1.5 self-end sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{isFa ? 'پیش‌فرض (۱۰۰)' : 'Default (100)'}</span>
        </button>
      </div>

      {/* Reboot Notice */}
      {showRebootNotice && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {isFa
                ? 'بافر درایورهای mouclass و kbdclass به‌روزرسانی شد. راه‌اندازی مجدد سیستم برای اعمال کامل پورت‌های ورودی لازم است.'
                : 'Input driver buffer sizes updated in registry. System restart required to take full effect across USB ports.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowRebootNotice(false)}
            className="text-[11px] font-semibold underline hover:opacity-80"
          >
            {isFa ? 'بستن' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Dual Column Buffer Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Mouse Buffer Controller */}
        <div className="p-3.5 rounded-lg glass-chip hover:border-cyan-500/25 transition-colors space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mouse className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                {isFa ? 'عمق بافر ماوس (MouseDataQueueSize)' : 'Mouse Buffer Depth'}
              </span>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums text-primary">
              {mouseSize} packets
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {isFa
              ? 'پیش‌فرض ویندوز ۱۰۰ پکت است. برای ماوس‌های ۱۰۰۰ هرتز مقدار ۱۲۸ و برای ماوس‌های ۴K و ۸K مقدار ۲۵۶ برای حذف لگ ناگهانی حین فریم‌دراپ پیشنهاد می‌شود.'
              : 'Windows default is 100 packets. High polling rates (1000Hz–8000Hz) benefit from 128 or 256 packets to avoid buffer saturation.'}
          </p>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleSetMouseQueue(100)}
              disabled={actionInProgress === 'mouse'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                mouseSize === 100
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              100 (Default)
            </button>
            <button
              type="button"
              onClick={() => handleSetMouseQueue(128)}
              disabled={actionInProgress === 'mouse'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                mouseSize === 128
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              128 (1000Hz)
            </button>
            <button
              type="button"
              onClick={() => handleSetMouseQueue(256)}
              disabled={actionInProgress === 'mouse'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                mouseSize >= 200
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              256 (4K / 8K)
            </button>
          </div>
        </div>

        {/* Keyboard Buffer Controller */}
        <div className="p-3.5 rounded-lg glass-chip hover:border-cyan-500/25 transition-colors space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                {isFa ? 'عمق بافر کیبورد (KeyboardDataQueueSize)' : 'Keyboard Buffer Depth'}
              </span>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums text-primary">
              {kbdSize} packets
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {isFa
              ? 'پیش‌فرض ویندوز ۱۰۰ پکت است. افزایش به ۱۲۸ یا ۲۵۶ ثبات ثبت فشردن همزمان چند کلید (NKRO) در شرایط بار سنگین پردازنده را تضمین می‌کند.'
              : 'Extends kbdclass packet depth from 100 to 128 or 256 for rapid key rollover stability under peak CPU load.'}
          </p>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleSetKeyboardQueue(100)}
              disabled={actionInProgress === 'keyboard'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                kbdSize === 100
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              100 (Default)
            </button>
            <button
              type="button"
              onClick={() => handleSetKeyboardQueue(128)}
              disabled={actionInProgress === 'keyboard'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                kbdSize === 128
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              128 (Esports)
            </button>
            <button
              type="button"
              onClick={() => handleSetKeyboardQueue(256)}
              disabled={actionInProgress === 'keyboard'}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer text-center ${
                kbdSize >= 200
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-muted text-muted-foreground border border-border'
              }`}
            >
              256 (High-Rate)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
