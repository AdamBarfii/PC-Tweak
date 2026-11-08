import React from 'react';
import {
  Wifi,
  Network,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NetworkAdapterInfo } from '@/types/electron';

interface NetworkTopBarProps {
  adapters: NetworkAdapterInfo[];
  selectedAdapterId: string | null;
  onSelectAdapter: (id: string) => void;
  onUndoAll: () => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onNetworkRecovery: () => Promise<void>;
  hasReversibleChanges: boolean;
  isRdpActive: boolean;
}

export const NetworkTopBar: React.FC<NetworkTopBarProps> = ({
  adapters,
  selectedAdapterId,
  onSelectAdapter,
  onUndoAll,
  onResetDefaults,
  onNetworkRecovery,
  hasReversibleChanges,
  isRdpActive,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const selectedAdapter =
    adapters.find((a) => a.id === selectedAdapterId) || adapters[0] || null;

  return (
    <div className="space-y-4 text-foreground">
      {/* RDP Session Warning Banner */}
      {isRdpActive && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              <strong>{isRtl ? 'اتصال ریموت دسکتاپ فعال است:' : 'Remote Desktop Session Active:'}</strong>{' '}
              {isRtl
                ? 'ریستارت آداپتور به منظور جلوگیری از قطع اتصال قفل شده است.'
                : 'Adapter resets or link bounces are locked to prevent connection loss.'}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/30">
            RDP Protected
          </span>
        </div>
      )}

      {/* Top Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Module Title */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-md">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">
              {isRtl ? 'بهینه‌سازی شبکه و اینترنت' : 'Network Optimizer'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? 'پایش تاخیر، پکت لاس، تنظیمات DNS و بهینه‌سازی آداپتور با اندازه‌گیری واقعی'
                : 'Optimize network latency, DNS resolution, and adapter throughput with real measurements.'}
            </p>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Undo All Changes */}
          <button
            type="button"
            onClick={onUndoAll}
            disabled={!hasReversibleChanges}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              hasReversibleChanges
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isRtl ? 'بازگردانی همه تغییرات' : 'Undo All'}</span>
          </button>

          {/* Reset to Windows Defaults */}
          <button
            type="button"
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isRtl ? 'بازنشانی پیش‌فرض ویندوز' : 'Reset Defaults'}</span>
          </button>

          {/* Network Recovery (Safe Mode batch generator) */}
          <button
            type="button"
            onClick={onNetworkRecovery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 transition-all cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
            <span>{isRtl ? 'پوشه بازیابی اضطراری' : 'Network Recovery'}</span>
          </button>
        </div>
      </div>

      {/* Active Adapter Overview Card */}
      {selectedAdapter && (
        <div className="p-5 rounded-xl glass-panel space-y-3 text-card-foreground">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 dark:border-white/5 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]">
                {selectedAdapter.mediaType === 'Wi-Fi' ? (
                  <Wifi className="w-5 h-5" />
                ) : (
                  <Network className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">{selectedAdapter.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                      selectedAdapter.status === 'Up'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedAdapter.status === 'Up' ? 'bg-emerald-500' : 'bg-muted-foreground'
                      }`}
                    />
                    {selectedAdapter.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted border border-border text-muted-foreground font-mono">
                    {selectedAdapter.linkSpeed}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-lg">
                  {selectedAdapter.description}
                </p>
              </div>
            </div>

            {/* Adapter Selector Dropdown */}
            {adapters.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{isRtl ? 'کارت شبکه:' : 'Adapter:'}</span>
                <select
                  value={selectedAdapter.id}
                  onChange={(e) => onSelectAdapter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-background border border-border text-foreground focus:outline-none focus:border-primary cursor-pointer"
                >
                  {adapters.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.mediaType})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-muted/20 border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                {isRtl ? 'آدرس IPv4' : 'IPv4 Address'}
              </span>
              <span className="text-foreground font-mono font-semibold block truncate">
                {selectedAdapter.ipv4Address || (isRtl ? 'نامشخص' : 'None')}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-muted/20 border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                {isRtl ? 'دروازه پیش‌فرض (Gateway)' : 'Default Gateway'}
              </span>
              <span className="text-foreground font-mono font-semibold block truncate">
                {selectedAdapter.defaultGateway || (isRtl ? 'نامشخص' : 'None')}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-muted/20 border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                {isRtl ? 'سرورهای DNS' : 'DNS Servers'}
              </span>
              <span className="text-foreground font-mono font-semibold block truncate">
                {selectedAdapter.dnsServers.length > 0
                  ? selectedAdapter.dnsServers.join(', ')
                  : isRtl ? 'خودکار (DHCP)' : 'Automatic'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-muted/20 border border-border space-y-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                {isRtl ? 'نوع تعرفه اتصال' : 'Connection Cost'}
              </span>
              <span className="text-foreground font-semibold flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedAdapter.isMetered ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                {selectedAdapter.isMetered
                  ? isRtl ? 'محدود (حجمی)' : 'Metered'
                  : isRtl ? 'نامحدود' : 'Unmetered'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
