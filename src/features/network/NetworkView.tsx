import React, { useState, useEffect, useRef } from 'react';
import {
  Network,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  Search,
  Globe,
  Sliders,
  Wifi,
  Star,
  FlaskConical,
  Wrench,
  AlertOctagon,
  ShieldCheck,
  AlertTriangle,
  Timer,
  Check,
  FileText,
  Activity,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NetworkModuleOverview, NetworkAdapterInfo } from '@/types/electron';
import { NetworkTopBar } from './components/NetworkTopBar';
import { NetworkTestSection } from './components/NetworkTestSection';
import { DnsManagerSection } from './components/DnsManagerSection';
import { AdapterTweaksSection } from './components/AdapterTweaksSection';
import { WifiInspectorSection } from './components/WifiInspectorSection';
import { AdvancedTweaksSection } from './components/AdvancedTweaksSection';
import { ExperimentalTweaksSection } from './components/ExperimentalTweaksSection';
import { NetworkRepairSection } from './components/NetworkRepairSection';
import { HostsViewerModal } from './components/HostsViewerModal';
import { PageLoadingState } from '@/components/common/PageLoadingState';

export type NetworkSubTab = 'latency' | 'dns' | 'adapter' | 'repair';

export const NetworkView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [activeSubTab, setActiveSubTab] = useState<NetworkSubTab>('latency');
  const [isHostsModalOpen, setIsHostsModalOpen] = useState(false);
  const [overview, setOverview] = useState<NetworkModuleOverview | null>(null);
  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerMessage, setBannerMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // 20-second Auto-Revert Safety Modal State
  const [revertModal, setRevertModal] = useState<{
    isOpen: boolean;
    tweakName: string;
    countdown: number;
    onRevert: () => Promise<void>;
  }>({
    isOpen: false,
    tweakName: '',
    countdown: 20,
    onRevert: async () => {},
  });

  const showBanner = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setBannerMessage({ text, type });
    setTimeout(() => setBannerMessage(null), 5000);
  };

  const loadOverview = async (isBackgroundSync = false) => {
    if (!window.electronAPI?.getNetworkOverview) return;
    if (!isBackgroundSync && !overview) {
      setIsLoading(true);
    }
    try {
      const data = await window.electronAPI.getNetworkOverview();
      setOverview(data);
      if (data.activeAdapter && !selectedAdapterId) {
        setSelectedAdapterId(data.activeAdapter.id);
      }
    } catch (err: any) {
      console.error('Failed to load network overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  // Listen for backend watchdog ticks, confirm events, and rollback events
  useEffect(() => {
    window.electronAPI?.getWatchdogState?.().then((state: any) => {
      if (state && state.isArmed && state.record) {
        setRevertModal({
          isOpen: true,
          tweakName: state.record.tweakName,
          countdown: state.remainingSeconds,
          onRevert: async () => {},
        });
      }
    });

    const unbindTick = window.electronAPI?.onWatchdogTick?.((data: any) => {
      setRevertModal((prev) => ({
        isOpen: true,
        tweakName: data.tweakName,
        countdown: data.remainingSeconds,
        onRevert: prev.onRevert,
      }));
    });

    const unbindReverted = window.electronAPI?.onWatchdogReverted?.((data: any) => {
      setRevertModal((prev) => ({ ...prev, isOpen: false }));
      showBanner(`Watchdog auto-reverted "${data.tweakName}" (${data.reason}). Restored previous configuration.`, 'warning');
      loadOverview();
    });

    const unbindConfirmed = window.electronAPI?.onWatchdogConfirmed?.((data: any) => {
      setRevertModal((prev) => ({ ...prev, isOpen: false }));
      showBanner(`Changes to "${data.tweakName}" kept successfully.`, 'success');
    });

    return () => {
      if (unbindTick) unbindTick();
      if (unbindReverted) unbindReverted();
      if (unbindConfirmed) unbindConfirmed();
    };
  }, []);

  const handleRequestAutoRevert = (tweakName: string, onRevert: () => Promise<void>) => {
    setRevertModal({
      isOpen: true,
      tweakName,
      countdown: 20,
      onRevert,
    });
  };

  const handleKeepChanges = async () => {
    if (window.electronAPI?.confirmNetworkChanges) {
      await window.electronAPI.confirmNetworkChanges();
    }
    setRevertModal((prev) => ({ ...prev, isOpen: false }));
    showBanner(`Changes to "${revertModal.tweakName}" kept successfully.`, 'success');
  };

  const handleAutoRevertTrigger = async () => {
    setRevertModal((prev) => ({ ...prev, isOpen: false }));
    showBanner(`Time expired or reverted: "${revertModal.tweakName}" restored to previous configuration.`, 'warning');
    try {
      if (window.electronAPI?.undoAllNetwork) {
        await window.electronAPI.undoAllNetwork(activeAdapter?.name);
      } else if (revertModal.onRevert) {
        await revertModal.onRevert();
      }
      await loadOverview();
    } catch (err: any) {
      showBanner(`Revert error: ${err.message}`, 'error');
    }
  };

  const handleUndoAll = async () => {
    if (!window.electronAPI?.undoAllNetwork) return;
    try {
      const res = await window.electronAPI.undoAllNetwork(activeAdapter?.name);
      if (res.success) {
        showBanner(res.message, 'success');
      } else {
        showBanner(res.error || res.message, 'error');
      }
      await loadOverview();
    } catch (err: any) {
      showBanner(`Undo all failed: ${err.message}`, 'error');
    }
  };

  const handleResetDefaults = async () => {
    if (!window.electronAPI?.resetAllNetworkDefaults) return;
    try {
      const res = await window.electronAPI.resetAllNetworkDefaults(activeAdapter?.name);
      if (res.success) {
        showBanner(res.message, 'success');
      } else {
        showBanner(res.error || res.message, 'error');
      }
      await loadOverview();
    } catch (err: any) {
      showBanner(err.message || 'Reset failed', 'error');
    }
  };

  const handleNetworkRecovery = async () => {
    if (!window.electronAPI?.openNetworkRecoveryFolder) return;
    try {
      const res = await window.electronAPI.openNetworkRecoveryFolder();
      if (res.success) {
        showBanner(`Network Recovery scripts ready in: ${res.path}`, 'success');
      } else {
        showBanner(res.error || 'Failed to open recovery folder', 'error');
      }
    } catch (err: any) {
      showBanner(err?.message || 'Recovery failed', 'error');
    }
  };

  const activeAdapter =
    overview?.adapters.find((a) => a.id === selectedAdapterId) ||
    overview?.activeAdapter ||
    null;

  if (isLoading) {
    return (
      <PageLoadingState
        title={isRtl ? 'در حال بارگذاری شبکه و اینترنت...' : 'Loading Network Optimizer...'}
        subtitle={
          isRtl
            ? 'در حال پایش کارت‌های شبکه، تنظیمات DNS و تاخیر پکت‌ها...'
            : 'Inspecting network adapters, DNS configuration, and active links...'
        }
        icon={Wifi}
        variant="network"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 text-foreground">
      {/* 20-Second Auto-Revert Safety Modal */}
      {revertModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-card border border-amber-500/50 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 text-card-foreground">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500">
                <Timer className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isRtl ? 'در حال آزمون تغییر شبکه' : 'Testing Network Change'}
                  </h3>
                  <span className="text-xl font-mono font-bold text-amber-500">
                    {revertModal.countdown}s
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied <span className="font-semibold text-foreground font-mono">"{revertModal.tweakName}"</span>. Confirm that your network and internet connection are functioning properly.
                </p>
              </div>
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(revertModal.countdown / 20) * 100}%` }}
              />
            </div>

            <div className="p-3 rounded-md bg-muted/40 border border-border text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Safety Guard:</span> If not confirmed, settings will automatically revert in <strong className="text-amber-500 font-mono">{revertModal.countdown}</strong> seconds to prevent loss of connectivity.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAutoRevertTrigger}
                className="flex-1 py-2 px-3.5 rounded-md text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isRtl ? 'بازگردانی آنی' : 'Revert Now'}
              </button>
              <button
                type="button"
                onClick={handleKeepChanges}
                className="flex-1 py-2 px-3.5 rounded-md text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {isRtl ? 'تأیید و ذخیره' : 'Keep Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Notifications */}
      {bannerMessage && (
        <div
          className={`p-3 rounded-md border text-xs font-medium flex items-center justify-between ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : bannerMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            aria-label="Dismiss banner message"
            className="text-muted-foreground hover:text-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Top Bar: Adapter Summary & Recovery */}
      <NetworkTopBar
        adapters={overview?.adapters || []}
        selectedAdapterId={selectedAdapterId}
        onSelectAdapter={setSelectedAdapterId}
        onUndoAll={handleUndoAll}
        onResetDefaults={handleResetDefaults}
        onNetworkRecovery={handleNetworkRecovery}
        hasReversibleChanges={overview?.hasReversibleChanges || false}
        isRdpActive={overview?.isRdpActive || false}
      />

      {/* Sub-Navigation Tabs Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-1.5 rounded-xl glass-panel">
        <div className="flex items-center gap-1 overflow-x-auto p-0.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('latency')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeSubTab === 'latency'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{isRtl ? 'تاخیر و پکت لاس' : 'Latency & Jitter'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('dns')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeSubTab === 'dns'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isRtl ? 'مدیریت DNS' : 'DNS Manager'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('adapter')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeSubTab === 'adapter'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isRtl ? 'بهینه‌سازی آداپتور' : 'Adapter Tweaks'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('repair')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeSubTab === 'repair'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{isRtl ? 'ابزارهای تعمیر و ایمنی' : 'Repair & Safety Tools'}</span>
          </button>
        </div>

        {/* Action Button: Hosts File Inspector */}
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => setIsHostsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>{isRtl ? 'فایل Hosts' : 'Hosts File Inspector'}</span>
          </button>
        </div>
      </div>

      {/* Tab Content Display */}
      {activeSubTab === 'latency' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <NetworkTestSection
            adapter={activeAdapter}
            onNotify={showBanner}
            onRevertTweak={handleUndoAll}
          />
        </div>
      )}

      {activeSubTab === 'dns' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <DnsManagerSection
            adapter={activeAdapter}
            onNotify={showBanner}
            onRequestAutoRevert={handleRequestAutoRevert}
          />
        </div>
      )}

      {activeSubTab === 'adapter' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <AdapterTweaksSection
            adapter={activeAdapter}
            onNotify={showBanner}
            onRequestAutoRevert={handleRequestAutoRevert}
          />
          <WifiInspectorSection onNotify={showBanner} />
          <AdvancedTweaksSection
            adapter={activeAdapter}
            onNotify={showBanner}
            onRequestAutoRevert={handleRequestAutoRevert}
          />
          <ExperimentalTweaksSection
            adapter={activeAdapter}
            onNotify={showBanner}
          />
        </div>
      )}

      {activeSubTab === 'repair' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <NetworkRepairSection adapter={activeAdapter} onNotify={showBanner} />
        </div>
      )}

      {/* Hosts File Viewer Modal */}
      <HostsViewerModal
        isOpen={isHostsModalOpen}
        onClose={() => setIsHostsModalOpen(false)}
        onNotify={showBanner}
      />
    </div>
  );
};
