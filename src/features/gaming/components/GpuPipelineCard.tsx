import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  Gauge,
  Layers,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GpuDeviceInfo, DirectXPresentationStatus } from '@/types/electron';
import { Switch } from '@/components/common/Switch';

interface GpuPipelineCardProps {
  onNotify?: (text: string, type?: 'success' | 'warning' | 'error') => void;
}

export const GpuPipelineCard: React.FC<GpuPipelineCardProps> = ({ onNotify }) => {
  const { i18n } = useTranslation();
  const isFa = i18n.language === 'fa';

  const [gpuList, setGpuList] = useState<GpuDeviceInfo[]>([]);
  const [dxStatus, setDxStatus] = useState<DirectXPresentationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showRebootNotice, setShowRebootNotice] = useState(false);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [gpus, dx] = await Promise.all([
          window.electronAPI.getGpuDevices(),
          window.electronAPI.getDirectXPresentationStatus(),
        ]);
        setGpuList(gpus);
        setDxStatus(dx);
      }
    } catch (err) {
      console.error('Failed to load GPU pipeline status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const discreteGpu = gpuList.find((g) => g.isDiscrete) || gpuList[0] || null;

  const handleToggleMsi = async (enable: boolean, priority: number = 3) => {
    if (!discreteGpu) return;
    setActionInProgress('msi');
    try {
      const res = await window.electronAPI?.setGpuMsi(discreteGpu.instanceId, enable, priority);
      if (res?.success) {
        setShowRebootNotice(true);
        onNotify?.(
          isFa ? 'تنظیمات وقفه MSI با موفقیت اعمال شد. راه‌اندازی مجدد برای اعمال کامل پیشنهاد می‌شود.' : res.message,
          'success'
        );
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to update GPU MSI Mode', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleMaxFrameLatency = async (enable: boolean) => {
    setActionInProgress('maxFrameLatency');
    try {
      const res = await window.electronAPI?.setMaxFrameLatency(enable);
      if (res?.success) {
        onNotify?.(isFa ? 'صف رندر DirectX با موفقیت به‌روزرسانی شد.' : res.message, 'success');
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to set MaxFrameLatency', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleFlipModel = async (enable: boolean) => {
    setActionInProgress('flipModel');
    try {
      const res = await window.electronAPI?.setFlipModelUpgrade(enable);
      if (res?.success) {
        onNotify?.(isFa ? 'مدل ارائه DXGI با موفقیت تنظیم شد.' : res.message, 'success');
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to update Flip Model', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleTdrDelay = async (enable: boolean) => {
    setActionInProgress('tdrDelay');
    try {
      const res = await window.electronAPI?.setTdrDelay(enable);
      if (res?.success) {
        setShowRebootNotice(true);
        onNotify?.(isFa ? 'زمان‌بندی TdrDelay با موفقیت به‌روزرسانی شد.' : res.message, 'success');
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to set TdrDelay', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleShaderCache = async (enable: boolean) => {
    setActionInProgress('shaderCache');
    try {
      const res = await window.electronAPI?.setShaderCacheBoost(enable);
      if (res?.success) {
        onNotify?.(isFa ? 'حافظه کش سایه‌زن DirectX با موفقیت تنظیم شد.' : res.message, 'success');
        await loadData();
      } else {
        onNotify?.(res?.message || 'Failed to update Shader Cache', 'error');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error executing request', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApplyCompetitivePreset = async () => {
    setActionInProgress('preset');
    try {
      const [resDx, resMsi] = await Promise.all([
        window.electronAPI?.applyCompetitiveDirectXPreset(),
        discreteGpu ? window.electronAPI?.setGpuMsi(discreteGpu.instanceId, true, 3) : Promise.resolve({ success: true }),
      ]);

      if (resDx?.success) {
        setShowRebootNotice(true);
        onNotify?.(
          isFa
            ? 'پریست رقابتی تاخیر حداقلی GPU و DirectX با موفقیت اعمال شد.'
            : 'Competitive Low-Latency Preset applied across GPU Interrupts and DirectX Presentation.',
          'success'
        );
        await loadData();
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Error applying preset', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevertAll = async () => {
    setActionInProgress('revert');
    try {
      await Promise.all([
        window.electronAPI?.revertDirectXPresentation(),
        discreteGpu ? window.electronAPI?.revertGpuMsi(discreteGpu.instanceId) : Promise.resolve({ success: true }),
      ]);
      setShowRebootNotice(true);
      onNotify?.(
        isFa ? 'تنظیمات GPU و DirectX به حالت پیش‌فرض بازگردانده شدند.' : 'GPU and DirectX parameters reverted to baseline.',
        'success'
      );
      await loadData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Error reverting settings', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-5 rounded-lg bg-card border border-border space-y-3 animate-pulse">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="h-24 bg-muted/40 rounded-md" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm space-y-0 text-foreground transition-all">
      {/* Header Banner */}
      <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {isFa ? 'خط لوله رندر گرافیک و وقفه‌های سخت‌افزاری (GPU Time & Latency)' : 'GPU Render Pipeline & Latency Engine'}
              </h2>
              <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                Esports
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isFa
                ? 'کاهش زمان فریم GPU، وقفه‌های سخت‌افزاری PCIe و تاخیر بافر رندر در بازی‌های رقابتی.'
                : 'Direct PCIe interrupt steering, 1-frame queue restriction, and DXGI Flip Model optimization.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={handleRevertAll}
            disabled={Boolean(actionInProgress)}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer flex items-center gap-1.5"
            title="Reset to default baseline"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{isFa ? 'پیش‌فرض' : 'Reset'}</span>
          </button>

          <button
            type="button"
            onClick={handleApplyCompetitivePreset}
            disabled={Boolean(actionInProgress)}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            {actionInProgress === 'preset' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isFa ? 'اعمال پریست تاخیر حداقلی' : 'Apply Low-Latency Preset'}</span>
          </button>
        </div>
      </div>

      {/* Reboot Notice Banner */}
      {showRebootNotice && (
        <div className="mx-4 mt-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {isFa
                ? 'تغییرات وقفه‌های سخت‌افزاری ثبت شد. برای اعمال کامل در سطح درایور ویندوز، راه‌اندازی مجدد سیستم پیشنهاد می‌شود.'
                : 'PCIe interrupt priority updated. A system restart is recommended for complete hardware re-enumeration.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowRebootNotice(false)}
            className="text-xs font-semibold underline hover:opacity-80"
          >
            {isFa ? 'بستن' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Main Content Body */}
      <div className="p-4 space-y-4">
        {/* Section 1: Discrete GPU Hardware Interrupt (MSI-X) */}
        {discreteGpu ? (
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center text-primary">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{discreteGpu.name}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-background border border-border text-muted-foreground">
                      {discreteGpu.vendor}
                    </span>
                    {discreteGpu.isDiscrete && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        Discrete GPU
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono tabular-nums mt-0.5">
                    Driver: {discreteGpu.driverVersion} | Device: {discreteGpu.instanceId.split('\\').slice(-1)[0]}
                  </p>
                </div>
              </div>

              {/* Status Badge & Toggle */}
              <div className="flex items-center gap-3">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border ${
                    discreteGpu.msiSupported && discreteGpu.devicePriority === 3
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : discreteGpu.msiSupported
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      discreteGpu.msiSupported ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {discreteGpu.msiSupported
                      ? `MSI-X Mode Active (${discreteGpu.devicePriorityText} Priority)`
                      : 'Legacy Line-Based IRQ'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleMsi(!discreteGpu.msiSupported, 3)}
                  disabled={Boolean(actionInProgress)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    discreteGpu.msiSupported && discreteGpu.devicePriority === 3
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border'
                  }`}
                >
                  {actionInProgress === 'msi' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {discreteGpu.msiSupported && discreteGpu.devicePriority === 3
                      ? isFa ? 'فعال (اولویت بالا)' : 'Optimized (High)'
                      : isFa ? 'فعال‌سازی MSI و اولویت بالا' : 'Enable MSI High'}
                  </span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isFa
                ? 'وقفه‌های خطی قدیمی (Legacy IRQ) خط ارتباطی را با صدا و USB به اشتراک می‌گذارند که سبب افت فریم و اسپایک تاخیر می‌شود. حالت MSI-X دسترسی مستقیم به حافظه PCIe برقرار کرده و اولویت بالا زمان صف پردازش فریم‌ها را به حداقل می‌رساند.'
                : 'Message Signaled Interrupts (MSI-X) route GPU render events directly into CPU memory across PCIe without legacy IRQ sharing. High priority reduces frame presentation latency spikes under heavy compute load.'}
            </p>
          </div>
        ) : null}

        {/* Section 2: DirectX Presentation & Render Queue Parameters (4 Cards Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Card 1: MaxFrameLatency = 1 */}
          <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <Timer className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isFa ? 'محدودیت صف رندر: ۱ فریم (MaxFrameLatency)' : 'MaxFrameLatency = 1 (Ultra-Low Queue)'}
                  </h4>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    DirectX Render Buffer: {dxStatus?.isMaxFrameLatencyActive ? '1 Frame (Minimal Lag)' : '3 Frames (Default)'}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <Switch
                size="sm"
                checked={Boolean(dxStatus?.isMaxFrameLatencyActive)}
                isLoading={actionInProgress === 'maxFrameLatency'}
                disabled={Boolean(actionInProgress)}
                onChange={handleToggleMaxFrameLatency}
                ariaLabel="Toggle MaxFrameLatency"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isFa
                ? 'محدود کردن تعداد فریم‌های در صف رندر پردازنده گرافیکی به ۱ فریم، تاخیر بین کلیک ماوس و رندر فریم بعدی را به حداقل رسانده و حس تاخیر ورودی را کاهش می‌دهد.'
                : 'Restricts the CPU pre-render queue to exactly 1 frame ahead. Directly lowers click-to-photon presentation delay without dropping raw framerates.'}
            </p>
          </div>

          {/* Card 2: DXGI Modern Flip Model */}
          <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isFa ? 'ارتقای مدل ارائه پنجره‌ای (DXGI Flip Model)' : 'DXGI Modern Flip Presentation'}
                  </h4>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    Presentation: {dxStatus?.swapEffectUpgradeEnable ? 'Flip Discard (0ms)' : 'Legacy Blt (Buffered)'}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <Switch
                size="sm"
                checked={Boolean(dxStatus?.swapEffectUpgradeEnable)}
                isLoading={actionInProgress === 'flipModel'}
                disabled={Boolean(actionInProgress)}
                onChange={handleToggleFlipModel}
                ariaLabel="Toggle DXGI Flip Model"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isFa
                ? 'ارتقای بازی‌های حالت پنجره‌ای و بدون حاشیه (Borderless) به مدل مدرن فلیپ. تاخیر مشابه حالت تمام‌صفحه اختصاصی را با حفظ Alt-Tab آنی فراهم می‌کند.'
                : 'Upgrades legacy borderless windowed presentation to independent Flip Model, achieving true exclusive fullscreen latency while retaining instant Alt-Tab.'}
            </p>
          </div>

          {/* Card 3: Shader Cache 10GB Boost */}
          <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isFa ? 'افزایش حافظه کش سایه‌زن (Shader Cache 10GB)' : 'DirectX Shader Cache 10GB Boost'}
                  </h4>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    Limit: {dxStatus?.isShaderCacheBoosted ? '10,240 MB (Uncapped)' : '1,024 MB (Default)'}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <Switch
                size="sm"
                checked={Boolean(dxStatus?.isShaderCacheBoosted)}
                isLoading={actionInProgress === 'shaderCache'}
                disabled={Boolean(actionInProgress)}
                onChange={handleToggleShaderCache}
                ariaLabel="Toggle Shader Cache Boost"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isFa
                ? 'جلوگیری از حذف و کامپایل مکرر سایه‌زن‌ها در نقشه‌های بزرگ CS2، وارزون و ایپکس لجندز، که منبع اصلی اسپایک‌های افت فریم (1% Low) حین ورود به محیط‌های جدید است.'
                : 'Expands DirectX shader cache to 10GB, eliminating frame drops and micro-stutters caused by background shader re-compilations during intense gunfights.'}
            </p>
          </div>

          {/* Card 4: TdrDelay 8s Extension */}
          <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col justify-between space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {isFa ? 'مهلت زمان‌بندی رندر (TdrDelay = 8s)' : 'TdrDelay = 8s (GPU Burst Stability)'}
                  </h4>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    Timeout Threshold: {dxStatus?.isTdrDelayExtended ? '8 Seconds (Extended)' : '2 Seconds (Default)'}
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <Switch
                size="sm"
                checked={Boolean(dxStatus?.isTdrDelayExtended)}
                isLoading={actionInProgress === 'tdrDelay'}
                disabled={Boolean(actionInProgress)}
                onChange={handleToggleTdrDelay}
                ariaLabel="Toggle TdrDelay Extension"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isFa
                ? 'افزایش مهلت بازنشانی درایور گرافیک از ۲ به ۸ ثانیه حین بارهای محاسباتی سنگین. از کرش و فریزهای لحظه‌ای درایور حین کامپایل سنگین جلوگیری می‌کند.'
                : 'Extends Windows GPU Timeout Detection and Recovery delay to 8 seconds, preventing micro-hang driver resets during heavy shader spikes or complex assets.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function Timer(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}
