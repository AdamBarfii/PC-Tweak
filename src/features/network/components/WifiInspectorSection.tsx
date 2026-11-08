import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Signal,
  Radio,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
} from 'lucide-react';
import { WifiDetailsInfo } from '@/types/electron';

interface WifiInspectorSectionProps {
  onNotify: (text: string, type: 'success' | 'warning' | 'error') => void;
}

export const WifiInspectorSection: React.FC<WifiInspectorSectionProps> = ({ onNotify }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [wifiData, setWifiData] = useState<WifiDetailsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoaming, setSelectedRoaming] = useState<string>('Medium');
  const [isUpdatingRoaming, setIsUpdatingRoaming] = useState(false);

  const loadWifi = async () => {
    if (!window.electronAPI?.getWifiDetails) return;
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getWifiDetails();
      setWifiData(data);
      if (data.roamingAggressiveness) {
        setSelectedRoaming(data.roamingAggressiveness.currentValue);
      }
    } catch (err: any) {
      console.error('Failed to load Wi-Fi details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWifi();
  }, []);

  const handleRoamingChange = async (newValue: string) => {
    if (!wifiData?.interfaceName || !window.electronAPI) return;
    setIsUpdatingRoaming(true);
    setSelectedRoaming(newValue);

    try {
      const res = await window.electronAPI.applyAdapterTweak({
        adapterName: wifiData.interfaceName,
        tweakId: 'wifi_roaming_aggressiveness',
        value: newValue,
      });

      if (res.success) {
        onNotify(`Roaming Aggressiveness updated to "${newValue}".`, 'success');
        await loadWifi();
      } else {
        onNotify(res.error || 'Failed to update roaming aggressiveness.', 'error');
      }
    } catch (err: any) {
      onNotify(err.message || 'Operation failed', 'error');
    } finally {
      setIsUpdatingRoaming(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden shadow-lg transition-all">
      {/* Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-900/30 transition-colors select-none"
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`p-2 rounded-xl border ${
              wifiData?.hasWifi
                ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                : 'bg-slate-800/40 border-slate-700/50 text-slate-400'
            }`}
          >
            {wifiData?.hasWifi ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-slate-100">D. Wi-Fi Inspector & Roaming</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  wifiData?.hasWifi
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {wifiData?.hasWifi ? 'Wi-Fi Detected' : 'No Wi-Fi Interface'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real connection telemetry, band and channel health, and roaming scan aggressiveness.
            </p>
          </div>
        </div>

        <button type="button" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-6 pt-2 border-t border-slate-800/60 space-y-4 animate-in fade-in duration-150">
          {!wifiData?.hasWifi ? (
            /* Clean Empty State When No Wi-Fi Adapter Exists */
            <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-4 text-slate-400">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 flex-shrink-0">
                <WifiOff className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-200">No Wireless Interface Detected</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  This system is connected via a dedicated physical Ethernet controller. Wireless controls, background scans, and roaming settings are cleanly disabled as no Wi-Fi hardware is present.
                </p>
              </div>
            </div>
          ) : (
            /* Real Wi-Fi Telemetry Cards */
            <div className="space-y-4">
              {/* Warnings if any */}
              {wifiData.warnings && wifiData.warnings.length > 0 && (
                <div className="space-y-2">
                  {wifiData.warnings.map((warn, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* KPI Telemetry Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">SSID (Network)</span>
                  <div className="text-sm font-bold text-slate-100 truncate">{wifiData.ssid || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-400">{wifiData.radioType || '802.11'}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Band & Channel</span>
                  <div className="text-sm font-bold text-slate-100">{wifiData.band || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-400">Channel {wifiData.channel ?? 'Auto'}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Signal Strength</span>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <Signal
                      className={`w-4 h-4 ${
                        (wifiData.signalPercentage ?? 0) >= 70
                          ? 'text-emerald-400'
                          : (wifiData.signalPercentage ?? 0) >= 40
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    />
                    {wifiData.signalPercentage ?? 0}%
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {(wifiData.signalPercentage ?? 0) >= 75 ? 'Optimal' : 'Moderate'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Link Speed</span>
                  <div className="text-sm font-bold text-slate-100 font-mono">
                    {wifiData.receiveRateMbps ?? 0} Mbps
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Tx: {wifiData.transmitRateMbps ?? 0} Mbps
                  </div>
                </div>
              </div>

              {/* Roaming Aggressiveness Controller */}
              {wifiData.roamingAggressiveness?.isSupported && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">Roaming Aggressiveness</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        Moderate
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Controls how aggressively your Wi-Fi card scans for other access points. Setting to <strong>Lowest</strong> prevents background scans that cause periodic ping spikes in online multiplayer games.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedRoaming}
                      onChange={(e) => handleRoamingChange(e.target.value)}
                      disabled={isUpdatingRoaming}
                      className="text-xs font-semibold py-1.5 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      {wifiData.roamingAggressiveness.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
