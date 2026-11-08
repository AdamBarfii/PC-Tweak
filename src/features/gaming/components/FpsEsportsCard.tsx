import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Cpu,
  Zap,
  Network,
  ShieldCheck,
  RefreshCw,
  Plus,
  Check,
  RotateCcw,
  AlertCircle,
  Gamepad2,
  X,
  Sliders,
} from 'lucide-react';
import type { CpuTopologyInfo, FpsGameProfile, RunningProcessItem } from '@/types/electron';
import { Switch } from '@/components/common/Switch';

interface FpsEsportsCardProps {
  onNotify?: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const FpsEsportsCard: React.FC<FpsEsportsCardProps> = ({ onNotify }) => {
  const [topology, setTopology] = useState<CpuTopologyInfo | null>(null);
  const [profiles, setProfiles] = useState<FpsGameProfile[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<RunningProcessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeActionExe, setActiveActionExe] = useState<string | null>(null);

  // Custom Game Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [customExeInput, setCustomExeInput] = useState('');
  const [customExeError, setCustomExeError] = useState<string | null>(null);

  // Track games modified in this session to show "Restart Game to Apply" badge
  const [modifiedExes, setModifiedExes] = useState<Set<string>>(new Set());

  const loadData = async (refreshProcesses = false) => {
    if (refreshProcesses) setScanning(true);
    else setLoading(true);

    try {
      if (window.electronAPI?.getCpuTopology) {
        const topo = await window.electronAPI.getCpuTopology();
        setTopology(topo);
      }

      if (window.electronAPI?.getFpsGameProfiles) {
        const list = await window.electronAPI.getFpsGameProfiles();
        setProfiles(list);
      }

      if (window.electronAPI?.getRunningProcesses) {
        const procs = await window.electronAPI.getRunningProcesses();
        setRunningProcesses(procs);
      }
    } catch (err) {
      console.error('Failed to load FPS optimizer data:', err);
      onNotify?.('Failed to load game profiles or CPU topology.', 'error');
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleTweak = async (
    exeName: string,
    tweakType: 'cpuAffinity' | 'priority' | 'gpuPreference' | 'qosDscp',
    currentVal: boolean
  ) => {
    setActiveActionExe(`${exeName}:${tweakType}`);
    try {
      const res = await window.electronAPI?.applyFpsGameTweak(exeName, tweakType, !currentVal);
      if (res?.success) {
        setProfiles((prev) =>
          prev.map((p) => (p.exeName.toLowerCase() === exeName.toLowerCase() ? res.profile : p))
        );
        setModifiedExes((prev) => new Set(prev).add(exeName.toLowerCase()));
        onNotify?.(res.message, 'success');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update game tweak.', 'error');
    } finally {
      setActiveActionExe(null);
    }
  };

  const handleOptimizeAll = async (exeName: string) => {
    setActiveActionExe(exeName);
    try {
      const res = await window.electronAPI?.optimizeAllForFpsGame(exeName);
      if (res?.success) {
        setProfiles((prev) =>
          prev.map((p) => (p.exeName.toLowerCase() === exeName.toLowerCase() ? res.profile : p))
        );
        setModifiedExes((prev) => new Set(prev).add(exeName.toLowerCase()));
        onNotify?.(res.message, 'success');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to optimize game.', 'error');
    } finally {
      setActiveActionExe(null);
    }
  };

  const handleRevert = async (exeName: string) => {
    setActiveActionExe(exeName);
    try {
      const res = await window.electronAPI?.revertFpsGame(exeName);
      if (res?.success) {
        setProfiles((prev) =>
          prev.map((p) => (p.exeName.toLowerCase() === exeName.toLowerCase() ? res.profile : p))
        );
        setModifiedExes((prev) => {
          const next = new Set(prev);
          next.delete(exeName.toLowerCase());
          return next;
        });
        onNotify?.(res.message, 'success');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to revert game.', 'error');
    } finally {
      setActiveActionExe(null);
    }
  };

  const handleAddCustomGame = async () => {
    const raw = customExeInput.trim();
    if (!raw) return;

    const formatted = raw.endsWith('.exe') ? raw : `${raw}.exe`;
    if (!/^[a-zA-Z0-9_\-\.]+\.exe$/i.test(formatted)) {
      setCustomExeError('Executable name must contain only letters, numbers, hyphens, and dots.');
      return;
    }

    setCustomExeError(null);
    try {
      const res = await window.electronAPI?.optimizeAllForFpsGame(formatted);
      if (res?.success) {
        await loadData(false);
        setModifiedExes((prev) => new Set(prev).add(formatted.toLowerCase()));
        onNotify?.(`Added and optimized ${formatted}.`, 'success');
        setShowAddModal(false);
        setCustomExeInput('');
      }
    } catch (err: any) {
      setCustomExeError(err?.message || 'Failed to add game.');
    }
  };

  const configuredOrShooters = profiles.filter((p) => p.isConfigured || p.isKnownShooter || p.isRunning);

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border p-6 shadow-sm mb-6 transition-all">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">FPS Esports & Shooter Optimizer</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                100% Anti-Cheat Safe
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Eliminate 1% low drops, thread-bouncing micro-stutters, and network queue delay for competitive shooters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => loadData(true)}
            disabled={scanning}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors disabled:opacity-50"
            title="Scan active running processes on the system"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            Scan Processes
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Game .exe
          </button>
        </div>
      </div>

      {/* CPU Topology Banner */}
      {topology && (
        <div className="mt-4 p-3.5 rounded-lg bg-muted/60 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-primary shrink-0" />
            <div>
              <span className="font-semibold text-foreground">{topology.cpuName}</span>
              <span className="text-muted-foreground ml-2">
                ({topology.physicalCores} Cores, {topology.logicalProcessors} Threads)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Recommended Mask:</span>
            <span className="font-mono font-bold px-2 py-0.5 rounded bg-card text-foreground border border-border">
              {topology.recommendedMaskHex}
            </span>
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium text-[11px]">
              {topology.recommendedMode === 'pcores-only'
                ? 'P-Cores Only'
                : topology.recommendedMode === 'vcache-ccd-only'
                ? '3D V-Cache CCD'
                : topology.recommendedMode === 'isolate-core0'
                ? 'Isolate CPU 0'
                : 'All Cores'}
            </span>
          </div>
        </div>
      )}

      {/* Configured / Detected Games List */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
            Scanning running processes and game profiles...
          </div>
        ) : configuredOrShooters.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            No shooter games detected or running. Click "+ Add Game .exe" to configure an executable.
          </div>
        ) : (
          configuredOrShooters.map((game) => {
            const isProcessing = activeActionExe === game.exeName;
            const hasChanges = modifiedExes.has(game.exeName.toLowerCase());

            return (
              <div
                key={game.exeName}
                className={`p-4 rounded-xl border transition-all ${
                  game.isConfigured
                    ? 'bg-card/90 border-primary/30 shadow-sm'
                    : 'bg-muted/30 border-border'
                }`}
              >
                {/* Game Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg border ${
                        game.isRunning
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      <Gamepad2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{game.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">({game.exeName})</span>
                        {game.isRunning && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Running {game.pid ? `(PID ${game.pid})` : ''}
                          </span>
                        )}
                        {game.isConfigured && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            Optimized
                          </span>
                        )}
                      </div>
                      {hasChanges && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-500 mt-1 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Restart game executable for Windows registry optimizations to take effect.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleOptimizeAll(game.exeName)}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Optimize All
                    </button>
                    {game.isConfigured && (
                      <button
                        onClick={() => handleRevert(game.exeName)}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border transition-colors disabled:opacity-50"
                        title="Revert all registry optimizations for this game"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Revert
                      </button>
                    )}
                  </div>
                </div>

                {/* 3 Pillar Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
                  {/* Pillar 1: CPU Core Affinity */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/80">
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-foreground">CPU Core Affinity</div>
                        <div className="text-[11px] text-muted-foreground">
                          {game.cpuAffinityEnabled
                            ? `Active (${game.cpuAffinityMaskHex || topology?.recommendedMaskHex || 'P-Cores'})`
                            : 'All Cores (Default)'}
                        </div>
                      </div>
                    </div>
                    <Switch
                      size="sm"
                      checked={game.cpuAffinityEnabled}
                      isLoading={activeActionExe === `${game.exeName}:cpuAffinity` || activeActionExe === game.exeName}
                      disabled={Boolean(activeActionExe)}
                      onChange={() => handleToggleTweak(game.exeName, 'cpuAffinity', game.cpuAffinityEnabled)}
                      ariaLabel="Toggle CPU Core Affinity"
                    />
                  </div>

                  {/* Pillar 2: Process & GPU Priority */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/80">
                    <div className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-foreground">Priority & Discrete GPU</div>
                        <div className="text-[11px] text-muted-foreground">
                          {game.priorityEnabled ? 'High CPU + Discrete GPU' : 'Normal / Windows Default'}
                        </div>
                      </div>
                    </div>
                    <Switch
                      size="sm"
                      checked={game.priorityEnabled}
                      isLoading={
                        activeActionExe === `${game.exeName}:priority` ||
                        activeActionExe === `${game.exeName}:gpuPreference` ||
                        activeActionExe === game.exeName
                      }
                      disabled={Boolean(activeActionExe)}
                      onChange={() => {
                        handleToggleTweak(game.exeName, 'priority', game.priorityEnabled);
                        handleToggleTweak(game.exeName, 'gpuPreference', game.gpuPreferenceEnabled);
                      }}
                      ariaLabel="Toggle Priority & Discrete GPU"
                    />
                  </div>

                  {/* Pillar 3: QoS DSCP 46 */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/80">
                    <div className="flex items-center gap-2.5">
                      <Network className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-foreground">QoS DSCP 46 Queuing</div>
                        <div className="text-[11px] text-muted-foreground">
                          {game.qosDscpEnabled ? 'Expedited Forwarding (UDP)' : 'Best Effort (Default)'}
                        </div>
                      </div>
                    </div>
                    <Switch
                      size="sm"
                      checked={game.qosDscpEnabled}
                      isLoading={activeActionExe === `${game.exeName}:qosDscp` || activeActionExe === game.exeName}
                      disabled={Boolean(activeActionExe)}
                      onChange={() => handleToggleTweak(game.exeName, 'qosDscp', game.qosDscpEnabled)}
                      ariaLabel="Toggle QoS DSCP 46"
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Running Process Quick-Add Chips */}
      {runningProcesses.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-foreground">Active Running Processes (Click to Optimize):</span>
            <span className="text-[11px] text-muted-foreground">{runningProcesses.length} processes detected</span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
            {runningProcesses.slice(0, 20).map((proc) => {
              const isAlreadyConfigured = profiles.some(
                (p) => p.exeName.toLowerCase() === proc.exeName.toLowerCase() && p.isConfigured
              );

              return (
                <button
                  key={proc.exeName}
                  onClick={() => handleOptimizeAll(proc.exeName)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    isAlreadyConfigured
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border-border'
                  }`}
                  title={`Optimize ${proc.displayName} (${proc.exeName}) - ${proc.memoryUsage}`}
                >
                  <Gamepad2 className="w-3 h-3" />
                  <span>{proc.exeName}</span>
                  {proc.isKnownShooter && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Custom Game Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card text-card-foreground border border-border rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base">Add Custom Game Executable</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setCustomExeError(null);
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter the exact game executable filename (e.g. <code>cs2.exe</code>, <code>r5apex.exe</code>). All 3
                optimization pillars will be applied automatically.
              </p>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Executable Name</label>
                <input
                  type="text"
                  placeholder="e.g. cs2.exe"
                  value={customExeInput}
                  onChange={(e) => {
                    setCustomExeInput(e.target.value);
                    setCustomExeError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomGame()}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
                {customExeError && <p className="text-xs text-red-500 mt-1.5">{customExeError}</p>}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setCustomExeError(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomGame}
                disabled={!customExeInput.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
              >
                Add & Optimize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
