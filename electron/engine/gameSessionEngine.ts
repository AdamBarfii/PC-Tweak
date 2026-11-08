import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import { RegistryEngine } from './registry';
import { GamingEngine } from './gamingEngine';

const execAsync = promisify(exec);

export interface GameSessionConfig {
  enabled: boolean;
  autoSwitchPowerPlan: boolean;
  throttleBackgroundApps: boolean;
  focusAssist: boolean;
  monitoredProcesses: string[];
}

export interface GameSessionStatus {
  isActive: boolean;
  activeGame: string | null;
  sessionStartedAt: number | null;
  config: GameSessionConfig;
  throttledProcessCount: number;
}

interface SessionSnapshot {
  activeGame: string;
  startedAt: number;
  previousPowerPlanGuid: string | null;
  throttledProcesses: string[];
  focusAssistModified: boolean;
}

export class GameSessionEngine {
  private static watcherInterval: NodeJS.Timeout | null = null;
  private static isActive = false;
  private static activeGame: string | null = null;
  private static sessionStartedAt: number | null = null;
  private static throttledProcessCount = 0;
  private static currentSnapshot: SessionSnapshot | null = null;

  private static config: GameSessionConfig = {
    enabled: true,
    autoSwitchPowerPlan: true,
    throttleBackgroundApps: true,
    focusAssist: true,
    monitoredProcesses: [
      'cs2.exe',
      'valorant-win64-shipping.exe',
      'r5apex.exe',
      'fortniteclient-win64-shipping.exe',
      'dota2.exe',
      'leagueclient.exe',
      'overwatch.exe',
      'playgtav.exe',
      'gta5.exe',
      'rainbowsix.exe',
      'cod.exe',
    ],
  };

  private static targetBackgroundApps = [
    'chrome',
    'msedge',
    'firefox',
    'discord',
    'spotify',
    'steamwebhelper',
    'onedrive',
  ];

  private static getSnapshotFilePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'game_session_snapshot.json');
  }

  /**
   * Initializes session engine, restores any orphaned crash snapshots, and starts process watcher
   */
  static async init(): Promise<void> {
    await this.restoreOrphanedSession();
    await this.syncInstalledGames();
    this.startWatcher();
  }

  /**
   * Syncs installed games from GamingEngine into monitored list
   */
  static async syncInstalledGames(): Promise<void> {
    try {
      const installed = await GamingEngine.scanInstalledGames();
      for (const g of installed) {
        const exe = g.exeName.toLowerCase();
        if (!this.config.monitoredProcesses.includes(exe)) {
          this.config.monitoredProcesses.push(exe);
        }
      }
    } catch (err) {
      console.error('Failed to sync installed games into session monitor:', err);
    }
  }

  static getStatus(): GameSessionStatus {
    return {
      isActive: this.isActive,
      activeGame: this.activeGame,
      sessionStartedAt: this.sessionStartedAt,
      config: { ...this.config },
      throttledProcessCount: this.throttledProcessCount,
    };
  }

  static updateConfig(newConfig: Partial<GameSessionConfig>): GameSessionStatus {
    this.config = { ...this.config, ...newConfig };
    if (!this.config.enabled && this.isActive) {
      this.endSession().catch((e) => console.error('Failed to end session on disable:', e));
    }
    return this.getStatus();
  }

  static startWatcher(): void {
    if (this.watcherInterval) return;
    this.watcherInterval = setInterval(async () => {
      try {
        await this.checkRunningProcesses();
      } catch (err) {
        console.error('GameSessionEngine process check error:', err);
      }
    }, 3000);
  }

  static stopWatcher(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
  }

  /**
   * Reads all running executables via tasklist and detects game launches/exits
   */
  static async checkRunningProcesses(): Promise<void> {
    if (!this.config.enabled) return;

    let runningProcesses: string[] = [];
    try {
      const { stdout } = await execAsync('tasklist /FO CSV /NH', { windowsHide: true });
      runningProcesses = stdout
        .split('\n')
        .map((line) => {
          const match = line.match(/^"([^"]+)"/);
          return match ? match[1].toLowerCase() : '';
        })
        .filter(Boolean);
    } catch {
      return;
    }

    const runningSet = new Set(runningProcesses);

    // If session is already active, verify if game is still running
    if (this.isActive && this.activeGame) {
      if (!runningSet.has(this.activeGame.toLowerCase())) {
        await this.endSession();
      }
      return;
    }

    // Check if any monitored game is running
    for (const monitored of this.config.monitoredProcesses) {
      if (runningSet.has(monitored.toLowerCase())) {
        await this.triggerSession(monitored);
        break;
      }
    }
  }

  /**
   * Activates Game Session Mode
   */
  static async triggerSession(gameName: string): Promise<void> {
    if (this.isActive) return;

    this.isActive = true;
    this.activeGame = gameName;
    this.sessionStartedAt = Date.now();
    this.throttledProcessCount = 0;

    const snapshot: SessionSnapshot = {
      activeGame: gameName,
      startedAt: this.sessionStartedAt,
      previousPowerPlanGuid: null,
      throttledProcesses: [],
      focusAssistModified: false,
    };

    // 1. Auto-Switch Power Plan to Gaming
    if (this.config.autoSwitchPowerPlan) {
      try {
        const { stdout } = await execAsync('powercfg /getactivescheme', { windowsHide: true });
        const match = stdout.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (match) {
          snapshot.previousPowerPlanGuid = match[1];
        }

        // Switch to Gaming custom plan or Ultimate Performance
        const plans = await GamingEngine.getPowerPlans();
        const customPlan = plans.find((p) => p.isCustom);
        const ultimatePlan = plans.find((p) => p.guid.toLowerCase() === 'e9a42b02-d5df-448d-aa00-03f14749eb61');
        const targetGuid = customPlan?.guid || ultimatePlan?.guid || '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

        if (targetGuid && targetGuid !== snapshot.previousPowerPlanGuid) {
          await execAsync(`powercfg /setactive ${targetGuid}`, { windowsHide: true });
        }
      } catch (err) {
        console.error('Failed to switch power plan for game session:', err);
      }
    }

    // 2. Throttle non-essential background processes to Idle priority
    if (this.config.throttleBackgroundApps) {
      try {
        const names = this.targetBackgroundApps.join(',');
        const cmd = `powershell -NoProfile -Command "Get-Process -Name ${names} -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'Idle'; Write-Output $_.ProcessName } catch {} }"`;
        const { stdout } = await execAsync(cmd, { windowsHide: true });
        const throttled = stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        snapshot.throttledProcesses = Array.from(new Set(throttled));
        this.throttledProcessCount = snapshot.throttledProcesses.length;
      } catch (err) {
        console.error('Failed to throttle background processes:', err);
      }
    }

    // 3. Suppress notification toast popups (Focus Assist)
    if (this.config.focusAssist) {
      try {
        await RegistryEngine.setValue(
          'HKCU',
          'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings',
          'NOC_GLOBAL_SETTING_TOASTS_ENABLED',
          'REG_DWORD',
          0
        );
        snapshot.focusAssistModified = true;
      } catch (err) {
        console.error('Failed to activate Focus Assist:', err);
      }
    }

    this.currentSnapshot = snapshot;
    try {
      fs.writeFileSync(this.getSnapshotFilePath(), JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Restores normal state when the game exits
   */
  static async endSession(): Promise<void> {
    const snap = this.currentSnapshot;

    // 1. Restore previous power plan
    if (snap?.previousPowerPlanGuid) {
      try {
        await execAsync(`powercfg /setactive ${snap.previousPowerPlanGuid}`, { windowsHide: true });
      } catch (err) {
        console.error('Failed to restore previous power plan on session end:', err);
      }
    }

    // 2. Restore throttled processes to Normal priority
    if (snap?.throttledProcesses && snap.throttledProcesses.length > 0) {
      try {
        const names = snap.throttledProcesses.join(',');
        const cmd = `powershell -NoProfile -Command "Get-Process -Name ${names} -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'Normal' } catch {} }"`;
        await execAsync(cmd, { windowsHide: true });
      } catch (err) {
        console.error('Failed to restore process priorities on session end:', err);
      }
    }

    // 3. Restore notification toasts
    if (snap?.focusAssistModified) {
      try {
        await RegistryEngine.setValue(
          'HKCU',
          'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings',
          'NOC_GLOBAL_SETTING_TOASTS_ENABLED',
          'REG_DWORD',
          1
        );
      } catch (err) {
        console.error('Failed to restore notifications on session end:', err);
      }
    }

    this.isActive = false;
    this.activeGame = null;
    this.sessionStartedAt = null;
    this.throttledProcessCount = 0;
    this.currentSnapshot = null;

    try {
      const snapPath = this.getSnapshotFilePath();
      if (fs.existsSync(snapPath)) {
        fs.unlinkSync(snapPath);
      }
    } catch {}
  }

  /**
   * Restores any leftover session snapshot after unexpected app close or power loss
   */
  static async restoreOrphanedSession(): Promise<void> {
    try {
      const snapPath = this.getSnapshotFilePath();
      if (!fs.existsSync(snapPath)) return;

      const raw = fs.readFileSync(snapPath, 'utf-8');
      const snap = JSON.parse(raw) as SessionSnapshot;

      if (snap.previousPowerPlanGuid) {
        await execAsync(`powercfg /setactive ${snap.previousPowerPlanGuid}`, { windowsHide: true });
      }

      if (snap.throttledProcesses && snap.throttledProcesses.length > 0) {
        const names = snap.throttledProcesses.join(',');
        await execAsync(
          `powershell -NoProfile -Command "Get-Process -Name ${names} -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'Normal' } catch {} }"`,
          { windowsHide: true }
        );
      }

      if (snap.focusAssistModified) {
        await RegistryEngine.setValue(
          'HKCU',
          'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings',
          'NOC_GLOBAL_SETTING_TOASTS_ENABLED',
          'REG_DWORD',
          1
        );
      }

      fs.unlinkSync(snapPath);
      console.log('Successfully recovered from previous interrupted game session.');
    } catch (err) {
      console.error('Error during orphaned game session recovery:', err);
    }
  }
}
