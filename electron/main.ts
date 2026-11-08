import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync, execFile } from 'node:child_process';

import { registerTweakIpc } from './ipc/tweaks';
import { registerBackupIpc } from './ipc/backup';
import { registerInputLabIpc } from './ipc/inputLab';
import { registerProfileIpc } from './ipc/profiles';
import { registerGamingIpc } from './ipc/gaming';
import { registerNetworkIpc } from './ipc/network';
import { registerAntiCheatIpc } from './ipc/anticheat';
import { registerDiagnosticsIpc } from './ipc/diagnostics';
import { registerOptimizerIpc } from './ipc/optimizer';
import { registerAutomationIpc } from './ipc/automation';
import { registerOverclockIpc } from './ipc/overclock';
import { registerAiOptimizerIpc } from './ipc/aiOptimizer';
import { AutomationEngine } from './engine/automationEngine';
import { SettingsStore } from './storage/settingsStore';
import { registerSettingsIpc, syncStartupSetting } from './ipc/settings';
import { AutoRevertWatchdog } from './engine/autoRevertWatchdog';
import { OverlayManager } from './overlayManager';
import { getCpuTopology } from './engine/cpuTopologyEngine';
import {
  scanRunningProcesses,
  getGameProfiles,
  applyGameTweak,
  optimizeAllForGame,
  revertGame,
} from './engine/fpsOptimizerEngine';
import { getGpuDevices, setGpuMsi, revertGpuMsi } from './engine/gpuInterruptEngine';
import {
  getDirectXPresentationStatus,
  setMaxFrameLatency,
  setFlipModelUpgrade,
  setTdrDelay,
  setShaderCacheBoost,
  applyCompetitiveDirectXPreset,
  revertDirectXPresentation,
} from './engine/directXPresentationEngine';
import {
  getInputQueueStatus,
  setMouseQueueSize,
  setKeyboardQueueSize,
  revertInputQueue,
} from './engine/inputQueueEngine';
import {
  getNativePowerShellPath,
  execFileWithTimeout,
} from './processUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single-Instance Lock Enforcement with Deadlock Bypass for UAC Elevation
const isElevatedRelaunch = process.argv.includes('--elevated-relaunch');
let hasLock = app.requestSingleInstanceLock();

if (!hasLock && isElevatedRelaunch) {
  // Elevated child instance retry window: allow up to 1500ms for parent to release lock & exit
  const start = Date.now();
  while (!hasLock && Date.now() - start < 1500) {
    const buf = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buf, 0, 0, 100);
    hasLock = app.requestSingleInstanceLock();
  }
}

if (!hasLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let hasShownTrayBalloon = false;
let metricsInterval: NodeJS.Timeout | null = null;
const overlayManager = new OverlayManager();

const TRAY_ICON_BASE64 =
  'data:image/png;base64,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';

/**
 * Focus and restore the main window from any state (minimized, hidden in tray, or background).
 * Ensures zero duplicate instances run by bringing the existing instance to the foreground.
 */
function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(false);
  mainWindow.flashFrame(true);
}

/**
 * Minimizes window into the Windows taskbar hidden icons (Notification Area / System Tray).
 */
function minimizeToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();

  if (!hasShownTrayBalloon && tray && !tray.isDestroyed()) {
    hasShownTrayBalloon = true;
    try {
      tray.displayBalloon({
        title: 'PC Tweak',
        content: 'PC Tweak is running in the background. Click the tray icon to open or close.',
      });
    } catch {}
  }
}

/**
 * Initializes the Windows System Tray (Taskbar Hidden Icons) with context menu actions.
 */
function createTray() {
  if (tray && !tray.isDestroyed()) return;

  let icon: Electron.NativeImage;
  const iconPath = path.join(__dirname, '../resources/tray-icon.png');
  const packagedPath = path.join(process.resourcesPath, 'resources/tray-icon.png');

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else if (fs.existsSync(packagedPath)) {
    icon = nativeImage.createFromPath(packagedPath);
  } else {
    icon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);
  }

  tray = new Tray(icon);
  tray.setToolTip('PC Tweak');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open PC Tweak',
      click: () => {
        showAndFocusMainWindow();
      },
    },
    {
      label: 'Dashboard',
      click: () => {
        showAndFocusMainWindow();
        mainWindow?.webContents.send('nav:navigate', 'dashboard');
      },
    },
    {
      label: 'Gaming Optimizer',
      click: () => {
        showAndFocusMainWindow();
        mainWindow?.webContents.send('nav:navigate', 'gaming');
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        if (tray && !tray.isDestroyed()) {
          tray.destroy();
          tray = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy();
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      minimizeToTray();
    } else {
      showAndFocusMainWindow();
    }
  });

  tray.on('double-click', () => {
    showAndFocusMainWindow();
  });
}

// When a duplicate instance is launched, focus and restore the running window
app.on('second-instance', () => {
  showAndFocusMainWindow();
});

// Cache previous CPU times for accurate delta calculation
let prevCpuTimes = os.cpus().map((cpu) => cpu.times);

let cachedGpuStats: { load: number | null; temp: number | null; model: string | null } = {
  load: null,
  temp: null,
  model: null,
};
let cachedRamDetails: string | null = null;
let cachedCpuCores: number | null = null;
let isHardwareQueryRunning = false;
let isGpuQueryRunning = false;
let gpuQueryCounter = 0;

async function detectHardwareSpecsAsync(): Promise<void> {
  if (isHardwareQueryRunning) return;
  isHardwareQueryRunning = true;
  const psPath = getNativePowerShellPath();

  try {
    // Query real GPU model asynchronously via PowerShell CIM without blocking main thread
    const gpuCmd = "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Virtual|Remote' } | Select-Object -ExpandProperty Name -First 1) ?? (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name -First 1)";
    const { stdout: gpuOut } = await execFileWithTimeout(
      psPath,
      ['-NoProfile', '-NonInteractive', '-Command', gpuCmd],
      { timeout: 3000, windowsHide: true }
    );
    if (gpuOut && gpuOut.trim()) {
      cachedGpuStats.model = gpuOut.trim();
    }
  } catch {}

  try {
    // Query real physical memory modules asynchronously
    const ramCmd = "$m = Get-CimInstance Win32_PhysicalMemory; $c = ($m | Measure-Object).Count; $s = ($m | Select-Object -ExpandProperty ConfiguredClockSpeed -First 1); if ($c -gt 1) { \"Multi-Channel ($c Modules) $s MHz\" } elseif ($c -eq 1) { \"Single Channel (1 Module) $s MHz\" } else { \"\" }";
    const { stdout: ramOut } = await execFileWithTimeout(
      psPath,
      ['-NoProfile', '-NonInteractive', '-Command', ramCmd],
      { timeout: 3000, windowsHide: true }
    );
    if (ramOut && ramOut.trim()) {
      cachedRamDetails = ramOut.trim();
    }
  } catch {}

  try {
    // Query real physical CPU cores asynchronously
    const coreCmd = "(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty NumberOfCores -First 1) ?? ''";
    const { stdout: coreOut } = await execFileWithTimeout(
      psPath,
      ['-NoProfile', '-NonInteractive', '-Command', coreCmd],
      { timeout: 3000, windowsHide: true }
    );
    if (coreOut && coreOut.trim() && !isNaN(Number(coreOut.trim()))) {
      cachedCpuCores = Number(coreOut.trim());
    }
  } catch {} finally {
    isHardwareQueryRunning = false;
  }
}

async function queryGpuStatsAsync(): Promise<void> {
  if (isGpuQueryRunning) return;
  isGpuQueryRunning = true;

  const candidates = [
    'C:\\Windows\\System32\\nvidia-smi.exe',
    'C:\\Windows\\Sysnative\\nvidia-smi.exe',
    'nvidia-smi',
  ];

  for (const exe of candidates) {
    try {
      const { stdout } = await execFileWithTimeout(
        exe,
        ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
        { timeout: 1200, windowsHide: true }
      );
      if (stdout) {
        const parts = stdout.trim().split(',');
        if (parts.length >= 2) {
          const loadVal = parseInt(parts[0].trim(), 10);
          const tempVal = parseInt(parts[1].trim(), 10);
          cachedGpuStats.load = isNaN(loadVal) ? null : loadVal;
          cachedGpuStats.temp = isNaN(tempVal) ? null : tempVal;
          isGpuQueryRunning = false;
          return;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  // No supported CLI found or not an NVIDIA card; values remain null (truthful N/A)
  cachedGpuStats.load = null;
  cachedGpuStats.temp = null;
  isGpuQueryRunning = false;
}

function calculateCpuUsage(): number {
  const currentCpuTimes = os.cpus().map((cpu) => cpu.times);
  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < currentCpuTimes.length; i++) {
    const prev = prevCpuTimes[i];
    const curr = currentCpuTimes[i];
    if (!prev || !curr) continue;

    const prevIdle = prev.idle;
    const currIdle = curr.idle;

    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    totalIdle += currIdle - prevIdle;
    totalTick += currTotal - prevTotal;
  }

  prevCpuTimes = currentCpuTimes;
  if (totalTick <= 0) return 0;
  const usage = 100 - Math.round((totalIdle / totalTick) * 100);
  return Math.max(0, Math.min(100, usage));
}

let cachedIsElevated: boolean | null = null;
function checkIsElevated(): boolean {
  if (cachedIsElevated !== null) return cachedIsElevated;
  try {
    // fltmc fails with code 1 if not elevated
    execSync('fltmc', { stdio: 'ignore', windowsHide: true });
    cachedIsElevated = true;
    return true;
  } catch {
    cachedIsElevated = false;
    return false;
  }
}

/**
 * Handles graceful UAC self-elevation without deadlocks.
 * Releases the single-instance lock BEFORE spawning the elevated child,
 * and re-acquires it if the user declines UAC.
 */
function requestAppElevation(): boolean {
  if (checkIsElevated()) return true;

  const execPath = process.execPath;
  const psPath = getNativePowerShellPath();

  // Explicitly release single instance lock right before launching elevated child
  try {
    app.releaseSingleInstanceLock();
  } catch {}

  const psScript = `Start-Process -FilePath "${execPath}" -ArgumentList "--elevated-relaunch" -Verb RunAs`;
  execFile(psPath, ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, (err) => {
    if (err) {
      // User clicked "No" on UAC prompt (error 1223) or elevation failed: re-acquire lock so current instance stays active
      app.requestSingleInstanceLock();
      console.warn('UAC elevation request declined or failed:', err.message);
    } else {
      app.quit();
    }
  });

  return false;
}

let cachedOsEdition: string | null = null;
function getWindowsEdition(): string {
  if (cachedOsEdition) return cachedOsEdition;
  try {
    const output = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductName /reg:64', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 1500,
    });
    const match = output.match(/ProductName\s+REG_\w+\s+(.*)/i);
    if (match && match[1]?.trim()) {
      let edition = match[1].trim();
      const build = getWindowsBuild();
      const buildNum = parseInt(build, 10);
      // Windows 11 builds start at 22000. Microsoft preserves "Windows 10" in the registry ProductName for backward compatibility.
      if (!isNaN(buildNum) && buildNum >= 22000 && edition.includes('Windows 10')) {
        edition = edition.replace('Windows 10', 'Windows 11');
      }
      cachedOsEdition = edition;
      return cachedOsEdition;
    }
  } catch {}
  cachedOsEdition = 'Windows 11 Pro';
  return cachedOsEdition;
}

let cachedOsBuild: string | null = null;
function getWindowsBuild(): string {
  if (cachedOsBuild) return cachedOsBuild;
  try {
    const output = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v CurrentBuildNumber /reg:64', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 1500,
    });
    const match = output.match(/CurrentBuildNumber\s+REG_\w+\s+(.*)/i);
    if (match && match[1]?.trim()) {
      cachedOsBuild = match[1].trim();
      return cachedOsBuild;
    }
  } catch {}
  cachedOsBuild = os.release();
  return cachedOsBuild;
}

function broadcastMetricsTick() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    gpuQueryCounter++;
    if (gpuQueryCounter % 2 === 0) {
      queryGpuStatsAsync();
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const cpuSpeed = cpus.length > 0 && cpus[0].speed ? cpus[0].speed / 1000 : null;

    const metrics = {
      cpuUsage: calculateCpuUsage(),
      cpuSpeedGhz: cpuSpeed ? parseFloat(cpuSpeed.toFixed(1)) : null,
      memoryUsedGb: parseFloat((usedMem / (1024 * 1024 * 1024)).toFixed(1)),
      memoryTotalGb: parseFloat((totalMem / (1024 * 1024 * 1024)).toFixed(0)),
      memoryPercentage: Math.round((usedMem / totalMem) * 100),
      gpuLoad: cachedGpuStats.load,
      gpuTemp: cachedGpuStats.temp,
      gpuModel: cachedGpuStats.model,
      uptimeSeconds: Math.floor(os.uptime()),
    };
    mainWindow.webContents.send('metrics:update', metrics);

    const overlayTelemetry = overlayManager.getTelemetry(metrics);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('overlay:telemetry', overlayTelemetry);
      }
    });
  }
}

export function updateMetricsPollingInterval(intervalMs: number): void {
  const clamped = Math.max(500, Math.min(5000, Number.isFinite(intervalMs) ? intervalMs : 1000));
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
  metricsInterval = setInterval(broadcastMetricsTick, clamped);
}

function createWindow() {
  const isHiddenLaunch = process.argv.includes('--hidden');

  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
    ? path.join(__dirname, 'preload.cjs')
    : path.join(__dirname, 'preload.js');

  const appIconPath = path.join(__dirname, '../resources/icon.png');
  const packagedAppIcon = path.join(process.resourcesPath, 'resources/icon.png');
  const windowIcon = fs.existsSync(appIconPath)
    ? nativeImage.createFromPath(appIconPath)
    : fs.existsSync(packagedAppIcon)
    ? nativeImage.createFromPath(packagedAppIcon)
    : nativeImage.createFromDataURL(TRAY_ICON_BASE64);

  mainWindow = new BrowserWindow({
    title: 'PC Tweak',
    icon: windowIcon,
    width: 1200,
    height: 780,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#070A10',
    show: !isHiddenLaunch,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  if (isHiddenLaunch) {
    minimizeToTray();
  }

  // Intercept window minimize event to respect user preferences
  mainWindow.on('minimize', () => {
    const settings = SettingsStore.getSettings();
    if (settings.minimizeToTray) {
      minimizeToTray();
    }
  });

  // Intercept window close event to respect closeToTray setting
  mainWindow.on('close', (event: Electron.Event) => {
    const settings = SettingsStore.getSettings();
    if (settings.closeToTray && !isQuitting) {
      event.preventDefault();
      minimizeToTray();
      return;
    }
    if (!isQuitting) {
      isQuitting = true;
    }
  });

  mainWindow.webContents.on('preload-error', (_event, path, error) => {
    console.error('CRITICAL PRELOAD ERROR in', path, error);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('CRITICAL LOAD ERROR:', errorCode, errorDescription);
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Overlay IPC handlers
ipcMain.handle('overlay:getConfig', () => overlayManager.getConfig());
ipcMain.handle('overlay:saveConfig', (_event, config) => overlayManager.saveConfig(config));
ipcMain.handle('overlay:toggle', () => overlayManager.toggleOverlay());

// FPS Esports & Shooter Optimizer IPC handlers
ipcMain.handle('fps:getCpuTopology', (_event, forceRefresh) => getCpuTopology(forceRefresh));
ipcMain.handle('fps:getRunningProcesses', () => scanRunningProcesses());
ipcMain.handle('fps:getGameProfiles', () => getGameProfiles());
ipcMain.handle('fps:applyGameTweak', (_event, exeName, tweakType, enable, customMaskHex) =>
  applyGameTweak(exeName, tweakType, enable, customMaskHex)
);
ipcMain.handle('fps:optimizeAll', (_event, exeName, customMaskHex) =>
  optimizeAllForGame(exeName, customMaskHex)
);
ipcMain.handle('fps:revertGame', (_event, exeName) => revertGame(exeName));

// GPU Pipeline & Hardware MSI Interrupt handlers
ipcMain.handle('gpuPipeline:getDevices', () => getGpuDevices());
ipcMain.handle('gpuPipeline:setMsi', (_event, instanceId, enableMsi, priority) =>
  setGpuMsi(instanceId, enableMsi, priority)
);
ipcMain.handle('gpuPipeline:revertMsi', (_event, instanceId) => revertGpuMsi(instanceId));

// DirectX Low-Latency Presentation handlers
ipcMain.handle('directX:getStatus', () => getDirectXPresentationStatus());
ipcMain.handle('directX:setMaxFrameLatency', (_event, enabled) => setMaxFrameLatency(enabled));
ipcMain.handle('directX:setFlipModel', (_event, enabled) => setFlipModelUpgrade(enabled));
ipcMain.handle('directX:setTdrDelay', (_event, extended) => setTdrDelay(extended));
ipcMain.handle('directX:setShaderCacheBoost', (_event, boosted) => setShaderCacheBoost(boosted));
ipcMain.handle('directX:applyCompetitivePreset', () => applyCompetitiveDirectXPreset());
ipcMain.handle('directX:revert', () => revertDirectXPresentation());

// High-Polling Input Queue Depth handlers
ipcMain.handle('inputQueue:getStatus', () => getInputQueueStatus());
ipcMain.handle('inputQueue:setMouseQueue', (_event, size) => setMouseQueueSize(size));
ipcMain.handle('inputQueue:setKeyboardQueue', (_event, size) => setKeyboardQueueSize(size));
ipcMain.handle('inputQueue:revert', () => revertInputQueue());

// Window control IPC handlers
ipcMain.handle('window:minimize', () => {
  const settings = SettingsStore.getSettings();
  if (settings.minimizeToTray) {
    minimizeToTray();
  } else {
    mainWindow?.minimize();
  }
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  const settings = SettingsStore.getSettings();
  if (settings.closeToTray && !isQuitting) {
    minimizeToTray();
    return;
  }
  isQuitting = true;
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  app.quit();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// System Info IPC handlers
ipcMain.handle('system:getInfo', () => {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 && cpus[0].model ? cpus[0].model : 'Unknown Processor';
  const totalMemGb = parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(0));
  const cpuThreads = cpus.length;

  const archString =
    process.arch === 'x64'
      ? '64-bit (x64)'
      : process.arch === 'arm64'
      ? '64-bit (ARM64)'
      : process.arch;

  return {
    osName: getWindowsEdition(),
    osBuild: getWindowsBuild(),
    osArchitecture: archString,
    cpuModel,
    totalMemoryGb: totalMemGb,
    isElevated: checkIsElevated(),
    hostname: os.hostname(),
    gpuModel: cachedGpuStats.model,
    ramDetails: cachedRamDetails,
    cpuCores: cachedCpuCores || Math.max(1, Math.floor(cpuThreads / 2)),
    cpuThreads,
  };
});

ipcMain.handle('system:getMetrics', () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const cpuSpeed = cpus.length > 0 && cpus[0].speed ? cpus[0].speed / 1000 : null;

  return {
    cpuUsage: calculateCpuUsage(),
    cpuSpeedGhz: cpuSpeed ? parseFloat(cpuSpeed.toFixed(1)) : null,
    memoryUsedGb: parseFloat((usedMem / (1024 * 1024 * 1024)).toFixed(2)),
    memoryTotalGb: parseFloat((totalMem / (1024 * 1024 * 1024)).toFixed(2)),
    memoryPercentage: Math.round((usedMem / totalMem) * 100),
    gpuLoad: cachedGpuStats.load,
    gpuTemp: cachedGpuStats.temp,
    gpuModel: cachedGpuStats.model,
    uptimeSeconds: Math.floor(os.uptime()),
  };
});

ipcMain.handle('system:requestElevation', async () => {
  return requestAppElevation();
});

// Conflict & System Risk Check Handlers
ipcMain.handle('system:checkConflicts', async () => {
  let isDockerInstalled = false;
  let isWslInstalled = false;
  let isUsePlatformClockActive = false;
  let isLaptopOnBattery = false;

  try {
    const { stdout: dockerCheck } = await execFileWithTimeout('where.exe', ['docker'], { timeout: 1500, windowsHide: true });
    isDockerInstalled = !!dockerCheck.trim();
  } catch {}

  try {
    const { stdout: wslCheck } = await execFileWithTimeout('wsl.exe', ['-l', '-q'], { timeout: 1500, windowsHide: true });
    isWslInstalled = wslCheck.trim().length > 0;
  } catch {}

  try {
    const { stdout: bcdOutput } = await execFileWithTimeout('bcdedit.exe', ['/enum', '{current}'], { timeout: 1500, windowsHide: true });
    isUsePlatformClockActive =
      bcdOutput.toLowerCase().includes('useplatformclock') &&
      bcdOutput.toLowerCase().includes('yes');
  } catch {}

  try {
    const { stdout: battCheck } = await execFileWithTimeout(
      getNativePowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).BatteryStatus'],
      { timeout: 2000, windowsHide: true }
    );
    isLaptopOnBattery = battCheck.trim() === '1';
  } catch {}

  return {
    isDockerInstalled,
    isWslInstalled,
    isUsePlatformClockActive,
    isLaptopOnBattery,
  };
});

ipcMain.handle('system:removeUsePlatformClock', async () => {
  try {
    await execFileWithTimeout('bcdedit.exe', ['/deletevalue', 'useplatformclock'], { timeout: 2000, windowsHide: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  // Auto-Elevation: If not elevated, and not explicitly launched with --no-elevate
  if (!process.argv.includes('--no-elevate') && !checkIsElevated()) {
    requestAppElevation();
    return;
  }

  detectHardwareSpecsAsync();
  registerTweakIpc();
  registerBackupIpc();
  registerInputLabIpc();
  registerProfileIpc();
  registerGamingIpc();
  registerNetworkIpc();
  registerAntiCheatIpc();
  registerDiagnosticsIpc();
  registerOptimizerIpc();
  registerAutomationIpc();
  registerOverclockIpc();
  registerAiOptimizerIpc();
  AutomationEngine.start();

  // Register settings IPC and sync startup preferences
  const startupSettings = SettingsStore.getSettings();
  syncStartupSetting(startupSettings.launchOnStartup).catch((err) => {
    console.error('Failed to sync startup setting on boot:', err);
  });
  registerSettingsIpc(updateMetricsPollingInterval);
  updateMetricsPollingInterval(startupSettings.hardwarePollingInterval);

  AutoRevertWatchdog.checkStartupCrashRecovery().catch((err) => {
    console.error('Failed to run crash recovery on startup:', err);
  });
  createWindow();
  createTray();

  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
    ? path.join(__dirname, 'preload.cjs')
    : path.join(__dirname, 'preload.js');
  overlayManager.createOverlayWindow(preloadPath, process.env.VITE_DEV_SERVER_URL);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showAndFocusMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  AutomationEngine.stop();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (metricsInterval) clearInterval(metricsInterval);
  overlayManager.destroy();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
