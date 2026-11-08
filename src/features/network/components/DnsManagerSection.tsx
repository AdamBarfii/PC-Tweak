import React, { useState, useEffect } from 'react';
import {
  Globe,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Play,
  Clock,
  Zap,
  Info,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentDns, setCurrentDns] = useState<CurrentDnsInfo | null>(null);
  const [presets, setPresets] = useState<DnsPreset[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // DoH Global Toggle for applying
  const [enableDoh, setEnableDoh] = useState(true);

  // New Preset Modal / Inline Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPreset, setNewPreset] = useState({
    name: '',
    primaryIpv4: '',
    secondaryIpv4: '',
    dohTemplate: '',
  });

  // Benchmark State
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkDomains, setBenchmarkDomains] = useState<string[]>([
    'google.com',
    'cloudflare.com',
    'microsoft.com',
    'wikipedia.org',
    'github.com',
  ]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [benchmarkResults, setBenchmarkResults] = useState<DnsBenchmarkResult[]>([]);

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

  const handleFlushCache = async () => {
    if (!window.electronAPI?.flushDnsCache) return;
    setIsFlushing(true);
    try {
      const res = await window.electronAPI.flushDnsCache();
      if (res.success) {
        onNotify('Windows DNS resolver cache flushed successfully.', 'success');
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
        onNotify(`Applied ${preset.name} on ${adapter.name}.`, 'success');

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
        onNotify(`Reset ${adapter.name} DNS to automatic (DHCP).`, 'success');
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
        onNotify('DNS settings reverted to previous configuration.', 'success');
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
      onNotify('Preset name and Primary IPv4 are required.', 'warning');
      return;
    }

    try {
      await window.electronAPI.saveDnsPreset({
        preset: {
          name: newPreset.name.trim(),
          primaryIpv4: newPreset.primaryIpv4.trim(),
          secondaryIpv4: newPreset.secondaryIpv4.trim() || undefined,
          dohTemplate: newPreset.dohTemplate.trim() || undefined,
          isCustom: true,
        },
      });

      setShowAddForm(false);
      setNewPreset({ name: '', primaryIpv4: '', secondaryIpv4: '', dohTemplate: '' });
      await loadData();
      onNotify('Custom DNS preset saved.', 'success');
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
      onNotify('DNS preset removed.', 'success');
    } catch (err: any) {
      onNotify(err?.message || 'Failed to delete preset', 'error');
    }
  };

  // ----------------------------------------------------
  // DNS Benchmark Runner
  // ----------------------------------------------------
  const handleRunBenchmark = async () => {
    if (!window.electronAPI?.benchmarkDns) return;
    if (presets.length === 0) return;

    setIsBenchmarking(true);
    setBenchmarkResults([]);

    try {
      // Benchmark all presets + current DNS if static
      const targets = presets.map((p) => ({
        id: p.id,
        name: p.name,
        ip: p.primaryIpv4,
      }));

      // Add active gateway DNS if distinct
      if (currentDns?.servers[0] && !targets.some((t) => t.ip === currentDns.servers[0])) {
        targets.unshift({
          id: 'current_dns',
          name: `Current DNS (${currentDns.servers[0]})`,
          ip: currentDns.servers[0],
        });
      }

      const results = await window.electronAPI.benchmarkDns({
        servers: targets,
        domains: benchmarkDomains,
      });

      setBenchmarkResults(results);
      onNotify(`DNS Benchmark complete across ${results.length} servers and ${benchmarkDomains.length} domains.`, 'success');
    } catch (err: any) {
      onNotify(err?.message || 'DNS benchmark failed', 'error');
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleAddDomain = () => {
    const d = newDomainInput.trim().toLowerCase();
    if (!d) return;
    if (benchmarkDomains.includes(d)) {
      onNotify('Domain already in test list.', 'warning');
      return;
    }
    setBenchmarkDomains((prev) => [...prev, d]);
    setNewDomainInput('');
  };

  const handleRemoveDomain = (domain: string) => {
    setBenchmarkDomains((prev) => prev.filter((d) => d !== domain));
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all space-y-4 p-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">B. DNS Manager & Benchmark</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Safe
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure DNS servers, enable DoH encryption, and measure resolve speed without cache interference.
            </p>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Reset to DHCP */}
          <button
            type="button"
            onClick={handleResetToDhcp}
            disabled={isBusy || currentDns?.isDhcp}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              currentDns?.isDhcp
                ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed opacity-60'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 cursor-pointer'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to DHCP</span>
          </button>

          {/* Flush DNS Cache */}
          <button
            type="button"
            onClick={handleFlushCache}
            disabled={isFlushing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600/80 hover:bg-blue-600 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
            <span>Flush DNS Cache</span>
          </button>
        </div>
      </div>

      {/* Current Active DNS Telemetry Banner */}
      {currentDns && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Current Active DNS:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    currentDns.isDhcp
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {currentDns.isDhcp ? 'DHCP (Automatic)' : 'Statically Configured'}
                </span>

                {currentDns.dohActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    DoH Encrypted
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-cyan-400 mt-1">
                {currentDns.servers.length > 0 ? currentDns.servers.join(', ') : 'None assigned'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={enableDoh}
                onChange={(e) => setEnableDoh(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <span>Enable DoH (Windows 11)</span>
            </label>
          </div>
        </div>
      )}

      {/* DNS Presets Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300">Available DNS Presets ({presets.length}):</h3>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add Custom Preset</span>
          </button>
        </div>

        {/* Add Preset Form */}
        {showAddForm && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3 animate-in fade-in duration-150">
            <h4 className="text-xs font-bold text-white">Create Custom DNS Preset</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <input
                type="text"
                placeholder="Name (e.g. AdGuard)"
                value={newPreset.name}
                onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Primary IPv4 (e.g. 94.140.14.14)"
                value={newPreset.primaryIpv4}
                onChange={(e) => setNewPreset({ ...newPreset, primaryIpv4: e.target.value })}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Secondary IPv4 (Optional)"
                value={newPreset.secondaryIpv4}
                onChange={(e) => setNewPreset({ ...newPreset, secondaryIpv4: e.target.value })}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="DoH URL Template (Optional)"
                value={newPreset.dohTemplate}
                onChange={(e) => setNewPreset({ ...newPreset, dohTemplate: e.target.value })}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 text-xs rounded-lg text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomPreset}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md cursor-pointer"
              >
                Save Preset
              </button>
            </div>
          </div>
        )}

        {/* Presets Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {presets.map((preset) => {
            const isCurrentlyActive =
              currentDns?.servers.includes(preset.primaryIpv4) && !currentDns?.isDhcp;

            return (
              <div
                key={preset.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isCurrentlyActive
                    ? 'bg-blue-950/30 border-blue-500/50 shadow-md shadow-blue-950/20'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{preset.name}</span>
                      {preset.dohTemplate && (
                        <span title="Supports DoH Encryption">
                          <Lock className="w-3 h-3 text-cyan-400" />
                        </span>
                      )}
                    </span>

                    {preset.isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePreset(preset.id, e)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete custom preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500">Primary: </span>
                      <span className="text-slate-200">{preset.primaryIpv4}</span>
                    </div>
                    {preset.secondaryIpv4 && (
                      <div>
                        <span className="text-slate-500">Secondary: </span>
                        <span className="text-slate-200">{preset.secondaryIpv4}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                  <span className="text-[10px] text-slate-500">
                    {isCurrentlyActive ? 'Active DNS' : preset.isDefault ? 'Verified' : 'Custom'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    disabled={isCurrentlyActive || isBusy}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isCurrentlyActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                    }`}
                  >
                    {isCurrentlyActive ? 'Active' : 'Apply'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DNS Benchmark Suite */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Real Multi-Domain DNS Benchmark</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Queries DNS servers directly via raw UDP socket to measure real resolve speed bypassing local OS caching.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunBenchmark}
            disabled={isBenchmarking}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isBenchmarking ? 'animate-spin' : ''}`} />
            <span>{isBenchmarking ? 'Benchmarking...' : 'Run Benchmark'}</span>
          </button>
        </div>

        {/* Tested Domains Configuration */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-400 font-semibold mr-1">Test Domains:</span>
          {benchmarkDomains.map((d) => (
            <span
              key={d}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
            >
              <span>{d}</span>
              {benchmarkDomains.length > 2 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDomain(d)}
                  className="text-slate-500 hover:text-red-400"
                >
                  ×
                </button>
              )}
            </span>
          ))}

          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Add domain..."
              value={newDomainInput}
              onChange={(e) => setNewDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
              className="px-2 py-0.5 text-[11px] rounded bg-slate-950 border border-slate-700/80 text-slate-200 placeholder-slate-500 w-28 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddDomain}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-cyan-400 hover:bg-slate-700"
            >
              +
            </button>
          </div>
        </div>

        {/* Benchmark Results Table */}
        {benchmarkResults.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-900/50">
                  <th className="py-2.5 px-4">DNS Server</th>
                  <th className="py-2.5 px-4">Server IP</th>
                  <th className="py-2.5 px-4">Median Latency</th>
                  <th className="py-2.5 px-4">P95 Latency</th>
                  <th className="py-2.5 px-4">Min / Max</th>
                  <th className="py-2.5 px-4">Success / Loss</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {benchmarkResults.map((r, idx) => (
                  <tr
                    key={r.serverId}
                    className={`hover:bg-slate-900/40 transition-colors ${
                      idx === 0 && r.successCount > 0 ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-sans font-bold text-white flex items-center gap-2">
                      {idx === 0 && r.successCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" title="Fastest Median" />
                      )}
                      <span>{r.serverName}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{r.serverIp}</td>
                    <td className="py-2.5 px-4 font-bold text-cyan-400">
                      {r.successCount > 0 ? `${r.medianMs} ms` : 'Failed'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {r.successCount > 0 ? `${r.p95Ms} ms` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                      {r.successCount > 0 ? `${r.minMs} / ${r.maxMs} ms` : '—'}
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
                          const matched = presets.find((p) => p.primaryIpv4 === r.serverIp);
                          if (matched) handleApplyPreset(matched);
                        }}
                        disabled={isBusy}
                        className="px-2.5 py-1 rounded text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 cursor-pointer"
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
