import React, { useState } from 'react';
import {
  Gamepad2,
  PlusCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Monitor,
  Cpu,
  Layers,
  FolderOpen,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { InstalledGame } from '@/types/electron';
import { Switch } from '@/components/common/Switch';

interface PerGameSettingsProps {
  games: InstalledGame[];
  onScanGames: () => Promise<void>;
  onToggleSetting: (
    exePath: string,
    exeName: string,
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority',
    enabled: boolean
  ) => Promise<void>;
  onAddGame: () => Promise<void>;
}

export const PerGameSettings: React.FC<PerGameSettingsProps> = ({
  games,
  onScanGames,
  onToggleSetting,
  onAddGame,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [busyGameSetting, setBusyGameSetting] = useState<string | null>(null);

  const handleScan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsScanning(true);
    try {
      await onScanGames();
    } finally {
      setIsScanning(false);
    }
  };

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onAddGame();
  };

  const handleToggle = async (
    game: InstalledGame,
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority',
    currentValue: boolean
  ) => {
    const key = `${game.id}-${setting}`;
    setBusyGameSetting(key);
    try {
      await onToggleSetting(game.exePath, game.exeName, setting, !currentValue);
    } finally {
      setBusyGameSetting(null);
    }
  };

  const getPlatformBadge = (platform: InstalledGame['platform']) => {
    switch (platform) {
      case 'steam':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 border border-blue-500/30 text-blue-400">
            Steam
          </span>
        );
      case 'epic':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
            Epic Games
          </span>
        );
      case 'gog':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 border border-purple-500/30 text-purple-300">
            GOG Galaxy
          </span>
        );
      case 'custom':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            Custom
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-100">E. Per-Game Settings</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Safe
              </span>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                {games.length} {games.length === 1 ? 'Game' : 'Games'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure GPU preference, Fullscreen Optimizations, and CPU priority for each game executable.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Game .exe</span>
          </button>

          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan Libraries'}</span>
          </button>

          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4">
          {games.length === 0 ? (
            <div className="py-10 text-center space-y-3 bg-slate-900/30 rounded-xl border border-slate-800/60 p-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto">
                <Gamepad2 className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-bold text-slate-200">No Games Detected Yet</h3>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Click "Scan Libraries" to automatically discover Steam and Epic Games, or use "Add Game .exe" to browse to any custom game.
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleScan}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Scan Libraries Now
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {games.map((game) => {
                return (
                  <div
                    key={game.id}
                    className="rounded-xl p-4 bg-slate-900/70 border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3 shadow-sm"
                  >
                    {/* Game Title & Platform Header */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-100 truncate" title={game.name}>
                            {game.name}
                          </h4>
                          <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5" title={game.exePath}>
                            {game.exePath}
                          </p>
                        </div>
                        {getPlatformBadge(game.platform)}
                      </div>
                    </div>

                    {/* 3 Interactive Tweak Rows */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/60 text-xs">
                      {/* 1. Force Discrete GPU */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/60">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-slate-200 block text-[11px]">
                            High-Performance GPU
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            Forces dedicated GPU (GpuPreference=2)
                          </span>
                        </div>
                        <Switch
                          size="sm"
                          checked={Boolean(game.gpuPreference)}
                          onChange={() => handleToggle(game, 'gpu_preference', game.gpuPreference)}
                          disabled={busyGameSetting !== null}
                          isLoading={busyGameSetting === `${game.id}-gpu_preference`}
                          colorScheme="blue"
                          ariaLabel={`Force High-Performance GPU for ${game.name}`}
                        />
                      </div>

                      {/* 2. Disable Fullscreen Optimizations */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/60">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-slate-200 block text-[11px]">
                            Disable Fullscreen Optimizations
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            Bypasses DWM compositor for lower frame lag
                          </span>
                        </div>
                        <Switch
                          size="sm"
                          checked={Boolean(game.disableFullscreenOptimizations)}
                          onChange={() => handleToggle(game, 'disable_fso', game.disableFullscreenOptimizations)}
                          disabled={busyGameSetting !== null}
                          isLoading={busyGameSetting === `${game.id}-disable_fso`}
                          colorScheme="blue"
                          ariaLabel={`Disable Fullscreen Optimizations for ${game.name}`}
                        />
                      </div>

                      {/* 3. High CPU Priority Class */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800/60">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-slate-200 block text-[11px]">
                            High CPU Priority Class
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            IFEO High Priority for thread scheduling
                          </span>
                        </div>
                        <Switch
                          size="sm"
                          checked={Boolean(game.highCpuPriority)}
                          onChange={() => handleToggle(game, 'high_priority', game.highCpuPriority)}
                          disabled={busyGameSetting !== null}
                          isLoading={busyGameSetting === `${game.id}-high_priority`}
                          colorScheme="blue"
                          ariaLabel={`High CPU Priority for ${game.name}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
