import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Square,
  Clock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Info,
  TrendingDown,
  TrendingUp,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  NetworkAdapterInfo,
  NetworkTestTarget,
  NetworkSample,
  NetworkTestSummary,
  BaselineReport,
} from '@/types/electron';
import { GamingServerRadarCard } from './GamingServerRadarCard';

interface NetworkTestSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
  onRevertTweak?: () => Promise<void>;
}

export const NetworkTestSection: React.FC<NetworkTestSectionProps> = ({
  adapter,
  onNotify,
  onRevertTweak,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(30);
  const [samples, setSamples] = useState<NetworkSample[]>([]);
  const [summary, setSummary] = useState<NetworkTestSummary | null>(null);

  // Targets
  const [customHost, setCustomHost] = useState('');
  const [includePublic, setIncludePublic] = useState(false);
  const [targets, setTargets] = useState<NetworkTestTarget[]>([]);

  // Baseline Delta State
  const [isBaselineRunning, setIsBaselineRunning] = useState(false);
  const [baselineReport, setBaselineReport] = useState<BaselineReport | null>(null);
  const [deltaResult, setDeltaResult] = useState<{
    improved: boolean;
    deltaMs: number;
    spreadMs: number;
    message: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize targets based on active adapter
  useEffect(() => {
    const list: NetworkTestTarget[] = [];

    if (adapter?.defaultGateway) {
      list.push({
        id: 'gateway',
        name: 'Default Gateway',
        host: adapter.defaultGateway,
        isGateway: true,
      });
    }

    if (adapter?.dnsServers && adapter.dnsServers.length > 0) {
      list.push({
        id: 'dns',
        name: 'Active DNS Server',
        host: adapter.dnsServers[0],
        isDns: true,
      });
    }

    setTargets(list);
  }, [adapter]);

  // Subscribe to real-time test samples
  useEffect(() => {
    if (!window.electronAPI?.onNetworkTestSample) return;

    const unsubscribe = window.electronAPI.onNetworkTestSample((sample: NetworkSample) => {
      setSamples((prev) => [...prev.slice(-100), sample]);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Render Live Canvas Latency Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Empty state
    if (samples.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        isRunning ? 'Gathering initial latency samples...' : 'Click "Start Test" to begin live latency measurement',
        width / 2,
        height / 2
      );
      return;
    }

    const validRtts = samples.filter((s) => s.rtt !== null).map((s) => s.rtt!);
    const maxVal = Math.max(...validRtts, 50);
    const minVal = 0;

    // Draw background grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    for (let i = 1; i <= 3; i++) {
      const y = height - (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Y-axis label in ms
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round((i / 4) * maxVal)}ms`, 35, y + 3);
    }

    // Draw Latency Path
    const usableWidth = width - 45;
    const step = usableWidth / (samples.length - 1 || 1);

    ctx.beginPath();
    samples.forEach((sample, idx) => {
      const x = 45 + idx * step;
      const rtt = sample.rtt ?? maxVal;
      const y = height - ((rtt - minVal) / (maxVal - minVal || 1)) * (height - 20) - 10;

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(45 + (samples.length - 1) * step, height);
    ctx.lineTo(45, height);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.fill();

    // Highlight timeouts or TCP fallbacks
    samples.forEach((sample, idx) => {
      const x = 45 + idx * step;
      if (sample.isTimeout) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, 10, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (sample.usedTcpFallback) {
        const y = height - ((sample.rtt! - minVal) / (maxVal - minVal || 1)) * (height - 20) - 10;
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [samples, isRunning]);

  const handleStartTest = async () => {
    if (!window.electronAPI?.startNetworkTest) return;
    if (targets.length === 0) {
      onNotify('Please add at least one test target.', 'warning');
      return;
    }

    setIsRunning(true);
    setSamples([]);
    setSummary(null);
    setDeltaResult(null);

    try {
      const activeTargets = [...targets];
      if (includePublic && !activeTargets.some((t) => t.id === 'cloudflare_dns')) {
        activeTargets.push({
          id: 'cloudflare_dns',
          name: 'Cloudflare (Public)',
          host: '1.1.1.1',
          isPublic: true,
        });
      }

      const summaries = await window.electronAPI.startNetworkTest({
        targets: activeTargets,
        durationSeconds,
      });

      if (summaries && summaries.length > 0) {
        setSummary(summaries[0]);
        onNotify('Network latency test completed successfully.', 'success');

        // If baseline is present, auto-evaluate delta
        if (baselineReport && window.electronAPI.compareNetworkDelta) {
          const delta = await window.electronAPI.compareNetworkDelta({
            summary: summaries[0],
            baseline: baselineReport,
          });
          setDeltaResult(delta);
        }
      }
    } catch (err: any) {
      onNotify(err?.message || 'Network test failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopTest = async () => {
    if (!window.electronAPI?.stopNetworkTest) return;
    await window.electronAPI.stopNetworkTest();
    setIsRunning(false);
  };

  const handleRunBaseline = async () => {
    if (!window.electronAPI?.runNetworkBaseline) return;
    if (targets.length === 0) {
      onNotify('Please select a target first.', 'warning');
      return;
    }

    setIsBaselineRunning(true);
    try {
      const report = await window.electronAPI.runNetworkBaseline(targets[0]);
      setBaselineReport(report);
      setDeltaResult(null);
      onNotify(
        `Baseline established across 3 cycles: Avg ${report.baselineAvg}ms (Noise Spread: ${report.noiseSpread}ms).`,
        'success'
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to establish baseline', 'error');
    } finally {
      setIsBaselineRunning(false);
    }
  };

  const handleAddCustomTarget = () => {
    const trimmed = customHost.trim();
    if (!trimmed) return;

    if (targets.some((t) => t.host === trimmed)) {
      onNotify('Target already added.', 'warning');
      return;
    }

    const newTarget: NetworkTestTarget = {
      id: `custom_${Date.now()}`,
      name: `Custom (${trimmed})`,
      host: trimmed,
    };

    setTargets((prev) => [...prev, newTarget]);
    setCustomHost('');
  };

  const handleRemoveTarget = (id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* 1. Official Gaming Server Latency Radar & Routing Matrix */}
      <GamingServerRadarCard
        adapterName={adapter?.name}
        onNotify={onNotify}
      />

      {/* 2. Local Gateway & Public Target Testing Section */}
      <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all space-y-4 p-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">A. Network Test</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                Measured
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live RTT, jitter, and packet loss with dual-engine ICMP + TCP fallback.
            </p>
          </div>
        </div>

        {/* Controls: Duration & Start/Stop */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
              disabled={isRunning}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={10}>10s</option>
              <option value={30}>30s (Default)</option>
              <option value={60}>60s</option>
            </select>
          </div>

          {isRunning ? (
            <button
              type="button"
              onClick={handleStopTest}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartTest}
              disabled={targets.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Test</span>
            </button>
          )}
        </div>
      </div>

      {/* Targets Configuration Strip */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="font-bold text-slate-300">Active Test Targets ({targets.length}):</span>

          <div className="flex items-center gap-4">
            {/* Optional Public Targets Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={includePublic}
                onChange={(e) => setIncludePublic(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <span>Include Public Cloudflare Target (1.1.1.1)</span>
            </label>
          </div>
        </div>

        {/* Targets Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {targets.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono"
            >
              <span className="text-cyan-400 font-bold">{t.name}:</span>
              <span>{t.host}</span>
              {!t.isGateway && !t.isDns && (
                <button
                  type="button"
                  onClick={() => handleRemoveTarget(t.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Add Custom Host Input */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Add IP or host..."
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTarget()}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700/80 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-36"
            />
            <button
              type="button"
              onClick={handleAddCustomTarget}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Canvas Latency Chart */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-semibold text-slate-300">Live Round-Trip Latency (ms)</span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>ICMP RTT</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>TCP Fallback</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span>Packet Loss</span>
            </span>
          </div>
        </div>

        <div className="relative w-full h-44 bg-slate-950/80 rounded-xl border border-slate-800/90 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={800}
            height={176}
            className="w-full h-full block"
          />
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Min RTT */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Min RTT</span>
          <span className="text-lg font-black text-white font-mono block">
            {summary ? `${summary.minRtt} ms` : '—'}
          </span>
        </div>

        {/* Avg RTT */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Avg RTT</span>
          <span className="text-lg font-black text-cyan-400 font-mono block">
            {summary ? `${summary.avgRtt} ms` : '—'}
          </span>
        </div>

        {/* P99 RTT */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">P99 RTT</span>
          <span className="text-lg font-black text-white font-mono block">
            {summary ? `${summary.p99Rtt} ms` : '—'}
          </span>
        </div>

        {/* Max RTT */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Max RTT</span>
          <span className="text-lg font-black text-white font-mono block">
            {summary ? `${summary.maxRtt} ms` : '—'}
          </span>
        </div>

        {/* Jitter */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Jitter</span>
            <span
              className="text-[10px] text-slate-500 hover:text-slate-300 cursor-help"
              title="RFC 3550 standard interarrival jitter: variation in packet arrival times."
            >
              ⓘ
            </span>
          </div>
          <span className="text-lg font-black text-purple-400 font-mono block">
            {summary ? `${summary.jitter} ms` : '—'}
          </span>
        </div>

        {/* Packet Loss */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Packet Loss</span>
          <span
            className={`text-lg font-black font-mono block ${
              summary && summary.packetLossPercent > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {summary ? `${summary.packetLossPercent}%` : '—'}
          </span>
        </div>
      </div>

      {/* Router Fallback Tooltip Notice */}
      <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Dual-Engine Latency Measurement:</strong> Probes are executed via ICMP echo packets. If the local router drops or deprioritizes ICMP (a common security policy), the engine automatically falls back to microsecond TCP socket connects.
        </p>
      </div>

      {/* Baseline & Benchmark Delta Validation Card */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Benchmark Delta & Noise Spread Verification</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Establishes a 3-cycle baseline to capture natural connection jitter before claiming tweak improvements.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunBaseline}
            disabled={isBaselineRunning || isRunning}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isBaselineRunning ? 'Establishing Baseline...' : 'Run 3-Cycle Baseline'}</span>
          </button>
        </div>

        {/* Baseline Status / Results */}
        {baselineReport && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400">Baseline Target:</span>
                <span className="text-white font-bold">{baselineReport.targetHost}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Baseline Avg:</span>
                <span className="text-cyan-400 font-bold">{baselineReport.baselineAvg} ms</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Noise Spread:</span>
                <span className="text-purple-400 font-bold">{baselineReport.noiseSpread} ms</span>
              </div>
              <p className="text-[10px] text-slate-500">
                Rule: An optimization is verified only if post-tweak improvement exceeds 2x noise spread (threshold: &gt; {(2 * baselineReport.noiseSpread).toFixed(2)} ms).
              </p>
            </div>

            {/* Delta Analysis Result */}
            {deltaResult && (
              <div
                className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 flex-shrink-0 ${
                  deltaResult.improved
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                }`}
              >
                {deltaResult.improved ? (
                  <TrendingDown className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                )}
                <div>
                  <span className="font-bold block">{deltaResult.improved ? 'Verified Improvement' : 'No Measurable Change'}</span>
                  <span className="text-[10px] text-slate-300 block">{deltaResult.message}</span>
                </div>

                {!deltaResult.improved && onRevertTweak && (
                  <button
                    type="button"
                    onClick={onRevertTweak}
                    className="ml-2 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 cursor-pointer"
                  >
                    Revert Tweak
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
};
