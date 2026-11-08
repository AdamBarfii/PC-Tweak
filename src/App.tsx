import React, { useEffect, useState } from 'react';
import { TitleBar } from '@/components/layout/TitleBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { OptimizerView } from '@/views/OptimizerView';
import { OverclockView } from '@/features/overclock/OverclockView';
import { BackupView } from '@/features/backup/BackupView';
import { InputLabView } from '@/features/inputlab/InputLabView';
import { GamingView } from '@/features/gaming/GamingView';
import { NetworkView } from '@/features/network/NetworkView';
import { PrivacyView } from '@/views/PrivacyView';
import { ProfilesView } from '@/views/ProfilesView';
import { SettingsView } from '@/views/SettingsView';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from 'react-i18next';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, setSystemInfo, setMetrics, isDark } = useUIStore();

  // Track mounted tabs to preserve DOM state across tab switches (0ms instant navigation)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([activeTab || 'dashboard']));

  useEffect(() => {
    // Initial theme sync
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Fetch initial system info and telemetry
    if (window.electronAPI) {
      window.electronAPI.getSystemInfo().then(setSystemInfo);
      window.electronAPI.getSystemMetrics().then(setMetrics);

      // Subscribe to real-time metrics stream
      const unsubscribe = window.electronAPI.onMetricsUpdate((updatedMetrics) => {
        setMetrics(updatedMetrics);
      });

      // Subscribe to tray or external navigation events
      const unsubscribeNav = window.electronAPI.onNavigate?.((tab) => {
        if (tab) {
          setActiveTab(tab as any);
        }
      });

      return () => {
        unsubscribe?.();
        unsubscribeNav?.();
      };
    }
  }, [isDark, setSystemInfo, setMetrics, setActiveTab]);

  // Ensure current active tab is always added to mounted set immediately
  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Background idle preloading: after Dashboard mounts and thread is idle,
  // quietly mount other views so even the user's first click is instant 0ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setMountedTabs(
        new Set([
          'dashboard',
          'optimizer',
          'overclock',
          'inputlab',
          'gaming',
          'network',
          'backup',
          'privacy',
          'profiles',
          'settings',
        ])
      );
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden ambient-cockpit-bg text-foreground font-sans">
      {/* Windows 11 TitleBar */}
      <TitleBar />

      {/* Main App Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Dynamic Content View Area with DOM preservation */}
        <main className="flex-1 overflow-y-auto p-6 bg-transparent">
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            {mountedTabs.has('dashboard') && <DashboardView />}
          </div>
          <div style={{ display: activeTab === 'optimizer' ? 'block' : 'none' }}>
            {mountedTabs.has('optimizer') && <OptimizerView />}
          </div>
          <div style={{ display: activeTab === 'overclock' ? 'block' : 'none' }}>
            {mountedTabs.has('overclock') && <OverclockView />}
          </div>
          <div style={{ display: activeTab === 'inputlab' ? 'block' : 'none' }}>
            {mountedTabs.has('inputlab') && <InputLabView />}
          </div>
          <div style={{ display: activeTab === 'gaming' ? 'block' : 'none' }}>
            {mountedTabs.has('gaming') && <GamingView />}
          </div>
          <div style={{ display: activeTab === 'network' ? 'block' : 'none' }}>
            {mountedTabs.has('network') && <NetworkView />}
          </div>
          <div style={{ display: activeTab === 'backup' ? 'block' : 'none' }}>
            {mountedTabs.has('backup') && <BackupView />}
          </div>
          <div style={{ display: activeTab === 'privacy' ? 'block' : 'none' }}>
            {mountedTabs.has('privacy') && <PrivacyView />}
          </div>
          <div style={{ display: activeTab === 'profiles' ? 'block' : 'none' }}>
            {mountedTabs.has('profiles') && <ProfilesView />}
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            {mountedTabs.has('settings') && <SettingsView />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
