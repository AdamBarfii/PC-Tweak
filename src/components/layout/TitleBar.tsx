import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Minus,
  Square,
  Copy,
  X,
  ShieldCheck,
  ShieldAlert,
  Moon,
  Sun,
  Languages,
  Zap,
} from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useUIStore } from '@/stores/uiStore';
import { setAppLanguage } from '@/i18n';
import { CompetitiveSafeToggle } from '@/features/anticheat/components/CompetitiveSafeToggle';

export const TitleBar: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme, systemInfo, metrics, isMaximized, setIsMaximized } =
    useUIStore();

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = async () => {
    await window.electronAPI?.maximizeWindow();
    const max = await window.electronAPI?.isMaximized();
    setIsMaximized(max);
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  const handleToggleLang = () => {
    const nextLang = i18n.language === 'en' ? 'fa' : 'en';
    setAppLanguage(nextLang);
  };

  const handleRequestElevation = () => {
    window.electronAPI?.requestElevation();
  };

  return (
    <header className="h-10 w-full flex items-center justify-between px-3.5 bg-card/90 backdrop-blur-xl border-b border-white/10 dark:border-white/5 text-foreground app-drag-region select-none relative z-50">
      {/* Left: Brand Logo + App Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src={appLogo}
            alt="PC Tweak"
            className="w-5 h-5 object-contain filter drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]"
          />
          <span className="font-bold text-xs tracking-wider text-foreground">
            PC Tweak
          </span>
        </div>
      </div>

      {/* Right: Status Pill, Language, Theme & Window Controls */}
      <div className="flex items-center gap-1.5 no-drag">
        {/* Anti-Cheat Competitive-Safe Mode Pill */}
        <CompetitiveSafeToggle />

        {/* Real-time Hardware Metrics Pills matching reference UI */}
        <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] me-1">
          <div className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-cyan-300">
            <span className="text-muted-foreground me-1 font-sans">CPU</span>
            <span className="font-bold">{metrics.cpuUsage}%</span>
          </div>

          <div className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-emerald-300">
            <span className="text-muted-foreground me-1 font-sans">GPU</span>
            <span className="font-bold">
              {metrics.gpuTemp !== null
                ? `${metrics.gpuTemp}°C`
                : `${metrics.gpuLoad !== null ? metrics.gpuLoad : 0}%`}
            </span>
          </div>

          <div className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-purple-300">
            <span className="text-muted-foreground me-1 font-sans">RAM</span>
            <span className="font-bold">{metrics.memoryUsedGb} GB</span>
          </div>
        </div>

        {/* Language Switcher */}
        <button
          type="button"
          onClick={handleToggleLang}
          aria-label={i18n.language === 'en' ? 'Switch to Persian' : 'تغییر زبان به انگلیسی'}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer no-drag focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          title={i18n.language === 'en' ? 'فارسی' : 'English'}
        >
          <Languages className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Dark/Light Mode Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer no-drag focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          title={isDark ? t('settings.light') : t('settings.dark')}
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" aria-hidden="true" />
          )}
        </button>

        {/* Window Control Buttons */}
        <div className="flex items-center ms-2 border-s border-border ps-1 no-drag">
          <button
            type="button"
            onClick={handleMinimize}
            aria-label={t('window.minimize', 'Minimize')}
            className="w-9 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer no-drag focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            title={t('window.minimize', 'Minimize')}
          >
            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            aria-label={isMaximized ? t('window.restore', 'Restore window') : t('window.maximize', 'Maximize window')}
            className="w-9 h-8 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer no-drag focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            title={isMaximized ? t('window.restore') : t('window.maximize')}
          >
            {isMaximized ? (
              <Copy className="w-3 h-3 rotate-180" aria-hidden="true" />
            ) : (
              <Square className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('window.close', 'Close window')}
            className="w-9 h-8 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors cursor-pointer no-drag focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none"
            title={t('window.close')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
