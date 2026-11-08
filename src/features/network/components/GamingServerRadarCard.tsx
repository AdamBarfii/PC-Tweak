import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  Play,
  RotateCw,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Sparkles,
  X,
  TrendingDown,
  Globe,
  Gauge,
  Flame,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GameServerDefinition,
  GameServerBenchmarkResult,
  NetworkSample,
  NetworkTestSummary,
} from '@/types/electron';

interface GamingServerRadarCardProps {
  adapterName?: string;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const GamingServerRadarCard: React.FC<GamingServerRadarCardProps> = ({
  adapterName,
  onNotify,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [servers, setServers] = useState<GameServerDefinition[]>([]);
  const [benchmarkResults, setBenchmarkResults] = useState<Map<string, GameServerBenchmarkResult>>(
    new Map()
  );
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [activeGameFilter, setActiveGameFilter] = useState<string>('all');
  const [activeRegionFilter, setActiveRegionFilter] = useState<string>('all');
  const [optimizingId, setOptimizingId] = useState<string | null>(null);

  // Stability Monitor Modal State
  const [monitoringServer, setMonitoringServer] = useState<GameServerDefinition | null>(null);
  const [monitorSamples, setMonitorSamples] = useState<NetworkSample[]>([]);
  const [monitorCountdown, setMonitorCountdown] = useState(10);
  const [monitorSummary, setMonitorSummary] = useState<NetworkTestSummary | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load server catalog on mount
  useEffect(() => {
    if (window.electronAPI?.getGameServers) {
      window.electronAPI.getGameServers().then((list) => {
        setServers(list || []);
      });
    }
  }, []);

  // Subscribe to real-time benchmark progress
  useEffect(() => {
    if (!window.electronAPI?.onGameServerBenchmarkProgress) return;
    const unsubscribe = window.electronAPI.onGameServerBenchmarkProgress((result) => {
      setBenchmarkResults((prev) => {
        const next = new Map(prev);
        next.set(result.id, result);
        return next;
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  // Subscribe to stability monitor samples
  useEffect(() => {
    if (!monitoringServer || !window.electronAPI?.onGameServerMonitorSample) return;
    const unsubscribe = window.electronAPI.onGameServerMonitorSample((sample) => {
      setMonitorSamples((prev) => [...prev.slice(-30), sample]);
    });
    return () => {
      unsubscribe?.();
    };
  }, [monitoringServer]);

  // Render canvas oscilloscope for the stability monitor
  useEffect(() => {
    if (!canvasRef.current || monitorSamples.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 20; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const rtts = monitorSamples.map((s) => s.rtt ?? 200);
    const min = Math.max(0, Math.min(...rtts) - 10);
    const max = Math.max(100, Math.max(...rtts) + 20);
    const step = width / (monitorSamples.length - 1);

    // Waveform line
    ctx.beginPath();
    monitorSamples.forEach((sample, i) => {
      const x = i * step;
      const val = sample.rtt ?? max;
      const y = height - ((val - min) / (max - min || 1)) * (height - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Pulse dots on points
    ctx.shadowBlur = 0;
    monitorSamples.forEach((sample, i) => {
      const x = i * step;
      const val = sample.rtt ?? max;
      const y = height - ((val - min) / (max - min || 1)) * (height - 20) - 10;
      ctx.fillStyle = sample.rtt !== null ? '#10B981' : '#EF4444';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [monitorSamples]);

  // Run full benchmark across all servers or active game filter
  const handleBenchmark = async () => {
    if (isBenchmarking || !window.electronAPI?.benchmarkGameServers) return;
    setIsBenchmarking(true);
    setBenchmarkResults(new Map());
    try {
      const res = await window.electronAPI.benchmarkGameServers(
        activeGameFilter === 'all' ? undefined : activeGameFilter
      );
      const resMap = new Map<string, GameServerBenchmarkResult>();
      res.forEach((r) => resMap.set(r.id, r));
      setBenchmarkResults(resMap);
      onNotify('Game server benchmark completed successfully.', 'success');
    } catch (err: any) {
      onNotify(`Benchmark error: ${err.message}`, 'error');
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Launch 10-second stability monitor for a specific node
  const handleStartMonitor = async (server: GameServerDefinition) => {
    setMonitoringServer(server);
    setMonitorSamples([]);
    setMonitorSummary(null);
    setMonitorCountdown(10);

    const timer = setInterval(() => {
      setMonitorCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      if (window.electronAPI?.monitorGameServer) {
        const summary = await window.electronAPI.monitorGameServer({
          serverId: server.id,
          durationSeconds: 10,
        });
        setMonitorSummary(summary);
      }
    } catch (err: any) {
      onNotify(`Monitor error: ${err.message}`, 'error');
    } finally {
      clearInterval(timer);
    }
  };

  // 1-Click Route & MTU Optimizer
  const handleOptimizeRoute = async (server: GameServerDefinition) => {
    setOptimizingId(server.id);
    try {
      if (window.electronAPI?.optimizeGameRoute) {
        const res = await window.electronAPI.optimizeGameRoute({
          gameId: server.gameId,
          serverId: server.id,
          adapterName: adapterName || 'Ethernet',
        });
        if (res.success) {
          onNotify(res.message, 'success');
        } else {
          onNotify(res.message, 'error');
        }
      }
    } catch (err: any) {
      onNotify(`Optimization failed: ${err.message}`, 'error');
    } finally {
      setOptimizingId(null);
    }
  };

  // Filtered servers
  const filteredServers = servers.filter((s) => {
    const matchesGame = activeGameFilter === 'all' || s.gameId === activeGameFilter;
    const matchesRegion = activeRegionFilter === 'all' || s.regionId === activeRegionFilter;
    return matchesGame && matchesRegion;
  });

  const getLatencyColor = (rtt: number | null) => {
    if (rtt === null) return 'text-muted-foreground';
    if (rtt < 50) return 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    if (rtt < 80) return 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]';
    if (rtt < 120) return 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]';
    return 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]';
  };

  const getLatencyBadgeBg = (rtt: number | null) => {
    if (rtt === null) return 'bg-muted/40 border-white/10 text-muted-foreground';
    if (rtt < 50) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
    if (rtt < 80) return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400';
    if (rtt < 120) return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
    return 'bg-rose-500/15 border-rose-500/30 text-rose-400';
  };

  const games = [
    { id: 'all', label: 'All Games' },
    { id: 'valorant', label: 'Valorant' },
    { id: 'cs2', label: 'CS2' },
    { id: 'fortnite', label: 'Fortnite' },
    { id: 'apex', label: 'Apex Legends' },
    { id: 'warzone', label: 'Warzone' },
  ];

  const regions = [
    { id: 'all', label: 'All Regions' },
    { id: 'europe', label: 'Europe' },
    { id: 'middle_east', label: 'Middle East' },
    { id: 'north_america', label: 'North America' },
  ];

  return (
    <div className="rounded-xl glass-panel-elevated p-5 space-y-5 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.36)] text-card-foreground">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground tracking-tight">
                {isRtl ? 'رادار پینگ و مسیر سرورهای بازی' : 'Gaming Server Radar & Latency Matrix'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Hybrid ICMP + TCP
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isRtl
                ? 'آزمون پینگ مستقیم، جیتر و پکت لاس به سرورهای رسمی بازی‌ها در اروپا، خاورمیانه و آمریکا'
                : 'Direct latency, RFC 3550 jitter, and packet loss benchmarking to official game edge relays'}
            </p>
          </div>
        </div>

        {/* Benchmark Action Button */}
        <button
          type="button"
          onClick={handleBenchmark}
          disabled={isBenchmarking}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(0,240,255,0.35)] hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBenchmarking ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isBenchmarking ? (isRtl ? 'در حال پایش...' : 'Benchmarking Nodes...') : (isRtl ? 'آزمون پینگ سرورها' : 'Benchmark All Nodes')}</span>
        </button>
      </div>

      {/* Filter Controls: Game Selector & Region Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Game Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {games.map((g) => {
            const isActive = activeGameFilter === g.id;
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => setActiveGameFilter(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Region Pills */}
        <div className="flex items-center gap-1.5">
          {regions.map((r) => {
            const isActive = activeRegionFilter === r.id;
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => setActiveRegionFilter(r.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03] border border-white/5'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Server Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredServers.map((server) => {
          const result = benchmarkResults.get(server.id);
          const hasTested = result !== undefined;
          const rtt = result ? result.rtt : null;
          const jitter = result ? result.jitter : null;
          const isBest = result?.isBestRoute;
          const isOptimizing = optimizingId === server.id;

          return (
            <div
              key={server.id}
              className={`p-3.5 rounded-xl transition-all duration-200 relative flex flex-col justify-between gap-3 ${
                isBest
                  ? 'bg-gradient-to-br from-emerald-500/10 via-card/80 to-card border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'bg-card/50 backdrop-blur-md border border-white/5 hover:border-cyan-500/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
              }`}
            >
              {/* Card Top: Game Badge, Region, and Best Route tag */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground tracking-wide">
                      {server.game}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground border border-white/5">
                      {server.region}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    <span>{server.location}</span>
                  </p>
                </div>

                {isBest && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Best Route</span>
                  </span>
                )}
              </div>

              {/* Latency & Telemetry Metric Section */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/25 border border-white/5">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                    Latency
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-mono font-black ${getLatencyColor(rtt)}`}>
                      {hasTested ? (rtt !== null ? `${rtt}` : 'Offline') : '--'}
                    </span>
                    {rtt !== null && <span className="text-[11px] font-mono text-muted-foreground">ms</span>}
                  </div>
                </div>

                <div className="text-end space-y-1">
                  <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-end gap-1">
                    <span>Jitter:</span>
                    <strong className="text-foreground">
                      {hasTested && jitter !== null ? `±${jitter}ms` : '--'}
                    </strong>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-end gap-1">
                    <span>Loss:</span>
                    <strong className={result?.packetLossPercent ? 'text-rose-400' : 'text-emerald-400'}>
                      {hasTested ? `${result?.packetLossPercent}%` : '--'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center gap-2 pt-1">
                {/* 10s Stability Monitor Button */}
                <button
                  type="button"
                  onClick={() => handleStartMonitor(server)}
                  className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  title="Run real-time 10-second stability check with live waveform"
                >
                  <Activity className="w-3 h-3 text-cyan-400" />
                  <span>{isRtl ? 'پایش نوسان' : 'Stability'}</span>
                </button>

                {/* 1-Click Route & MTU Optimizer Button */}
                <button
                  type="button"
                  onClick={() => handleOptimizeRoute(server)}
                  disabled={isOptimizing}
                  className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="Apply TCP NoDelay, optimal MTU, and fast gaming DNS for this route"
                >
                  {isOptimizing ? (
                    <RotateCw className="w-3 h-3 animate-spin text-cyan-400" />
                  ) : (
                    <Zap className="w-3 h-3 text-cyan-400 fill-current" />
                  )}
                  <span>{isRtl ? 'بهینه‌سازی مسیر' : 'Optimize'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stability Monitor Oscilloscope Modal */}
      {monitoringServer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-card border border-cyan-500/40 p-6 shadow-2xl space-y-4 text-card-foreground animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Activity className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {monitoringServer.game} &bull; {monitoringServer.location}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Node: {monitoringServer.host} ({monitoringServer.provider})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">
                  {monitorCountdown > 0 ? `${monitorCountdown}s remaining` : 'Finished'}
                </span>
                <button
                  type="button"
                  onClick={() => setMonitoringServer(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Canvas Live Oscilloscope */}
            <div className="relative rounded-lg bg-black/50 border border-white/10 p-2 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={460}
                height={140}
                className="w-full h-36 block"
              />
              <div className="absolute top-2 start-3 text-[10px] font-mono text-cyan-400/80">
                Live RTT Waveform (1s sampling)
              </div>
            </div>

            {/* Live Stats Row */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-[9px] uppercase font-mono text-muted-foreground block">Latest</span>
                <span className="text-sm font-mono font-bold text-cyan-400">
                  {monitorSamples.length > 0 && monitorSamples[monitorSamples.length - 1].rtt !== null
                    ? `${monitorSamples[monitorSamples.length - 1].rtt}ms`
                    : '--'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-[9px] uppercase font-mono text-muted-foreground block">Min</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {monitorSummary ? `${monitorSummary.minRtt}ms` : '--'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-[9px] uppercase font-mono text-muted-foreground block">Avg</span>
                <span className="text-sm font-mono font-bold text-foreground">
                  {monitorSummary ? `${monitorSummary.avgRtt}ms` : '--'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                <span className="text-[9px] uppercase font-mono text-muted-foreground block">Jitter</span>
                <span className="text-sm font-mono font-bold text-purple-400">
                  {monitorSummary ? `±${monitorSummary.jitter}ms` : '--'}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setMonitoringServer(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-white/10 transition-colors cursor-pointer"
              >
                Close Monitor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
