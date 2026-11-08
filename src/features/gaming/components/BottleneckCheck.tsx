import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Monitor,
  HardDrive,
  Flame,
  Zap,
  Clock,
  Layers,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { BottleneckAuditReport, BottleneckItem } from '@/types/electron';

interface BottleneckCheckProps {
  auditReport: BottleneckAuditReport | null;
  onRunAudit: () => Promise<void>;
  onFixBottleneck: (actionId: string) => Promise<void>;
}

export const BottleneckCheck: React.FC<BottleneckCheckProps> = ({
  auditReport,
  onRunAudit,
  onFixBottleneck,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const handleScan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsScanning(true);
    try {
      await onRunAudit();
    } finally {
      setIsScanning(false);
    }
  };

  const handleAction = async (actionId: string) => {
    setActiveActionId(actionId);
    try {
      await onFixBottleneck(actionId);
    } finally {
      setActiveActionId(null);
    }
  };

  const getItemIcon = (category: BottleneckItem['category']) => {
    switch (category) {
      case 'ram':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'display':
        return <Monitor className="w-4 h-4 text-blue-400" />;
      case 'gpu':
        return <Zap className="w-4 h-4 text-cyan-400" />;
      case 'rebar':
        return <Cpu className="w-4 h-4 text-emerald-400" />;
      case 'hags':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'storage_type':
      case 'storage_space':
        return <HardDrive className="w-4 h-4 text-emerald-400" />;
      case 'thermal':
        return <Flame className="w-4 h-4 text-orange-400" />;
      case 'driver':
        return <Clock className="w-4 h-4 text-indigo-400" />;
      default:
        return <Search className="w-4 h-4 text-blue-400" />;
    }
  };

  const passedCount = auditReport?.passedCount ?? 0;
  const warningCount = auditReport?.warningCount ?? 0;
  const criticalCount = auditReport?.criticalCount ?? 0;
  const totalCount = auditReport?.items.length ?? 9;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Search className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">F. Bottleneck Check</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Safe
              </span>

              {auditReport && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                    criticalCount > 0
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : warningCount > 0
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {passedCount}/{totalCount} Optimal
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Find and fix performance bottlenecks in hardware configuration and drivers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Auditing...' : 'Run System Scan'}</span>
          </button>

          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-300">{passedCount} Optimal</span>
                <p className="text-[10px] text-slate-400">Peak performance verified</p>
              </div>
            </div>

            <div className="px-4 py-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-amber-300">{warningCount} Warnings</span>
                <p className="text-[10px] text-slate-400">Potential fps loss or latency</p>
              </div>
            </div>

            <div className="px-4 py-2.5 rounded-xl bg-red-950/20 border border-red-500/30 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
                <AlertOctagon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-red-300">{criticalCount} Critical</span>
                <p className="text-[10px] text-slate-400">Severe bottleneck detected</p>
              </div>
            </div>
          </div>

          {/* Diagnostic Checks Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {auditReport?.items.map((item) => {
              const isOptimal = item.status === 'optimal';
              const isCritical = item.status === 'critical';
              const isWarning = item.status === 'warning';
              const isBusy = activeActionId === item.actionId;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-3.5 border transition-all flex flex-col justify-between ${
                    isCritical
                      ? 'bg-red-950/20 border-red-500/40 hover:border-red-500/60'
                      : isWarning
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex-shrink-0">
                          {getItemIcon(item.category)}
                        </div>
                        <h4 className="text-xs font-bold text-slate-100 truncate" title={item.title}>
                          {item.title}
                        </h4>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 flex items-center gap-1 ${
                          isCritical
                            ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                            : isWarning
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                            : isOptimal
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {isCritical ? (
                          <AlertOctagon className="w-3 h-3" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : isOptimal ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Info className="w-3 h-3" />
                        )}
                        <span className="capitalize">{item.status}</span>
                      </span>
                    </div>

                    {/* Measured Value */}
                    <div className="px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/70">
                      <span className="text-[10px] text-slate-400 block">Measured Value</span>
                      <p className="text-xs font-mono font-bold text-slate-200 truncate">
                        {item.currentValue}
                      </p>
                    </div>

                    {/* Plain Recommendation */}
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {item.recommendation}
                    </p>
                  </div>

                  {/* Action Button */}
                  {item.actionLabel && item.actionId && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => handleAction(item.actionId!)}
                        disabled={isBusy}
                        className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-200 border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <span>{item.actionLabel}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </>
                        )}
                      </button>
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
