import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SlidersHorizontal,
  Trophy,
  Radio,
  BatteryCharging,
  RotateCcw,
  Sparkles,
  Plus,
  Upload,
  Download,
  Trash2,
  Edit3,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  Sliders,
  X,
  Mouse,
  Monitor,
  Layers,
  Check,
  Shield,
} from 'lucide-react';
import {
  TuningProfile,
  TuningProfileCategory,
} from '@/types/electron';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Switch } from '@/components/common/Switch';
import { useUIStore } from '@/stores/uiStore';

// Curated tweaks dictionary for custom profile creation
interface CuratedTweakItem {
  id: string;
  name: string;
  category: 'gaming' | 'privacy' | 'input' | 'advanced';
}

const CURATED_TWEAKS: CuratedTweakItem[] = [
  // Gaming
  { id: 'enable_game_mode', name: 'Windows Game Mode', category: 'gaming' },
  { id: 'disable_game_dvr', name: 'Disable Game DVR & Background Capture', category: 'gaming' },
  { id: 'windowed_optimizations_win11', name: 'Windowed Game Optimizations (Auto HDR / VRR)', category: 'gaming' },
  // Privacy
  { id: 'disable_telemetry', name: 'Disable DiagTrack Telemetry', category: 'privacy' },
  { id: 'disable_wer', name: 'Disable Windows Error Reporting (WerSvc)', category: 'privacy' },
  { id: 'disable_cortana_copilot', name: 'Disable Cortana & Windows Copilot', category: 'privacy' },
  { id: 'disable_advertising_id', name: 'Disable Advertising Tracking ID', category: 'privacy' },
  { id: 'disable_activity_history', name: 'Disable Activity Feed & Diagnostics Tracking', category: 'privacy' },
  { id: 'disable_location_diagnostics', name: 'Disable Location Sensor & App Diagnostics', category: 'privacy' },
  // Input
  { id: 'mouse_disable_acceleration', name: 'Disable Windows Mouse Acceleration (1:1 Raw)', category: 'input' },
  { id: 'mouse_neutral_pointer_speed', name: 'Set Neutral 6/11 Pointer Speed (10 Registry)', category: 'input' },
  { id: 'mouse_disable_trails_and_shadow', name: 'Disable Pointer Trails & Shadows', category: 'input' },
  { id: 'usb_disable_selective_suspend', name: 'Disable USB Selective Suspend (Zero Sleep)', category: 'input' },
  { id: 'keyboard_repeat_rate_max', name: 'Max Keyboard Repeat Rate (31) & Short Delay (0)', category: 'input' },
  { id: 'keyboard_disable_filter_keys', name: 'Disable FilterKeys & Key Repeat Lag', category: 'input' },
  { id: 'keyboard_disable_sticky_toggle_keys', name: 'Disable StickyKeys & ToggleKeys Shortcuts', category: 'input' },
  { id: 'keyboard_disable_alt_shift_toggle', name: 'Disable Alt+Shift Keyboard Layout Toggle', category: 'input' },
  { id: 'keyboard_numlock_on_boot', name: 'Enable NumLock Automatically on Windows Boot', category: 'input' },
  { id: 'keyboard_disable_windows_key', name: 'Disable Windows Key During Gameplay', category: 'input' },
  { id: 'system_input_mmcss_priority', name: 'MMCSS Thread Scheduling Input Priority', category: 'input' },
  // Advanced
  { id: 'timer_resolution_global', name: 'Global 0.5ms System Timer Resolution', category: 'advanced' },
];

export const ProfilesView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { tweakChangeVersion, notifyTweakChanged } = useUIStore();

  const [profiles, setProfiles] = useState<TuningProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pctweak_active_profile_id');
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [applyingProfileId, setApplyingProfileId] = useState<string | null>(null);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
    requiresReboot?: boolean;
  } | null>(null);

  // Modal Dialogs
  const [deleteTarget, setDeleteTarget] = useState<TuningProfile | null>(null);
  const [revertAllTarget, setRevertAllTarget] = useState<TuningProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<TuningProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'tweaks' | 'mouse' | 'directX'>('tweaks');
  const [modalValidationErr, setModalValidationErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profiles from backend store
  const loadProfiles = useCallback(
    async (isBackground = false) => {
      if (!isBackground && profiles.length === 0) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }

      try {
        if (window.electronAPI?.listProfiles) {
          const list = await window.electronAPI.listProfiles();
          setProfiles(list);
        }
      } catch (err: any) {
        console.error('Failed to query tuning profiles:', err);
        setStatusBanner({
          type: 'error',
          text: err?.message || 'Failed to retrieve tuning profiles.',
        });
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [profiles.length]
  );

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Synchronize if changes happen elsewhere
  useEffect(() => {
    if (tweakChangeVersion > 0) {
      loadProfiles(true);
    }
  }, [tweakChangeVersion, loadProfiles]);

  // Split into built-in and custom profiles
  const builtInProfiles = useMemo(
    () => profiles.filter((p) => p.isBuiltIn),
    [profiles]
  );

  const customProfiles = useMemo(
    () => profiles.filter((p) => !p.isBuiltIn),
    [profiles]
  );

  // Get semantic metadata for built-in preset cards
  const getPresetMeta = (id: string, category: TuningProfileCategory) => {
    if (id === 'esports_competitive' || category === 'esports') {
      return {
        icon: Trophy,
        colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        badgeText: t('profiles.presets.esports.badge', 'Competitive Low-Latency'),
        tweaksTag: t('profiles.presets.esports.tweaksTag', '10 Tweaks'),
        mouseTag: t('profiles.presets.esports.mouseTag', '1:1 Raw / Zero Accel'),
        latencyTag: t('profiles.presets.esports.latencyTag', 'Ultra-Low / 0.5ms Timer'),
      };
    }
    if (id === 'streaming_content' || category === 'streaming') {
      return {
        icon: Radio,
        colorClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
        badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        badgeText: t('profiles.presets.streaming.badge', 'Creator & Broadcast'),
        tweaksTag: t('profiles.presets.streaming.tweaksTag', '6 Tweaks'),
        mouseTag: t('profiles.presets.streaming.mouseTag', '1:1 Raw Input'),
        latencyTag: t('profiles.presets.streaming.latencyTag', 'Balanced Pacing'),
      };
    }
    if (id === 'max_battery_quiet' || category === 'battery') {
      return {
        icon: BatteryCharging,
        colorClass: 'text-lime-400 bg-lime-500/10 border-lime-500/30',
        badgeBg: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
        badgeText: t('profiles.presets.battery.badge', 'Eco & Efficiency'),
        tweaksTag: t('profiles.presets.battery.tweaksTag', '4 Tweaks'),
        mouseTag: t('profiles.presets.battery.mouseTag', 'Standard Windows'),
        latencyTag: t('profiles.presets.battery.latencyTag', 'Power Saving'),
      };
    }
    return {
      icon: RotateCcw,
      colorClass: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
      badgeBg: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
      badgeText: t('profiles.presets.default.badge', 'Factory Baseline'),
      tweaksTag: t('profiles.presets.default.tweaksTag', 'Revert All (0 Active)'),
      mouseTag: t('profiles.presets.default.mouseTag', 'Stock Curve'),
      latencyTag: t('profiles.presets.default.latencyTag', 'Factory Default'),
    };
  };

  // Profile Application Orchestration
  const executeApply = async (profile: TuningProfile) => {
    if (!window.electronAPI) return;
    setApplyingProfileId(profile.id);
    setStatusBanner(null);

    try {
      const res = await window.electronAPI.applyProfile(profile);
      if (res.success) {
        setActiveProfileId(profile.id);
        try {
          localStorage.setItem('pctweak_active_profile_id', profile.id);
        } catch {}

        setStatusBanner({
          type: res.requiresReboot ? 'warning' : 'success',
          text: t('profiles.feedback.appliedSuccess', 'Profile "{{name}}" applied successfully.', {
            name: profile.name,
          }),
          requiresReboot: res.requiresReboot,
        });

        notifyTweakChanged();
      } else {
        setStatusBanner({
          type: 'error',
          text: t('profiles.feedback.appliedError', 'Failed to apply profile: {{error}}', {
            error: res.error || 'Unknown error occurred.',
          }),
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: t('profiles.feedback.appliedError', 'Failed to apply profile: {{error}}', {
          error: err?.message || 'Execution failed.',
        }),
      });
    } finally {
      setApplyingProfileId(null);
    }
  };

  const handleApplyClick = (profile: TuningProfile) => {
    // Windows Default / Revert All triggers safety confirmation dialog
    if (
      profile.id === 'windows_default' ||
      profile.id === 'windows_default_revert' ||
      profile.category === 'default'
    ) {
      setRevertAllTarget(profile);
      return;
    }
    executeApply(profile);
  };

  // Delete Profile
  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !window.electronAPI) return;
    try {
      const res = await window.electronAPI.deleteProfile(deleteTarget.id);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      if (isSuccess) {
        setStatusBanner({
          type: 'success',
          text: t('profiles.feedback.deletedSuccess', 'Profile deleted successfully.'),
        });
        if (activeProfileId === deleteTarget.id) {
          setActiveProfileId(null);
          try {
            localStorage.removeItem('pctweak_active_profile_id');
          } catch {}
        }
        await loadProfiles(true);
      } else {
        const errorMsg = typeof res === 'object' && res.error ? res.error : 'Failed to delete';
        setStatusBanner({ type: 'error', text: errorMsg });
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to delete profile.' });
    } finally {
      setDeleteTarget(null);
    }
  };

  // Export Profile
  const handleExport = async (profile: TuningProfile) => {
    setStatusBanner(null);
    try {
      if (window.electronAPI?.exportProfile) {
        const res = await window.electronAPI.exportProfile(profile);
        if (res.success && res.filePath) {
          setStatusBanner({
            type: 'success',
            text: t('profiles.feedback.exportedSuccess', 'Profile exported to {{fileName}}.', {
              fileName: res.filePath.split(/[/\\]/).pop(),
            }),
          });
          return;
        }
        if (res.canceled) return;
      }

      // Browser Blob fallback
      const dataStr = JSON.stringify(
        {
          format: 'pctweak-profile',
          schemaVersion: 1,
          formatVersion: 1,
          app: 'PC Tweak',
          exportedAt: new Date().toISOString(),
          profile: { ...profile, isBuiltIn: false },
        },
        null,
        2
      );
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${profile.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.pctweak.json`;
      link.click();
      URL.revokeObjectURL(url);

      setStatusBanner({
        type: 'success',
        text: t('profiles.feedback.exportedSuccess', 'Profile exported to {{fileName}}.', {
          fileName: link.download,
        }),
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: `Export failed: ${err.message}`,
      });
    }
  };

  // Import Profile Trigger
  const handleImportTrigger = async () => {
    setStatusBanner(null);
    try {
      if (window.electronAPI?.importProfile) {
        const res = await window.electronAPI.importProfile();
        if (res.canceled) return;
        if (res.success && res.profile) {
          setStatusBanner({
            type: 'success',
            text: t('profiles.feedback.importedSuccess', 'Profile "{{name}}" imported successfully.', {
              name: res.profile.name,
            }),
          });
          await loadProfiles(true);
          return;
        }
        if (res.error) {
          setStatusBanner({ type: 'error', text: res.error });
          return;
        }
      }

      // Hidden input fallback
      fileInputRef.current?.click();
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Import failed: ${err.message}` });
    }
  };

  // Fallback File Reader Import
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (window.electronAPI?.importProfileFromJson) {
          const res = await window.electronAPI.importProfileFromJson(content);
          if (res.success && res.profile) {
            setStatusBanner({
              type: 'success',
              text: t('profiles.feedback.importedSuccess', 'Profile "{{name}}" imported successfully.', {
                name: res.profile.name,
              }),
            });
            await loadProfiles(true);
          } else {
            setStatusBanner({
              type: 'error',
              text: res.error || t('profiles.feedback.importInvalid', 'Invalid profile JSON file.'),
            });
          }
        }
      } catch (err: any) {
        setStatusBanner({
          type: 'error',
          text: t('profiles.feedback.importInvalid', 'Invalid profile JSON file.'),
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Duplicate Profile
  const handleDuplicate = async (profile: TuningProfile) => {
    const cloned: TuningProfile = {
      ...profile,
      id: `custom_${Date.now()}`,
      name: `${profile.name} (Copy)`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    };

    try {
      if (window.electronAPI?.saveProfile) {
        await window.electronAPI.saveProfile(cloned);
        setStatusBanner({
          type: 'success',
          text: t('profiles.feedback.duplicatedSuccess', 'Profile duplicated as "{{name}}".', {
            name: cloned.name,
          }),
        });
        await loadProfiles(true);
      }
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Failed to duplicate profile.' });
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingProfile({
      id: '',
      name: '',
      category: 'custom',
      description: '',
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      tweakIds: ['mouse_disable_acceleration', 'keyboard_repeat_rate_max'],
      mouseSettings: {
        pointerSpeed: 6,
        enhancePointerAccuracy: false,
        disableAcceleration: true,
        disableTrails: true,
        rawInputMode: true,
        scrollSpeed: 3,
        doubleClickSpeed: 550,
      },
      directX: {
        flipModel: true,
        maxFrameLatency: false,
        shaderCacheBoost: true,
      },
      keyboardTweaks: [],
    });
    setModalTab('tweaks');
    setModalValidationErr(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (profile: TuningProfile) => {
    setEditingProfile(JSON.parse(JSON.stringify(profile)));
    setModalTab('tweaks');
    setModalValidationErr(null);
    setIsModalOpen(true);
  };

  // Save Modal Profile
  const handleSaveModalProfile = async () => {
    if (!editingProfile) return;
    if (!editingProfile.name.trim()) {
      setModalValidationErr(t('profiles.modal.nameRequired', 'Profile name is required.'));
      return;
    }
    if (editingProfile.name.length > 50) {
      setModalValidationErr(t('profiles.modal.nameTooLong', 'Profile name cannot exceed 50 characters.'));
      return;
    }

    try {
      if (window.electronAPI?.saveProfile) {
        const res = await window.electronAPI.saveProfile(editingProfile);
        if (res.success) {
          setIsModalOpen(false);
          setStatusBanner({
            type: 'success',
            text: t('profiles.feedback.savedSuccess', 'Profile "{{name}}" saved successfully.', {
              name: editingProfile.name,
            }),
          });
          await loadProfiles(true);
        } else {
          setModalValidationErr(res.error || 'Failed to save profile.');
        }
      }
    } catch (err: any) {
      setModalValidationErr(err?.message || 'Failed to save profile.');
    }
  };

  // Toggle tweak selection in modal
  const handleToggleTweakInModal = (tweakId: string) => {
    if (!editingProfile) return;
    const current = editingProfile.tweakIds || [];
    const exists = current.includes(tweakId);
    const updated = exists ? current.filter((id) => id !== tweakId) : [...current, tweakId];
    setEditingProfile({ ...editingProfile, tweakIds: updated });
  };

  // Select / Deselect All Tweaks in Modal
  const handleSelectAllTweaks = (selectAll: boolean) => {
    if (!editingProfile) return;
    setEditingProfile({
      ...editingProfile,
      tweakIds: selectAll ? CURATED_TWEAKS.map((t) => t.id) : [],
    });
  };

  if (isLoading) {
    return (
      <PageLoadingState
        title={t('profiles.title', 'Tuning Profiles')}
        subtitle={t('profiles.subtitle', 'Loading optimization presets and peripheral configurations...')}
        icon={SlidersHorizontal}
        variant="cards"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Hidden File Input for Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pctweak.json"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* View Header with Sliders Glow & Profile Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl glass-panel relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/30 text-primary shadow-[0_0_16px_rgba(0,240,255,0.2)]">
            <SlidersHorizontal className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {t('profiles.title', 'Tuning Profiles')}
              </h1>
              {activeProfileId && (
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {t('profiles.currentlyActive', 'Active Now')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-xl">
              {t(
                'profiles.subtitle',
                'Switch entire system configurations in 1 click across mouse precision, DirectX latency, and services with 100% rollback guarantee.'
              )}
            </p>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_12px_rgba(0,240,255,0.25)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('profiles.createProfile', 'Create Profile')}</span>
          </button>

          <button
            type="button"
            onClick={handleImportTrigger}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-foreground border border-white/10 transition-colors cursor-pointer"
            title={t('profiles.importProfileTitle', 'Import Profile from .pctweak.json file')}
          >
            <Upload className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">{t('profiles.importProfile', 'Import')}</span>
          </button>

          <button
            type="button"
            onClick={() => loadProfiles(true)}
            disabled={isSyncing}
            className="p-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10 transition-colors cursor-pointer"
            title={t('common.refresh', 'Sync')}
            aria-label={t('common.refresh', 'Sync profiles')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dynamic Status / Alert Banner */}
      {statusBanner && (
        <div
          className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs transition-all ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : statusBanner.type === 'error'
              ? 'bg-red-500/10 border-red-500/25 text-red-300'
              : statusBanner.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
              : 'bg-blue-500/10 border-blue-500/25 text-blue-300'
          }`}
          role="status"
          aria-live="polite"
        >
          {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
          {statusBanner.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
          {statusBanner.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />}
          {statusBanner.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />}
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-relaxed">{statusBanner.text}</p>
            {statusBanner.requiresReboot && (
              <p className="text-[11px] opacity-90 font-mono flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                {t('privacy.rebootNotice', 'A Windows restart is recommended to complete service detachment.')}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={t('common.close', 'Dismiss notification')}
            onClick={() => setStatusBanner(null)}
            className="text-muted-foreground hover:text-foreground text-xs px-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 1: Built-in Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {t('profiles.builtInPresetsTitle', 'System Presets')}
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {t('profiles.builtInPresetsSubtitle', 'Handcrafted low-overhead tuning configurations tested for anti-cheat and system stability.')}
          </span>
        </div>

        {/* 2-Column Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {builtInProfiles.map((preset) => {
            const meta = getPresetMeta(preset.id, preset.category);
            const Icon = meta.icon;
            const isCurrentlyActive = activeProfileId === preset.id;
            const isApplying = applyingProfileId === preset.id;

            return (
              <div
                key={preset.id}
                className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                  isCurrentlyActive
                    ? 'glass-panel-elevated border-primary/40 shadow-[0_0_16px_rgba(0,240,255,0.12)]'
                    : 'glass-panel border-white/5 hover:border-white/15'
                }`}
              >
                <div>
                  {/* Top Bar: Icon, Category Badge & Active Indicator */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta.colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${meta.badgeBg}`}>
                        {meta.badgeText}
                      </span>
                    </div>

                    {isCurrentlyActive && (
                      <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Check className="w-2.5 h-2.5" />
                        {t('profiles.currentlyActive', 'Active Now')}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-sm font-bold text-foreground tracking-tight">
                    {t(`profiles.presets.${preset.category}.name`, preset.name)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">
                    {t(`profiles.presets.${preset.category}.desc`, preset.description)}
                  </p>

                  {/* Summary Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-white/5 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                      {meta.tweaksTag}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                      {meta.mouseTag}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                      {meta.latencyTag}
                    </span>
                  </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-500" />
                    <span>{t('profiles.anticheatSafe', 'Anti-Cheat Safe')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyClick(preset)}
                    disabled={isApplying || isCurrentlyActive}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isCurrentlyActive
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                    }`}
                  >
                    {isApplying ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{t('profiles.applying', 'Applying...')}</span>
                      </>
                    ) : isCurrentlyActive ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>{t('profiles.currentlyActive', 'Active')}</span>
                      </>
                    ) : (
                      <span>{t('profiles.applyPreset', 'Apply Preset')}</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Custom Profiles */}
      <div className="space-y-3 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {t('profiles.customProfilesTitle', 'Custom Profiles')}
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/5">
              {customProfiles.length}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {t('profiles.customProfilesSubtitle', 'Personalized tuning profiles saved on your local machine.')}
          </span>
        </div>

        {/* Custom Profiles Grid or Empty State */}
        {customProfiles.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-white/10 glass-panel text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
              <SlidersHorizontal className="w-6 h-6 opacity-60" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('profiles.noCustomProfilesTitle', 'No Custom Profiles Yet')}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {t(
                  'profiles.noCustomProfilesSubtitle',
                  'Create your own customized tuning preset or import one from a file to get started.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="mt-2 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('profiles.createFirstProfile', 'Create Your First Profile')}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customProfiles.map((profile) => {
              const isCurrentlyActive = activeProfileId === profile.id;
              const isApplying = applyingProfileId === profile.id;
              const tweakCount = profile.tweakIds?.length || 0;
              const pointerSpeed = profile.mouseSettings?.pointerSpeed || 6;
              const disableAccel = profile.mouseSettings?.disableAcceleration ?? true;

              return (
                <div
                  key={profile.id}
                  className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                    isCurrentlyActive
                      ? 'glass-panel-elevated border-cyan-400/40 shadow-[0_0_16px_rgba(0,240,255,0.12)]'
                      : 'glass-panel border-white/5 hover:border-white/15'
                  }`}
                >
                  <div>
                    {/* Top Bar */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {profile.category || 'custom'}
                      </span>

                      {isCurrentlyActive && (
                        <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <Check className="w-2.5 h-2.5" />
                          {t('profiles.currentlyActive', 'Active')}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-foreground tracking-tight">
                      {profile.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {profile.description || t('profiles.noDescription', 'Custom user tuning preset.')}
                    </p>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-white/5 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                        {t('profiles.tweaksCount', '{{count}} Tweaks', { count: tweakCount })}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                        {t('profiles.mouseConfig', 'Mouse: {{speed}}/11, {{accel}}', {
                          speed: pointerSpeed,
                          accel: disableAccel
                            ? t('profiles.accelDisabled', 'Zero Accel')
                            : t('profiles.accelEnabled', 'Accel Enabled'),
                        })}
                      </span>
                      {profile.directX?.flipModel && (
                        <span className="px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                          DXGI Flip
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Toolbar */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(profile)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        title={t('profiles.editProfile', 'Edit Profile')}
                        aria-label={t('profiles.editProfile', 'Edit Profile')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(profile)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        title={t('profiles.duplicateProfile', 'Duplicate Profile')}
                        aria-label={t('profiles.duplicateProfile', 'Duplicate Profile')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(profile)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        title={t('profiles.exportProfile', 'Export Profile')}
                        aria-label={t('profiles.exportProfile', 'Export Profile')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(profile)}
                        className="p-1.5 rounded-lg text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title={t('profiles.deleteProfile', 'Delete Profile')}
                        aria-label={t('profiles.deleteProfile', 'Delete Profile')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyClick(profile)}
                      disabled={isApplying || isCurrentlyActive}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isCurrentlyActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                      }`}
                    >
                      {isApplying ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>{t('profiles.applying', 'Applying...')}</span>
                        </>
                      ) : isCurrentlyActive ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>{t('profiles.currentlyActive', 'Active')}</span>
                        </>
                      ) : (
                        <span>{t('profiles.applyPreset', 'Apply')}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT PROFILE MODAL */}
      {isModalOpen && editingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl glass-panel border border-white/10 shadow-2xl overflow-hidden bg-slate-900/95"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/30 text-primary">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <h3 id="profile-modal-title" className="text-sm font-bold text-foreground">
                  {editingProfile.id
                    ? t('profiles.modal.editTitle', 'Edit Profile: {{name}}', { name: editingProfile.name })
                    : t('profiles.modal.createTitle', 'Create Tuning Profile')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                aria-label={t('profiles.modal.cancel', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {modalValidationErr && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                  {modalValidationErr}
                </div>
              )}

              {/* General Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    {t('profiles.modal.profileName', 'Profile Name')} *
                  </label>
                  <input
                    type="text"
                    value={editingProfile.name}
                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                    placeholder={t('profiles.modal.profileNamePlaceholder', 'e.g., Valorant Competitive, Work Focus...')}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/60 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    maxLength={50}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-foreground">
                    {t('profiles.modal.category', 'Category')}
                  </label>
                  <select
                    value={editingProfile.category}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, category: e.target.value as TuningProfileCategory })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="custom">Custom</option>
                    <option value="esports">Esports</option>
                    <option value="streaming">Streaming</option>
                    <option value="battery">Battery</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-foreground">
                  {t('profiles.modal.description', 'Description')}
                </label>
                <textarea
                  value={editingProfile.description}
                  onChange={(e) => setEditingProfile({ ...editingProfile, description: e.target.value })}
                  placeholder={t('profiles.modal.descriptionPlaceholder', 'Describe the purpose and target games of this profile...')}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/60 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Tabs Bar */}
              <div className="flex border-b border-white/10 pt-2">
                <button
                  type="button"
                  onClick={() => setModalTab('tweaks')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    modalTab === 'tweaks'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {t('profiles.modal.tabTweaks', 'Tweaks ({{count}})', {
                      count: editingProfile.tweakIds?.length || 0,
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTab('mouse')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    modalTab === 'mouse'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Mouse className="w-3.5 h-3.5" />
                  <span>{t('profiles.modal.tabMouse', 'Mouse & Sensor')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTab('directX')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    modalTab === 'directX'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{t('profiles.modal.tabDirectX', 'DirectX & Latency')}</span>
                </button>
              </div>

              {/* TAB 1: Tweaks Picker */}
              {modalTab === 'tweaks' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {t(
                        'profiles.modal.selectTweaksPrompt',
                        'Select which system, gaming, and privacy tweaks to include in this profile:'
                      )}
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleSelectAllTweaks(true)}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        {t('profiles.modal.selectAll', 'Select All')}
                      </button>
                      <span className="text-white/20">|</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllTweaks(false)}
                        className="text-muted-foreground hover:underline cursor-pointer"
                      >
                        {t('profiles.modal.deselectAll', 'Deselect All')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {CURATED_TWEAKS.map((twk) => {
                      const isChecked = editingProfile.tweakIds?.includes(twk.id) || false;
                      return (
                        <label
                          key={twk.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleTweakInModal(twk.id)}
                              className="rounded border-white/20 text-primary focus:ring-primary h-3.5 w-3.5 bg-black/40"
                            />
                            <span className="text-foreground">{twk.name}</span>
                          </div>
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                            {twk.category}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: Mouse & Sensor */}
              {modalTab === 'mouse' && (
                <div className="space-y-4 pt-1">
                  {/* Pointer Speed Slider */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {t('profiles.modal.pointerSpeed', 'Pointer Speed (Windows Sensitivity)')}
                      </span>
                      <span className="font-mono text-xs font-bold text-primary">
                        {editingProfile.mouseSettings?.pointerSpeed || 6} / 11{' '}
                        {editingProfile.mouseSettings?.pointerSpeed === 6 && (
                          <span className="text-[10px] text-emerald-400 font-normal">
                            ({t('profiles.modal.pointerSpeedNeutral', 'Neutral 1:1')})
                          </span>
                        )}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={11}
                      step={1}
                      value={editingProfile.mouseSettings?.pointerSpeed ?? 6}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          mouseSettings: {
                            ...(editingProfile.mouseSettings || {
                              enhancePointerAccuracy: false,
                              disableAcceleration: true,
                            }),
                            pointerSpeed: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                      <span>{t('profiles.modal.speedSlow', '1 (Slow)')}</span>
                      <span>{t('profiles.modal.speedStandard', '6 (1:1 Standard)')}</span>
                      <span>{t('profiles.modal.speedFast', '11 (Fast)')}</span>
                    </div>
                  </div>

                  {/* Disable Mouse Acceleration Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.disableAcceleration', 'Disable Mouse Acceleration (1:1 Sensor Mapping)')}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('profiles.modal.disableAccelerationDesc', 'Removes Windows pointer ballistics for linear muscle memory.')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.mouseSettings?.disableAcceleration ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          mouseSettings: {
                            ...(editingProfile.mouseSettings || { pointerSpeed: 6 }),
                            disableAcceleration: checked,
                            enhancePointerAccuracy: !checked,
                          },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>

                  {/* Force Raw Input Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.rawInputMode', 'Force Raw Input Mode')}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('profiles.modal.rawInputModeDesc', 'Bypasses Windows message pump acceleration curves.')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.mouseSettings?.rawInputMode ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          mouseSettings: {
                            ...(editingProfile.mouseSettings || { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true }),
                            rawInputMode: checked,
                          },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>

                  {/* Disable Cursor Trails Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.disableTrails', 'Disable Cursor Trails & Shadows')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.mouseSettings?.disableTrails ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          mouseSettings: {
                            ...(editingProfile.mouseSettings || { pointerSpeed: 6, enhancePointerAccuracy: false, disableAcceleration: true }),
                            disableTrails: checked,
                          },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: DirectX Low Latency */}
              {modalTab === 'directX' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.directXFlip', 'DirectX Flip Presentation Model')}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('profiles.modal.directXFlipDesc', 'Upgrades windowed games to modern DXGI borderless flip model.')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.directX?.flipModel ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          directX: { ...(editingProfile.directX || {}), flipModel: checked },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.directXLatency', 'Max Frame Latency Reduction')}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('profiles.modal.directXLatencyDesc', 'Reduces queued prerendered GPU frames to 1 for lowest motion-to-photon latency.')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.directX?.maxFrameLatency ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          directX: { ...(editingProfile.directX || {}), maxFrameLatency: checked },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="font-semibold text-foreground">
                        {t('profiles.modal.shaderCache', 'Boost Shader Cache Size')}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t('profiles.modal.shaderCacheDesc', 'Prevents in-game compilation micro-stutters in DirectX 12 titles.')}
                      </div>
                    </div>
                    <Switch
                      checked={editingProfile.directX?.shaderCacheBoost ?? true}
                      onChange={(checked) =>
                        setEditingProfile({
                          ...editingProfile,
                          directX: { ...(editingProfile.directX || {}), shaderCacheBoost: checked },
                        })
                      }
                      colorScheme="primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10 bg-black/20">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
              >
                {t('profiles.modal.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveModalProfile}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_0_12px_rgba(0,240,255,0.25)] cursor-pointer"
              >
                {editingProfile.id
                  ? t('profiles.modal.save', 'Save Profile')
                  : t('profiles.modal.create', 'Create Profile')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Profile */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('profiles.dialogs.deleteTitle', 'Delete Tuning Profile?')}
        message={t(
          'profiles.dialogs.deleteMessage',
          'Are you sure you want to permanently delete "{{name}}"? This action cannot be undone.',
          { name: deleteTarget?.name || '' }
        )}
        confirmLabel={t('profiles.dialogs.deleteConfirm', 'Yes, Delete')}
        cancelLabel={t('profiles.dialogs.deleteCancel', 'Cancel')}
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Confirmation Dialog: Revert All / Windows Default */}
      <ConfirmDialog
        isOpen={!!revertAllTarget}
        title={t('profiles.dialogs.revertDefaultTitle', 'Revert All Optimizations to Windows Defaults?')}
        message={t(
          'profiles.dialogs.revertDefaultMessage',
          'Applying this preset will restore Windows Error Reporting, telemetry services, standard mouse acceleration, and default DirectX queues. Are you sure you want to continue?'
        )}
        confirmLabel={t('profiles.dialogs.revertDefaultConfirm', 'Yes, Revert to Defaults')}
        cancelLabel={t('profiles.dialogs.revertDefaultCancel', 'Cancel')}
        isDestructive={true}
        onConfirm={() => {
          if (revertAllTarget) {
            executeApply(revertAllTarget);
            setRevertAllTarget(null);
          }
        }}
        onCancel={() => setRevertAllTarget(null)}
      />
    </div>
  );
};

export default ProfilesView;
