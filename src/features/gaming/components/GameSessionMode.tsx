import React, { useState, useEffect } from 'react';
import {
  Zap,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  BellOff,
  BatteryCharging,
  Play,
  Square,
  CheckCircle2,
  Clock,
  Gamepad2,
} from 'lucide-react';
import { GameSessionStatus, GameSessionConfig } from '@/types/electron';

interface GameSessionModeProps {
  onNotify?: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const GameSessionMode: React.FC<GameSessionModeProps> = ({ onNotify }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [status, setStatus] = useState<GameSessionStatus | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadStatus = async () => {
    if (!window.electronAPI?.getGameSessionStatus) return;
    try {
      const res = await window.electronAPI.getGameSessionStatus();
      setStatus(res);
    } catch (err) {
      console.error('Failed to load game session status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
    // Poll session status periodically
    const timer = setInterval(loadStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleConfig = async (key: keyof GameSessionConfig, value: boolean) => {
    if (!window.electronAPI?.updateGameSessionConfig || !status) return;
    setIsBusy(true);
    try {
      const updated = await window.electronAPI.updateGameSessionConfig({ [key]: value });
      setStatus(updated);
      onNotify?.(`Updated Game Session: ${key} ${value ? 'enabled' : 'disabled'}.`, 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update configuration', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTriggerManual = async (gameName = 'Simulated-Game.exe') => {
    if (!window.electronAPI?.triggerGameSession) return;
    setIsBusy(true);
    try {
      const updated = await window.electronAPI.triggerGameSession(gameName);
      setStatus(updated);
      onNotify?.(`Game Session manually activated for ${gameName}. Background apps throttled and power plan switched.`, 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to trigger session', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleEndManual = async () => {
    if (!window.electronAPI?.endGameSession) return;
    setIsBusy(true);
    try {
      const updated = await window.electronAPI.endGameSession();
      setStatus(updated);
      onNotify?.('Game Session ended. Restored original power plan and background process priorities.', 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to end session', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const config = status?.config;
  const isActive = status?.isActive || false;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`p-2 rounded-xl border transition-all ${
              isActive
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">G. Game Session Mode</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Safe
              </span>

              {isActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Active: {status?.activeGame}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically apply settings when a game starts.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-5">
          {/* Active Session Alert Banner */}
          {isActive ? (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <div>
                  <h3 className="text-xs font-bold text-emerald-300">
                    Game Session Active: {status?.activeGame}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Throttled {status?.throttledProcessCount || 0} non-essential background processes to Idle priority. Notifications silenced.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEndManual}
                disabled={isBusy}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-600/80 hover:bg-red-500 text-white flex items-center gap-1.5 shadow-md transition-all cursor-pointer flex-shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>End Session</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-xs text-slate-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  Background Watcher Active. When you launch any configured game, optimizations engage automatically.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTriggerManual('CS2.exe')}
                disabled={isBusy}
                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0"
              >
                <Play className="w-3 h-3" />
                <span>Test Session</span>
              </button>
            </div>
          )}

          {/* Config Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. Master Enable */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Enable Game Session Mode</h4>
                  <p className="text-[11px] text-slate-400">
                    Auto-detects launched games every 3 seconds.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.enabled ?? true}
                onChange={(e) => handleToggleConfig('enabled', e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* 2. Power Plan Auto-Switch */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <BatteryCharging className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Switch to Gaming Power Plan</h4>
                  <p className="text-[11px] text-slate-400">
                    Activates PC Tweak Gaming or Ultimate Performance.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.autoSwitchPowerPlan ?? true}
                onChange={(e) => handleToggleConfig('autoSwitchPowerPlan', e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-950 border-slate-700 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {/* 3. Throttle Background Apps */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Throttle Background Apps</h4>
                  <p className="text-[11px] text-slate-400">
                    Lowers Chrome, Discord, and Spotify to Idle priority.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.throttleBackgroundApps ?? true}
                onChange={(e) => handleToggleConfig('throttleBackgroundApps', e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-purple-600 bg-slate-950 border-slate-700 focus:ring-purple-500 cursor-pointer"
              />
            </div>

            {/* 4. Focus Assist / Suppress Toasts */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <BellOff className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Focus Assist (Do Not Disturb)</h4>
                  <p className="text-[11px] text-slate-400">
                    Mutes Windows popup notifications while playing.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.focusAssist ?? true}
                onChange={(e) => handleToggleConfig('focusAssist', e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-amber-600 bg-slate-950 border-slate-700 focus:ring-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Monitored Games Badges */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Monitored Game Executables ({config?.monitoredProcesses?.length || 0})</span>
              </span>
              <span className="text-[11px] text-slate-500">Auto-detected from Steam & Epic Games</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {config?.monitoredProcesses?.map((exe) => (
                <span
                  key={exe}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-300"
                >
                  {exe}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
