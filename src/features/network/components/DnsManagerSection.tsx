import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Zap,
  Lock,
  Search,
  Trophy,
  Sparkles,
  Server,
  Activity,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  NetworkAdapterInfo,
  DnsPreset,
  CurrentDnsInfo,
  DnsBenchmarkResult,
} from '@/types/electron';

interface DnsManagerSectionProps {
  adapter: NetworkAdapterInfo | null;
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
  onRequestAutoRevert: (name: string, onRevert: () => Promise<void>) => void;
}

export const DnsManagerSection: React.FC<DnsManagerSectionProps> = ({
  adapter,
  onNotify,
  onRequestAutoRevert,
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'fa';

  const [currentDns, setCurrentDns] = useState<CurrentDnsInfo | null>(null);
  const [presets, setPresets] = useState<DnsPreset[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [enableDoh, setEnableDoh] = useState(true);

  // Search and Category Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'iranian' | 'global' | 'custom'>('all');

  // Add Custom Modal
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPreset, setNewPreset] = useState({
    name: '',
    primaryIpv4: '',
    secondaryIpv4: '',
    dohTemplate: '',
  });

  // Benchmarking and Live Pings
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<DnsBenchmarkResult[]>([]);
  const [testingServerIds, setTestingServerIds] = useState<Set<string>>(new Set());
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [showBenchmarkTable, setShowBenchmarkTable] = useState(false);

  const loadData = async () => {
    if (!adapter) return;
    try {
      if (window.electronAPI?.getCurrentDns) {
        const dnsInfo = await window.electronAPI.getCurrentDns(adapter.name);
        setCurrentDns(dnsInfo);
      }
      if (window.electronAPI?.listDnsPresets) {
        const list = await window.electronAPI.listDnsPresets();
        setPresets(list);
      }
    } catch (err) {
      console.error('Failed to load DNS data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [adapter]);

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const handleFlushCache = async () => {
    if (!window.electronAPI?.flushDnsCache) return;
    setIsFlushing(true);
    try {
      const res = await window.electronAPI.flushDnsCache();
      if (res.success) {
        onNotify(
          isRtl ? 'حافظه موقت DNS ویندوز با موفقیت پاک شد.' : 'Windows DNS resolver cache flushed successfully.',
          'success'
        );
      } else {
        onNotify(res.error || 'Failed to flush DNS cache', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Flush failed', 'error');
    } finally {
      setIsFlushing(false);
    }
  };

  const handleApplyPreset = async (preset: DnsPreset) => {
    if (!adapter || !window.electronAPI?.applyDns) return;
    setIsBusy(true);

    try {
      const res = await window.electronAPI.applyDns({
        adapterName: adapter.name,
        preset,
        enableDoh,
      });

      if (res.success) {
        await loadData();
        onNotify(
          isRtl
            ? `سرور DNS "${preset.name}" روی کارت شبکه ${adapter.name} اعمال شد.`
            : `Applied "${preset.name}" on ${adapter.name}.`,
          'success'
        );

        // Arm 20-second Auto-Revert safety modal
        if (res.requiresAutoRevert) {
          onRequestAutoRevert(`DNS: ${preset.name}`, async () => {
            await handleRevertDns();
          });
        }
      } else {
        onNotify(res.error || 'Failed to apply DNS preset', 'error');
        await loadData();
      }
    } catch (err: any) {
      onNotify(err?.message || 'Failed to apply DNS', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetToDhcp = async () => {
    if (!adapter || !window.electronAPI?.resetDnsToDhcp) return;
    setIsBusy(true);
    try {
      const res = await window.electronAPI.resetDnsToDhcp(adapter.name);
      if (res.success) {
        await loadData();
        onNotify(
          isRtl
            ? `تنظیمات DNS به حالت خودکار (DHCP) بازگردانده شد.`
            : `Reset ${adapter.name} DNS to automatic (DHCP).`,
          'success'
        );
      } else {
        onNotify(res.error || 'Failed to reset DNS', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Reset failed', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRevertDns = async () => {
    if (!adapter || !window.electronAPI?.revertDns) return;
    setIsBusy(true);
    try {
      const res = await window.electronAPI.revertDns(adapter.name);
      if (res.success) {
        await loadData();
        onNotify(
          isRtl
            ? 'تنظیمات DNS به پیکربندی قبلی بازگردانی شد.'
            : 'DNS settings reverted to previous configuration.',
          'success'
        );
      } else {
        onNotify(res.error || 'Failed to revert DNS', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Revert failed', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveCustomPreset = async () => {
    if (!window.electronAPI?.saveDnsPreset) return;
    if (!newPreset.name.trim() || !newPreset.primaryIpv4.trim()) {
      onNotify(
        isRtl ? 'نام دی‌ان‌اس و آی‌پی اولیه الزامی هستند.' : 'Preset name and Primary IPv4 are required.',
        'warning'
      );
      return;
    }

    try {
      await window.electronAPI.saveDnsPreset({
        preset: {
          name: newPreset.name.trim(),
          primaryIpv4: newPreset.primaryIpv4.trim(),
          secondaryIpv4: newPreset.secondaryIpv4.trim() || undefined,
          dohTemplate: newPreset.dohTemplate.trim() || undefined,
          category: 'custom',
          isCustom: true,
        },
      });

      setShowAddForm(false);
      setNewPreset({ name: '', primaryIpv4: '', secondaryIpv4: '', dohTemplate: '' });
      await loadData();
      onNotify(
        isRtl ? 'دی‌ان‌اس اختصاصی با موفقیت ذخیره شد.' : 'Custom DNS preset saved.',
        'success'
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save preset', 'error');
    }
  };

  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI?.deleteDnsPreset) return;
    try {
      await window.electronAPI.deleteDnsPreset(id);
      await loadData();
      onNotify(
        isRtl ? 'پروفایل دی‌ان‌اس حذف شد.' : 'DNS preset removed.',
        'success'
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to delete preset', 'error');
    }
  };

  // ----------------------------------------------------
  // DNS Benchmark & Live Ping Matrix
  // ----------------------------------------------------
  const handlePingAll = async () => {
    if (!window.electronAPI?.benchmarkDns || presets.length === 0) return;
    setIsBenchmarking(true);

    try {
      const targets = presets.map((p) => ({
        id: p.id,
        name: p.name,
        ip: p.primaryIpv4,
      }));

      const results = await window.electronAPI.benchmarkDns({
        servers: targets,
        domains: ['cloudflare.com', 'google.com'],
      });

      setBenchmarkResults(results);

      const fastest = results.find((r) => r.successCount > 0);
      if (fastest) {
        onNotify(
          isRtl
            ? `سریع‌ترین دی‌ان‌اس شناسایی شد: ${fastest.serverName} (${fastest.medianMs} میلی‌ثانیه)`
            : `Fastest DNS detected: ${fastest.serverName} (${fastest.medianMs} ms)`,
          'success'
        );
      } else {
        onNotify(isRtl ? 'پایان سنجش پینگ دی‌ان‌اس‌ها.' : 'DNS ping matrix complete.', 'success');
      }
    } catch (err: any) {
      onNotify(err?.message || 'DNS benchmark failed', 'error');
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handlePingSingle = async (preset: DnsPreset, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.electronAPI?.benchmarkDns) return;

    setTestingServerIds((prev) => new Set(prev).add(preset.id));

    try {
      const results = await window.electronAPI.benchmarkDns({
        servers: [{ id: preset.id, name: preset.name, ip: preset.primaryIpv4 }],
        domains: ['cloudflare.com', 'google.com'],
      });

      if (results && results.length > 0) {
        const single = results[0];
        setBenchmarkResults((prev) => {
          const filtered = prev.filter((r) => r.serverId !== preset.id && r.serverIp !== preset.primaryIpv4);
          return [...filtered, single].sort((a, b) => {
            if (a.successCount === 0) return 1;
            if (b.successCount === 0) return -1;
            return a.medianMs - b.medianMs;
          });
        });

        if (single.successCount > 0) {
          onNotify(
            `${preset.name}: ${single.medianMs} ms (${single.successCount}/${single.testedCount} packets)`,
            'success'
          );
        } else {
          onNotify(`${preset.name}: Unreachable / Timeout`, 'warning');
        }
      }
    } catch (err: any) {
      onNotify(`Ping failed for ${preset.name}`, 'error');
    } finally {
      setTestingServerIds((prev) => {
        const next = new Set(prev);
        next.delete(preset.id);
        return next;
      });
    }
  };

  // Find the fastest responding DNS server
  const fastestResult = useMemo(() => {
    return (
      benchmarkResults
        .filter((r) => r.successCount > 0)
        .sort((a, b) => a.medianMs - b.medianMs)[0] || null
    );
  }, [benchmarkResults]);

  const fastestPreset = useMemo(() => {
    if (!fastestResult) return null;
    return presets.find(
      (p) => p.id === fastestResult.serverId || p.primaryIpv4 === fastestResult.serverIp
    ) || null;
  }, [fastestResult, presets]);

  // Filter and Search Presets
  const filteredPresets = useMemo(() => {
    return presets.filter((p) => {
      // Category filter
      if (selectedCategory === 'iranian' && p.category !== 'iranian') return false;
      if (selectedCategory === 'global' && p.category !== 'global') return false;
      if (selectedCategory === 'custom' && !p.isCustom) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesPrimary = p.primaryIpv4.includes(q);
        const matchesSecondary = p.secondaryIpv4 ? p.secondaryIpv4.includes(q) : false;
        const matchesDesc = p.description ? p.description.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesPrimary && !matchesSecondary && !matchesDesc) return false;
      }

      return true;
    });
  }, [presets, selectedCategory, searchQuery]);

  // Counts for Category Pills
  const counts = useMemo(() => {
    const iranian = presets.filter((p) => p.category === 'iranian').length;
    const global = presets.filter((p) => p.category === 'global').length;
    const custom = presets.filter((p) => p.isCustom).length;
    return { all: presets.length, iranian, global, custom };
  }, [presets]);

  const getLatencyBadge = (preset: DnsPreset) => {
    const res = benchmarkResults.find(
      (r) => r.serverId === preset.id || r.serverIp === preset.primaryIpv4
    );
    const isTesting = testingServerIds.has(preset.id);

    if (isTesting) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          <span>Pinging...</span>
        </span>
      );
    }

    if (!res) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border">
          <span>Not Pinged</span>
        </span>
      );
    }

    if (res.successCount === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-destructive/15 text-destructive border border-destructive/30">
          <span>Timeout</span>
        </span>
      );
    }

    const ms = res.medianMs;
    if (ms < 25) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <Zap className="w-2.5 h-2.5" />
          <span>{ms} ms</span>
        </span>
      );
    }
    if (ms < 60) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span>{ms} ms</span>
        </span>
      );
    }
    if (ms < 110) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span>{ms} ms</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
        <span>{ms} ms</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* DNS Changer Header Panel */}
      <div className="rounded-2xl border border-blue-500/20 bg-card/60 backdrop-blur-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  {isRtl ? 'تغییر و تنظیم هوشمند DNS' : 'Smart DNS Changer & Optimizer'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {isRtl ? 'ایمن' : 'Safe'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRtl
                  ? 'سنجش زنده پینگ سرورهای ایرانی و جهانی، انتخاب سریع‌ترین DNS و اعمال آنی با یک کلیک.'
                  : 'Ping all Iranian & global DNS servers, measure real UDP latency, and apply the fastest resolver in 1 click.'}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Ping All DNS */}
            <button
              type="button"
              onClick={handlePingAll}
              disabled={isBenchmarking || presets.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isBenchmarking ? 'animate-spin' : ''}`} />
              <span>{isBenchmarking ? (isRtl ? 'در حال پینگ...' : 'Pinging All...') : (isRtl ? '⚡ پینگ همه سرورها' : '⚡ Ping All DNS')}</span>
            </button>

            {/* Reset to DHCP */}
            <button
              type="button"
              onClick={handleResetToDhcp}
              disabled={isBusy || currentDns?.isDhcp}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                currentDns?.isDhcp
                  ? 'bg-muted/40 text-muted-foreground border border-border cursor-not-allowed opacity-60'
                  : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border cursor-pointer'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRtl ? 'تنظیم خودکار (DHCP)' : 'Reset to DHCP'}</span>
            </button>

            {/* Flush DNS Cache */}
            <button
              type="button"
              onClick={handleFlushCache}
              disabled={isFlushing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
              <span>{isRtl ? 'پاک‌سازی کَش DNS' : 'Flush DNS Cache'}</span>
            </button>
          </div>
        </div>

        {/* Current Active DNS Banner */}
        {currentDns && (
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {isRtl ? 'دی‌ان‌اس فعال فعلی:' : 'Current Active DNS:'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      currentDns.isDhcp
                        ? 'bg-muted border-border text-muted-foreground'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {currentDns.isDhcp
                      ? isRtl ? 'خودکار (DHCP)' : 'DHCP (Automatic)'
                      : isRtl ? 'دستی (Static)' : 'Statically Configured'}
                  </span>

                  {currentDns.dohActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      DoH
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-cyan-400 mt-0.5 font-semibold">
                  {currentDns.servers.length > 0 ? currentDns.servers.join(', ') : 'None assigned'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={enableDoh}
                  onChange={(e) => setEnableDoh(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-muted border-border text-primary focus:ring-primary"
                />
                <span>{isRtl ? 'رمزنگاری DoH (ویندوز ۱۱)' : 'Enable DoH (Windows 11)'}</span>
              </label>
            </div>
          </div>
        )}

        {/* Fastest DNS Auto-Recommendation Banner */}
        {fastestPreset && fastestResult && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-transparent border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-md">
                <Trophy className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-400 text-black">
                    🏆 {isRtl ? 'سریع‌ترین دی‌ان‌اس' : 'Fastest DNS'}
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    {fastestPreset.name}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>
                    {isRtl ? 'پینگ میانگین:' : 'Median latency:'}{' '}
                    <strong className="text-emerald-400 font-mono text-xs">{fastestResult.medianMs} ms</strong>
                  </span>
                  <span>•</span>
                  <span className="font-mono text-muted-foreground">
                    {fastestPreset.primaryIpv4}
                  </span>
                  <span>•</span>
                  <span className="text-[11px] text-emerald-300">
                    {isRtl ? 'بهترین برای گیمینگ و کاهش پکت‌لاس' : 'Recommended for lowest gaming latency'}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleApplyPreset(fastestPreset)}
              disabled={isBusy}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 fill-black" />
              <span>{isRtl ? 'اعمال سریع‌ترین دی‌ان‌اس' : 'Apply Fastest DNS'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar Strip */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 rounded-xl bg-card/60 border border-border/60">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {isRtl ? 'همه سرورها' : 'All'} ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('iranian')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'iranian'
                ? 'bg-amber-500 text-black shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span>🇮🇷 {isRtl ? 'سرورهای ایرانی (گیمینگ و ضدتحریم)' : 'Iranian (Gaming & Anti-Sanction)'}</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.iranian})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('global')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'global'
                ? 'bg-blue-600 text-white shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span>🌐 {isRtl ? 'سرورهای جهانی' : 'Global (Low Latency)'}</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.global})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('custom')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'custom'
                ? 'bg-purple-600 text-white shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span>⭐ {isRtl ? 'شخصی' : 'Custom'}</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.custom})</span>
          </button>
        </div>

        {/* Search & Add Custom Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={isRtl ? 'جستجوی نام یا آی‌پی...' : 'Search DNS or IP...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isRtl ? 'افزودن دی‌ان‌اس' : 'Add Custom'}</span>
          </button>
        </div>
      </div>

      {/* Add Custom Preset Modal / Inline Form */}
      {showAddForm && (
        <div className="p-5 rounded-2xl bg-card border border-border space-y-3.5 shadow-xl animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground">
              {isRtl ? 'ایجاد پروفایل دی‌ان‌اس دلخواه' : 'Add Custom DNS Server'}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {isRtl ? 'آدرس‌های معتبر IPv4 وارد کنید' : 'Requires valid IPv4 address'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <input
              type="text"
              placeholder={isRtl ? 'نام سرور (مثال: شلتِر)' : 'Name (e.g. Shelter)'}
              value={newPreset.name}
              onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder={isRtl ? 'آی‌پی اصلی (مثال: 172.29.0.100)' : 'Primary IPv4 (e.g. 172.29.0.100)'}
              value={newPreset.primaryIpv4}
              onChange={(e) => setNewPreset({ ...newPreset, primaryIpv4: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
            <input
              type="text"
              placeholder={isRtl ? 'آی‌پی کمکی (اختیاری)' : 'Secondary IPv4 (Optional)'}
              value={newPreset.secondaryIpv4}
              onChange={(e) => setNewPreset({ ...newPreset, secondaryIpv4: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
            <input
              type="text"
              placeholder={isRtl ? 'آدرس DoH (اختیاری)' : 'DoH Template (Optional)'}
              value={newPreset.dohTemplate}
              onChange={(e) => setNewPreset({ ...newPreset, dohTemplate: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {isRtl ? 'انصراف' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSaveCustomPreset}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm cursor-pointer"
            >
              {isRtl ? 'ذخیره سرور' : 'Save Preset'}
            </button>
          </div>
        </div>
      )}

      {/* Presets Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredPresets.map((preset) => {
          const isCurrentlyActive =
            currentDns?.servers.includes(preset.primaryIpv4) && !currentDns?.isDhcp;
          const isFastest = fastestPreset?.id === preset.id;

          return (
            <div
              key={preset.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                isCurrentlyActive
                  ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10'
                  : isFastest
                  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md shadow-emerald-500/10'
                  : 'bg-card/50 border-border/80 hover:border-border hover:bg-card/80'
              }`}
            >
              <div className="space-y-2">
                {/* Top Row: Name, Category Tag & Delete Button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-foreground">
                        {preset.name}
                      </span>

                      {preset.category === 'iranian' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          🇮🇷 {isRtl ? 'ایرانی' : 'Iran'}
                        </span>
                      )}

                      {preset.category === 'global' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          🌐 {isRtl ? 'جهانی' : 'Global'}
                        </span>
                      )}

                      {preset.dohTemplate && (
                        <span title="Supports DoH Encryption" className="text-cyan-400">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}

                      {isFastest && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500 text-black">
                          🏆 {isRtl ? 'سریع‌ترین' : 'Fastest'}
                        </span>
                      )}
                    </div>

                    {preset.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                        {preset.description}
                      </p>
                    )}
                  </div>

                  {preset.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeletePreset(preset.id, e)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title={isRtl ? 'حذف سرور شخصی' : 'Delete custom preset'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* IP Addresses Display with One-Click Copy */}
                <div className="p-2 rounded-xl bg-muted/40 border border-border/60 space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{isRtl ? 'اصلی:' : 'Primary:'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyIp(preset.primaryIpv4)}
                      className="flex items-center gap-1 text-foreground hover:text-primary transition-colors cursor-pointer"
                      title={isRtl ? 'کپی آی‌پی' : 'Click to copy IP'}
                    >
                      <span className="font-bold">{preset.primaryIpv4}</span>
                      {copiedIp === preset.primaryIpv4 ? (
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 opacity-60" />
                      )}
                    </button>
                  </div>

                  {preset.secondaryIpv4 && (
                    <div className="flex items-center justify-between border-t border-border/40 pt-1">
                      <span className="text-muted-foreground">{isRtl ? 'کمکی:' : 'Secondary:'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyIp(preset.secondaryIpv4!)}
                        className="flex items-center gap-1 text-foreground hover:text-primary transition-colors cursor-pointer"
                        title={isRtl ? 'کپی آی‌پی' : 'Click to copy IP'}
                      >
                        <span>{preset.secondaryIpv4}</span>
                        {copiedIp === preset.secondaryIpv4 ? (
                          <CheckCheck className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 opacity-60" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions: Latency Badge, Test Button & Apply Button */}
              <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                <div className="flex items-center gap-1.5">
                  {getLatencyBadge(preset)}

                  <button
                    type="button"
                    onClick={(e) => handlePingSingle(preset, e)}
                    disabled={testingServerIds.has(preset.id)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    title={isRtl ? 'تست پینگ این سرور' : 'Ping this server'}
                  >
                    <Activity className={`w-3 h-3 ${testingServerIds.has(preset.id) ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  disabled={isCurrentlyActive || isBusy}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isCurrentlyActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                      : isFastest
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-sm font-extrabold'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm'
                  }`}
                >
                  {isCurrentlyActive
                    ? (isRtl ? 'فعال است' : 'Active')
                    : (isRtl ? 'اعمال DNS' : 'Apply')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Benchmark Results Collapsible Drawer */}
      {benchmarkResults.length > 0 && (
        <div className="p-4 rounded-2xl bg-card/60 border border-border/80 space-y-3">
          <button
            type="button"
            onClick={() => setShowBenchmarkTable(!showBenchmarkTable)}
            className="w-full flex items-center justify-between text-xs font-bold text-foreground cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span>
                {isRtl
                  ? `جدول تفصیلی نتایج پینگ (${benchmarkResults.length} سرور تست شده)`
                  : `Detailed Ping Results Table (${benchmarkResults.length} servers tested)`}
              </span>
            </div>
            {showBenchmarkTable ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showBenchmarkTable && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card animate-in fade-in duration-150">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground font-bold uppercase tracking-wider bg-muted/50">
                    <th className="py-2.5 px-4">{isRtl ? 'سرور دی‌ان‌اس' : 'DNS Server'}</th>
                    <th className="py-2.5 px-4">{isRtl ? 'آی‌پی' : 'Server IP'}</th>
                    <th className="py-2.5 px-4">{isRtl ? 'تاخیر پینگ' : 'Median Latency'}</th>
                    <th className="py-2.5 px-4">{isRtl ? 'بازه کمترین / بیشترین' : 'Min / Max'}</th>
                    <th className="py-2.5 px-4">{isRtl ? 'پکت‌های موفق' : 'Success Rate'}</th>
                    <th className="py-2.5 px-4 text-right">{isRtl ? 'عملیات' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {benchmarkResults.map((r, idx) => (
                    <tr
                      key={r.serverId}
                      className={`hover:bg-muted/40 transition-colors ${
                        idx === 0 && r.successCount > 0 ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-sans font-bold text-foreground flex items-center gap-2">
                        {idx === 0 && r.successCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" title="Fastest" />
                        )}
                        <span>{r.serverName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{r.serverIp}</td>
                      <td className="py-2.5 px-4 font-bold text-cyan-400">
                        {r.successCount > 0 ? `${r.medianMs} ms` : 'Failed'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-[11px]">
                        {r.successCount > 0 ? `${r.minMs} / ${r.maxMs} ms` : 'Timeout'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[11px] font-bold ${
                            r.failureCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {r.successCount}/{r.testedCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => {
                            const matched = presets.find(
                              (p) => p.primaryIpv4 === r.serverIp || p.id === r.serverId
                            );
                            if (matched) handleApplyPreset(matched);
                          }}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border cursor-pointer"
                        >
                          {isRtl ? 'اعمال' : 'Apply'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
