import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { AntiCheatDetectionResult } from '@/types/electron';

interface AntiCheatCompatibilityCardProps {
  onPresetApplied?: () => void;
}

export const AntiCheatCompatibilityCard: React.FC<AntiCheatCompatibilityCardProps> = ({
  onPresetApplied,
}) => {
  const [data, setData] = useState<AntiCheatDetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);

  const loadStatus = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.getAntiCheatStatus(forceRefresh);
        setData(res);
      }
    } catch (err) {
      console.error('Failed to load anti-cheat compatibility:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleApplyPreset = async () => {
    setIsApplyingPreset(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.applyCompetitiveSafePreset();
        setPresetFeedback(res.message);
        await loadStatus(true);
        onPresetApplied?.();
      }
    } catch (err) {
      console.error('Failed to apply competitive-safe preset:', err);
    } finally {
      setIsApplyingPreset(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="p-5 rounded-xl glass-panel animate-pulse space-y-3">
        <div className="h-4 w-48 bg-white/10 rounded" />
        <div className="h-16 w-full bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  const { detectedAntiCheats, systemBaseline, evaluations, isCompetitiveSafeActive } = data;

  return (
    <div className="p-5 rounded-xl glass-panel space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 dark:border-white/5 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Anti-Cheat Safety & Compatibility</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isCompetitiveSafeActive
                    ? 'bg-primary/15 border border-primary/30 text-primary shadow-[0_0_8px_rgba(0,240,255,0.15)]'
                    : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                }`}
              >
                {isCompetitiveSafeActive ? 'Guardrails Active' : 'Guardrails Disengaged'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Read-only system diagnostic for Vanguard, FACEIT, EAC, and BattlEye compliance.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadStatus(true)}
            disabled={isLoading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            title="Refresh Anti-Cheat Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleApplyPreset}
            disabled={isApplyingPreset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold neon-btn-primary cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Competitive-Safe Preset</span>
          </button>
        </div>
      </div>

      {presetFeedback && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between text-xs text-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            <span>{presetFeedback}</span>
          </div>
          <button
            onClick={() => setPresetFeedback(null)}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* System Security Baseline Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Secure Boot */}
        <div className="p-3 rounded-lg glass-chip flex flex-col justify-between hover:border-cyan-500/25 transition-colors">
          <span className="text-[11px] text-muted-foreground font-medium">Secure Boot</span>
          <div className="flex items-center gap-1.5 mt-1">
            {systemBaseline.secureBootEnabled ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span
              className={`text-xs font-bold ${
                systemBaseline.secureBootEnabled ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {systemBaseline.secureBootEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {/* TPM 2.0 */}
        <div className="p-3 rounded-lg glass-chip flex flex-col justify-between hover:border-cyan-500/25 transition-colors">
          <span className="text-[11px] text-muted-foreground font-medium">TPM State</span>
          <div className="flex items-center gap-1.5 mt-1">
            {systemBaseline.tpmPresent ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span
              className={`text-xs font-bold ${
                systemBaseline.tpmPresent ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {systemBaseline.tpmPresent ? `TPM ${systemBaseline.tpmVersion}` : 'Not Found'}
            </span>
          </div>
        </div>

        {/* VBS / HVCI */}
        <div className="p-3 rounded-lg glass-chip flex flex-col justify-between hover:border-cyan-500/25 transition-colors">
          <span className="text-[11px] text-muted-foreground font-medium">VBS / HVCI</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground">
              {systemBaseline.hvciEnabled
                ? 'HVCI Active'
                : systemBaseline.vbsEnabled
                ? 'VBS Enabled'
                : 'Standard'}
            </span>
          </div>
        </div>

        {/* Driver Signature / Test Signing */}
        <div className="p-3 rounded-lg glass-chip flex flex-col justify-between hover:border-cyan-500/25 transition-colors">
          <span className="text-[11px] text-muted-foreground font-medium">Code Integrity</span>
          <div className="flex items-center gap-1.5 mt-1">
            {!systemBaseline.testSigningEnabled ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span
              className={`text-xs font-bold ${
                !systemBaseline.testSigningEnabled ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {!systemBaseline.testSigningEnabled ? 'Enforced' : 'Test Signing'}
            </span>
          </div>
        </div>
      </div>

      {/* Detected Anti-Cheat Software Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">
            Installed Anti-Cheats on this System ({detectedAntiCheats.length})
          </span>
          <span className="text-[10px] text-muted-foreground">Zero process hooks</span>
        </div>

        {detectedAntiCheats.length === 0 ? (
          <div className="p-3.5 rounded-lg glass-chip text-center text-xs text-muted-foreground">
            No known kernel anti-cheats currently detected.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {evaluations.map((ev) => {
              const detectedMeta = detectedAntiCheats.find((d) => d.id === ev.antiCheatId);
              const isRunning = detectedMeta?.isRunning;

              return (
                <div
                  key={ev.antiCheatId}
                  className="p-3.5 rounded-lg glass-chip hover:border-cyan-500/30 transition-colors flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{ev.name}</span>
                        {isRunning && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                            Driver Running
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Games: {detectedMeta?.games.join(', ')}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        ev.status === 'pass'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      }`}
                    >
                      {ev.status === 'pass' ? 'Pass' : 'Warn'}
                    </span>
                  </div>

                  {ev.reasons.length > 0 && (
                    <div className="space-y-1">
                      {ev.reasons.map((r, idx) => (
                        <p key={idx} className="text-[11px] text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span>{r}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/10 dark:border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Verified: {ev.lastVerified}</span>
                    <a
                      href={ev.supportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-cyan-300 font-semibold"
                    >
                      <span>Official Requirements</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mandatory Disclaimer Box */}
      <div className="p-3 rounded-lg glass-chip flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
        <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p>
          <strong className="text-foreground">Notice:</strong> Requirements change often; verify on the game&apos;s official support page. PC Tweak operates with strict zero-game-process intervention (no handle injection, no code hooking, no kernel drivers) and never promises to be ban-proof.
        </p>
      </div>
    </div>
  );
};
