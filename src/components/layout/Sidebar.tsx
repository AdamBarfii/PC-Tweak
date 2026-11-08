import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Zap,
  Gauge,
  MousePointer,
  Gamepad2,
  Wifi,
  Shield,
  RotateCcw,
  SlidersHorizontal,
  Settings,
} from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { NavigationTab, useUIStore } from '@/stores/uiStore';

interface NavItem {
  id: NavigationTab;
  labelKey: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'optimizer', labelKey: 'nav.optimizer', icon: Zap },
  { id: 'overclock', labelKey: 'nav.overclock', icon: Gauge },
  { id: 'inputlab', labelKey: 'nav.inputlab', icon: MousePointer },
  { id: 'gaming', labelKey: 'nav.gaming', icon: Gamepad2 },
  { id: 'network', labelKey: 'nav.network', icon: Wifi },
  { id: 'backup', labelKey: 'nav.backup', icon: RotateCcw },
  { id: 'privacy', labelKey: 'nav.privacy', icon: Shield },
  { id: 'profiles', labelKey: 'nav.profiles', icon: SlidersHorizontal },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, systemInfo } = useUIStore();

  const osVersionLabel = React.useMemo(() => {
    let name = systemInfo?.osName || 'Windows 11 Pro';
    const buildStr = systemInfo?.osBuild || '';
    const buildNum = parseInt(buildStr, 10);
    if (!isNaN(buildNum) && buildNum >= 22000 && name.includes('Windows 10')) {
      name = name.replace('Windows 10', 'Windows 11');
    }
    if (buildStr.includes('26100') || buildNum >= 26100) return 'Windows 11 24H2';
    if (buildStr.includes('22631') || buildStr.includes('22621')) return 'Windows 11 23H2';
    return `${name} ${buildStr ? `(${buildStr})` : ''}`;
  }, [systemInfo]);

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col justify-between p-3.5 border-e border-white/10 dark:border-white/5 bg-card/80 backdrop-blur-2xl select-none relative overflow-hidden"
      aria-label="Sidebar"
    >
      <div className="space-y-4 relative z-10">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center p-1.5 shadow-[0_0_15px_rgba(0,240,255,0.35)]">
            <img src={appLogo} alt="PC Tweak" className="w-full h-full object-contain filter drop-shadow-[0_0_6px_#00f0ff]" />
          </div>
          <span className="font-extrabold text-sm tracking-wide text-foreground">
            PC Tweak
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => !item.disabled && setActiveTab(item.id)}
                disabled={item.disabled}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
                  item.disabled
                    ? 'opacity-35 cursor-not-allowed text-muted-foreground'
                    : isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/80 shadow-[0_0_18px_rgba(0,240,255,0.35)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-muted-foreground'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(item.labelKey)}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] uppercase tracking-wider font-mono font-bold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-white/10">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="relative pt-2 space-y-3 z-10">
        {/* Windows OS Info Badge */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center gap-3 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center p-1.5 flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.3)]">
            <img
              src={appLogo}
              alt="PC Tweak"
              className="w-full h-full object-contain filter drop-shadow-[0_0_4px_#00f0ff]"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">PC Tweak v1.0.0</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{osVersionLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
