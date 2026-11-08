import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { AntiCheatStore, AntiCheatRequirement } from '../storage/antiCheatStore';
import { AuditStore } from '../storage/auditStore';
import { RegistryEngine } from './registry';

const execAsync = promisify(exec);

export interface DetectedAntiCheat {
  id: string;
  name: string;
  games: string[];
  isRunning: boolean;
  serviceName?: string;
  driverName?: string;
}

export interface SystemSecurityBaseline {
  secureBootEnabled: boolean;
  tpmPresent: boolean;
  tpmVersion: string;
  tpmInitialized: boolean;
  vbsEnabled: boolean;
  hvciEnabled: boolean;
  osVersion: string;
  testSigningEnabled: boolean;
}

export interface AntiCheatEvaluation {
  antiCheatId: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  reasons: string[];
  supportUrl: string;
  lastVerified: string;
  note: string;
}

export interface AntiCheatDetectionResult {
  detectedAntiCheats: DetectedAntiCheat[];
  systemBaseline: SystemSecurityBaseline;
  evaluations: AntiCheatEvaluation[];
  isCompetitiveSafeActive: boolean;
  hasAntiCheatInstalled: boolean;
}

export class AntiCheatEngine {
  private static settingsFile: string;
  private static cachedResult: AntiCheatDetectionResult | null = null;
  private static lastCheckTime = 0;

  private static getSettingsPath(): string {
    if (!this.settingsFile) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.settingsFile = path.join(storageDir, 'antiCheatSettings.json');
    }
    return this.settingsFile;
  }

  /**
   * Reads persistent Competitive-Safe toggle state from disk.
   */
  static getPersistedCompetitiveSafe(): boolean | null {
    try {
      const p = this.getSettingsPath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data.isCompetitiveSafeActive === 'boolean') {
          return data.isCompetitiveSafeActive;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Persists Competitive-Safe mode toggle.
   */
  static setCompetitiveSafe(enabled: boolean): void {
    try {
      const p = this.getSettingsPath();
      const data = { isCompetitiveSafeActive: enabled, updatedAt: new Date().toISOString() };
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
      if (this.cachedResult) {
        this.cachedResult.isCompetitiveSafeActive = enabled;
      }
      AuditStore.record({
        category: 'system',
        action: `Competitive-Safe Mode: ${enabled ? 'Enabled' : 'Disabled'}`,
        details: enabled
          ? 'Competitive-Safe Guardrails engaged: blocked-risk tweaks locked.'
          : 'Competitive-Safe Guardrails disengaged by user.',
        reversible: true,
      });
    } catch (err) {
      console.error('Failed to persist Competitive-Safe mode:', err);
    }
  }

  /**
   * Reads current system security baseline (Secure Boot, TPM 2.0, VBS, HVCI, BCD).
   * Fully non-elevated read-only telemetry.
   */
  static async getSystemBaseline(): Promise<SystemSecurityBaseline> {
    let secureBootEnabled = false;
    let tpmPresent = false;
    let tpmVersion = 'Unknown';
    let tpmInitialized = false;
    let vbsEnabled = false;
    let hvciEnabled = false;
    let testSigningEnabled = false;

    // 1. Secure Boot State
    try {
      const sbVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State',
        'UEFISecureBootEnabled'
      );
      if (sbVal.exists && sbVal.value?.toString() === '1') {
        secureBootEnabled = true;
      }
    } catch {}

    // 2. TPM 2.0 State via native tpmtool
    try {
      const { stdout } = await execAsync('tpmtool getdeviceinformation', { windowsHide: true });
      if (stdout.includes('-TPM Present: True')) {
        tpmPresent = true;
      }
      const vMatch = stdout.match(/-TPM Version:\s*([^\r\n]+)/);
      if (vMatch) {
        tpmVersion = vMatch[1].trim();
      }
      if (stdout.includes('-Is Initialized: True')) {
        tpmInitialized = true;
      }
    } catch {}

    // 3. VBS & HVCI
    try {
      const vbsVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard',
        'EnableVirtualizationBasedSecurity'
      );
      if (vbsVal.exists && vbsVal.value?.toString() === '1') {
        vbsEnabled = true;
      }

      const hvciVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
        'Enabled'
      );
      if (hvciVal.exists && hvciVal.value?.toString() === '1') {
        hvciEnabled = true;
      }
    } catch {}

    // 4. Test Signing
    try {
      const { stdout } = await execAsync('bcdedit /enum {current}', { windowsHide: true });
      if (/testsigning\s+yes/i.test(stdout) || /nointegritychecks\s+yes/i.test(stdout)) {
        testSigningEnabled = true;
      }
    } catch {
      // bcdedit requires admin; default to false if inaccessible
      testSigningEnabled = false;
    }

    // 5. Windows OS build version
    const osVersion = `${os.type()} ${os.release()} (${process.env.PROCESSOR_ARCHITECTURE || 'x64'})`;

    return {
      secureBootEnabled,
      tpmPresent,
      tpmVersion,
      tpmInitialized,
      vbsEnabled,
      hvciEnabled,
      osVersion,
      testSigningEnabled,
    };
  }

  /**
   * Queries installed anti-cheat services and drivers (Read-Only).
   * Zero process touching.
   */
  static async detectInstalledAntiCheats(): Promise<DetectedAntiCheat[]> {
    const requirements = AntiCheatStore.getRequirements();
    const detected: DetectedAntiCheat[] = [];

    for (const req of requirements) {
      let isInstalled = false;
      let isRunning = false;
      let matchedService: string | undefined;
      let matchedDriver: string | undefined;

      // Check user services
      for (const sName of req.serviceNames) {
        try {
          const { stdout } = await execAsync(`sc.exe query "${sName}"`, { windowsHide: true });
          if (stdout.includes('SERVICE_NAME')) {
            isInstalled = true;
            matchedService = sName;
            if (stdout.includes('STATE') && stdout.includes('RUNNING')) {
              isRunning = true;
            }
            break;
          }
        } catch {}
      }

      // Check kernel drivers
      for (const dName of req.driverNames) {
        try {
          const cleanName = dName.replace(/\.sys$/i, '');
          const { stdout } = await execAsync(`sc.exe query "${cleanName}"`, { windowsHide: true });
          if (stdout.includes('SERVICE_NAME')) {
            isInstalled = true;
            matchedDriver = dName;
            if (stdout.includes('STATE') && stdout.includes('RUNNING')) {
              isRunning = true;
            }
            break;
          }
        } catch {}
      }

      if (isInstalled) {
        detected.push({
          id: req.id,
          name: req.name,
          games: req.games,
          isRunning,
          serviceName: matchedService,
          driverName: matchedDriver,
        });
      }
    }

    return detected;
  }

  /**
   * Evaluates detected anti-cheats against the machine's baseline security.
   */
  static evaluateAntiCheats(
    detected: DetectedAntiCheat[],
    baseline: SystemSecurityBaseline
  ): AntiCheatEvaluation[] {
    const evaluations: AntiCheatEvaluation[] = [];

    for (const item of detected) {
      const req = AntiCheatStore.getRequirementById(item.id);
      if (!req) continue;

      const reasons: string[] = [];
      let status: 'pass' | 'warning' | 'fail' = 'pass';

      // 1. Secure Boot check
      if (req.requiredSecureBoot === 'required' && !baseline.secureBootEnabled) {
        status = 'warning';
        reasons.push('Secure Boot is Disabled (Required on Windows 11).');
      }

      // 2. TPM 2.0 check
      if (req.requiredTpm === '2.0' && (!baseline.tpmPresent || !baseline.tpmVersion.includes('2.0'))) {
        status = 'warning';
        reasons.push('TPM 2.0 is Missing or Inactive (Required for launch on Win 11).');
      }

      // 3. VBS / Hypervisor check
      if (req.requiredHypervisor === 'required' && !baseline.vbsEnabled && !baseline.hvciEnabled) {
        if (req.id === 'vanguard') {
          // Vanguard strongly recommends VBS and requires Hypervisor
          reasons.push('Virtualization-Based Security / Hypervisor is recommended for full compliance.');
        }
      }

      // 4. Test Signing check
      if (baseline.testSigningEnabled) {
        status = 'fail';
        reasons.push('Windows Test Signing is Enabled (Anti-cheat will block game launch).');
      }

      evaluations.push({
        antiCheatId: req.id,
        name: req.name,
        status,
        reasons,
        supportUrl: req.supportUrl,
        lastVerified: req.lastVerified,
        note: req.note,
      });
    }

    return evaluations;
  }

  /**
   * Complete Anti-Cheat diagnostic scan.
   */
  static async getFullAntiCheatStatus(forceRefresh = false): Promise<AntiCheatDetectionResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && now - this.lastCheckTime < 10000) {
      return this.cachedResult;
    }

    const [detectedAntiCheats, systemBaseline] = await Promise.all([
      this.detectInstalledAntiCheats(),
      this.getSystemBaseline(),
    ]);

    const evaluations = this.evaluateAntiCheats(detectedAntiCheats, systemBaseline);
    const hasAntiCheatInstalled = detectedAntiCheats.length > 0;

    // Determine Competitive-Safe state:
    // If user explicitly configured it, use saved value.
    // Otherwise, default to ON if any anti-cheat is installed, else OFF.
    const persisted = this.getPersistedCompetitiveSafe();
    const isCompetitiveSafeActive = persisted !== null ? persisted : hasAntiCheatInstalled;

    const result: AntiCheatDetectionResult = {
      detectedAntiCheats,
      systemBaseline,
      evaluations,
      isCompetitiveSafeActive,
      hasAntiCheatInstalled,
    };

    this.cachedResult = result;
    this.lastCheckTime = now;
    return result;
  }

  /**
   * Applies the 1-Click Competitive-Safe Preset:
   * - Reverts all active 'blocked-risk' tweaks.
   * - Applies certified 'safe' tweaks (Game Mode, Game DVR off, etc.).
   */
  static async applyCompetitiveSafePreset(): Promise<{
    success: boolean;
    appliedCount: number;
    revertedCount: number;
    message: string;
  }> {
    let appliedCount = 0;
    let revertedCount = 0;

    // 1. Revert dangerous blocked-risk tweaks (VBS disable, bcdedit, etc.)
    try {
      // If VBS was disabled, re-enable VBS and HVCI
      const vbsVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard',
        'EnableVirtualizationBasedSecurity'
      );
      if (vbsVal.exists && vbsVal.value?.toString() === '0') {
        await RegistryEngine.setValue(
          'HKLM',
          'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard',
          'EnableVirtualizationBasedSecurity',
          'REG_DWORD',
          1
        );
        revertedCount++;
      }

      const hvciVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
        'Enabled'
      );
      if (hvciVal.exists && hvciVal.value?.toString() === '0') {
        await RegistryEngine.setValue(
          'HKLM',
          'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
          'Enabled',
          'REG_DWORD',
          1
        );
        revertedCount++;
      }

      // Revert Spectre / Meltdown mitigations disable if active
      const spectreVal = await RegistryEngine.getValue(
        'HKLM',
        'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
        'FeatureSettingsOverride'
      );
      if (spectreVal.exists && (spectreVal.value === 3 || spectreVal.value?.toString() === '3')) {
        await RegistryEngine.setValue(
          'HKLM',
          'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
          'FeatureSettingsOverride',
          'REG_DWORD',
          0
        );
        await RegistryEngine.setValue(
          'HKLM',
          'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management',
          'FeatureSettingsOverrideMask',
          'REG_DWORD',
          0
        );
        revertedCount++;
      }

      // Revert hypervisorlaunchtype to auto if off
      try {
        const { stdout: bcdOut } = await execAsync('bcdedit /enum {current}', { windowsHide: true });
        if (bcdOut.toLowerCase().includes('hypervisorlaunchtype') && bcdOut.toLowerCase().includes('off')) {
          await execAsync('bcdedit /set hypervisorlaunchtype auto', { windowsHide: true });
          revertedCount++;
        }
      } catch {}
    } catch {}

    // 2. Apply certified SAFE tweaks
    try {
      // Game Mode ON
      await RegistryEngine.setValue(
        'HKCU',
        'Software\\Microsoft\\GameBar',
        'AutoGameModeEnabled',
        'REG_DWORD',
        1
      );
      appliedCount++;

      // Game DVR OFF
      await RegistryEngine.setValue(
        'HKCU',
        'System\\GameConfigStore',
        'GameDVR_Enabled',
        'REG_DWORD',
        0
      );
      appliedCount++;
    } catch {}

    // 3. Ensure Competitive-Safe mode is engaged
    this.setCompetitiveSafe(true);

    AuditStore.record({
      category: 'system',
      action: 'Applied Competitive-Safe Preset',
      details: `Reverted ${revertedCount} risk settings; applied ${appliedCount} verified safe tweaks.`,
      reversible: true,
    });

    return {
      success: true,
      appliedCount,
      revertedCount,
      message: `Competitive-Safe preset applied: ${revertedCount} risk tweaks restored, ${appliedCount} safe tweaks optimized.`,
    };
  }

  /**
   * Helper check for tweak execution controllers.
   */
  static isCompetitiveSafeActive(): boolean {
    const persisted = this.getPersistedCompetitiveSafe();
    if (persisted !== null) return persisted;
    if (this.cachedResult) return this.cachedResult.isCompetitiveSafeActive;
    return true; // Default to safe
  }
}
