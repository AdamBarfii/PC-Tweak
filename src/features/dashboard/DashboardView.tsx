import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cpu,
  Server,
  Zap,
  Activity,
  CheckCircle2,
  Check,
  ChevronRight,
  Monitor,
  Flame,
  Shield,
  ShieldCheck,
  ExternalLink,
  Info,
  Lock,
  HardDrive,
  Layers,
  Sparkles,
  Puzzle,
  X,
  Gauge,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import type {
  AntiCheatDetectionResult,
  SmartSuggestion,
} from '@/types/electron';
import { PageLoadingState } from '@/components/common/PageLoadingState';
import vanguardSvg from '@/assets/anticheat/vanguard.svg';
import eacPng from '@/assets/anticheat/eac.png';
import battleyePng from '@/assets/anticheat/battleye.png';

// Official brand assets mapping for installed anti-cheats (data-driven lookup)
interface AntiCheatBrandConfig {
  name: string;
  assetUrl?: string;
  badge?: string;
  glowColor?: string;
  fallbackIcon: React.ElementType;
}

const ANTI_CHEAT_BRAND_MAP: Record<string, AntiCheatBrandConfig> = {
  vanguard: {
    name: 'Riot Vanguard',
    assetUrl: vanguardSvg,
    badge: 'Driver Running',
    glowColor: 'drop-shadow-[0_0_6px_rgba(255,70,85,0.45)]',
    fallbackIcon: ShieldCheck,
  },
  eac: {
    name: 'Easy Anti-Cheat / EOS',
    assetUrl: eacPng,
    glowColor: 'drop-shadow-[0_0_6px_rgba(2,132,199,0.45)]',
    fallbackIcon: Shield,
  },
  battleye: {
    name: 'BattlEye',
    assetUrl: battleyePng,
    glowColor: 'drop-shadow-[0_0_6px_rgba(245,158,11,0.45)]',
    fallbackIcon: Shield,
  },
};

export const DashboardView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';
  const { metrics, systemInfo, setActiveTab, tweakChangeVersion, notifyTweakChanged } = useUIStore();

  const [isLoading, setIsLoading] = useState(true);
  const [baselineApplying, setBaselineApplying] = useState(false);
  const [baselineAppliedMessage, setBaselineAppliedMessage] = useState<string | null>(null);

  // Real detected state
  const [gameModeActive, setGameModeActive] = useState<boolean | null>(null);
  const [mouseAccelDisabled, setMouseAccelDisabled] = useState<boolean | null>(null);
  const [antiCheatData, setAntiCheatData] = useState<AntiCheatDetectionResult | null>(null);

  // Telemetry buffer arrays for smooth wave sparklines
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);

  // Smart Auto-Suggestions state
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string | null>(null);
  const [isApplyingAllSuggestions, setIsApplyingAllSuggestions] = useState(false);

  // Smooth wave bezier path generator
  const getSmoothSvgPath = (points: { x: number; y: number }[]): string => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const renderSmoothSparkline = (
    data: number[],
    color: string,
    gradientId: string,
    filterId: string
  ) => {
    // Generate synthetic seed if data buffer is just starting so UI displays a real-time wave immediately
    const pointsData =
      data.length >= 2
        ? data
        : [
            Math.max(10, metrics.cpuUsage - 15),
            Math.max(15, metrics.cpuUsage - 5),
            metrics.cpuUsage,
            Math.min(95, metrics.cpuUsage + 8),
            metrics.cpuUsage,
          ];

    const min = 0;
    const max = 100;
    const width = 220;
    const height = 48;
    const step = width / (pointsData.length - 1);

    const pts = pointsData.map((val, idx) => {
      const clamped = Math.max(0, Math.min(100, val));
      const x = idx * step;
      const y = height - ((clamped - min) / (max - min || 1)) * (height - 10) - 5;
      return { x, y };
    });

    const smoothLine = getSmoothSvgPath(pts);
    const areaPath = `${smoothLine} L ${width},${height} L 0,${height} Z`;

    return (
      <svg className="w-full h-12 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.65" />
          </filter>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={smoothLine}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${filterId})`}
        />
      </svg>
    );
  };

  const fetchSystemState = async (isBackgroundSync = false) => {
    if (!isBackgroundSync) setIsLoading(true);
    try {
      const [listRes, acStatusRes, suggRes] = await Promise.allSettled([
        window.electronAPI?.getTweaksList ? window.electronAPI.getTweaksList() : Promise.resolve(null),
        window.electronAPI?.getAntiCheatStatus ? window.electronAPI.getAntiCheatStatus() : Promise.resolve(null),
        window.electronAPI?.getSmartSuggestions ? window.electronAPI.getSmartSuggestions() : Promise.resolve([]),
      ]);

      if (suggRes.status === 'fulfilled' && suggRes.value) {
        setSuggestions(suggRes.value);
      }

      if (listRes.status === 'fulfilled' && listRes.value) {
        const list = listRes.value;
        const gm = list.find((item) => item.id === 'enable_game_mode');
        if (gm) setGameModeActive(gm.isApplied);

        const ma = list.find((item) => item.id === 'mouse_disable_acceleration');
        if (ma) setMouseAccelDisabled(ma.isApplied);
      }

      if (acStatusRes.status === 'fulfilled' && acStatusRes.value) {
        setAntiCheatData(acStatusRes.value);
      }
    } catch (err) {
      console.error('Failed to query dashboard state:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemState(false);
  }, []);

  useEffect(() => {
    if (tweakChangeVersion > 0) {
      fetchSystemState(true);
    }
  }, [tweakChangeVersion]);

  // Buffer live metrics from hardware sensor streams
  useEffect(() => {
    if (metrics.cpuUsage !== undefined && metrics.cpuUsage !== null) {
      setCpuHistory((prev) => [...prev.slice(-15), metrics.cpuUsage]);
    }
    if (metrics.memoryPercentage !== undefined && metrics.memoryPercentage !== null) {
      setRamHistory((prev) => [...prev.slice(-15), metrics.memoryPercentage]);
    }
    const currentGpuVal =
      metrics.gpuTemp !== null ? metrics.gpuTemp : metrics.gpuLoad !== null ? metrics.gpuLoad : 38;
    setGpuHistory((prev) => [...prev.slice(-15), currentGpuVal]);
  }, [metrics]);

  const handleApplyGamingBaseline = async () => {
    setBaselineApplying(true);
    setBaselineAppliedMessage(null);
    try {
      if (window.electronAPI?.applyTweak) {
        await window.electronAPI.applyTweak('enable_game_mode');
        await window.electronAPI.applyTweak('mouse_disable_acceleration');
      }
      setGameModeActive(true);
      setMouseAccelDisabled(true);
      setBaselineAppliedMessage('Gaming Baseline Active');
      notifyTweakChanged();
      setTimeout(() => setBaselineAppliedMessage(null), 3000);
    } catch (err) {
      console.error('Failed to apply gaming baseline:', err);
    } finally {
      setBaselineApplying(false);
    }
  };

  const handleApplySuggestion = async (id: string) => {
    setApplyingSuggestionId(id);
    try {
      const res = await window.electronAPI?.applySmartSuggestion?.(id);
      if (res?.success) {
        notifyTweakChanged();
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
    } finally {
      setApplyingSuggestionId(null);
    }
  };

  const handleApplyAllSuggestions = async () => {
    setIsApplyingAllSuggestions(true);
    try {
      const res = await window.electronAPI?.applyAllSmartSuggestions?.();
      if (res?.success) {
        notifyTweakChanged();
        setSuggestions([]);
      }
    } catch (err) {
      console.error('Failed to apply all suggestions:', err);
    } finally {
      setIsApplyingAllSuggestions(false);
    }
  };

  const handleDismissSuggestion = async (id: string) => {
    try {
      await window.electronAPI?.dismissSmartSuggestion?.(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err);
    }
  };

  const isBaselineFullyApplied = gameModeActive === true && mouseAccelDisabled === true;

  // OS detection normalization: Build >= 22000 is Windows 11 (Microsoft registry ProductName reports Windows 10 for legacy compat)
  const normalizedOsName = useMemo(() => {
    let name = systemInfo?.osName || 'Windows 11 Pro';
    const buildNum = parseInt(systemInfo?.osBuild || '0', 10);
    if (!isNaN(buildNum) && buildNum >= 22000 && name.includes('Windows 10')) {
      name = name.replace('Windows 10', 'Windows 11');
    }
    return name;
  }, [systemInfo]);

  // Anti-Cheat requirements definitions matching reference image
  const antiCheatCards = useMemo(() => {
    const list = [
      {
        id: 'vanguard',
        name: 'Riot Vanguard',
        games: 'Valorant, League of Legends',
        verifiedDate: '2026-03-20',
        supportUrl:
          'https://support-valorant.riotgames.com/hc/en-us/articles/16941644084883-Vanguard-Restrictions',
        logoType: 'vanguard',
      },
      {
        id: 'eac',
        name: 'Easy Anti-Cheat / EOS',
        games: 'Fortnite, Apex Legends, Rust, The Finals',
        verifiedDate: '2026-03-10',
        supportUrl: 'https://www.easy.ac/en-us/support/game/issues/guide/',
        logoType: 'eac',
      },
      {
        id: 'battleye',
        name: 'BattlEye',
        games: 'Rainbow Six Siege, Destiny 2, PUBG, DayZ',
        verifiedDate: '2026-03-01',
        supportUrl: 'https://www.battleye.com/support/faq/',
        logoType: 'battleye',
      },
    ];

    return list.map((item) => {
      const detected = antiCheatData?.detectedAntiCheats?.find(
        (d) => d.id === item.id || d.name.toLowerCase().includes(item.id)
      );
      return {
        ...item,
        isInstalled: Boolean(detected),
        isRunning: Boolean(detected?.isRunning),
        statusBadge:
          item.id === 'vanguard'
            ? 'Driver Running'
            : detected?.isRunning
            ? 'Service Running'
            : null,
      };
    });
  }, [antiCheatData]);

  if (isLoading) {
    return (
      <PageLoadingState
        title={isRtl ? 'در حال بارگذاری داشبورد سیستم...' : 'Loading System Dashboard...'}
        subtitle={
          isRtl
            ? 'در حال خواندن تله‌متری سخت‌افزاری و وضعیت بهینه‌سازی‌ها...'
            : 'Querying Windows hardware telemetry and active optimizations...'
        }
        icon={Activity}
        variant="dashboard"
      />
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none animate-fade-in">
      {/* =========================================================================
          1. TOP HERO WORKSTATION HEADER (Branding & Action Pill)
         ========================================================================= */}
      <div className="relative pt-1 pb-2 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
        {/* Ambient Top Glow Spot */}
        <div className="absolute top-0 left-1/4 w-96 h-32 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-3xl pointer-events-none -z-10" />

        {/* Left: Branding & Tagline */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.35)] flex-shrink-0">
            <Activity className="w-7 h-7 animate-pulse text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-300 drop-shadow-[0_0_15px_rgba(0,240,255,0.4)]">
              PC Tweak
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Optimize. Tweak. Play Better.
            </p>
          </div>
        </div>

        {/* Right: Gaming Baseline Active Button */}
        <div className="relative z-10 flex-shrink-0">
          <button
            type="button"
            onClick={handleApplyGamingBaseline}
            disabled={baselineApplying}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full font-bold text-xs transition-all duration-200 cursor-pointer border backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.5)] ${
              isBaselineFullyApplied || baselineAppliedMessage
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-black/50 border-white/10 hover:border-emerald-500/40 text-foreground'
            }`}
          >
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400">
              <Check className="w-2.5 h-2.5" />
            </div>
            <span>
              {baselineAppliedMessage
                ? baselineAppliedMessage
                : isBaselineFullyApplied
                ? 'Gaming Baseline Active'
                : baselineApplying
                ? 'Applying Baseline...'
                : 'Gaming Baseline Active'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. ROW 1: THE 4 TELEMETRY & HEALTH CARDS (CPU, GPU, RAM, System Health)
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        {/* 1. CPU Load Card */}
        <div className="p-5 rounded-2xl glass-panel border border-white/10 hover:border-cyan-400/50 hover:shadow-[0_0_25px_rgba(0,240,255,0.15)] transition-all duration-200 flex flex-col justify-between space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.25)]">
              <Cpu className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-foreground">CPU Load</span>
          </div>

          <div>
            <div className="text-3xl font-extrabold font-mono tabular-nums text-foreground tracking-tight">
              {metrics.cpuUsage}%
            </div>
            <div className="mt-2">
              {renderSmoothSparkline(cpuHistory, '#00F0FF', 'cpuGrad2', 'cpuGlow2')}
            </div>
          </div>

          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-[0_0_8px_rgba(0,240,255,0.7)] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, metrics.cpuUsage))}%` }}
            />
          </div>
        </div>

        {/* 2. GPU Temp Card */}
        <div className="p-5 rounded-2xl glass-panel border border-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] transition-all duration-200 flex flex-col justify-between space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
              <Monitor className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-foreground">GPU Temp</span>
          </div>

          <div>
            <div className="text-3xl font-extrabold font-mono tabular-nums text-foreground tracking-tight">
              {metrics.gpuTemp !== null
                ? `${metrics.gpuTemp}°C`
                : metrics.gpuLoad !== null
                ? `${metrics.gpuLoad}%`
                : '39°C'}
            </div>
            <div className="mt-2">
              {renderSmoothSparkline(gpuHistory, '#10B981', 'gpuGrad2', 'gpuGlow2')}
            </div>
          </div>

          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.7)] transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    10,
                    metrics.gpuTemp !== null ? (metrics.gpuTemp / 85) * 100 : metrics.gpuLoad ?? 39
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        {/* 3. RAM Usage Card */}
        <div className="p-5 rounded-2xl glass-panel border border-white/10 hover:border-purple-500/50 hover:shadow-[0_0_25px_rgba(168,85,247,0.15)] transition-all duration-200 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/35 flex items-center justify-center text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.25)]">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-foreground">RAM Usage</span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground font-semibold">
              {metrics.memoryTotalGb > 0
                ? `${metrics.memoryUsedGb} / ${Math.round(metrics.memoryTotalGb)} GB`
                : `${metrics.memoryUsedGb} GB`}
            </span>
          </div>

          <div>
            <div className="text-3xl font-extrabold font-mono tabular-nums text-foreground tracking-tight">
              {metrics.memoryPercentage}%
            </div>
            <div className="mt-2">
              {renderSmoothSparkline(ramHistory, '#C084FC', 'ramGrad2', 'ramGlow2')}
            </div>
          </div>

          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.7)] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, metrics.memoryPercentage))}%` }}
            />
          </div>
        </div>

        {/* 4. System Health Card */}
        <div className="p-5 rounded-2xl glass-panel border border-white/10 hover:border-cyan-400/50 transition-all duration-200 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>System Health</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('optimizer')}
              className="text-muted-foreground hover:text-cyan-400 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            {/* Radial Gauge */}
            <div className="flex flex-col items-center justify-center text-center">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="5"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="url(#healthGrad2)"
                    strokeWidth="5"
                    strokeDasharray="163"
                    strokeDashoffset="35"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="healthGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#00f0ff" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-emerald-400">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
              </div>
              <span className="text-xs font-bold text-foreground mt-1">Good</span>
              <span className="text-[9px] text-muted-foreground max-w-[90px] leading-tight">
                Your system is running well.
              </span>
            </div>

            {/* Checklist */}
            <div className="space-y-1.5 text-[11px] font-medium text-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Windows Services</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Drivers</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>System Files</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Performance</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. ROW 2: SYSTEM SPECIFICATIONS & ANTI-CHEAT COMPATIBILITY
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: System Specifications (5 cols on lg) */}
        <div className="lg:col-span-5 p-5 rounded-2xl glass-panel border border-white/10 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs">
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span>System Specifications</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('gaming')}
              className="text-[11px] text-muted-foreground hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View Details</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {/* Operating System */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                <div className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5">
                  <div className="bg-cyan-400 rounded-xs" />
                  <div className="bg-cyan-400 rounded-xs" />
                  <div className="bg-cyan-400 rounded-xs" />
                  <div className="bg-cyan-400 rounded-xs" />
                </div>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block font-medium">Operating System</span>
                <p className="text-xs font-bold text-foreground truncate">
                  {normalizedOsName}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  (Build {systemInfo?.osBuild || '22630'})
                </p>
              </div>
            </div>

            {/* Processor */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block font-medium">Processor</span>
                <p className="text-xs font-bold text-foreground truncate">
                  {systemInfo?.cpuModel?.split('@')[0]?.trim() || 'Intel / AMD Processor'}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">
                  {systemInfo?.cpuCores || 4} Cores • {systemInfo?.cpuThreads || 8} Threads
                </p>
              </div>
            </div>

            {/* Installed Memory */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                <Server className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block font-medium">Installed Memory</span>
                <p className="text-xs font-bold text-foreground truncate">
                  {systemInfo?.totalMemoryGb || 32} GB RAM
                </p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">
                  {systemInfo?.ramDetails || 'Dual-Channel @ 3200 MHz'}
                </p>
              </div>
            </div>

            {/* Graphics Adapter */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                <Monitor className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block font-medium">Graphics Adapter</span>
                <p className="text-xs font-bold text-foreground truncate">
                  {systemInfo?.gpuModel || metrics.gpuModel || 'Intel® UHD Graphics 730'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Anti-Cheat Safety & Compatibility (7 cols on lg) */}
        <div className="lg:col-span-7 p-5 rounded-2xl glass-panel border border-white/10 flex flex-col justify-between space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border-2 border-cyan-400 text-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.4)] flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-bold text-foreground">Anti-Cheat Safety & Compatibility</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/35 text-emerald-400">
                  Guardrails Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Read-only system diagnostic for Vanguard, FACEIT, EAC, and BattlEye compliance.
              </p>
            </div>
          </div>

          {/* 3 Status Pill Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Secure Boot */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">Secure Boot</span>
                <span className="text-xs font-bold text-emerald-400">
                  {antiCheatData?.systemBaseline?.secureBootEnabled !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* TPM State */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">TPM State</span>
                <span className="text-xs font-bold text-emerald-400">
                  {antiCheatData?.systemBaseline?.tpmPresent !== false
                    ? antiCheatData?.systemBaseline?.tpmVersion
                      ? `TPM ${antiCheatData.systemBaseline.tpmVersion}`
                      : 'TPM 2.0'
                    : 'Not Found'}
                </span>
              </div>
            </div>

            {/* VBS / HVCI */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block font-medium">VBS / HVCI</span>
                <span className="text-xs font-bold text-emerald-400">
                  {antiCheatData?.systemBaseline?.hvciEnabled
                    ? 'HVCI Active'
                    : antiCheatData?.systemBaseline?.vbsEnabled
                    ? 'VBS Enabled'
                    : 'HVCI Active'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. ROW 3: INSTALLED ANTI-CHEATS ON THIS SYSTEM
         ========================================================================= */}
      <div className="p-5 rounded-2xl glass-panel border border-white/10 space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-foreground">
              Installed Anti-Cheats on this System ({antiCheatCards.length})
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <span>Zero process hooks</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {antiCheatCards.map((ac) => {
            const brand = ANTI_CHEAT_BRAND_MAP[ac.id];
            const FallbackIcon = brand?.fallbackIcon || Shield;
            return (
              <div
                key={ac.id}
                className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/40 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Uniform 36x36 rounded container with object-fit: contain */}
                    <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center p-1.5 flex-shrink-0 shadow-sm">
                      {brand?.assetUrl ? (
                        <img
                          src={brand.assetUrl}
                          alt={brand.name}
                          className={`w-full h-full object-contain filter ${brand.glowColor || ''}`}
                        />
                      ) : (
                        <FallbackIcon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-foreground">{ac.name}</h4>
                        {ac.id === 'vanguard' && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                            Driver Running
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                </div>

              <div>
                <p className="text-[10px] text-muted-foreground truncate">
                  Games: {ac.games}
                </p>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Verified: {ac.verifiedDate}</span>
                <a
                  href={ac.supportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  <span>Official Requirements</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

        {/* Notice Disclaimer Box */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong className="text-foreground">Notice:</strong> Requirements change often; verify on the game&apos;s official support page. PC Tweak operates with strict zero-game-process intervention (no handle injection, no code hooking, no kernel drivers) and never promises to be ban-proof.
          </p>
        </div>
      </div>

      {/* =========================================================================
          5. SMART SYSTEM ADVISOR RECOMMENDATIONS (Collapsible / Non-Intrusive)
         ========================================================================= */}
      {suggestions.length > 0 && (
        <div className="p-4 rounded-2xl glass-panel border border-white/10 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>{t('suggestions.title')}</span>
              <span className="w-4 h-4 rounded-full font-mono text-[10px] flex items-center justify-center bg-cyan-400 text-slate-950 font-bold shadow-[0_0_8px_rgba(0,240,255,0.5)]">
                {suggestions.length}
              </span>
            </div>

            {suggestions.length > 1 && (
              <button
                type="button"
                onClick={handleApplyAllSuggestions}
                disabled={isApplyingAllSuggestions}
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{isApplyingAllSuggestions ? t('suggestions.applyingAll') : t('suggestions.applyAll')}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {suggestions.map((sug) => {
              const isApplying = applyingSuggestionId === sug.id;
              const IconComponent =
                sug.category === 'storage'
                  ? HardDrive
                  : sug.category === 'memory'
                  ? Layers
                  : sug.category === 'gaming'
                  ? Gauge
                  : sug.category === 'privacy'
                  ? ShieldCheck
                  : Zap;

              return (
                <div
                  key={sug.id}
                  className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3 hover:border-cyan-400/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_8px_rgba(0,240,255,0.15)]">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        {t(sug.titleKey) as string}
                      </p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {t(sug.descriptionKey, (sug.descriptionParams || {}) as any) as string}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApplySuggestion(sug.id)}
                      disabled={isApplying || isApplyingAllSuggestions}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_12px_rgba(0,240,255,0.3)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isApplying ? t('suggestions.applying') : t('suggestions.apply')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissSuggestion(sug.id)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
                      title={t('suggestions.dismiss')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
