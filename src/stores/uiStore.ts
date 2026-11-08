import { create } from 'zustand';
import { SystemInfo, SystemMetrics } from '@/types/electron';

export type NavigationTab =
  | 'dashboard'
  | 'overclock'
  | 'optimizer'
  | 'inputlab'
  | 'gaming'
  | 'network'
  | 'privacy'
  | 'backup'
  | 'profiles'
  | 'settings';

interface UIState {
  activeTab: NavigationTab;
  isDark: boolean;
  systemInfo: SystemInfo | null;
  metrics: SystemMetrics;
  isMaximized: boolean;
  tweakChangeVersion: number;
  setActiveTab: (tab: NavigationTab) => void;
  toggleTheme: () => void;
  setSystemInfo: (info: SystemInfo) => void;
  setMetrics: (metrics: SystemMetrics) => void;
  setIsMaximized: (val: boolean) => void;
  notifyTweakChanged: () => void;
}

const savedTheme = localStorage.getItem('pctweak_theme') || 'dark';

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'dashboard',
  isDark: savedTheme === 'dark',
  systemInfo: null,
  tweakChangeVersion: 0,
  metrics: {
    cpuUsage: 0,
    cpuSpeedGhz: null,
    memoryUsedGb: 0,
    memoryTotalGb: 0,
    memoryPercentage: 0,
    gpuLoad: null,
    gpuTemp: null,
    gpuModel: null,
    diskReadMb: 0,
    diskWriteMb: 0,
    uptimeSeconds: 0,
  },
  isMaximized: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  notifyTweakChanged: () => set((state) => ({ tweakChangeVersion: state.tweakChangeVersion + 1 })),
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDark;
      localStorage.setItem('pctweak_theme', next ? 'dark' : 'light');
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { isDark: next };
    }),
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setMetrics: (metrics) => set({ metrics }),
  setIsMaximized: (isMaximized) => set({ isMaximized }),
}));
