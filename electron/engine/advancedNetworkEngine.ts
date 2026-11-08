import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AuditStore } from '../storage/auditStore';
import { sanitizeInterfaceAlias } from './dnsEngine';
import { isValidTargetHost } from './networkTestEngine';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface AdvancedNetworkTweakItem {
  id: string;
  name: string;
  description: string;
  impact: 'safe' | 'moderate' | 'advanced' | 'experimental';
  isSupported: boolean;
  unsupportedReason?: string;
  isApplied: boolean;
  currentValueDisplay: string;
  requiresReboot: boolean;
  requiresAutoRevert: boolean;
  category: 'driver' | 'tcp_stack' | 'experimental';
  options?: { label: string; value: string }[];
}

export interface TcpGlobalState {
  autotuning: string; // normal, disabled, highlyrestricted
  ecn: string; // enabled, disabled
  timestamps: string; // allowed, disabled
  rss: string; // enabled, disabled
}

export interface AdvancedNetworkOverview {
  adapterName: string;
  netCfgInstanceId: string | null;
  currentMtu: number;
  tcpGlobal: TcpGlobalState;
  tweaks: AdvancedNetworkTweakItem[];
}

export class AdvancedNetworkEngine {
  /**
   * Helper: resolve NetCfgInstanceId for the given adapter
   */
  private static async getNetCfgInstanceId(adapterName: string): Promise<string | null> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) return null;
    try {
      const script = `
        $pnp = (Get-NetAdapter -Name '${safeAdapter}' -ErrorAction SilentlyContinue).PnPDeviceID
        if ($pnp) {
          $driver = (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $pnp) -ErrorAction SilentlyContinue).Driver
          if ($driver) {
            (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\' + $driver) -ErrorAction SilentlyContinue).NetCfgInstanceId
          }
        }
      `;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, {
        windowsHide: true,
      });
      const id = stdout.trim();
      return id.startsWith('{') ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Reads real TCP global configuration from netsh int tcp show global
   */
  static async getTcpGlobalState(): Promise<TcpGlobalState> {
    try {
      const { stdout } = await execAsync('netsh int tcp show global', { windowsHide: true });
      const getVal = (pattern: RegExp) => {
        const m = stdout.match(pattern);
        return m ? m[1].trim().toLowerCase() : 'unknown';
      };

      return {
        autotuning: getVal(/Receive Window Auto-Tuning Level\s*:\s*(\w+)/i),
        ecn: getVal(/ECN Capability\s*:\s*(\w+)/i),
        timestamps: getVal(/RFC 1323 Timestamps\s*:\s*(\w+)/i),
        rss: getVal(/Receive-Side Scaling State\s*:\s*(\w+)/i),
      };
    } catch {
      return {
        autotuning: 'normal',
        ecn: 'disabled',
        timestamps: 'allowed',
        rss: 'enabled',
      };
    }
  }

  /**
   * Queries full advanced & experimental state from real system
   */
  static async getAdvancedState(adapterName: string): Promise<AdvancedNetworkOverview> {
    const netCfgId = await this.getNetCfgInstanceId(adapterName);
    const tcpGlobal = await this.getTcpGlobalState();

    // 1. Read MTU
    let currentMtu = 1500;
    try {
      const { stdout } = await execAsync('netsh interface ipv4 show subinterfaces', { windowsHide: true });
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(adapterName.toLowerCase())) {
          const match = line.match(/^\s*(\d+)/);
          if (match) {
            currentMtu = parseInt(match[1], 10);
            break;
          }
        }
      }
    } catch {}

    // 2. Query Driver Advanced Properties
    const advProps: Record<string, { value: string; display: string }> = {};
    try {
      const script = `
        Get-NetAdapterAdvancedProperty -Name '${adapterName}' -ErrorAction SilentlyContinue | ForEach-Object {
          [PSCustomObject]@{
            Keyword = $_.RegistryKeyword
            Value = $_.RegistryValue[0]
            Display = $_.DisplayValue
          }
        } | ConvertTo-Json -Compress
      `;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, {
        windowsHide: true,
      });
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          if (item && item.Keyword) {
            advProps[item.Keyword.toLowerCase()] = {
              value: String(item.Value ?? ''),
              display: String(item.Display ?? ''),
            };
          }
        }
      }
    } catch {}

    // 3. Query Nagle's Algorithm (TcpAckFrequency & TCPNoDelay)
    let nagleDisabled = false;
    if (netCfgId) {
      try {
        const key = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${netCfgId}`;
        const { stdout } = await execAsync(`reg query "${key}" /v TcpAckFrequency /reg:64`, { windowsHide: true });
        if (stdout.includes('0x1')) {
          nagleDisabled = true;
        }
      } catch {}
    }

    // 4. Query MMCSS NetworkThrottlingIndex & SystemResponsiveness
    let throttlingDisabled = false;
    let currentResponsiveness = 10;
    try {
      const mmcssKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
      const { stdout: mmcssOut } = await execAsync(`reg query "${mmcssKey}" /reg:64`, { windowsHide: true });
      const throttleMatch = mmcssOut.match(/NetworkThrottlingIndex\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
      if (throttleMatch && throttleMatch[1].toLowerCase() === 'ffffffff') {
        throttlingDisabled = true;
      }
      const respMatch = mmcssOut.match(/SystemResponsiveness\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
      if (respMatch) {
        currentResponsiveness = parseInt(respMatch[1], 16);
      }
    } catch {}

    // Build Tweaks Catalog with real driver checks
    const imProp = advProps['*interruptmoderation'];
    const hasIm = Boolean(imProp);
    const imOff = hasIm && (imProp.value === '0' || imProp.display.toLowerCase().includes('disabled'));

    const flowProp = advProps['*flowcontrol'];
    const hasFlow = Boolean(flowProp);
    const flowOff = hasFlow && (flowProp.value === '0' || flowProp.display.toLowerCase().includes('disabled'));

    const lsoProp = advProps['*lsov2ipv4'];
    const hasLso = Boolean(lsoProp);
    const lsoOff = hasLso && (lsoProp.value === '0' || lsoProp.display.toLowerCase().includes('disabled'));

    const rscProp = advProps['*rscipv4'];
    const hasRsc = Boolean(rscProp);
    const rscOff = hasRsc && (rscProp.value === '0' || rscProp.display.toLowerCase().includes('disabled'));

    const rxBuf = advProps['*receivebuffers']?.display || '512';
    const txBuf = advProps['*transmitbuffers']?.display || '128';

    const tweaks: AdvancedNetworkTweakItem[] = [
      // SECTION E: Advanced
      {
        id: 'adapter_interrupt_moderation_off',
        name: 'Disable Interrupt Moderation',
        description: 'Processes incoming packets immediately rather than batching them. Lowers packet processing delay for gaming at the cost of slightly higher CPU usage.',
        impact: 'advanced',
        category: 'driver',
        isSupported: hasIm,
        unsupportedReason: hasIm ? undefined : 'NIC hardware driver does not expose Interrupt Moderation.',
        isApplied: imOff,
        currentValueDisplay: hasIm ? (imOff ? 'Disabled (Low Latency)' : 'Enabled (Batched)') : 'Not Supported',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'adapter_flow_control_off',
        name: 'Disable Flow Control (802.3x)',
        description: 'Prevents sending or receiving IEEE 802.3x PAUSE frames. Avoids micro-freezes during high-throughput local network bursts.',
        impact: 'moderate',
        category: 'driver',
        isSupported: hasFlow,
        unsupportedReason: hasFlow ? undefined : 'NIC hardware driver does not expose Flow Control.',
        isApplied: flowOff,
        currentValueDisplay: hasFlow ? (flowOff ? 'Disabled (Recommended)' : 'Enabled') : 'Not Supported',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'adapter_lso_off',
        name: 'Disable Large Send Offload (LSO v2)',
        description: 'Bypasses hardware TCP segmentation offloading on the NIC. Prevents packet delivery jitter caused by buggy network card firmware.',
        impact: 'moderate',
        category: 'driver',
        isSupported: hasLso,
        unsupportedReason: hasLso ? undefined : 'Driver does not expose Large Send Offload.',
        isApplied: lsoOff,
        currentValueDisplay: hasLso ? (lsoOff ? 'Disabled (Software Segmentation)' : 'Enabled') : 'Not Supported',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'adapter_rsc_off',
        name: 'Disable Receive Segment Coalescing (RSC)',
        description: 'Disables packet coalescence across receive chains. Delivers packets individually to the Windows TCP stack for consistent frame times.',
        impact: 'moderate',
        category: 'driver',
        isSupported: hasRsc,
        unsupportedReason: hasRsc ? undefined : 'Driver does not expose Receive Segment Coalescing.',
        isApplied: rscOff,
        currentValueDisplay: hasRsc ? (rscOff ? 'Disabled (Smooth Frame Times)' : 'Enabled') : 'Not Supported',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'tcp_nagle_algorithm_off',
        name: "Disable Nagle's Algorithm (TcpAckFrequency & TCPNoDelay)",
        description: "Sends small TCP packets immediately without waiting for full 200ms ACK window. Note: Only affects TCP games; competitive games using UDP (CS2, Valorant) are unaffected.",
        impact: 'moderate',
        category: 'tcp_stack',
        isSupported: Boolean(netCfgId),
        unsupportedReason: netCfgId ? undefined : 'Adapter NetCfgInstanceId not found in Windows registry.',
        isApplied: nagleDisabled,
        currentValueDisplay: nagleDisabled ? 'Disabled (Instant TCP Dispatches)' : 'Enabled (Delayed ACKs)',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'tcp_autotuning_normal',
        name: 'TCP Window Auto-Tuning Level: Normal',
        description: 'Standard Windows autotuning dynamically scales receive buffer window sizes. Disabling this restricts modern broadband connections.',
        impact: 'safe',
        category: 'tcp_stack',
        isSupported: true,
        isApplied: tcpGlobal.autotuning === 'normal',
        currentValueDisplay: `Current: ${tcpGlobal.autotuning.toUpperCase()}`,
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'tcp_ecn_toggle',
        name: 'Explicit Congestion Notification (ECN)',
        description: 'Allows routers to flag network congestion without dropping packets. Disable if older ISP routers drop ECN-flagged SYN packets.',
        impact: 'moderate',
        category: 'tcp_stack',
        isSupported: true,
        isApplied: tcpGlobal.ecn === 'enabled',
        currentValueDisplay: tcpGlobal.ecn === 'enabled' ? 'Enabled' : 'Disabled (Standard)',
        requiresReboot: false,
        requiresAutoRevert: true,
      },

      // SECTION F: Experimental (Honest Label)
      {
        id: 'mmcss_network_throttling_off',
        name: 'Disable MMCSS Network Throttling Index',
        description: 'Sets NetworkThrottlingIndex=0xffffffff to disable Multimedia Class Scheduler throttling. Measured effect on modern Windows 11 is small or unproven.',
        impact: 'experimental',
        category: 'experimental',
        isSupported: true,
        isApplied: throttlingDisabled,
        currentValueDisplay: throttlingDisabled ? 'Throttling Disabled (0xFFFFFFFF)' : 'Default (10)',
        requiresReboot: false,
        requiresAutoRevert: false,
      },
      {
        id: 'mmcss_system_responsiveness_zero',
        name: 'System Responsiveness: 0 (Prioritize Games)',
        description: 'Configures MMCSS SystemResponsiveness=0 to allocate 100% CPU to foreground multimedia threads rather than reserving 20% for background tasks.',
        impact: 'experimental',
        category: 'experimental',
        isSupported: true,
        isApplied: currentResponsiveness === 0,
        currentValueDisplay: currentResponsiveness === 0 ? '0% Reserved (Foreground Only)' : `${currentResponsiveness}% Reserved`,
        requiresReboot: false,
        requiresAutoRevert: false,
      },
    ];

    return {
      adapterName,
      netCfgInstanceId: netCfgId,
      currentMtu,
      tcpGlobal,
      tweaks,
    };
  }

  /**
   * Applies an advanced or experimental tweak with validation and audit logging
   */
  static async applyTweak(
    adapterName: string,
    tweakId: string,
    value?: any
  ): Promise<{ success: boolean; requiresAutoRevert: boolean; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) {
      return { success: false, requiresAutoRevert: false, error: 'Invalid or unsafe adapter name.' };
    }
    try {
      const netCfgId = await this.getNetCfgInstanceId(safeAdapter);

      switch (tweakId) {
        case 'adapter_interrupt_moderation_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*InterruptModeration' -RegistryValue 0"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Interrupt Moderation',
            details: `Set *InterruptModeration=0 on '${safeAdapter}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'adapter_flow_control_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*FlowControl' -RegistryValue 0"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Flow Control',
            details: `Set *FlowControl=0 on '${safeAdapter}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'adapter_lso_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*LsoV2IPv4' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*LsoV2IPv6' -RegistryValue 0 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Large Send Offload',
            details: `Disabled LSO v2 on '${safeAdapter}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'adapter_rsc_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*RscIPv4' -RegistryValue 0 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*RscIPv6' -RegistryValue 0 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Receive Segment Coalescing',
            details: `Disabled RSC on '${safeAdapter}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'tcp_nagle_algorithm_off': {
          if (!netCfgId) {
            return { success: false, requiresAutoRevert: false, error: 'Could not resolve adapter interface ID.' };
          }
          const key = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${netCfgId}`;
          await execAsync(`reg add "${key}" /v TcpAckFrequency /t REG_DWORD /d 1 /f /reg:64`, { windowsHide: true });
          await execAsync(`reg add "${key}" /v TCPNoDelay /t REG_DWORD /d 1 /f /reg:64`, { windowsHide: true });
          AuditStore.record({
            category: 'network',
            action: "Disabled Nagle's Algorithm",
            details: `Configured TcpAckFrequency=1 and TCPNoDelay=1 on interface ${netCfgId}`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'tcp_autotuning_normal': {
          await execAsync('netsh int tcp set global autotuninglevel=normal', { windowsHide: true });
          AuditStore.record({
            category: 'network',
            action: 'Set TCP Window Auto-Tuning',
            details: 'Restored autotuninglevel=normal',
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'tcp_ecn_toggle': {
          const newVal = value ? 'enabled' : 'disabled';
          await execAsync(`netsh int tcp set global ecncapability=${newVal}`, { windowsHide: true });
          AuditStore.record({
            category: 'network',
            action: 'Toggled TCP ECN Capability',
            details: `Set ecncapability=${newVal}`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'mmcss_network_throttling_off': {
          const mmcssKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
          await execAsync(`reg add "${mmcssKey}" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f /reg:64`, {
            windowsHide: true,
          });
          AuditStore.record({
            category: 'network',
            action: 'Disabled MMCSS Network Throttling',
            details: 'Configured NetworkThrottlingIndex=0xFFFFFFFF',
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        case 'mmcss_system_responsiveness_zero': {
          const mmcssKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
          await execAsync(`reg add "${mmcssKey}" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64`, {
            windowsHide: true,
          });
          AuditStore.record({
            category: 'network',
            action: 'Set MMCSS System Responsiveness',
            details: 'Configured SystemResponsiveness=0 (100% priority)',
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        default:
          return { success: false, requiresAutoRevert: false, error: `Unknown advanced tweak ID: ${tweakId}` };
      }
    } catch (err: any) {
      return { success: false, requiresAutoRevert: false, error: err.message || 'Failed to apply advanced tweak' };
    }
  }

  /**
   * Reverts an advanced or experimental tweak back to standard defaults
   */
  static async revertTweak(
    adapterName: string,
    tweakId: string
  ): Promise<{ success: boolean; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) {
      return { success: false, error: 'Invalid or unsafe adapter name.' };
    }
    try {
      const netCfgId = await this.getNetCfgInstanceId(safeAdapter);

      switch (tweakId) {
        case 'adapter_interrupt_moderation_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*InterruptModeration' -RegistryValue 1 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Interrupt Moderation',
            details: `Restored *InterruptModeration=1 on '${safeAdapter}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_flow_control_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*FlowControl' -RegistryValue 3 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Flow Control',
            details: `Restored *FlowControl=3 on '${safeAdapter}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_lso_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*LsoV2IPv4' -RegistryValue 1 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*LsoV2IPv6' -RegistryValue 1 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Large Send Offload',
            details: `Restored default LSO v2 on '${safeAdapter}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_rsc_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*RscIPv4' -RegistryValue 1 -ErrorAction SilentlyContinue; Set-NetAdapterAdvancedProperty -Name '${safeAdapter}' -RegistryKeyword '*RscIPv6' -RegistryValue 1 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Receive Segment Coalescing',
            details: `Restored default RSC on '${safeAdapter}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'tcp_nagle_algorithm_off': {
          if (netCfgId) {
            const key = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${netCfgId}`;
            await execAsync(`reg delete "${key}" /v TcpAckFrequency /f /reg:64`, { windowsHide: true }).catch(() => {});
            await execAsync(`reg delete "${key}" /v TCPNoDelay /f /reg:64`, { windowsHide: true }).catch(() => {});
          }
          AuditStore.record({
            category: 'network',
            action: "Reverted Nagle's Algorithm",
            details: `Removed TcpAckFrequency and TCPNoDelay overrides from interface ${netCfgId}`,
            reversible: false,
          });
          return { success: true };
        }

        case 'tcp_autotuning_normal': {
          await execAsync('netsh int tcp set global autotuninglevel=normal', { windowsHide: true });
          return { success: true };
        }

        case 'tcp_ecn_toggle': {
          await execAsync('netsh int tcp set global ecncapability=disabled', { windowsHide: true });
          return { success: true };
        }

        case 'mmcss_network_throttling_off': {
          const mmcssKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
          await execAsync(`reg add "${mmcssKey}" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f /reg:64`, {
            windowsHide: true,
          });
          AuditStore.record({
            category: 'network',
            action: 'Reverted MMCSS Network Throttling',
            details: 'Restored default NetworkThrottlingIndex=10',
            reversible: false,
          });
          return { success: true };
        }

        case 'mmcss_system_responsiveness_zero': {
          const mmcssKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
          await execAsync(`reg add "${mmcssKey}" /v SystemResponsiveness /t REG_DWORD /d 20 /f /reg:64`, {
            windowsHide: true,
          });
          AuditStore.record({
            category: 'network',
            action: 'Reverted MMCSS System Responsiveness',
            details: 'Restored default SystemResponsiveness=20',
            reversible: false,
          });
          return { success: true };
        }

        default:
          return { success: false, error: `Unknown tweak ID to revert: ${tweakId}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to revert tweak' };
    }
  }

  /**
   * Guided MTU Detection: probes ping -f -l <size> down from 1472 bytes using direct ping.exe execFile
   */
  static async detectOptimalMtu(
    targetHost = '1.1.1.1'
  ): Promise<{ optimalMtu: number; unfragmentedPayload: number; isDefault1500: boolean }> {
    let unfragmented = 1472; // 1472 + 28 = 1500 standard MTU
    const safeTarget = isValidTargetHost(targetHost) ? targetHost.trim() : '1.1.1.1';

    // Probe common payload boundaries: 1472, 1464, 1452, 1440, 1420
    const testSizes = [1472, 1464, 1452, 1440, 1420, 1400];
    for (const size of testSizes) {
      try {
        const { stdout } = await execFileAsync(
          'ping.exe',
          ['-f', '-l', String(size), '-n', '1', '-w', '500', safeTarget],
          { windowsHide: true }
        );
        if (!stdout.includes('Packet needs to be fragmented') && !stdout.includes('100% loss')) {
          unfragmented = size;
          break;
        }
      } catch {}
    }

    const optimalMtu = unfragmented + 28;
    return {
      optimalMtu,
      unfragmentedPayload: unfragmented,
      isDefault1500: optimalMtu === 1500,
    };
  }

  /**
   * Configures MTU persistently on the specified network adapter
   */
  static async setMtu(
    adapterName: string,
    mtu: number
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    const cleanMtu = Math.floor(Number(mtu));

    if (!safeAdapter) {
      return { success: false, message: 'Invalid or unsafe network adapter name.' };
    }
    if (isNaN(cleanMtu) || cleanMtu < 576 || cleanMtu > 9000) {
      return { success: false, message: 'Invalid MTU value. Must be an integer between 576 and 9000 bytes.' };
    }

    try {
      await execAsync(
        `netsh interface ipv4 set subinterface "${safeAdapter}" mtu=${cleanMtu} store=persistent`,
        { windowsHide: true }
      );
      AuditStore.record({
        category: 'network',
        action: 'Configured Network MTU',
        details: `Set MTU=${cleanMtu} on interface '${safeAdapter}'`,
        reversible: true,
      });
      return { success: true, message: `MTU successfully set to ${cleanMtu} on '${safeAdapter}'.` };
    } catch (err: any) {
      return { success: false, message: 'Failed to configure MTU.', error: err.message };
    }
  }
}
