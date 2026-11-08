import React, { useState, useEffect } from 'react';
import {
  Timer,
  Clock,
  Layers,
  Cpu,
  HardDrive,
  Rocket,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BootBreakdownReport } from '@/types/electron';

export const BootBreakdownCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [bootReport, setBootReport] = useState<BootBreakdownReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadBootReport = async () => {
    if (!window.electronAPI?.getBootBreakdown) return;
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getBootBreakdown();
      setBootReport(data);
    } catch (err) {
      console.error('Failed to query boot breakdown:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBootReport();
  }, []);

  if (!bootReport) return null;

  const totalDurationSeconds = (bootReport.totalBootDurationMs / 1000).toFixed(1);
  const mainPathSeconds = (bootReport.phases.mainPathMs / 1000).toFixed(1);

  // Percentages for segmented bar
  const baseTotal =
    bootReport.totalBootDurationMs > 0
      ? bootReport.totalBootDurationMs
      : bootReport.phases.mainPathMs + bootReport.phases.postBootMs;

  const kernelPct = baseTotal > 0 ? (bootReport.phases.kernelInitMs / baseTotal) * 100 : 0;
  const driverPct = baseTotal > 0 ? (bootReport.phases.driverInitMs / baseTotal) * 100 : 0;
  const smssPct = baseTotal > 0 ? (bootReport.phases.smssInitMs / baseTotal) * 100 : 0;
  const postBootPct = baseTotal > 0 ? (bootReport.phases.postBootMs / baseTotal) * 100 : 0;

  return (
    <div className="p-5 rounded-xl glass-panel space-y-4 text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-foreground">
                {isRtl ? 'تحلیل زمان بوت ویندوز (Boot Diagnostics)' : 'Windows Boot Time Breakdown'}
              </h3>
              {!bootReport.hasEventLog && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  {isRtl ? 'نیازمند ادمین' : 'Admin Required for Kernel Log'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {bootReport.hasEventLog
                ? isRtl
                  ? `آخرین بوت: ${new Date(bootReport.lastBootTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : `Last boot: ${new Date(bootReport.lastBootTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : isRtl
                ? `زمان بالا آمدن سیستم: ${new Date(bootReport.lastBootTimestamp).toLocaleString()}`
                : `System started: ${new Date(bootReport.lastBootTimestamp).toLocaleString()}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadBootReport}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors cursor-pointer"
          title={isRtl ? 'بروزرسانی' : 'Refresh'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {bootReport.hasEventLog ? (
        <div className="space-y-4">
          {/* Main Timing Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg glass-chip hover:border-cyan-500/25 transition-colors flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                {isRtl ? 'کل زمان بوت' : 'Total Duration'}
              </span>
              <span className="text-lg font-mono font-black text-foreground mt-0.5">
                {totalDurationSeconds}s
              </span>
            </div>
            <div className="p-3 rounded-lg glass-chip hover:border-cyan-500/25 transition-colors flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                {isRtl ? 'مسیر اصلی (Main Path)' : 'Main Path'}
              </span>
              <span className="text-lg font-mono font-black text-cyan-400 mt-0.5">
                {mainPathSeconds}s
              </span>
            </div>
            <div className="p-3 rounded-lg glass-chip hover:border-amber-500/25 transition-colors flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                {isRtl ? 'بارگذاری درایورها' : 'Drivers Init'}
              </span>
              <span className="text-lg font-mono font-black text-amber-400 mt-0.5">
                {(bootReport.phases.driverInitMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="p-3 rounded-lg glass-chip hover:border-purple-500/25 transition-colors flex flex-col">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">
                {isRtl ? 'برنامه‌های استارتاپ' : 'Post-Boot Apps'}
              </span>
              <span className="text-lg font-mono font-black text-purple-400 mt-0.5">
                {(bootReport.phases.postBootMs / 1000).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Segmented Timeline Progress Bar */}
          <div className="space-y-2">
            <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden flex">
              <div
                style={{ width: `${kernelPct}%` }}
                className="bg-emerald-500 h-full transition-all duration-500"
                title={`Kernel: ${(bootReport.phases.kernelInitMs / 1000).toFixed(1)}s (${kernelPct.toFixed(0)}%)`}
              />
              <div
                style={{ width: `${driverPct}%` }}
                className="bg-amber-500 h-full transition-all duration-500"
                title={`Drivers: ${(bootReport.phases.driverInitMs / 1000).toFixed(1)}s (${driverPct.toFixed(0)}%)`}
              />
              <div
                style={{ width: `${smssPct}%` }}
                className="bg-cyan-500 h-full transition-all duration-500"
                title={`SMSS: ${(bootReport.phases.smssInitMs / 1000).toFixed(1)}s (${smssPct.toFixed(0)}%)`}
              />
              <div
                style={{ width: `${postBootPct}%` }}
                className="bg-purple-500 h-full transition-all duration-500"
                title={`Post-Boot: ${(bootReport.phases.postBootMs / 1000).toFixed(1)}s (${postBootPct.toFixed(0)}%)`}
              />
            </div>

            {/* Segment Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>
                  {isRtl ? 'کرنل' : 'Kernel'} ({(bootReport.phases.kernelInitMs / 1000).toFixed(1)}s)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>
                  {isRtl ? 'درایورها' : 'Drivers'} ({(bootReport.phases.driverInitMs / 1000).toFixed(1)}s)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                <span>
                  {isRtl ? 'مدیریت سشن (SMSS)' : 'SMSS'} ({(bootReport.phases.smssInitMs / 1000).toFixed(1)}s)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>
                  {isRtl ? 'استارتاپ' : 'Post-Boot'} ({(bootReport.phases.postBootMs / 1000).toFixed(1)}s)
                </span>
              </div>
            </div>
          </div>

          {/* Analysis & Recommendations Callout */}
          <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Rocket className="w-3.5 h-3.5 text-primary" />
              <span>{bootReport.summary}</span>
            </div>
            {bootReport.recommendations.map((rec, i) => (
              <p key={i} className="text-muted-foreground text-[11px] ps-5">
                • {rec}
              </p>
            ))}
          </div>
        </div>
      ) : (
        /* Non-elevated fallback view */
        <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-2 text-xs">
          <div className="flex items-start gap-2.5 text-muted-foreground">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {isRtl
                  ? 'لاگ تشخیصی عمقی زمان بوت نیازمند دسترسی ادمین است'
                  : 'Deep Kernel Boot Diagnostics Require Administrator Privileges'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isRtl
                  ? 'ویندوز تفکیک میلی‌ثانیه‌ای فازهای کرنل، درایورها و برنامه‌های استارتاپ را در لاگ Diagnostics-Performance ذخیره می‌کند. برنامه را با Run as Administrator اجرا کنید تا زمان دقیق هر بخش پایش شود.'
                  : 'Windows records millisecond phase breakdowns (Kernel, Drivers, Smss, PostBoot) in the Diagnostics-Performance operational event log. Run PC Tweak as Administrator to display this analysis.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
