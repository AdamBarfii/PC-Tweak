import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Power,
  Globe,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Check,
  Moon,
  Sun,
  Monitor,
  Activity,
  Sliders,
  ShieldCheck,
  DownloadCloud,
} from 'lucide-react';
import { AppSettings } from '@/types/electron';
import { Switch } from '@/components/common/Switch';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import { setAppLanguage } from '@/i18n';
import { useUIStore } from '@/stores/uiStore';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  launchOnStartup: false,
  minimizeToTray: true,
  closeToTray: true,
  language: 'en',
  hardwarePollingInterval: 1000,
  autoUpdate: true,
  theme: 'dark',
};

interface PollingPreset {
  value: number;
  labelKey: string;
  sec: string;
  overheadKey: string;
}

const POLLING_PRESETS: PollingPreset[] = [
  { value: 500, labelKey: 'settings.presetFast', sec: '0.5s', overheadKey: 'settings.overheadFast' },
  { value: 1000, labelKey: 'settings.presetBalanced', sec: '1.0s', overheadKey: 'settings.overheadModerate' },
  { value: 2500, labelKey: 'settings.presetEco', sec: '2.5s', overheadKey: 'settings.overheadLow' },
  { value: 5000, labelKey: 'settings.presetLow', sec: '5.0s', overheadKey: 'settings.overheadLow' },
];

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { isDark, toggleTheme } = useUIStore();

  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedLang = (localStorage.getItem('pctweak_lang') as 'en' | 'fa') || 'en';
    const savedTheme = (localStorage.getItem('pctweak_theme') as 'dark' | 'light' | 'system') || 'dark';
    return {
      ...DEFAULT_APP_SETTINGS,
      language: savedLang,
      theme: savedTheme,
    };
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [updatingKeys, setUpdatingKeys] = useState<Set<keyof AppSettings>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sliderValue, setSliderValue] = useState<number>(1000);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
  } | null>(null);

  // Dialog states
  const [resetDefaultsOpen, setResetDefaultsOpen] = useState(false);
  const [factoryWipeOpen, setFactoryWipeOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isFactoryWiping, setIsFactoryWiping] = useState(false);

  // Load preferences from backend settingsStore
  const loadSettings = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsSyncing(true);
    }
    setStatusBanner(null);

    try {
      if (window.electronAPI?.getSettings) {
        const loaded = await window.electronAPI.getSettings();
        if (loaded) {
          setSettings(loaded);
          setSliderValue(loaded.hardwarePollingInterval || 1000);
        }
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setStatusBanner({
        type: 'error',
        text: err?.message || t('settings.fetchError', 'Failed to load settings from storage.'),
      });
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Sync slider state when backend settings update
  useEffect(() => {
    if (settings.hardwarePollingInterval) {
      setSliderValue(settings.hardwarePollingInterval);
    }
  }, [settings.hardwarePollingInterval]);

  // Handle setting updates with optimistic rendering and error rollback
  const handleUpdateSetting = async (partial: Partial<AppSettings>) => {
    const prevSettings = { ...settings };
    setSettings((curr) => ({ ...curr, ...partial }));
    setSaveStatus('saving');
    setStatusBanner(null);

    const keys = Object.keys(partial) as (keyof AppSettings)[];
    setUpdatingKeys((curr) => {
      const next = new Set(curr);
      keys.forEach((k) => next.add(k));
      return next;
    });

    try {
      const updateFn = window.electronAPI?.setSettings || window.electronAPI?.updateSettings;
      if (updateFn) {
        const result = await updateFn(partial);
        if (result && result.success && result.settings) {
          setSettings(result.settings);
          setSaveStatus('saved');
          setTimeout(() => {
            setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
          }, 2500);
        } else {
          // Rollback on non-success
          setSettings(prevSettings);
          if (partial.language && partial.language !== prevSettings.language) {
            setAppLanguage(prevSettings.language);
          }
          setSaveStatus('error');
          setStatusBanner({
            type: 'error',
            text: t('settings.saveError', 'Failed to update setting.'),
          });
        }
      } else {
        // Fallback simulated success
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err: any) {
      // Rollback on exception
      setSettings(prevSettings);
      if (partial.language && partial.language !== prevSettings.language) {
        setAppLanguage(prevSettings.language);
      }
      setSaveStatus('error');
      setStatusBanner({
        type: 'error',
        text: err?.message || t('settings.saveError', 'Failed to update setting.'),
      });
    } finally {
      setUpdatingKeys((curr) => {
        const next = new Set(curr);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }
  };

  // Immediate language switch with LTR/RTL document sync
  const handleLanguageSelect = async (newLang: 'en' | 'fa') => {
    if (settings.language === newLang) return;
    setAppLanguage(newLang);
    await handleUpdateSetting({ language: newLang });
  };

  // Theme selection handler
  const handleThemeSelect = async (newTheme: 'dark' | 'light' | 'system') => {
    if (settings.theme === newTheme) return;

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('pctweak_theme', 'dark');
      if (!isDark) toggleTheme();
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('pctweak_theme', 'light');
      if (isDark) toggleTheme();
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
        if (!isDark) toggleTheme();
      } else {
        document.documentElement.classList.remove('dark');
        if (isDark) toggleTheme();
      }
      localStorage.setItem('pctweak_theme', 'system');
    }

    await handleUpdateSetting({ theme: newTheme });
  };

  // Reset to default preferences
  const handleResetDefaultsConfirm = async () => {
    setResetDefaultsOpen(false);
    setIsResetting(true);
    setStatusBanner(null);

    try {
      if (window.electronAPI?.resetSettings) {
        const res = await window.electronAPI.resetSettings();
        if (res.success && res.settings) {
          setSettings(res.settings);
          setSliderValue(res.settings.hardwarePollingInterval);
          setAppLanguage(res.settings.language);

          if (res.settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
            localStorage.setItem('pctweak_theme', 'dark');
          } else if (res.settings.theme === 'light') {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('pctweak_theme', 'light');
          }

          setStatusBanner({
            type: 'success',
            text: t('settings.resetSuccess', 'Settings successfully restored to factory defaults.'),
          });
        } else {
          setStatusBanner({
            type: 'error',
            text: t('settings.saveError', 'Failed to reset settings to defaults.'),
          });
        }
      } else {
        setSettings(DEFAULT_APP_SETTINGS);
        setStatusBanner({
          type: 'success',
          text: t('settings.resetSuccess', 'Settings successfully restored to factory defaults.'),
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || t('settings.saveError', 'Failed to reset settings.'),
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Reset all application data (factory wipe)
  const handleFactoryWipeConfirm = async () => {
    setFactoryWipeOpen(false);
    setIsFactoryWiping(true);
    setStatusBanner(null);

    try {
      if (window.electronAPI?.resetAppData) {
        const res = await window.electronAPI.resetAppData();
        if (res.success) {
          // Re-fetch default settings
          if (window.electronAPI.getSettings) {
            const def = await window.electronAPI.getSettings();
            setSettings(def);
            setSliderValue(def.hardwarePollingInterval);
            setAppLanguage(def.language);
          } else {
            setSettings(DEFAULT_APP_SETTINGS);
          }
          localStorage.removeItem('pctweak_active_profile_id');

          setStatusBanner({
            type: 'success',
            text: t(
              'settings.factoryWipeSuccess',
              'All application data has been wiped and reset to factory defaults.'
            ),
          });
        } else {
          setStatusBanner({
            type: 'error',
            text: t('settings.saveError', 'Failed to wipe application data.'),
          });
        }
      } else {
        setSettings(DEFAULT_APP_SETTINGS);
        setStatusBanner({
          type: 'success',
          text: t(
            'settings.factoryWipeSuccess',
            'All application data has been wiped and reset to factory defaults.'
          ),
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || t('settings.saveError', 'Failed to wipe application data.'),
      });
    } finally {
      setIsFactoryWiping(false);
    }
  };

  // Live label for current hardware interval
  const currentIntervalSec = (sliderValue / 1000).toFixed(1);
  const currentOverheadLabel = useMemo(() => {
    if (sliderValue <= 500) return t('settings.overheadFast', 'Interactive Gaming Tracking (< 0.6% CPU)');
    if (sliderValue <= 1000) return t('settings.overheadModerate', 'Minimal Overhead (< 0.3% CPU)');
    return t('settings.overheadLow', 'Negligible Overhead (< 0.1% CPU)');
  }, [sliderValue, t]);

  if (isLoading) {
    return (
      <PageLoadingState
        title={t('settings.loadingTitle', 'Loading Application Preferences...')}
        subtitle={t('settings.loadingSubtitle', 'Reading hardware polling settings and application configuration...')}
        icon={Settings}
        variant="checklist"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl glass-panel relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/30 text-primary shadow-[0_0_16px_rgba(0,240,255,0.2)]">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {t('settings.title', 'Settings & Preferences')}
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                <Sliders className="w-2.5 h-2.5" />
                {t('settings.versionTag', 'v1.0.0')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-xl">
              {t(
                'settings.subtitle',
                'Configure startup, window behavior, telemetry polling frequency, language, and system maintenance.'
              )}
            </p>
          </div>
        </div>

        {/* Status indicator & sync button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-primary animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('settings.savingStatus', 'Saving changes...')}</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('settings.savedStatus', 'Settings saved')}</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t('settings.saveError', 'Save failed')}</span>
              </span>
            )}
            {saveStatus === 'idle' && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{t('settings.syncStatus', 'Preferences synced')}</span>
              </span>
            )}
          </div>

          {/* Sync Button */}
          <button
            type="button"
            onClick={() => loadSettings(true)}
            disabled={isSyncing}
            title={t('common.refresh', 'Sync')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh', 'Sync')}</span>
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
        >
          {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusBanner.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusBanner.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-relaxed">{statusBanner.text}</p>
          </div>
        </div>
      )}

      {/* SECTION 1: General & Window Behavior */}
      <div className="p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Power className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('settings.generalTitle', 'General & Window Behavior')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.generalDesc', 'Manage Windows startup and tray minimization behavior.')}
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          {/* Launch on Windows Startup */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground block">
                {t('settings.launchOnStartup', 'Launch on Windows Startup')}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'settings.launchOnStartupDesc',
                  'Automatically start PC Tweak in the background when logging into Windows.'
                )}
              </p>
            </div>
            <Switch
              checked={settings.launchOnStartup}
              onChange={(val) => handleUpdateSetting({ launchOnStartup: val })}
              isLoading={updatingKeys.has('launchOnStartup')}
              ariaLabel={t('settings.launchOnStartup', 'Launch on Windows Startup')}
            />
          </div>

          {/* Minimize to System Tray */}
          <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3.5">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground block">
                {t('settings.minimizeToTray', 'Minimize to System Tray')}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'settings.minimizeToTrayDesc',
                  'Hide the application window to the taskbar notification area when minimized.'
                )}
              </p>
            </div>
            <Switch
              checked={settings.minimizeToTray}
              onChange={(val) => handleUpdateSetting({ minimizeToTray: val })}
              isLoading={updatingKeys.has('minimizeToTray')}
              ariaLabel={t('settings.minimizeToTray', 'Minimize to System Tray')}
            />
          </div>

          {/* Close Button Minimizes to Tray */}
          <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3.5">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground block">
                {t('settings.closeToTray', 'Close Button Minimizes to Tray')}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'settings.closeToTrayDesc',
                  'Keep PC Tweak running in the background when the close (X) button is clicked.'
                )}
              </p>
            </div>
            <Switch
              checked={settings.closeToTray}
              onChange={(val) => handleUpdateSetting({ closeToTray: val })}
              isLoading={updatingKeys.has('closeToTray')}
              ariaLabel={t('settings.closeToTray', 'Close Button Minimizes to Tray')}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Language & Localization */}
      <div className="p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('settings.localizationTitle', 'Language & Localization')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.localizationDesc', 'Select application display language and layout direction.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* English Option */}
          <button
            type="button"
            onClick={() => handleLanguageSelect('en')}
            className={`p-4 rounded-xl border text-start transition-all cursor-pointer relative flex items-center justify-between focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              settings.language === 'en'
                ? 'bg-primary/10 border-primary shadow-[0_0_16px_rgba(0,240,255,0.15)] text-foreground'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="space-y-1">
              <div className="text-xs font-semibold flex items-center gap-2">
                <span>{t('settings.englishLabel', 'English')}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-muted-foreground">
                  LTR
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('settings.englishDesc', 'Left-to-Right (LTR) default layout')}
              </p>
            </div>
            {settings.language === 'en' && (
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
            )}
          </button>

          {/* Persian Option */}
          <button
            type="button"
            onClick={() => handleLanguageSelect('fa')}
            className={`p-4 rounded-xl border text-start transition-all cursor-pointer relative flex items-center justify-between focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              settings.language === 'fa'
                ? 'bg-primary/10 border-primary shadow-[0_0_16px_rgba(0,240,255,0.15)] text-foreground'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="space-y-1">
              <div className="text-xs font-semibold flex items-center gap-2">
                <span>{t('settings.persianLabel', 'فارسی')}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-muted-foreground">
                  RTL
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('settings.persianDesc', 'Right-to-Left (RTL) localized layout')}
              </p>
            </div>
            {settings.language === 'fa' && (
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 3: Hardware Telemetry & Diagnostics */}
      <div className="p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {t('settings.telemetryTitle', 'Hardware Telemetry & Polling')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t(
                  'settings.telemetryDesc',
                  'Configure real-time hardware metrics refresh rate (CPU, GPU, RAM, Disk).'
                )}
              </p>
            </div>
          </div>

          {/* Current Live Rate Tag */}
          <div className="text-end">
            <div className="text-xs font-mono font-bold text-primary tabular-nums">
              {t('settings.currentIntervalLabel', 'Current Interval: {{ms}} ms ({{sec}}s)', {
                ms: sliderValue,
                sec: currentIntervalSec,
              })}
            </div>
            <div className="text-[10px] text-muted-foreground">{currentOverheadLabel}</div>
          </div>
        </div>

        {/* Polling Interval Slider */}
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <label htmlFor="polling-interval-slider">
                {t('settings.pollingInterval', 'Telemetry Polling Interval')}
              </label>
              <span className="font-mono text-muted-foreground">{sliderValue} ms</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                'settings.pollingIntervalDesc',
                'Controls how frequently hardware metrics are queried. Lower values provide smoother curves with negligible CPU usage.'
              )}
            </p>
          </div>

          <div className="relative pt-2">
            <input
              id="polling-interval-slider"
              type="range"
              min={500}
              max={5000}
              step={250}
              value={sliderValue}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliderValue(val);
              }}
              onMouseUp={() => handleUpdateSetting({ hardwarePollingInterval: sliderValue })}
              onTouchEnd={() => handleUpdateSetting({ hardwarePollingInterval: sliderValue })}
              aria-valuemin={500}
              aria-valuemax={5000}
              aria-valuenow={sliderValue}
              aria-valuetext={`${sliderValue} milliseconds`}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground pt-1.5">
              <span>500 ms ({t('settings.presetFast', 'Fast')})</span>
              <span>1000 ms ({t('settings.presetBalanced', 'Balanced')})</span>
              <span>2500 ms ({t('settings.presetEco', 'Eco')})</span>
              <span>5000 ms ({t('settings.presetLow', 'Low Overhead')})</span>
            </div>
          </div>

          {/* Quick-Select Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {POLLING_PRESETS.map((preset) => {
              const isActive = settings.hardwarePollingInterval === preset.value;
              return (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() => {
                    setSliderValue(preset.value);
                    handleUpdateSetting({ hardwarePollingInterval: preset.value });
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                    isActive
                      ? 'bg-primary/10 border-primary text-primary font-semibold shadow-[0_0_12px_rgba(0,240,255,0.15)]'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="truncate">{t(preset.labelKey)}</div>
                  <div className="text-[10px] font-mono opacity-70 mt-0.5">{preset.sec}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 4: Appearance & Theme */}
      <div className="p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Moon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('settings.appearanceTitle', 'Appearance & Theme')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.appearanceDesc', 'Choose your preferred visual theme and contrast mode.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Dark Mode */}
          <button
            type="button"
            onClick={() => handleThemeSelect('dark')}
            className={`p-3.5 rounded-xl border text-start transition-all cursor-pointer relative flex items-center justify-between focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              settings.theme === 'dark'
                ? 'bg-primary/10 border-primary shadow-[0_0_16px_rgba(0,240,255,0.15)] text-foreground'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center text-primary">
                <Moon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold">{t('settings.dark', 'Dark')}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t('settings.themeDarkDesc', 'Obsidian Cockpit')}
                </div>
              </div>
            </div>
            {settings.theme === 'dark' && <Check className="w-4 h-4 text-primary" />}
          </button>

          {/* Light Mode */}
          <button
            type="button"
            onClick={() => handleThemeSelect('light')}
            className={`p-3.5 rounded-xl border text-start transition-all cursor-pointer relative flex items-center justify-between focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              settings.theme === 'light'
                ? 'bg-primary/10 border-primary shadow-[0_0_16px_rgba(0,240,255,0.15)] text-foreground'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center text-amber-600">
                <Sun className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold">{t('settings.light', 'Light')}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t('settings.themeLightDesc', 'Chassis Ice')}
                </div>
              </div>
            </div>
            {settings.theme === 'light' && <Check className="w-4 h-4 text-primary" />}
          </button>

          {/* System Default */}
          <button
            type="button"
            onClick={() => handleThemeSelect('system')}
            className={`p-3.5 rounded-xl border text-start transition-all cursor-pointer relative flex items-center justify-between focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              settings.theme === 'system'
                ? 'bg-primary/10 border-primary shadow-[0_0_16px_rgba(0,240,255,0.15)] text-foreground'
                : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
                <Monitor className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold">{t('settings.system', 'System Default')}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t('settings.themeSystemDesc', 'Match Windows')}
                </div>
              </div>
            </div>
            {settings.theme === 'system' && <Check className="w-4 h-4 text-primary" />}
          </button>
        </div>
      </div>

      {/* SECTION 5: Updates & Maintenance */}
      <div className="p-5 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <DownloadCloud className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('settings.updatesTitle', 'Updates & Integrity')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('settings.updatesDesc', 'Manage automated updates and version checks.')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-foreground block">
              {t('settings.autoUpdate', 'Check for Updates Automatically')}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {t(
                'settings.autoUpdateDesc',
                'Automatically notify when new performance tweaks, game profiles, and anti-cheat patches are released.'
              )}
            </p>
          </div>
          <Switch
            checked={settings.autoUpdate}
            onChange={(val) => handleUpdateSetting({ autoUpdate: val })}
            isLoading={updatingKeys.has('autoUpdate')}
            ariaLabel={t('settings.autoUpdate', 'Check for Updates Automatically')}
          />
        </div>
      </div>

      {/* SECTION 6: Danger Zone & Maintenance */}
      <div className="p-5 rounded-2xl glass-panel border-red-500/20 bg-red-950/10 space-y-4">
        <div className="flex items-center gap-3 border-b border-red-500/10 pb-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-400">
              {t('settings.dangerZoneTitle', 'Danger Zone & Maintenance')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.dangerZoneDesc',
                'Restore preferences to factory defaults or perform a full application data wipe.'
              )}
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          {/* Action 1: Reset Settings to Default */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-foreground block">
                {t('settings.resetDefaults', 'Reset Settings to Default')}
              </span>
              <p className="text-[11px] text-muted-foreground max-w-lg">
                {t(
                  'settings.resetDefaultsDesc',
                  'Restore all startup, tray, polling, and theme preferences to factory defaults. Custom tuning profiles and backups are kept safe.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResetDefaultsOpen(true)}
              disabled={isResetting || isFactoryWiping}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border border-white/10 hover:border-amber-500/30 text-muted-foreground hover:text-amber-400 bg-white/[0.02] hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin text-amber-400' : ''}`} />
              <span>{t('settings.resetDefaults', 'Reset Settings')}</span>
            </button>
          </div>

          {/* Action 2: Reset All Application Data (Factory Wipe) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-red-500/10 pt-3.5">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-red-300 block">
                {t('settings.resetAllData', 'Reset All Application Data (Factory Wipe)')}
              </span>
              <p className="text-[11px] text-muted-foreground max-w-lg">
                {t(
                  'settings.resetAllDataDesc',
                  'Permanently delete all custom tuning profiles, audit history, backup snapshots, and settings.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFactoryWipeOpen(true)}
              disabled={isResetting || isFactoryWiping}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 transition-colors cursor-pointer shrink-0 shadow-sm focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
            >
              <Trash2 className={`w-3.5 h-3.5 ${isFactoryWiping ? 'animate-spin' : ''}`} />
              <span>{t('settings.wipeAction', 'Wipe All Data')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog 1: Reset Settings to Default */}
      <ConfirmDialog
        isOpen={resetDefaultsOpen}
        title={t('settings.confirmResetTitle', 'Reset Settings to Default?')}
        message={t(
          'settings.confirmResetMessage',
          'Are you sure you want to reset all preferences to their factory defaults? Your custom tuning profiles and backup history will not be affected.'
        )}
        confirmLabel={t('settings.confirmAction', 'Confirm')}
        cancelLabel={t('settings.cancelAction', 'Cancel')}
        isDestructive={false}
        onConfirm={handleResetDefaultsConfirm}
        onCancel={() => setResetDefaultsOpen(false)}
      />

      {/* Confirmation Dialog 2: Factory Wipe Reset All Data */}
      <ConfirmDialog
        isOpen={factoryWipeOpen}
        title={t('settings.confirmFactoryWipeTitle', 'Factory Reset: Wipe All Data?')}
        message={t(
          'settings.confirmFactoryWipeMessage',
          'CRITICAL WARNING: This action permanently erases all custom profiles, tweaks audit history, snapshots, and application settings. This cannot be undone.'
        )}
        confirmLabel={t('settings.wipeAction', 'Wipe All Data')}
        cancelLabel={t('settings.cancelAction', 'Cancel')}
        isDestructive={true}
        onConfirm={handleFactoryWipeConfirm}
        onCancel={() => setFactoryWipeOpen(false)}
      />
    </div>
  );
};

export default SettingsView;
