import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Wifi,
  Monitor,
  Volume2,
  Lock,
  Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DpcIsrReport, DriverBottleneckInfo } from '@/types/electron';

export const DpcIsrDiagnosticsCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [report, setReport] = useState<DpcIsrReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const loadReport = async () => {
    if (!window.electronAPI?.getDpcIsrReport) return;
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getDpcIsrReport();
      setReport(data);
    } catch (err) {
      console.error('Failed to load DPC/ISR diagnostic report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  if (!report) return null;

  const filteredDrivers = report.drivers.filter((d) => {
    if (activeCategoryFilter === 'all') return true;
    if (activeCategoryFilter === 'flagged') return d.isKnownBottleneck;
    return d.category === activeCategoryFilter;
  });

  const getCategoryIcon = (category: DriverBottleneckInfo['category']) => {
    switch (category) {
      case 'gpu':
        return <Monitor className="w-3.5 h-3.5" />;
      case 'network':
        return <Wifi className="w-3.5 h-3.5" />;
      case 'storage':
        return <HardDrive className="w-3.5 h-3.5" />;
      case 'audio':
        return <Volume2 className="w-3.5 h-3.5" />;
      default:
        return <Cpu className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-border shadow-lg backdrop-blur-md space-y-4 text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              report.overallStatus === 'optimal'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                : report.overallStatus === 'moderate'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}
          >
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-foreground">
                {isRtl ? 'پایش تاخیر درایورها (DPC & ISR Driver Latency)' : 'DPC & ISR Driver Latency Audit'}
              </h3>
              {!report.isElevated && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  {isRtl ? 'ادمین برای درصد زنده' : 'Admin for Real-Time %'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isRtl
                ? `${report.runningDriversCount} درایور کرنل فعال پایش شد • ${report.flaggedDriversCount} کاندید تاخیر شناسایی شد`
                : `${report.runningDriversCount} active kernel drivers audited • ${report.flaggedDriversCount} known latency candidates`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadReport}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title={isRtl ? 'بروزرسانی' : 'Refresh'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {/* DPC Time */}
        <div className="p-3 rounded-xl bg-muted/30 border border-border flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">
            {isRtl ? 'درصد زمان DPC' : '% DPC Time'}
          </span>
          <span className="text-lg font-mono font-black mt-0.5 text-foreground">
            {report.dpcPercent !== null ? `${report.dpcPercent.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {report.dpcPercent !== null
              ? report.dpcPercent < 2
                ? isRtl ? 'بهینه (<۲٪)' : 'Optimal (<2%)'
                : isRtl ? 'متوسط یا بالا' : 'Elevated'
              : isRtl ? 'نیازمند دسترسی ادمین' : 'Requires admin'}
          </span>
        </div>

        {/* ISR Time */}
        <div className="p-3 rounded-xl bg-muted/30 border border-border flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">
            {isRtl ? 'درصد وقفه سخت‌افزاری (ISR)' : '% Interrupt (ISR) Time'}
          </span>
          <span className="text-lg font-mono font-black mt-0.5 text-foreground">
            {report.interruptPercent !== null ? `${report.interruptPercent.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {report.interruptPercent !== null
              ? report.interruptPercent < 1.5
                ? isRtl ? 'بهینه (<۱.۵٪)' : 'Optimal (<1.5%)'
                : isRtl ? 'متوسط یا بالا' : 'Elevated'
              : isRtl ? 'نیازمند دسترسی ادمین' : 'Requires admin'}
          </span>
        </div>

        {/* Status */}
        <div className="p-3 rounded-xl bg-muted/30 border border-border flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">
            {isRtl ? 'وضعیت تاخیر سیستم' : 'Driver Latency Status'}
          </span>
          <span
            className={`text-sm font-bold mt-1 ${
              report.overallStatus === 'optimal'
                ? 'text-emerald-500'
                : report.overallStatus === 'moderate'
                ? 'text-amber-500'
                : 'text-red-500'
            }`}
          >
            {report.overallStatus === 'optimal'
              ? isRtl ? 'بهینه (لگ پایین)' : 'Optimal (Low Latency)'
              : report.overallStatus === 'moderate'
              ? isRtl ? 'متوسط' : 'Moderate Latency'
              : isRtl ? 'تاخیر بالا' : 'High Latency Spikes'}
          </span>
        </div>
      </div>

      {/* Recommendations Banner */}
      <div className="p-3 rounded-xl bg-muted/20 border border-border space-y-1 text-xs">
        {report.recommendations.map((rec, i) => (
          <p key={i} className="text-muted-foreground text-[11px] leading-relaxed">
            • {rec}
          </p>
        ))}
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            activeCategoryFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          {isRtl ? 'همه' : 'All Drivers'} ({report.drivers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('flagged')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            activeCategoryFilter === 'flagged'
              ? 'bg-amber-500 text-white'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          {isRtl ? 'نقاط حساس تاخیر' : 'Latency Hotspots'} ({report.flaggedDriversCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('gpu')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            activeCategoryFilter === 'gpu'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          GPU
        </button>
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('network')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            activeCategoryFilter === 'network'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          Network
        </button>
        <button
          type="button"
          onClick={() => setActiveCategoryFilter('storage')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
            activeCategoryFilter === 'storage'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          Storage
        </button>
      </div>

      {/* Driver List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredDrivers.slice(0, 15).map((d) => {
          const isExpanded = expandedDriver === d.moduleName;
          return (
            <div
              key={d.moduleName}
              className={`p-3 rounded-xl border transition-colors ${
                d.isKnownBottleneck
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-muted/10 border-border/60'
              }`}
            >
              <div
                onClick={() => setExpandedDriver(isExpanded ? null : d.moduleName)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                    {getCategoryIcon(d.category)}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-foreground truncate">
                        {d.moduleName}.sys
                      </span>
                      {d.isKnownBottleneck && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30">
                          Hotspot
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground truncate">
                        {d.displayName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      d.state === 'Running'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {d.state}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2 text-xs animate-in fade-in duration-150">
                  <div>
                    <span className="font-semibold text-foreground text-[11px]">
                      {isRtl ? 'علت محتمل تاخیر:' : 'Potential Latency Cause:'}
                    </span>
                    <p className="text-muted-foreground text-[11px] mt-0.5">{d.potentialCause}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground text-[11px]">
                      {isRtl ? 'راهکار پیشنهادی:' : 'Actionable Recommendation:'}
                    </span>
                    <p className="text-primary text-[11px] mt-0.5">{d.recommendation}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
