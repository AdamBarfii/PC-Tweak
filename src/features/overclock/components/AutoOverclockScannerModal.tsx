import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Activity, Zap, CheckCircle2, AlertTriangle, XCircle, RotateCcw } from 'lucide-react';
import { AutoOverclockStep } from '@/types/electron';

interface AutoOverclockScannerModalProps {
  isOpen: boolean;
  currentStep: AutoOverclockStep | null;
  onCancel: () => void;
  onClose: () => void;
}

export const AutoOverclockScannerModal: React.FC<AutoOverclockScannerModalProps> = ({
  isOpen,
  currentStep,
  onCancel,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const isCompleted = currentStep?.stage === 'completed';
  const isAborted = currentStep?.stage === 'aborted';
  const isScanning = !isCompleted && !isAborted;

  const progressPercent = currentStep ? Math.round((currentStep.currentStep / currentStep.totalSteps) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-cyan-500/30 bg-card/95 p-6 shadow-[0_0_50px_rgba(0,240,255,0.2)] overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.25)]">
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : isAborted ? (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              ) : (
                <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {isCompleted
                  ? t('overclock.modal.completedTitle', 'Auto-OC Optimization Complete')
                  : isAborted
                  ? t('overclock.modal.abortedTitle', 'Auto-OC Scan Aborted')
                  : t('overclock.modal.scanningTitle', 'Zero-Harm Auto-OC Scanner Running')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('overclock.modal.subtitle', 'Iterative safe step testing within non-destructive hardware guardrails.')}
              </p>
            </div>
          </div>
        </div>

        {/* Center Scanner Cockpit */}
        <div className="py-6 space-y-6 relative z-10">
          {/* Circular/Pulse Meter */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Outer Pulse Rings */}
              {isScanning && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping opacity-40" />
                  <div className="absolute inset-2 rounded-full border border-emerald-500/40 animate-pulse" />
                </>
              )}
              <div className="w-24 h-24 rounded-full bg-black/60 border border-cyan-500/50 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.25)]">
                <span className="text-2xl font-black font-mono text-cyan-300">
                  {progressPercent}%
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('overclock.modal.progress', 'Validated')}
                </span>
              </div>
            </div>

            {/* Live Metrics Under Pulse */}
            <div className="flex items-center gap-4 mt-4 text-xs font-mono">
              <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                <span className="text-muted-foreground text-[10px] block font-sans">
                  {t('overclock.telemetry.coreOffset', 'Tested Core')}
                </span>
                <span className="text-cyan-400 font-bold">
                  +{currentStep?.testedCoreOffset || 0} MHz
                </span>
              </div>
              <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                <span className="text-muted-foreground text-[10px] block font-sans">
                  {t('overclock.telemetry.memOffset', 'Tested Memory')}
                </span>
                <span className="text-emerald-400 font-bold">
                  +{currentStep?.testedMemOffset || 0} MHz
                </span>
              </div>
              <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                <span className="text-muted-foreground text-[10px] block font-sans">
                  {t('overclock.telemetry.gpuTemp', 'GPU Temp')}
                </span>
                <span
                  className={`font-bold ${
                    (currentStep?.currentTemp || 0) > 75
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {currentStep?.currentTemp || 0}°C
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                {t('overclock.modal.currentStage', 'Stage: {{stage}}', {
                  stage: currentStep?.stage || 'preflight',
                })}
              </span>
              <span className="text-cyan-400 font-mono font-bold">
                Step {currentStep?.currentStep || 1} / {currentStep?.totalSteps || 10}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Status Message Terminal */}
          <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 font-mono text-xs">
            <div className="flex items-center gap-2 text-cyan-400 text-[11px] font-semibold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              {t('overclock.modal.telemetryLog', 'Safety Telemetry Stream')}
            </div>
            <p className="text-foreground leading-relaxed">
              {currentStep?.statusMessage || t('overclock.modal.initializing', 'Initializing safe auto-tuner engine...')}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10 relative z-10">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('overclock.safety.voltageProtected', 'Zero Overvolting Guaranteed')}</span>
          </div>

          {isScanning ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition active:scale-95"
            >
              <XCircle className="w-4 h-4" />
              {t('common.cancel', 'Cancel Scan')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 transition active:scale-95 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
            >
              {t('common.done', 'Done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
