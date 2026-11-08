import { app, BrowserWindow, screen, globalShortcut, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { getNativePowerShellPath, execFileWithTimeout } from './processUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type OverlayCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type OverlayLayout = 'compact' | 'expanded';

export interface OverlayConfig {
  enabled: boolean;
  corner: OverlayCorner;
  layout: OverlayLayout;
  opacity: number;
  showFps: boolean;
  showDpc: boolean;
  showCpu: boolean;
  showGpu: boolean;
  showRam: boolean;
  hotkey: string;
}

export interface OverlayTelemetry {
  fps: number | null;
  dpcPercent: number | null;
  dpcLatencyUs: number | null;
  cpuUsage: number;
  cpuSpeedGhz: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  memoryPercentage: number;
  memoryUsedGb: number;
  uptimeSeconds: number;
}

const DEFAULT_CONFIG: OverlayConfig = {
  enabled: false,
  corner: 'top-right',
  layout: 'compact',
  opacity: 90,
  showFps: true,
  showDpc: true,
  showCpu: true,
  showGpu: true,
  showRam: true,
  hotkey: 'CommandOrControl+Shift+O',
};

export class OverlayManager {
  private overlayWindow: BrowserWindow | null = null;
  private config: OverlayConfig = { ...DEFAULT_CONFIG };
  private telemetryTimer: NodeJS.Timeout | null = null;
  private isSamplingDpc = false;
  private cachedDpcPercent: number | null = null;
  private isElevated = false;
  private cachedPreloadPath: string | null = null;
  private cachedDevServerUrl: string | undefined = undefined;

  constructor() {
    this.loadConfig();
    this.checkElevation();
  }

  private getConfigPath(): string {
    const userData = app.getPath('userData');
    return path.join(userData, 'overlay-config.json');
  }

  private loadConfig(): void {
    try {
      const p = this.getConfigPath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  public saveConfig(newConfig: Partial<OverlayConfig>): OverlayConfig {
    this.config = { ...this.config, ...newConfig };
    try {
      const p = this.getConfigPath();
      fs.writeFileSync(p, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save overlay config:', err);
    }

    this.applyConfigToWindow();
    return this.config;
  }

  public getConfig(): OverlayConfig {
    return { ...this.config };
  }

  private checkElevation(): void {
    try {
      const { execSync } = require('node:child_process');
      execSync('fltmc', { stdio: 'ignore', windowsHide: true });
      this.isElevated = true;
    } catch {
      this.isElevated = false;
    }
  }

  private getWindowBounds(corner: OverlayCorner, layout: OverlayLayout) {
    const primary = screen.getPrimaryDisplay();
    const workArea = primary.workArea;

    // Compact layout 360px guarantees clean fit for all 5 telemetry chips without line wrapping
    const width = layout === 'compact' ? 360 : 400;
    const height = layout === 'compact' ? 56 : 140;
    const margin = 20;

    let x = workArea.x + workArea.width - width - margin;
    let y = workArea.y + margin;

    if (corner === 'top-left') {
      x = workArea.x + margin;
      y = workArea.y + margin;
    } else if (corner === 'bottom-left') {
      x = workArea.x + margin;
      y = workArea.y + workArea.height - height - margin;
    } else if (corner === 'bottom-right') {
      x = workArea.x + workArea.width - width - margin;
      y = workArea.y + workArea.height - height - margin;
    }

    return { x: Math.round(x), y: Math.round(y), width, height };
  }

  private getHtmlPath(): string {
    const candidates = [
      path.join(__dirname, '../dist/index.html'),
      path.join(app.getAppPath(), 'dist/index.html'),
      path.join(app.getAppPath(), 'index.html'),
      path.join(__dirname, 'index.html'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {}
    }
    return candidates[0];
  }

  public ensureOverlayWindow(): BrowserWindow | null {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }
    if (this.cachedPreloadPath) {
      return this.createOverlayWindow(this.cachedPreloadPath, this.cachedDevServerUrl);
    }
    return null;
  }

  public createOverlayWindow(preloadPath: string, devServerUrl?: string): BrowserWindow {
    this.cachedPreloadPath = preloadPath;
    this.cachedDevServerUrl = devServerUrl;

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }

    const bounds = this.getWindowBounds(this.config.corner, this.config.layout);

    try {
      this.overlayWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        show: false,
        type: 'toolbar',
        thickFrame: false,
        backgroundColor: '#00000000',
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });

      // Pass mouse clicks directly through to game / crosshair underneath
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);

      this.overlayWindow.webContents.on('preload-error', (_event, filePath, error) => {
        console.error('CRITICAL OVERLAY PRELOAD ERROR in', filePath, error);
      });

      this.overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('CRITICAL OVERLAY LOAD ERROR:', errorCode, errorDescription);
      });

      if (devServerUrl) {
        this.overlayWindow.loadURL(`${devServerUrl}#overlay?overlay=true`);
      } else {
        const htmlPath = this.getHtmlPath();
        this.overlayWindow.loadFile(htmlPath, {
          hash: 'overlay',
          query: { overlay: 'true' },
        });
      }

      this.overlayWindow.on('closed', () => {
        this.overlayWindow = null;
      });

      this.registerGlobalHotkey();
      this.startTelemetryStream();

      if (this.config.enabled) {
        this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        this.overlayWindow.moveTop();
        this.overlayWindow.showInactive();
      }

      return this.overlayWindow;
    } catch (err) {
      console.error('Failed to create overlay window:', err);
      throw err;
    }
  }

  public registerGlobalHotkey(): void {
    try {
      globalShortcut.unregister(this.config.hotkey);
      const registered = globalShortcut.register(this.config.hotkey, () => {
        this.toggleOverlay();
      });
      if (!registered) {
        console.warn('Failed to register global hotkey for overlay:', this.config.hotkey);
      }
    } catch (err) {
      console.error('Error registering overlay hotkey:', err);
    }
  }

  public toggleOverlay(): boolean {
    const win = this.ensureOverlayWindow();
    if (!win || win.isDestroyed()) return false;

    if (win.isVisible()) {
      win.hide();
      this.config.enabled = false;
    } else {
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.moveTop();
      win.showInactive();
      this.config.enabled = true;
    }

    this.saveConfig({ enabled: this.config.enabled });
    this.broadcastConfig();
    return this.config.enabled;
  }

  public applyConfigToWindow(): void {
    const win = this.ensureOverlayWindow();
    if (!win || win.isDestroyed()) return;

    const bounds = this.getWindowBounds(this.config.corner, this.config.layout);
    win.setBounds(bounds);

    win.webContents.send('overlay:configUpdate', this.config);

    if (this.config.enabled) {
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.moveTop();
      if (!win.isVisible()) {
        win.showInactive();
      }
    } else {
      if (win.isVisible()) {
        win.hide();
      }
    }
  }

  private broadcastConfig(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('overlay:configUpdate', this.config);
    }
    // Also notify main window so the settings toggle reflects change
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== this.overlayWindow && !win.isDestroyed()) {
        win.webContents.send('overlay:configUpdate', this.config);
      }
    });
  }

  private async sampleDpcAsync(): Promise<void> {
    if (this.isSamplingDpc) return;
    this.isSamplingDpc = true;

    try {
      const psCommand = `(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object {$_.Name -eq '_Total'}).PercentDPCTime`;
      const { stdout } = await execFileWithTimeout(
        getNativePowerShellPath(),
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        { timeout: 2500, windowsHide: true }
      );
      const val = parseFloat(stdout.trim());
      this.cachedDpcPercent = isNaN(val) ? null : Math.min(100, Math.max(0, val));
    } catch {
      this.cachedDpcPercent = null;
    } finally {
      this.isSamplingDpc = false;
    }
  }

  public getTelemetry(
    metrics: {
      cpuUsage: number;
      cpuSpeedGhz: number | null;
      gpuLoad: number | null;
      gpuTemp: number | null;
      memoryPercentage: number;
      memoryUsedGb: number;
      uptimeSeconds: number;
    }
  ): OverlayTelemetry {
    // Convert DPC percentage to an estimated microsecond latency gauge (1% of 1000ms = 10ms = 10,000us)
    const dpcLatencyUs =
      this.cachedDpcPercent !== null && this.cachedDpcPercent !== undefined
        ? Math.round(this.cachedDpcPercent * 100)
        : null;

    return {
      fps: null, // Truthfully null unless an active 3D DirectX present session is captured
      dpcPercent: this.cachedDpcPercent,
      dpcLatencyUs,
      cpuUsage: metrics.cpuUsage,
      cpuSpeedGhz: metrics.cpuSpeedGhz,
      gpuLoad: metrics.gpuLoad,
      gpuTemp: metrics.gpuTemp,
      memoryPercentage: metrics.memoryPercentage,
      memoryUsedGb: metrics.memoryUsedGb,
      uptimeSeconds: metrics.uptimeSeconds,
    };
  }

  public startTelemetryStream(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);

    let counter = 0;
    this.telemetryTimer = setInterval(async () => {
      counter++;
      // Sample DPC every 3 seconds to avoid subprocess spam
      if (counter % 3 === 0) {
        this.sampleDpcAsync();
      }
    }, 1000);
  }

  public destroy(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    try {
      globalShortcut.unregister(this.config.hotkey);
    } catch {}
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
  }
}
