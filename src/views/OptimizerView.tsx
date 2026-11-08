/**
 * PC Tweak - Native System Optimizer View
 * 
 * Provides verifiable, non-placebo performance optimization across 5 key pillars:
 * 1. RAM: Win32 Working Set trimming and process memory inspector
 * 2. Disk: Safe junk cleaner (>24h temp, skipped locked files) and native SSD TRIM
 * 3. Services: Obsolete telemetry disablement, orphan service key cleanup, critical protection
 * 4. Scheduled Tasks: Aggressive telemetry task disablement, orphaned task cleaner
 * 5. CPU: Windows Ultimate Performance power scheme activation and process priority control
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  HardDrive,
  Cpu,
  Server,
  Calendar,
  Layers,
  RefreshCw,
  Trash2,
  Play,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Flame,
  ArrowDownUp,
  XCircle,
  HelpCircle,
  Sliders,
  Check,
  Bot,
  Sparkles,
  Clock,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import {
  ProcessMemoryInfo,
  DiskJunkCategory,
  DriveStatusInfo,
  WindowsServiceItem,
  ScheduledTaskItem,
  CpuPowerPlan,
  ProcessCpuInfo,
  AutomationConfig,
  AutomationLogEntry,
} from '@/types/electron';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Switch } from '@/components/common/Switch';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import { AiAutoOptimizerSection } from '@/features/optimizer/components/AiAutoOptimizerSection';

type OptimizerSubTab = 'ai' | 'ram' | 'disk' | 'services' | 'tasks' | 'cpu' | 'automation';

export const OptimizerView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { metrics, systemInfo } = useUIStore();

  const [activeSubTab, setActiveSubTab] = useState<OptimizerSubTab>('ai');
  const [isLoading, setIsLoading] = useState(true);

  // Status banners & feedback
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
  } | null>(null);

  // System Restore Point State
  const [isCreatingRestorePoint, setIsCreatingRestorePoint] = useState(false);

  // --- RAM Tab State ---
  const [ramProcesses, setRamProcesses] = useState<ProcessMemoryInfo[]>([]);
  const [ramSearch, setRamSearch] = useState('');
  const [isTrimmingRam, setIsTrimmingRam] = useState(false);
  const [selectedProcessToKill, setSelectedProcessToKill] = useState<ProcessMemoryInfo | null>(null);

  // --- Disk Tab State ---
  const [diskCategories, setDiskCategories] = useState<DiskJunkCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [driveStatus, setDriveStatus] = useState<DriveStatusInfo | null>(null);
  const [isScanningDisk, setIsScanningDisk] = useState(false);
  const [isCleaningDisk, setIsCleaningDisk] = useState(false);
  const [isOptimizingDrive, setIsOptimizingDrive] = useState(false);

  // --- Services Tab State ---
  const [services, setServices] = useState<WindowsServiceItem[]>([]);
  const [serviceFilter, setServiceFilter] = useState<'all' | 'orphan' | 'telemetry' | 'running'>('all');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceActionLoading, setServiceActionLoading] = useState<Record<string, boolean>>({});
  const [isAutoOptimizingServices, setIsAutoOptimizingServices] = useState(false);
  const [selectedOrphanServiceToDelete, setSelectedOrphanServiceToDelete] = useState<WindowsServiceItem | null>(null);

  // --- Tasks Tab State ---
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([]);
  const [taskFilter, setTaskFilter] = useState<'all' | 'orphan' | 'telemetry' | 'updater'>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskActionLoading, setTaskActionLoading] = useState<Record<string, boolean>>({});
  const [selectedOrphanTaskToDelete, setSelectedOrphanTaskToDelete] = useState<ScheduledTaskItem | null>(null);

  // --- CPU Tab State ---
  const [powerPlans, setPowerPlans] = useState<CpuPowerPlan[]>([]);
  const [cpuHogs, setCpuHogs] = useState<ProcessCpuInfo[]>([]);
  const [isUnlockingUltimate, setIsUnlockingUltimate] = useState(false);
  const [cpuActionLoading, setCpuActionLoading] = useState<Record<string, boolean>>({});

  // --- Automation Tab State ---
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig | null>(null);
  const [automationLogs, setAutomationLogs] = useState<AutomationLogEntry[]>([]);
  const [isUpdatingAutomation, setIsUpdatingAutomation] = useState(false);

  /**
   * Helper: Format bytes into human-readable representation
   */
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  /**
   * Initial data loader
   */
  const loadSubTabData = useCallback(
    async (tab: OptimizerSubTab, showSpinner = true) => {
      if (tab === 'ai') {
        setIsLoading(false);
        return;
      }
      if (showSpinner) setIsLoading(true);
      try {
        if (tab === 'ram') {
          const procs = await window.electronAPI?.optimizerGetRamProcesses?.(30);
          if (procs) setRamProcesses(procs);
        } else if (tab === 'disk') {
          const [cats, drive] = await Promise.all([
            window.electronAPI?.optimizerScanDisk?.(),
            window.electronAPI?.optimizerGetDriveStatus?.('C'),
          ]);
          if (cats) {
            setDiskCategories(cats);
            setSelectedCategoryIds(new Set(cats.filter((c) => c.defaultSelected).map((c) => c.id)));
          }
          if (drive) setDriveStatus(drive);
        } else if (tab === 'services') {
          const sList = await window.electronAPI?.optimizerScanServices?.();
          if (sList) setServices(sList);
        } else if (tab === 'tasks') {
          const tList = await window.electronAPI?.optimizerScanTasks?.();
          if (tList) setTasks(tList);
        } else if (tab === 'cpu') {
          const [plans, hogs] = await Promise.all([
            window.electronAPI?.optimizerGetPowerPlans?.(),
            window.electronAPI?.optimizerGetCpuProcesses?.(25),
          ]);
          if (plans) setPowerPlans(plans);
          if (hogs) setCpuHogs(hogs);
        } else if (tab === 'automation') {
          const [cfg, logs] = await Promise.all([
            window.electronAPI?.getAutomationConfig?.(),
            window.electronAPI?.getAutomationLogs?.(50),
          ]);
          if (cfg) setAutomationConfig(cfg);
          if (logs) setAutomationLogs(logs);
        }
      } catch (err) {
        console.error('Failed to load subtab data:', err);
      } finally {
        if (showSpinner) setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSubTabData(activeSubTab, true);
  }, [activeSubTab, loadSubTabData]);

  // Handle System Restore Point creation
  const handleCreateRestorePoint = async () => {
    if (isCreatingRestorePoint) return;
    setIsCreatingRestorePoint(true);
    try {
      const res = await window.electronAPI?.createRestorePoint?.('PC Tweak: Pre-Optimization Snapshot');
      if (res?.success) {
        setStatusBanner({
          type: 'success',
          text: res.message || 'System Restore Point created successfully.',
        });
      } else {
        setStatusBanner({
          type: 'warning',
          text: res?.message || 'Could not create System Restore Point (System Protection might be disabled).',
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Failed to create System Restore Point.',
      });
    } finally {
      setIsCreatingRestorePoint(false);
    }
  };

  // --- RAM Tab Actions ---
  const handleTrimRam = async () => {
    setIsTrimmingRam(true);
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerTrimRam?.();
      if (res?.success) {
        if (res.freedMb > 0) {
          setStatusBanner({
            type: 'success',
            text: t('optimizer.ram.freedSuccess', { freedMb: res.freedMb }),
          });
        } else {
          setStatusBanner({
            type: 'info',
            text: t('optimizer.ram.freedZero'),
          });
        }
        await loadSubTabData('ram', false);
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to trim working sets.' });
    } finally {
      setIsTrimmingRam(false);
    }
  };

  const handleEndProcess = async () => {
    if (!selectedProcessToKill) return;
    const pid = selectedProcessToKill.pid;
    try {
      const res = await window.electronAPI?.optimizerEndProcess?.(pid);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        await loadSubTabData('ram', false);
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Could not terminate process.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error terminating process.' });
    } finally {
      setSelectedProcessToKill(null);
    }
  };

  const filteredRamProcesses = useMemo(() => {
    if (!ramSearch.trim()) return ramProcesses;
    const q = ramSearch.toLowerCase().trim();
    return ramProcesses.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q));
  }, [ramProcesses, ramSearch]);

  // --- Disk Tab Actions ---
  const handleScanDisk = async () => {
    setIsScanningDisk(true);
    setStatusBanner(null);
    try {
      const cats = await window.electronAPI?.optimizerScanDisk?.();
      if (cats) setDiskCategories(cats);
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to scan disk.' });
    } finally {
      setIsScanningDisk(false);
    }
  };

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const totalSelectedDiskSize = useMemo(() => {
    return diskCategories
      .filter((c) => selectedCategoryIds.has(c.id))
      .reduce((acc, c) => acc + c.sizeBytes, 0);
  }, [diskCategories, selectedCategoryIds]);

  const handleCleanDisk = async () => {
    if (selectedCategoryIds.size === 0) return;
    setIsCleaningDisk(true);
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerCleanDisk?.(Array.from(selectedCategoryIds));
      if (res?.success) {
        setStatusBanner({
          type: 'success',
          text: t('optimizer.disk.cleanSuccess', {
            count: res.filesDeleted,
            size: formatBytes(res.reclaimedBytes),
          }),
        });
        await handleScanDisk();
        const drive = await window.electronAPI?.optimizerGetDriveStatus?.('C');
        if (drive) setDriveStatus(drive);
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to clean disk clutter.' });
    } finally {
      setIsCleaningDisk(false);
    }
  };

  const handleOptimizeDrive = async () => {
    setIsOptimizingDrive(true);
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerOptimizeDrive?.('C');
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to optimize drive.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Drive optimization encountered an error.' });
    } finally {
      setIsOptimizingDrive(false);
    }
  };

  // --- Services Tab Actions ---
  const handleSetServiceStartup = async (serviceName: string, startup: 'Automatic' | 'Manual' | 'Disabled') => {
    setServiceActionLoading((prev) => ({ ...prev, [serviceName]: true }));
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerSetServiceStartup?.(serviceName, startup);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        setServices((prev) =>
          prev.map((s) => (s.name === serviceName ? { ...s, startupType: startup } : s))
        );
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to change service startup type.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error updating service.' });
    } finally {
      setServiceActionLoading((prev) => ({ ...prev, [serviceName]: false }));
    }
  };

  const handleDeleteOrphanService = async () => {
    if (!selectedOrphanServiceToDelete) return;
    const name = selectedOrphanServiceToDelete.name;
    try {
      const res = await window.electronAPI?.optimizerDeleteOrphanedService?.(name);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        setServices((prev) => prev.filter((s) => s.name !== name));
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to delete orphaned service entry.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error deleting service.' });
    } finally {
      setSelectedOrphanServiceToDelete(null);
    }
  };

  const handleAutoOptimizeServices = async () => {
    setIsAutoOptimizingServices(true);
    setStatusBanner(null);
    const safeCandidates = services.filter((s) => s.category === 'telemetry' && s.startupType !== 'Disabled');
    let count = 0;
    try {
      for (const cand of safeCandidates) {
        const res = await window.electronAPI?.optimizerSetServiceStartup?.(cand.name, 'Disabled');
        if (res?.success) count++;
      }
      setStatusBanner({
        type: 'success',
        text: `${t('optimizer.services.autoOptimizeDone')} (${count} services disabled).`,
      });
      await loadSubTabData('services', false);
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to batch optimize services.' });
    } finally {
      setIsAutoOptimizingServices(false);
    }
  };

  const filteredServices = useMemo(() => {
    let list = services;
    if (serviceFilter === 'orphan') list = list.filter((s) => s.isOrphaned);
    else if (serviceFilter === 'telemetry') list = list.filter((s) => s.category === 'telemetry' || s.category === 'bloat');
    else if (serviceFilter === 'running') list = list.filter((s) => s.status === 'Running');

    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.displayName.toLowerCase().includes(q) ||
          s.imagePath.toLowerCase().includes(q)
      );
    }
    return list;
  }, [services, serviceFilter, serviceSearch]);

  // --- Tasks Tab Actions ---
  const handleToggleTaskState = async (task: ScheduledTaskItem) => {
    const nextState = task.state === 'Disabled';
    const key = task.fullPath;
    setTaskActionLoading((prev) => ({ ...prev, [key]: true }));
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerSetTaskState?.(task.taskPath, task.taskName, nextState);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        setTasks((prev) =>
          prev.map((t) => (t.fullPath === key ? { ...t, state: nextState ? 'Ready' : 'Disabled' } : t))
        );
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to toggle task state.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error updating task.' });
    } finally {
      setTaskActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteOrphanTask = async () => {
    if (!selectedOrphanTaskToDelete) return;
    const { taskPath, taskName, fullPath } = selectedOrphanTaskToDelete;
    try {
      const res = await window.electronAPI?.optimizerDeleteOrphanedTask?.(taskPath, taskName);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        setTasks((prev) => prev.filter((t) => t.fullPath !== fullPath));
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to delete task.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error deleting task.' });
    } finally {
      setSelectedOrphanTaskToDelete(null);
    }
  };

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (taskFilter === 'orphan') list = list.filter((t) => t.isOrphaned);
    else if (taskFilter === 'telemetry') list = list.filter((t) => t.category === 'telemetry');
    else if (taskFilter === 'updater') list = list.filter((t) => t.category === 'updater');

    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.taskName.toLowerCase().includes(q) ||
          t.taskPath.toLowerCase().includes(q) ||
          t.actionExecutable.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, taskFilter, taskSearch]);

  // --- CPU Tab Actions ---
  const handleSetActivePowerPlan = async (guid: string) => {
    setCpuActionLoading((prev) => ({ ...prev, [guid]: true }));
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerSetActivePowerPlan?.(guid);
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        setPowerPlans((prev) => prev.map((p) => ({ ...p, isActive: p.guid === guid })));
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to set power plan.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error activating power plan.' });
    } finally {
      setCpuActionLoading((prev) => ({ ...prev, [guid]: false }));
    }
  };

  const handleUnlockUltimatePower = async () => {
    setIsUnlockingUltimate(true);
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.optimizerUnlockUltimatePower?.();
      if (res?.success) {
        setStatusBanner({ type: 'success', text: res.message });
        await loadSubTabData('cpu', false);
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to unlock Ultimate Performance.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error unlocking Ultimate scheme.' });
    } finally {
      setIsUnlockingUltimate(false);
    }
  };

  const handleSetPriority = async (
    pid: number,
    priority: 'Idle' | 'BelowNormal' | 'Normal' | 'AboveNormal' | 'High'
  ) => {
    setCpuActionLoading((prev) => ({ ...prev, [`proc_${pid}`]: true }));
    try {
      const res = await window.electronAPI?.optimizerSetProcessPriority?.(pid, priority);
      if (res?.success) {
        setStatusBanner({
          type: 'success',
          text: t('optimizer.cpu.priorityUpdated', { pid, priority }),
        });
        setCpuHogs((prev) => prev.map((p) => (p.pid === pid ? { ...p, priorityClass: priority } : p)));
      } else {
        setStatusBanner({ type: 'error', text: res?.message || 'Failed to update priority.' });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error updating process priority.' });
    } finally {
      setCpuActionLoading((prev) => ({ ...prev, [`proc_${pid}`]: false }));
    }
  };

  const isUltimateUnlocked = useMemo(() => {
    return powerPlans.some((p) => p.isUltimate);
  }, [powerPlans]);

  // --- Automation Tab Actions ---
  const handleToggleMasterAutomation = async (enabled: boolean) => {
    setIsUpdatingAutomation(true);
    setStatusBanner(null);
    try {
      const res = await window.electronAPI?.updateAutomationConfig?.({ masterEnabled: enabled });
      if (res?.success) {
        setAutomationConfig(res.config);
        setStatusBanner({
          type: 'success',
          text: enabled
            ? t('optimizer.automation.activeStatus')
            : t('optimizer.automation.pausedStatus'),
        });
      }
    } finally {
      setIsUpdatingAutomation(false);
    }
  };

  const handleUpdateConfig = async (partial: Partial<AutomationConfig>) => {
    setIsUpdatingAutomation(true);
    try {
      const res = await window.electronAPI?.updateAutomationConfig?.(partial);
      if (res?.success) {
        setAutomationConfig(res.config);
      }
    } finally {
      setIsUpdatingAutomation(false);
    }
  };

  const handleClearAutomationLogs = async () => {
    try {
      const res = await window.electronAPI?.clearAutomationLogs?.();
      if (res?.success) {
        setAutomationLogs([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in select-none">
      {/* View Header with Telemetry Overview Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card/70 border border-white/10 backdrop-blur-xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <Zap className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {t('optimizer.title')}
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                PRO ENGINE
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.subtitle')}</p>
          </div>
        </div>

        {/* Live Gauges & System Snapshot Action */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-muted-foreground">{t('optimizer.header.cpuUsage')}:</span>
            <span className="font-mono font-bold text-foreground">{metrics.cpuUsage}%</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-muted-foreground">{t('optimizer.header.ramUsage')}:</span>
            <span className="font-mono font-bold text-foreground">{metrics.memoryPercentage}%</span>
          </div>

          {driveStatus && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground">C:</span>
              <span className="font-mono font-bold text-foreground">
                {formatBytes(driveStatus.freeBytes)} {t('optimizer.disk.freeSpace')}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreateRestorePoint}
            disabled={isCreatingRestorePoint}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-semibold shadow-sm transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isCreatingRestorePoint ? 'animate-spin' : ''}`} />
            <span>
              {isCreatingRestorePoint
                ? t('optimizer.header.creatingRestorePoint')
                : t('optimizer.header.restorePoint')}
            </span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {statusBanner && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs font-medium border backdrop-blur-md transition-all ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : statusBanner.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            {statusBanner.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
            {statusBanner.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
            {statusBanner.type === 'info' && <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-white/60 hover:text-white p-1 rounded"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-card/60 border border-white/10 backdrop-blur-md overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('ai')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'ai'
              ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/25 text-cyan-300 border border-cyan-400/80 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isRtl ? 'هوش مصنوعی' : 'AI Auto-Tune'}</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-400 text-slate-950">AI</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ram')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'ram'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.ram')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('disk')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'disk'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.disk')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('services')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'services'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.services')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'tasks'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.tasks')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('cpu')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'cpu'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.cpu')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('automation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
            activeSubTab === 'automation'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('optimizer.tabs.automation')}</span>
        </button>
      </div>

      {isLoading ? (
        <PageLoadingState
          title="Scanning Windows Subsystem..."
          subtitle="Querying memory, drive health, services, and scheduled tasks..."
          variant="cards"
        />
      ) : (
        <>
          {/* ==================== 0. AI AUTO-OPTIMIZER TAB ==================== */}
          {activeSubTab === 'ai' && (
            <AiAutoOptimizerSection
              onNotify={(text, type) => setStatusBanner({ text, type })}
              onTweakApplied={() => {
                loadSubTabData(activeSubTab, false);
              }}
            />
          )}

          {/* ==================== 1. RAM OPTIMIZER TAB ==================== */}
          {activeSubTab === 'ram' && (
            <div className="space-y-6">
              {/* RAM Top Control Card */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      {t('optimizer.ram.title')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.ram.description')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTrimRam}
                    disabled={isTrimmingRam}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTrimmingRam ? 'animate-spin' : ''}`} />
                    <span>{isTrimmingRam ? t('optimizer.ram.trimming') : t('optimizer.ram.trimButton')}</span>
                  </button>
                </div>

                {/* Progress & RAM Metrics Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[11px] text-muted-foreground">{t('optimizer.ram.totalRam')}</span>
                    <p className="text-lg font-mono font-bold text-foreground mt-1">{metrics.memoryTotalGb} GB</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[11px] text-muted-foreground">{t('optimizer.ram.usedRam')}</span>
                    <p className="text-lg font-mono font-bold text-emerald-400 mt-1">
                      {metrics.memoryUsedGb} GB ({metrics.memoryPercentage}%)
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[11px] text-muted-foreground">{t('optimizer.ram.freeRam')}</span>
                    <p className="text-lg font-mono font-bold text-cyan-400 mt-1">
                      {Math.max(0, parseFloat((metrics.memoryTotalGb - metrics.memoryUsedGb).toFixed(1)))} GB
                    </p>
                  </div>
                </div>

                <div className="w-full bg-white/5 rounded-full h-2 mt-4 overflow-hidden border border-white/10">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                    style={{ width: `${metrics.memoryPercentage}%` }}
                  />
                </div>
              </div>

              {/* Active Process RAM Table */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    {t('optimizer.ram.hogsTitle')}
                  </h3>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={ramSearch}
                      onChange={(e) => setRamSearch(e.target.value)}
                      placeholder={t('optimizer.ram.searchPlaceholder')}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-2.5 px-3">{t('optimizer.ram.colProcess')}</th>
                        <th className="py-2.5 px-3 font-mono">{t('optimizer.ram.colPid')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.ram.colWorkingSet')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.ram.colPrivate')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.ram.colStatus')}</th>
                        <th className="py-2.5 px-3 text-right">{t('optimizer.ram.colAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredRamProcesses.map((proc) => (
                        <tr key={proc.pid} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground">{proc.name}</td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">{proc.pid}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">
                            {proc.workingSetMb} MB
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {proc.privateBytesMb} MB
                          </td>
                          <td className="py-2.5 px-3">
                            {proc.isSystemCritical ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                <ShieldAlert className="w-3 h-3" />
                                {t('optimizer.ram.critical')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                <Check className="w-3 h-3" />
                                {t('optimizer.ram.userProcess')}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedProcessToKill(proc)}
                              disabled={proc.isSystemCritical}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {t('optimizer.ram.endProcess')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. DISK & STORAGE TAB ==================== */}
          {activeSubTab === 'disk' && (
            <div className="space-y-6">
              {/* Drive Health & TRIM Card */}
              {driveStatus && (
                <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground">
                          {t('optimizer.disk.driveHealth')} ({driveStatus.driveLetter}:)
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {driveStatus.mediaType} Drive • {formatBytes(driveStatus.freeBytes)} free of{' '}
                          {formatBytes(driveStatus.totalBytes)} ({driveStatus.percentUsed}% used)
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleOptimizeDrive}
                      disabled={isOptimizingDrive}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${isOptimizingDrive ? 'animate-spin' : ''}`} />
                      <span>{isOptimizingDrive ? t('optimizer.disk.trimming') : t('optimizer.disk.runTrim')}</span>
                    </button>
                  </div>

                  <div className="w-full bg-white/5 rounded-full h-2 mt-4 overflow-hidden border border-white/10">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-amber-500 h-2 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      style={{ width: `${driveStatus.percentUsed}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Cleanable Categories List */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-primary" />
                      {t('optimizer.disk.title')}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.disk.description')}</p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleScanDisk}
                      disabled={isScanningDisk}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-foreground transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isScanningDisk ? 'animate-spin' : ''}`} />
                      <span>{isScanningDisk ? t('optimizer.disk.scanning') : t('optimizer.disk.scanButton')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCleanDisk}
                      disabled={isCleaningDisk || selectedCategoryIds.size === 0}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-[0_0_12px_rgba(0,240,255,0.25)] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {isCleaningDisk
                          ? t('optimizer.disk.cleaning')
                          : t('optimizer.disk.cleanButton', { size: formatBytes(totalSelectedDiskSize) })}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-white/5 mt-2">
                  {diskCategories.map((cat) => {
                    const isChecked = selectedCategoryIds.has(cat.id);
                    return (
                      <div
                        key={cat.id}
                        onClick={() => handleToggleCategory(cat.id)}
                        className="flex items-center justify-between py-3.5 px-2 hover:bg-white/[0.02] rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                          />
                          <div>
                            <div className="text-xs font-bold text-foreground">{t(cat.nameKey)}</div>
                            <div className="text-[11px] text-muted-foreground">{t(cat.descriptionKey)}</div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-primary">
                            {formatBytes(cat.sizeBytes)}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {cat.fileCount} files
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 3. SERVICES OPTIMIZER TAB ==================== */}
          {activeSubTab === 'services' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Server className="w-4 h-4 text-primary" />
                      {t('optimizer.services.title')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.services.description')}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoOptimizeServices}
                    disabled={isAutoOptimizingServices}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-[0_0_12px_rgba(0,240,255,0.25)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isAutoOptimizingServices ? 'animate-spin' : ''}`} />
                    <span>
                      {isAutoOptimizingServices
                        ? t('optimizer.services.autoOptimizing')
                        : t('optimizer.services.autoOptimizeSafe')}
                    </span>
                  </button>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-white/[0.02] border border-white/5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setServiceFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        serviceFilter === 'all'
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.services.filterAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceFilter('orphan')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        serviceFilter === 'orphan'
                          ? 'bg-rose-500/20 text-rose-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.services.filterOrphaned')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceFilter('telemetry')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        serviceFilter === 'telemetry'
                          ? 'bg-amber-500/20 text-amber-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.services.filterTelemetry')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceFilter('running')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        serviceFilter === 'running'
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.services.filterRunning')}
                    </button>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      placeholder={t('optimizer.services.searchPlaceholder')}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Services Table */}
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-2.5 px-3">{t('optimizer.services.colName')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.services.colStatus')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.services.colStartup')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.services.colCategory')}</th>
                        <th className="py-2.5 px-3 text-right">{t('optimizer.services.colAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredServices.slice(0, 50).map((srv) => (
                        <tr key={srv.name} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{srv.displayName}</div>
                            <div className="font-mono text-[10px] text-muted-foreground truncate max-w-xs">
                              {srv.name}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                srv.status === 'Running'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-white/5 text-muted-foreground border border-white/10'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  srv.status === 'Running' ? 'bg-emerald-400' : 'bg-muted-foreground'
                                }`}
                              />
                              {srv.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {srv.isCritical ? (
                              <span className="font-mono text-muted-foreground text-[11px]">
                                {srv.startupType}
                              </span>
                            ) : (
                              <select
                                value={srv.startupType}
                                disabled={Boolean(serviceActionLoading[srv.name])}
                                onChange={(e) =>
                                  handleSetServiceStartup(
                                    srv.name,
                                    e.target.value as 'Automatic' | 'Manual' | 'Disabled'
                                  )
                                }
                                className="px-2 py-1 rounded bg-white/5 border border-white/10 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50"
                              >
                                <option value="Automatic" className="bg-neutral-900 text-white">
                                  Automatic
                                </option>
                                <option value="Manual" className="bg-neutral-900 text-white">
                                  Manual
                                </option>
                                <option value="Disabled" className="bg-neutral-900 text-white">
                                  Disabled
                                </option>
                              </select>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {srv.isCritical ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                <ShieldCheck className="w-3 h-3" />
                                Protected
                              </span>
                            ) : srv.isOrphaned ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                Orphan
                              </span>
                            ) : srv.category === 'telemetry' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Telemetry
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">{srv.category}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {srv.isOrphaned && (
                              <button
                                type="button"
                                onClick={() => setSelectedOrphanServiceToDelete(srv)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all cursor-pointer"
                              >
                                {t('optimizer.services.deleteOrphan')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 4. SCHEDULED TASKS TAB ==================== */}
          {activeSubTab === 'tasks' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {t('optimizer.tasks.title')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.tasks.description')}</p>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-white/[0.02] border border-white/5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTaskFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        taskFilter === 'all'
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.tasks.filterAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('orphan')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        taskFilter === 'orphan'
                          ? 'bg-rose-500/20 text-rose-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.tasks.filterOrphaned')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('telemetry')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        taskFilter === 'telemetry'
                          ? 'bg-amber-500/20 text-amber-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.tasks.filterTelemetry')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('updater')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        taskFilter === 'updater'
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('optimizer.tasks.filterUpdaters')}
                    </button>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder={t('optimizer.tasks.searchPlaceholder')}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Tasks Table */}
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-2.5 px-3">{t('optimizer.tasks.colTask')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.tasks.colAction')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.tasks.colState')}</th>
                        <th className="py-2.5 px-3 text-right">{t('optimizer.tasks.colActionBtn')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredTasks.slice(0, 50).map((task) => (
                        <tr key={task.fullPath} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{task.taskName}</div>
                            <div className="font-mono text-[10px] text-muted-foreground truncate max-w-sm">
                              {task.taskPath}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {task.isOrphaned ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-rose-300">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {t('optimizer.tasks.missingBinary')}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-xs block">
                                {task.actionExecutable || 'Internal COM / Handler'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {task.isCritical ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                <ShieldCheck className="w-3 h-3" />
                                Protected
                              </span>
                            ) : (
                              <Switch
                                checked={task.state !== 'Disabled'}
                                disabled={Boolean(taskActionLoading[task.fullPath])}
                                onChange={() => handleToggleTaskState(task)}
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {task.isOrphaned && (
                              <button
                                type="button"
                                onClick={() => setSelectedOrphanTaskToDelete(task)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all cursor-pointer"
                              >
                                {t('optimizer.tasks.deleteTask')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 5. CPU & POWER OPTIMIZER TAB ==================== */}
          {activeSubTab === 'cpu' && (
            <div className="space-y-6">
              {/* Power Plans Card */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      {t('optimizer.cpu.powerPlansTitle')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('optimizer.cpu.description')}</p>
                  </div>

                  {!isUltimateUnlocked && (
                    <button
                      type="button"
                      onClick={handleUnlockUltimatePower}
                      disabled={isUnlockingUltimate}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 ${isUnlockingUltimate ? 'animate-spin' : ''}`} />
                      <span>
                        {isUnlockingUltimate
                          ? t('optimizer.cpu.unlockingUltimate')
                          : t('optimizer.cpu.unlockUltimate')}
                      </span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 mt-4">
                  {powerPlans.map((plan) => (
                    <div
                      key={plan.guid}
                      className={`p-4 rounded-xl border transition-all ${
                        plan.isActive
                          ? 'bg-primary/10 border-primary/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">{plan.name}</span>
                        {plan.isActive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                            {t('optimizer.cpu.activeBadge')}
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-[10px] text-muted-foreground mt-2 truncate">
                        {plan.guid}
                      </div>

                      {!plan.isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActivePowerPlan(plan.guid)}
                          disabled={Boolean(cpuActionLoading[plan.guid])}
                          className="w-full mt-3 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                        >
                          {t('optimizer.cpu.activatePlan')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Real-Time CPU Hog Inspector Table */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    {t('optimizer.cpu.hogsTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => loadSubTabData('cpu', false)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-2.5 px-3">{t('optimizer.cpu.colProcess')}</th>
                        <th className="py-2.5 px-3 font-mono">{t('optimizer.cpu.colPid')}</th>
                        <th className="py-2.5 px-3">{t('optimizer.cpu.colCpu')}</th>
                        <th className="py-2.5 px-3 text-right">{t('optimizer.cpu.colPriority')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {cpuHogs.map((proc) => (
                        <tr key={proc.pid} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground">{proc.name}</td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">{proc.pid}</td>
                          <td className="py-2.5 px-3 font-mono text-cyan-400 font-semibold">
                            {proc.cpuSeconds}s
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {proc.isSystemCritical ? (
                              <span className="font-mono text-muted-foreground text-[11px]">
                                {proc.priorityClass}
                              </span>
                            ) : (
                              <select
                                value={proc.priorityClass}
                                disabled={Boolean(cpuActionLoading[`proc_${proc.pid}`])}
                                onChange={(e) =>
                                  handleSetPriority(
                                    proc.pid,
                                    e.target.value as 'Idle' | 'BelowNormal' | 'Normal' | 'AboveNormal' | 'High'
                                  )
                                }
                                className="px-2 py-1 rounded bg-white/5 border border-white/10 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50"
                              >
                                <option value="High" className="bg-neutral-900 text-white">
                                  High
                                </option>
                                <option value="AboveNormal" className="bg-neutral-900 text-white">
                                  Above Normal
                                </option>
                                <option value="Normal" className="bg-neutral-900 text-white">
                                  Normal
                                </option>
                                <option value="BelowNormal" className="bg-neutral-900 text-white">
                                  Below Normal
                                </option>
                                <option value="Idle" className="bg-neutral-900 text-white">
                                  Idle
                                </option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 6. AUTOMATION & RULES TAB ==================== */}
          {activeSubTab === 'automation' && (
            <div className="space-y-6">
              {/* Master Automation Switch Card */}
              <div
                className={`p-6 rounded-2xl border backdrop-blur-xl transition-all duration-200 ${
                  automationConfig?.masterEnabled
                    ? 'bg-primary/10 border-primary/40 shadow-[0_0_25px_rgba(0,240,255,0.12)]'
                    : 'bg-card/60 border-white/10'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        automationConfig?.masterEnabled
                          ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                          : 'bg-white/5 text-muted-foreground border border-white/10'
                      }`}
                    >
                      <Bot className={`w-6 h-6 ${automationConfig?.masterEnabled ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-base font-bold text-foreground">
                          {t('optimizer.automation.masterToggle')}
                        </h2>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            automationConfig?.masterEnabled
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-white/5 border-white/10 text-muted-foreground'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              automationConfig?.masterEnabled ? 'bg-emerald-400 animate-ping' : 'bg-muted-foreground'
                            }`}
                          />
                          {automationConfig?.masterEnabled
                            ? t('optimizer.automation.activeStatus')
                            : t('optimizer.automation.pausedStatus')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                        {t('optimizer.automation.masterToggleDesc')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center">
                    <Switch
                      checked={Boolean(automationConfig?.masterEnabled)}
                      onChange={handleToggleMasterAutomation}
                      disabled={isUpdatingAutomation}
                      size="md"
                      ariaLabel={t('optimizer.automation.masterToggle')}
                    />
                  </div>
                </div>

                {/* Sub-toggle: Desktop Notifications */}
                <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Display desktop notification when an autonomous optimization finishes
                  </span>
                  <Switch
                    checked={Boolean(automationConfig?.notifyOnAutoAction)}
                    onChange={(checked) => handleUpdateConfig({ notifyOnAutoAction: checked })}
                    disabled={isUpdatingAutomation || !automationConfig?.masterEnabled}
                    size="sm"
                    ariaLabel="Desktop Notifications"
                  />
                </div>
              </div>

              {/* Automation Rules Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. Auto RAM Trimming Card */}
                <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {t('optimizer.automation.ramRuleTitle')}
                          </h3>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {t('optimizer.automation.cooldown')}: 15 min
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={Boolean(automationConfig?.autoTrimRam?.enabled)}
                        onChange={(checked) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoTrimRam: { ...automationConfig.autoTrimRam, enabled: checked },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled}
                        size="sm"
                        ariaLabel={t('optimizer.automation.ramRuleTitle')}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      {t('optimizer.automation.ramRuleDesc')}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('optimizer.automation.threshold')}:</span>
                      <select
                        value={automationConfig?.autoTrimRam?.thresholdPercent ?? 80}
                        onChange={(e) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoTrimRam: {
                              ...automationConfig.autoTrimRam,
                              thresholdPercent: Number(e.target.value),
                            },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled || !automationConfig?.autoTrimRam?.enabled}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-foreground font-mono focus:border-primary/50 focus:outline-none disabled:opacity-50"
                      >
                        <option value="70">70% ({((metrics.memoryTotalGb * 0.70)).toFixed(1)} GB)</option>
                        <option value="75">75% ({((metrics.memoryTotalGb * 0.75)).toFixed(1)} GB)</option>
                        <option value="80">80% ({((metrics.memoryTotalGb * 0.80)).toFixed(1)} GB)</option>
                        <option value="85">85% ({((metrics.memoryTotalGb * 0.85)).toFixed(1)} GB)</option>
                        <option value="90">90% ({((metrics.memoryTotalGb * 0.90)).toFixed(1)} GB)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">{t('optimizer.automation.trimOnGameExit')}</span>
                      <Switch
                        checked={Boolean(automationConfig?.autoTrimRam?.trimOnGameExit)}
                        onChange={(checked) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoTrimRam: { ...automationConfig.autoTrimRam, trimOnGameExit: checked },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled || !automationConfig?.autoTrimRam?.enabled}
                        size="sm"
                        ariaLabel={t('optimizer.automation.trimOnGameExit')}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Auto Storage Junk Cleaner Card */}
                <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <Trash2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {t('optimizer.automation.diskRuleTitle')}
                          </h3>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Safe Temp &gt;24h only
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={Boolean(automationConfig?.autoCleanDisk?.enabled)}
                        onChange={(checked) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoCleanDisk: { ...automationConfig.autoCleanDisk, enabled: checked },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled}
                        size="sm"
                        ariaLabel={t('optimizer.automation.diskRuleTitle')}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      {t('optimizer.automation.diskRuleDesc')} Pauses automatically when games are active.
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('optimizer.automation.thresholdMb')}:</span>
                      <select
                        value={automationConfig?.autoCleanDisk?.thresholdMb ?? 2048}
                        onChange={(e) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoCleanDisk: {
                              ...automationConfig.autoCleanDisk,
                              thresholdMb: Number(e.target.value),
                            },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled || !automationConfig?.autoCleanDisk?.enabled}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-foreground font-mono focus:border-primary/50 focus:outline-none disabled:opacity-50"
                      >
                        <option value="1024">1,024 MB (1.0 GB)</option>
                        <option value="2048">2,048 MB (2.0 GB)</option>
                        <option value="5120">5,120 MB (5.0 GB)</option>
                        <option value="10240">10,240 MB (10 GB)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">{t('optimizer.automation.cleanSchedule')}:</span>
                      <select
                        value={automationConfig?.autoCleanDisk?.frequency ?? 'threshold_only'}
                        onChange={(e) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoCleanDisk: {
                              ...automationConfig.autoCleanDisk,
                              frequency: e.target.value as any,
                            },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled || !automationConfig?.autoCleanDisk?.enabled}
                        className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-foreground font-mono focus:border-primary/50 focus:outline-none disabled:opacity-50"
                      >
                        <option value="threshold_only">{t('optimizer.automation.cadenceThreshold')}</option>
                        <option value="daily">{t('optimizer.automation.cadenceDaily')}</option>
                        <option value="weekly">{t('optimizer.automation.cadenceWeekly')}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. Scheduled SSD TRIM Card */}
                <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <HardDrive className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {t('optimizer.automation.ssdRuleTitle')}
                          </h3>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Cadence: Weekly (7 days)
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={Boolean(automationConfig?.autoTrimSsd?.enabled)}
                        onChange={(checked) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoTrimSsd: { ...automationConfig.autoTrimSsd, enabled: checked },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled}
                        size="sm"
                        ariaLabel={t('optimizer.automation.ssdRuleTitle')}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      {t('optimizer.automation.ssdRuleDesc')}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last Optimization:</span>
                    <span className="font-mono text-muted-foreground">
                      {automationConfig?.autoTrimSsd?.lastRunTimestamp
                        ? new Date(automationConfig.autoTrimSsd.lastRunTimestamp).toLocaleDateString()
                        : 'Scheduled soon'}
                    </span>
                  </div>
                </div>

                {/* 4. Telemetry Sentinel Card */}
                <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {t('optimizer.automation.sentinelTitle')}
                          </h3>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            DiagTrack &amp; dmwappushservice
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={Boolean(automationConfig?.autoTelemetrySentinel?.enabled)}
                        onChange={(checked) =>
                          automationConfig &&
                          handleUpdateConfig({
                            autoTelemetrySentinel: {
                              ...automationConfig.autoTelemetrySentinel,
                              enabled: checked,
                            },
                          })
                        }
                        disabled={isUpdatingAutomation || !automationConfig?.masterEnabled}
                        size="sm"
                        ariaLabel={t('optimizer.automation.sentinelTitle')}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      {t('optimizer.automation.sentinelDesc')} Automatically silences telemetry services if re-enabled by cumulative Windows updates.
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Auto-Disable on Detection:</span>
                    <span className="font-semibold text-emerald-400">Active</span>
                  </div>
                </div>
              </div>

              {/* Automation Activity Log (Audit Trail) */}
              <div className="p-5 rounded-2xl bg-card/60 border border-white/10 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">
                      {t('optimizer.automation.historyTitle')}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                      {automationLogs.length} events
                    </span>
                  </div>
                  {automationLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAutomationLogs}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 border border-transparent transition-all cursor-pointer"
                    >
                      {t('optimizer.automation.clearLogs')}
                    </button>
                  )}
                </div>

                {automationLogs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <Bot className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p>{t('optimizer.automation.noLogs')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-muted-foreground font-semibold text-[11px]">
                          <th className="py-2.5 px-3">{t('optimizer.automation.colTimestamp')}</th>
                          <th className="py-2.5 px-3">{t('optimizer.automation.colType')}</th>
                          <th className="py-2.5 px-3">{t('optimizer.automation.colDetail')}</th>
                          <th className="py-2.5 px-3">{t('optimizer.automation.colReclaimed')}</th>
                          <th className="py-2.5 px-3 text-right">{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {automationLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  log.type === 'ram_trim'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : log.type === 'disk_clean'
                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                    : log.type === 'ssd_trim'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                }`}
                              >
                                {log.title}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-foreground max-w-md truncate">
                              {log.detail}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-cyan-400 whitespace-nowrap">
                              {log.reclaimedBytes ? formatBytes(log.reclaimedBytes) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                                <Check className="w-3.5 h-3.5" />
                                {t('common.success')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={Boolean(selectedProcessToKill)}
        title={t('optimizer.ram.confirmEndTitle')}
        message={
          selectedProcessToKill
            ? t('optimizer.ram.confirmEndMessage', {
                name: selectedProcessToKill.name,
                pid: selectedProcessToKill.pid,
              })
            : ''
        }
        confirmLabel={t('optimizer.ram.endProcess')}
        isDestructive={true}
        onConfirm={handleEndProcess}
        onCancel={() => setSelectedProcessToKill(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(selectedOrphanServiceToDelete)}
        title={t('optimizer.services.deleteOrphan')}
        message={
          selectedOrphanServiceToDelete
            ? t('optimizer.services.confirmDeleteOrphan', {
                name: selectedOrphanServiceToDelete.displayName,
              })
            : ''
        }
        confirmLabel={t('optimizer.services.deleteOrphan')}
        isDestructive={true}
        onConfirm={handleDeleteOrphanService}
        onCancel={() => setSelectedOrphanServiceToDelete(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(selectedOrphanTaskToDelete)}
        title={t('optimizer.tasks.deleteTask')}
        message={
          selectedOrphanTaskToDelete
            ? t('optimizer.tasks.confirmDeleteTask', {
                name: selectedOrphanTaskToDelete.taskName,
              })
            : ''
        }
        confirmLabel={t('optimizer.tasks.deleteTask')}
        isDestructive={true}
        onConfirm={handleDeleteOrphanTask}
        onCancel={() => setSelectedOrphanTaskToDelete(null)}
      />
    </div>
  );
};

export default OptimizerView;
