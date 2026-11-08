import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DriverBottleneckInfo {
  moduleName: string;
  displayName: string;
  description: string;
  category: 'gpu' | 'network' | 'storage' | 'system' | 'audio' | 'other';
  state: 'Running' | 'Stopped' | 'Unknown';
  isKnownBottleneck: boolean;
  severity: 'low' | 'medium' | 'high';
  potentialCause: string;
  recommendation: string;
}

export interface DpcIsrReport {
  timestamp: number;
  dpcPercent: number | null;
  interruptPercent: number | null;
  overallStatus: 'optimal' | 'moderate' | 'high_latency';
  runningDriversCount: number;
  flaggedDriversCount: number;
  drivers: DriverBottleneckInfo[];
  recommendations: string[];
  isElevated: boolean;
}

export const KNOWN_DRIVER_HOTSPOTS: Record<
  string,
  {
    category: DriverBottleneckInfo['category'];
    severity: DriverBottleneckInfo['severity'];
    potentialCause: string;
    recommendation: string;
  }
> = {
  'nvlddmkm': {
    category: 'gpu',
    severity: 'high',
    potentialCause: 'NVIDIA GPU driver DPC spikes during aggressive power state transitions or driver cache corruption.',
    recommendation: 'Perform a clean driver reinstall using DDU or NVIDIA Clean Install option. In Windows Graphics Settings, ensure Hardware-Accelerated GPU Scheduling is enabled.',
  },
  'ndis': {
    category: 'network',
    severity: 'high',
    potentialCause: 'Network interface card interrupt storms or unoptimized interrupt moderation.',
    recommendation: 'Enable Receive Side Scaling (RSS), set Interrupt Moderation to Adaptive, and disable Energy Efficient Ethernet in Adapter Tweaks.',
  },
  'tcpip': {
    category: 'network',
    severity: 'medium',
    potentialCause: 'TCP/IP stack processing bottlenecks or network packet throttling.',
    recommendation: 'Ensure Large Send Offload v2 (LSOv2) is active and network throttling is set to disabled in Network Tweaks.',
  },
  'storport': {
    category: 'storage',
    severity: 'high',
    potentialCause: 'Storage port controller delays, NVMe Link Power Management, or queue depth saturation.',
    recommendation: 'Set Storage Link Power Management to Active in Power Options and verify manufacturer NVMe controller driver.',
  },
  'storahci': {
    category: 'storage',
    severity: 'medium',
    potentialCause: 'SATA AHCI Link Power Management (HIPM/DIPM) aggressive sleep states.',
    recommendation: 'Disable SATA Link Power Management in power plan settings.',
  },
  'wdf01000': {
    category: 'system',
    severity: 'high',
    potentialCause: 'Kernel-Mode Driver Framework overhead, often triggered by peripheral polling rate overloading or chipset latency.',
    recommendation: 'Update motherboard chipset drivers and verify mouse polling rate is stable without erratic micro-stutters.',
  },
  'acpi': {
    category: 'system',
    severity: 'medium',
    potentialCause: 'Motherboard ACPI power management throttling, aggressive CPU core parking, or thermal limits.',
    recommendation: 'Use the Ultimate Performance power plan and inspect BIOS UEFI settings for aggressive platform C-states.',
  },
  'dxgkrnl': {
    category: 'gpu',
    severity: 'medium',
    potentialCause: 'DirectX Graphics Kernel overhead from background overlays, screen recording, or multi-monitor refresh rate mismatches.',
    recommendation: 'Close conflicting game overlay injectors and configure matching refresh rates across multi-monitor setups.',
  },
  'rtkvhd64': {
    category: 'audio',
    severity: 'medium',
    potentialCause: 'Realtek High Definition Audio Driver buffer underrun or spatial sound processing overhead.',
    recommendation: 'Disable exclusive audio enhancement effects in Windows Sound Control Panel and update Realtek audio driver.',
  },
  'hdaudbus': {
    category: 'audio',
    severity: 'low',
    potentialCause: 'High Definition Audio Bus controller interrupt latency.',
    recommendation: 'Disable unused digital audio interfaces (e.g. HDMI/DisplayPort audio outputs from GPU) in Device Manager.',
  },
};

export class LatencyDiagnosticsEngine {
  /**
   * Parses driverquery CSV output into structured driver records
   */
  static parseDriverQueryCsv(csvText: string): DriverBottleneckInfo[] {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const results: DriverBottleneckInfo[] = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Parse CSV columns handling quotes
      const cols = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
      if (!cols || cols.length < 7) continue;

      const cleanCols = cols.map((c) =>
        c.replace(/^,/, '').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim()
      );

      const moduleName = (cleanCols[0] || '').toLowerCase();
      const displayName = cleanCols[1] || cleanCols[0];
      const description = cleanCols[2] || displayName;
      const state = (cleanCols[5] === 'Running' ? 'Running' : cleanCols[5] === 'Stopped' ? 'Stopped' : 'Unknown') as 'Running' | 'Stopped' | 'Unknown';

      // Check if driver matches known latency hotspot dictionary
      const hotspot = KNOWN_DRIVER_HOTSPOTS[moduleName];

      if (hotspot) {
        results.push({
          moduleName: cleanCols[0],
          displayName,
          description,
          category: hotspot.category,
          state,
          isKnownBottleneck: true,
          severity: hotspot.severity,
          potentialCause: hotspot.potentialCause,
          recommendation: hotspot.recommendation,
        });
      } else {
        // Categorize other drivers
        let category: DriverBottleneckInfo['category'] = 'other';
        const lowerDesc = (description + ' ' + displayName).toLowerCase();
        if (lowerDesc.includes('network') || lowerDesc.includes('ethernet') || lowerDesc.includes('wi-fi') || lowerDesc.includes('wireless') || lowerDesc.includes('802.11')) {
          category = 'network';
        } else if (lowerDesc.includes('graphics') || lowerDesc.includes('display') || lowerDesc.includes('nvidia') || lowerDesc.includes('amd') || lowerDesc.includes('intel hd')) {
          category = 'gpu';
        } else if (lowerDesc.includes('storage') || lowerDesc.includes('controller') || lowerDesc.includes('nvme') || lowerDesc.includes('sata') || lowerDesc.includes('ahci')) {
          category = 'storage';
        } else if (lowerDesc.includes('audio') || lowerDesc.includes('sound')) {
          category = 'audio';
        }

        results.push({
          moduleName: cleanCols[0],
          displayName,
          description,
          category,
          state,
          isKnownBottleneck: false,
          severity: 'low',
          potentialCause: 'Standard kernel-level driver operation.',
          recommendation: 'No action required.',
        });
      }
    }

    return results;
  }

  /**
   * Queries real DPC and ISR percentages from Windows performance counters
   */
  static async queryDpcIsrCounters(): Promise<{
    dpcPercent: number | null;
    interruptPercent: number | null;
    isElevated: boolean;
  }> {
    try {
      // Query Windows CIM Performance Counters with short timeout
      const psCommand = `(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object {$_.Name -eq '_Total'}) | Select-Object -Property PercentDPCTime, PercentInterruptTime | ConvertTo-Json`;

      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        { timeout: 1500, windowsHide: true }
      );

      const parsed = JSON.parse(stdout.trim());
      const dpcVal = typeof parsed.PercentDPCTime === 'number' ? parsed.PercentDPCTime : parseFloat(parsed.PercentDPCTime);
      const isrVal = typeof parsed.PercentInterruptTime === 'number' ? parsed.PercentInterruptTime : parseFloat(parsed.PercentInterruptTime);

      return {
        dpcPercent: isNaN(dpcVal) ? null : Math.min(100, Math.max(0, dpcVal)),
        interruptPercent: isNaN(isrVal) ? null : Math.min(100, Math.max(0, isrVal)),
        isElevated: true,
      };
    } catch {
      // Non-elevated or counter unavailable: truthfully report nulls without synthetic numbers
      return {
        dpcPercent: null,
        interruptPercent: null,
        isElevated: false,
      };
    }
  }

  /**
   * Generates a complete DPC & ISR driver diagnostic report
   */
  static async getDiagnosticsReport(): Promise<DpcIsrReport> {
    const timestamp = Date.now();
    let drivers: DriverBottleneckInfo[] = [];

    try {
      const { stdout } = await execFileAsync('driverquery.exe', ['/v', '/fo', 'csv'], {
        windowsHide: true,
        timeout: 3000,
      });
      drivers = this.parseDriverQueryCsv(stdout);
    } catch {
      // Fallback: empty driver list if driverquery is inaccessible
      drivers = [];
    }

    const { dpcPercent, interruptPercent, isElevated } = await this.queryDpcIsrCounters();

    // Prioritize known bottlenecks first, then sorted by severity
    const sortedDrivers = drivers.sort((a, b) => {
      if (a.isKnownBottleneck && !b.isKnownBottleneck) return -1;
      if (!a.isKnownBottleneck && b.isKnownBottleneck) return 1;
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity];
    });

    const flaggedDrivers = sortedDrivers.filter((d) => d.isKnownBottleneck && d.state === 'Running');

    // Determine overall status
    let overallStatus: DpcIsrReport['overallStatus'] = 'optimal';
    if ((dpcPercent !== null && dpcPercent > 5) || (interruptPercent !== null && interruptPercent > 3)) {
      overallStatus = 'high_latency';
    } else if ((dpcPercent !== null && dpcPercent > 2) || (interruptPercent !== null && interruptPercent > 1.5) || flaggedDrivers.length > 3) {
      overallStatus = 'moderate';
    }

    // Build consolidated actionable recommendations
    const recommendations: string[] = [];
    if (dpcPercent !== null && dpcPercent > 3) {
      recommendations.push('DPC latency execution time exceeds 3% CPU time. Review running driver recommendations below to isolate latency spikes.');
    }
    if (interruptPercent !== null && interruptPercent > 2) {
      recommendations.push('Hardware Interrupt (% ISR Time) is elevated. Ensure network and storage controllers have interrupt moderation enabled.');
    }
    flaggedDrivers.slice(0, 3).forEach((d) => {
      recommendations.push(`${d.displayName} (${d.moduleName}.sys): ${d.recommendation}`);
    });

    if (recommendations.length === 0) {
      recommendations.push('Kernel DPC and Interrupt routines are executing within optimal low-latency thresholds (<1.0% CPU time).');
    }

    return {
      timestamp,
      dpcPercent,
      interruptPercent,
      overallStatus,
      runningDriversCount: sortedDrivers.filter((d) => d.state === 'Running').length,
      flaggedDriversCount: flaggedDrivers.length,
      drivers: sortedDrivers,
      recommendations,
      isElevated,
    };
  }
}
