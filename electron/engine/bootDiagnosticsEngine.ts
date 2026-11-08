import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BootPhaseBreakdown {
  kernelInitMs: number;
  driverInitMs: number;
  smssInitMs: number;
  postBootMs: number;
  mainPathMs: number;
}

export interface BootBreakdownReport {
  success: boolean;
  hasEventLog: boolean;
  totalBootDurationMs: number;
  phases: BootPhaseBreakdown;
  lastBootTimestamp: string;
  slowestPhase: 'kernel' | 'driver' | 'smss' | 'postboot' | 'none';
  slowestPhasePercent: number;
  summary: string;
  recommendations: string[];
  isElevated: boolean;
}

export class BootDiagnosticsEngine {
  /**
   * Parses Event 100 XML data from Microsoft-Windows-Diagnostics-Performance
   */
  static parseEvent100Xml(xmlText: string): {
    totalDurationMs: number;
    mainPathMs: number;
    kernelInitMs: number;
    driverInitMs: number;
    smssInitMs: number;
    postBootMs: number;
  } | null {
    if (!xmlText || typeof xmlText !== 'string') return null;

    const extractDataValue = (name: string): number => {
      // Matches <Data Name="BootDuration">12345</Data> or <Data Name='BootDuration'>12345</Data>
      const regex = new RegExp(`<Data\\s+Name=['"]${name}['"]>(\\d+)<\\/Data>`, 'i');
      const match = xmlText.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    };

    const totalDurationMs = extractDataValue('BootDuration');
    const mainPathMs = extractDataValue('MainPathBootTime');
    const kernelInitMs = extractDataValue('BootKernelInitTime');
    const driverInitMs = extractDataValue('BootDriverInitTime');
    const smssInitMs = extractDataValue('BootSmssInitTime');
    const postBootMs = extractDataValue('BootPostBootTime');

    if (totalDurationMs === 0 && mainPathMs === 0 && kernelInitMs === 0) {
      return null;
    }

    return {
      totalDurationMs,
      mainPathMs,
      kernelInitMs,
      driverInitMs,
      smssInitMs,
      postBootMs,
    };
  }

  /**
   * Queries Windows Diagnostics-Performance Event 100 via PowerShell
   */
  static async queryDiagnosticsPerformanceLog(): Promise<{
    xml: string | null;
    lastBootDate: string | null;
  }> {
    try {
      const psCommand = `
        $evt = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Diagnostics-Performance/Operational'; Id=100} -MaxEvents 1 -ErrorAction Stop
        [PSCustomObject]@{
          Xml = $evt.ToXml()
          TimeCreated = $evt.TimeCreated.ToString('o')
        } | ConvertTo-Json
      `;

      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        { timeout: 3500, windowsHide: true }
      );

      const parsed = JSON.parse(stdout.trim());
      return {
        xml: parsed.Xml || null,
        lastBootDate: parsed.TimeCreated || null,
      };
    } catch {
      return { xml: null, lastBootDate: null };
    }
  }

  /**
   * Queries fallback boot timestamp using Win32_OperatingSystem
   */
  static async queryFallbackBootTime(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString("o")',
        ],
        { timeout: 2000, windowsHide: true }
      );
      return stdout.trim();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Computes the slowest boot phase and associated recommendations
   */
  static analyzePhases(phases: BootPhaseBreakdown, totalDurationMs: number): {
    slowestPhase: BootBreakdownReport['slowestPhase'];
    slowestPhasePercent: number;
    summary: string;
    recommendations: string[];
  } {
    const list: { phase: BootBreakdownReport['slowestPhase']; ms: number; label: string }[] = [
      { phase: 'postboot', ms: phases.postBootMs, label: 'Post-Boot Startup Applications' },
      { phase: 'driver', ms: phases.driverInitMs, label: 'Driver Initialization' },
      { phase: 'kernel', ms: phases.kernelInitMs, label: 'Kernel Initialization' },
      { phase: 'smss', ms: phases.smssInitMs, label: 'Session Manager Subsystem' },
    ];

    list.sort((a, b) => b.ms - a.ms);
    const top = list[0];
    const baseTotal = totalDurationMs > 0 ? totalDurationMs : (phases.mainPathMs + phases.postBootMs);
    const percent = baseTotal > 0 ? Math.round((top.ms / baseTotal) * 100) : 0;

    const recommendations: string[] = [];
    if (phases.postBootMs > 12000) {
      recommendations.push(
        'Post-boot apps took over 12s to reach idle. Disable high-impact startup apps in Windows Settings > Apps > Startup.'
      );
    }
    if (phases.driverInitMs > 6000) {
      recommendations.push(
        'Driver initialization took over 6s. Audit non-essential device drivers and ensure GPU/chipset drivers are updated.'
      );
    }
    if (phases.mainPathMs < 15000 && phases.mainPathMs > 0) {
      recommendations.push(
        'Main boot path is within fast NVMe/SSD benchmarks (<15 seconds).'
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('System boot phases completed within normal parameters.');
    }

    const totalSeconds = (baseTotal / 1000).toFixed(1);
    const summary = `System took ${totalSeconds}s to boot. Largest phase was ${top.label} at ${(top.ms / 1000).toFixed(1)}s (${percent}%).`;

    return {
      slowestPhase: top.phase,
      slowestPhasePercent: percent,
      summary,
      recommendations,
    };
  }

  /**
   * Generates a complete system boot time breakdown report
   */
  static async getBootBreakdown(): Promise<BootBreakdownReport> {
    const { xml, lastBootDate } = await this.queryDiagnosticsPerformanceLog();

    if (xml) {
      const parsed = this.parseEvent100Xml(xml);
      if (parsed) {
        const phases: BootPhaseBreakdown = {
          kernelInitMs: parsed.kernelInitMs,
          driverInitMs: parsed.driverInitMs,
          smssInitMs: parsed.smssInitMs,
          postBootMs: parsed.postBootMs,
          mainPathMs: parsed.mainPathMs,
        };

        const analysis = this.analyzePhases(phases, parsed.totalDurationMs);

        return {
          success: true,
          hasEventLog: true,
          totalBootDurationMs: parsed.totalDurationMs,
          phases,
          lastBootTimestamp: lastBootDate || new Date().toISOString(),
          slowestPhase: analysis.slowestPhase,
          slowestPhasePercent: analysis.slowestPhasePercent,
          summary: analysis.summary,
          recommendations: analysis.recommendations,
          isElevated: true,
        };
      }
    }

    // Fallback: Query system last boot timestamp when Event 100 log is restricted or disabled
    const fallbackBootTime = await this.queryFallbackBootTime();

    return {
      success: true,
      hasEventLog: false,
      totalBootDurationMs: 0,
      phases: {
        kernelInitMs: 0,
        driverInitMs: 0,
        smssInitMs: 0,
        postBootMs: 0,
        mainPathMs: 0,
      },
      lastBootTimestamp: fallbackBootTime,
      slowestPhase: 'none',
      slowestPhasePercent: 0,
      summary: 'Windows Diagnostics-Performance event log was not accessible (requires Administrator elevation or log is disabled).',
      recommendations: [
        'Run PC Tweak as Administrator to query deep kernel boot phase timings from Windows Diagnostics-Performance.',
      ],
      isElevated: false,
    };
  }
}
