import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AuditStore } from '../storage/auditStore';
import { sanitizeInterfaceAlias } from './dnsEngine';

const execAsync = promisify(exec);

export interface AdapterTweakOption {
  label: string;
  value: string;
}

export interface AdapterTweakItem {
  id: string;
  name: string;
  description: string;
  impact: 'safe' | 'moderate' | 'advanced';
  isSupported: boolean;
  unsupportedReason?: string;
  isApplied: boolean;
  currentValueDisplay: string;
  requiresReboot: boolean;
  requiresAutoRevert: boolean;
  options?: AdapterTweakOption[];
}

export interface WifiDetailsInfo {
  hasWifi: boolean;
  interfaceName?: string;
  ssid?: string;
  band?: string; // 2.4 GHz, 5 GHz, 6 GHz
  channel?: number;
  signalPercentage?: number;
  radioType?: string; // 802.11ax, 802.11ac, etc.
  receiveRateMbps?: number;
  transmitRateMbps?: number;
  roamingAggressiveness?: {
    isSupported: boolean;
    currentValue: string;
    options: string[];
  };
  warnings: string[];
}

export interface AdapterDetailsInfo {
  adapterName: string;
  isLaptop: boolean;
  isMetered: boolean;
  interfaceMetric: number;
  automaticMetric: boolean;
  speedDuplex: {
    currentDisplay: string;
    currentValue: string;
    validOptions: AdapterTweakOption[];
  };
  tweaks: AdapterTweakItem[];
}

interface AdapterSnapshot {
  tweakId: string;
  previousValue: any;
  timestamp: string;
}

export class AdapterTweaksEngine {
  private static snapshots: Map<string, AdapterSnapshot> = new Map();

  /**
   * Helper: check if the machine is a laptop on battery
   */
  private static async isLaptopSystem(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Battery | Measure-Object | Select-Object -ExpandProperty Count"',
        { windowsHide: true }
      );
      return parseInt(stdout.trim(), 10) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Helper: resolve adapter driver registry subkey under Class\{4d36e972-e325-11ce-bfc1-08002be10318}
   */
  private static async getDriverRegistryPath(adapterName: string): Promise<string | null> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) return null;
    try {
      const cmd = `powershell -NoProfile -Command "$pnp = (Get-NetAdapter -Name '${safeAdapter}' -ErrorAction SilentlyContinue).PnPDeviceID; if ($pnp) { (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $pnp) -ErrorAction SilentlyContinue).Driver }"`;
      const { stdout } = await execAsync(cmd, { windowsHide: true });
      const driverSubkey = stdout.trim();
      if (driverSubkey && driverSubkey.includes('\\')) {
        return `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${driverSubkey}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches real adapter tweaks and exposed driver properties
   */
  static async getAdapterDetails(adapterName: string): Promise<AdapterDetailsInfo> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    const isLaptop = await this.isLaptopSystem();
    const driverRegPath = await this.getDriverRegistryPath(safeAdapter);

    // 1. Query PnPCapabilities (Power Management: Allow computer to turn off device)
    let pnpCapApplied = false;
    if (driverRegPath) {
      try {
        const { stdout } = await execAsync(`reg query "${driverRegPath}" /v PnPCapabilities /reg:64`, {
          windowsHide: true,
        });
        const match = stdout.match(/PnPCapabilities\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
        if (match) {
          const val = parseInt(match[1], 16);
          // 0x18 (24) or 0x100 or bit 0x10 means power down disabled
          pnpCapApplied = (val & 0x10) === 0x10 || val === 24 || val === 0x100;
        }
      } catch {
        pnpCapApplied = false;
      }
    }

    // 2. Query Driver Advanced Properties via CIM
    const advPropsMap: Record<string, { value: string; display: string; validDisplays?: string[]; validRegs?: string[] }> = {};
    try {
      const script = `
        Get-NetAdapterAdvancedProperty -Name '${adapterName}' -ErrorAction SilentlyContinue | ForEach-Object {
          [PSCustomObject]@{
            Keyword = $_.RegistryKeyword
            Value = $_.RegistryValue[0]
            Display = $_.DisplayValue
            ValidDisplays = ($_.ValidDisplayValues -join '|')
            ValidRegs = ($_.ValidRegistryValues -join '|')
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
            advPropsMap[item.Keyword.toLowerCase()] = {
              value: String(item.Value ?? ''),
              display: String(item.Display ?? ''),
              validDisplays: item.ValidDisplays ? item.ValidDisplays.split('|') : undefined,
              validRegs: item.ValidRegs ? item.ValidRegs.split('|') : undefined,
            };
          }
        }
      }
    } catch {
      // Driver query failed or adapter inactive
    }

    // 3. Query Interface Metric and AutomaticMetric
    let interfaceMetric = 25;
    let automaticMetric = true;
    try {
      const metricCmd = `powershell -NoProfile -Command "Get-NetIPInterface -InterfaceAlias '${adapterName}' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -Property InterfaceMetric, AutomaticMetric | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(metricCmd, { windowsHide: true });
      if (stdout.trim()) {
        const m = JSON.parse(stdout.trim());
        interfaceMetric = m.InterfaceMetric ?? 25;
        automaticMetric = m.AutomaticMetric === 1 || m.AutomaticMetric === true || m.AutomaticMetric === 'Enabled';
      }
    } catch {}

    // 4. Query Delivery Optimization (P2P Windows Updates)
    let doP2pDisabled = false;
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" /v DODownloadMode /reg:64',
        { windowsHide: true }
      );
      const match = stdout.match(/DODownloadMode\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
      if (match && parseInt(match[1], 16) === 0) {
        doP2pDisabled = true;
      }
    } catch {}

    // 5. Query Metered Connection status
    let isMetered = false;
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-NetConnectionProfile -InterfaceAlias '${adapterName}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPv4Connectivity"`,
        { windowsHide: true }
      );
      // Fallback check on network cost
      isMetered = stdout.toLowerCase().includes('costed') || stdout.toLowerCase().includes('metered');
    } catch {}

    // Parse Speed & Duplex
    const speedDuplexProp = advPropsMap['*speedduplex'];
    const validOptions: AdapterTweakOption[] = [];
    if (speedDuplexProp && speedDuplexProp.validDisplays && speedDuplexProp.validRegs) {
      for (let i = 0; i < speedDuplexProp.validDisplays.length; i++) {
        validOptions.push({
          label: speedDuplexProp.validDisplays[i],
          value: speedDuplexProp.validRegs[i] ?? String(i),
        });
      }
    } else {
      validOptions.push({ label: 'Auto Negotiation', value: '0' });
      validOptions.push({ label: '1.0 Gbps Full Duplex', value: '6' });
      validOptions.push({ label: '100 Mbps Full Duplex', value: '4' });
    }

    // Energy-Efficient Ethernet (*EEE)
    const eeeProp = advPropsMap['*eee'];
    const hasEee = Boolean(eeeProp);
    const eeeApplied = hasEee && (eeeProp.value === '0' || eeeProp.display.toLowerCase().includes('disabled'));

    // Green Ethernet / Power Saving Mode (*GreenEthernet or PowerSavingMode)
    const greenProp = advPropsMap['*greenethernet'] || advPropsMap['powersavingmode'];
    const hasGreen = Boolean(greenProp);
    const greenApplied = hasGreen && (greenProp.value === '0' || greenProp.display.toLowerCase().includes('disabled'));

    const tweaks: AdapterTweakItem[] = [
      {
        id: 'adapter_power_saving_off',
        name: 'Disable Adapter Sleep / Power Saving',
        description: 'Prevents Windows from suspending the network adapter into low-power states to save energy, eliminating wake latency and dropped packets.',
        impact: isLaptop ? 'moderate' : 'safe',
        isSupported: Boolean(driverRegPath),
        isApplied: pnpCapApplied,
        currentValueDisplay: pnpCapApplied ? 'Sleep Disabled (High Performance)' : 'Windows Can Suspend Adapter',
        requiresReboot: false,
        requiresAutoRevert: false,
      },
      {
        id: 'adapter_eee_off',
        name: 'Turn off Energy-Efficient Ethernet (EEE)',
        description: 'Disables IEEE 802.3az Energy-Efficient Ethernet. Eliminates PHY physical layer transitions between active and low-power idle modes.',
        impact: 'safe',
        isSupported: hasEee,
        unsupportedReason: hasEee ? undefined : 'Driver or NIC hardware does not support Energy-Efficient Ethernet.',
        isApplied: eeeApplied,
        currentValueDisplay: hasEee ? (eeeApplied ? 'Disabled (Low Latency)' : 'Enabled') : 'Not Supported by NIC',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'adapter_green_ethernet_off',
        name: 'Turn off Green Ethernet / Power Saving',
        description: 'Disables proprietary chip vendor power saving that reduces signal voltage based on cable length, preventing packet instability.',
        impact: 'safe',
        isSupported: hasGreen,
        unsupportedReason: hasGreen ? undefined : 'Driver or NIC hardware does not expose Green Ethernet / Power Saving Mode.',
        isApplied: greenApplied,
        currentValueDisplay: hasGreen ? (greenApplied ? 'Disabled (Full Power)' : 'Enabled') : 'Not Supported by NIC',
        requiresReboot: false,
        requiresAutoRevert: true,
      },
      {
        id: 'adapter_prefer_ethernet',
        name: 'Prefer Ethernet over Wi-Fi (Interface Metric)',
        description: 'Configures interface routing metric to 10 so Windows always routes gaming and high-priority traffic over Ethernet when connected.',
        impact: 'safe',
        isSupported: true,
        isApplied: !automaticMetric && interfaceMetric <= 10,
        currentValueDisplay: !automaticMetric && interfaceMetric <= 10 ? 'Priority: High (Metric 10)' : `Automatic (Metric ${interfaceMetric})`,
        requiresReboot: false,
        requiresAutoRevert: false,
      },
      {
        id: 'network_delivery_optimization_off',
        name: 'Disable Delivery Optimization (P2P Windows Updates)',
        description: 'Stops Windows Update from seeding and uploading system update chunks to peer devices on your local network or the internet in the background.',
        impact: 'safe',
        isSupported: true,
        isApplied: doP2pDisabled,
        currentValueDisplay: doP2pDisabled ? 'Disabled (No P2P Traffic)' : 'Enabled (Uploads in Background)',
        requiresReboot: false,
        requiresAutoRevert: false,
      },
    ];

    return {
      adapterName,
      isLaptop,
      isMetered,
      interfaceMetric,
      automaticMetric,
      speedDuplex: {
        currentDisplay: speedDuplexProp ? speedDuplexProp.display : 'Auto Negotiation',
        currentValue: speedDuplexProp ? speedDuplexProp.value : '0',
        validOptions,
      },
      tweaks,
    };
  }

  /**
   * Reads real Wi-Fi connection telemetry via netsh wlan
   */
  static async getWifiDetails(): Promise<WifiDetailsInfo> {
    const warnings: string[] = [];

    try {
      const { stdout } = await execAsync('netsh wlan show interfaces', { windowsHide: true });
      if (!stdout || stdout.includes('There is no wireless interface') || stdout.includes('not running')) {
        return { hasWifi: false, warnings: [] };
      }

      const getVal = (pattern: RegExp) => {
        const m = stdout.match(pattern);
        return m ? m[1].trim() : undefined;
      };

      const interfaceName = getVal(/Name\s*:\s*(.+)/i);
      const ssid = getVal(/SSID\s*:\s*(.+)/i);
      const radioType = getVal(/Radio type\s*:\s*(.+)/i);
      const channelStr = getVal(/Channel\s*:\s*(\d+)/i);
      const channel = channelStr ? parseInt(channelStr, 10) : undefined;
      const signalStr = getVal(/Signal\s*:\s*(\d+)%/i);
      const signalPercentage = signalStr ? parseInt(signalStr, 10) : undefined;
      const receiveRateStr = getVal(/Receive rate \(Mbps\)\s*:\s*([\d.]+)/i);
      const transmitRateStr = getVal(/Transmit rate \(Mbps\)\s*:\s*([\d.]+)/i);

      let band = 'Unknown';
      if (channel) {
        if (channel <= 14) {
          band = '2.4 GHz';
          warnings.push('Connected to 2.4 GHz band. If available, 5 GHz or 6 GHz Wi-Fi provides lower packet jitter.');
        } else if (channel >= 36 && channel <= 177) {
          band = '5 GHz';
        } else if (channel >= 180) {
          band = '6 GHz (Wi-Fi 6E/7)';
        }
      }

      if (signalPercentage !== undefined && signalPercentage < 50) {
        warnings.push(`Weak Wi-Fi signal (${signalPercentage}%). May cause packet loss and ping spikes in online games.`);
      }

      // Check roaming aggressiveness advanced property
      let roamingAggressiveness: { isSupported: boolean; currentValue: string; options: string[] } | undefined;
      if (interfaceName) {
        try {
          const roamScript = `(Get-NetAdapterAdvancedProperty -Name '${interfaceName}' -RegistryKeyword '*RoamAggressiveness' -ErrorAction SilentlyContinue) | Select-Object -Property DisplayValue, @{N='Valid';E={$_.ValidDisplayValues -join '|'}} | ConvertTo-Json -Compress`;
          const { stdout: roamOut } = await execAsync(`powershell -NoProfile -Command "${roamScript}"`, { windowsHide: true });
          if (roamOut.trim()) {
            const r = JSON.parse(roamOut.trim());
            roamingAggressiveness = {
              isSupported: true,
              currentValue: r.DisplayValue || 'Medium',
              options: r.Valid ? r.Valid.split('|') : ['Lowest', 'Medium-Low', 'Medium', 'Medium-High', 'Highest'],
            };
          }
        } catch {}
      }

      return {
        hasWifi: true,
        interfaceName,
        ssid,
        band,
        channel,
        signalPercentage,
        radioType,
        receiveRateMbps: receiveRateStr ? parseFloat(receiveRateStr) : undefined,
        transmitRateMbps: transmitRateStr ? parseFloat(transmitRateStr) : undefined,
        roamingAggressiveness,
        warnings,
      };
    } catch {
      return { hasWifi: false, warnings: [] };
    }
  }

  /**
   * Applies an adapter tweak with pre-apply snapshot capture
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
      const driverRegPath = await this.getDriverRegistryPath(safeAdapter);

      switch (tweakId) {
        case 'adapter_power_saving_off': {
          if (!driverRegPath) return { success: false, requiresAutoRevert: false, error: 'Driver registry key not found.' };
          // Snapshot
          let prev = '0';
          try {
            const { stdout } = await execAsync(`reg query "${driverRegPath}" /v PnPCapabilities /reg:64`, { windowsHide: true });
            const m = stdout.match(/0x([0-9a-fA-F]+)/);
            if (m) prev = m[1];
          } catch {}
          this.snapshots.set(`${adapterName}_${tweakId}`, { tweakId, previousValue: prev, timestamp: new Date().toISOString() });

          // 24 (0x18) = Disables power off while preserving wake capabilities
          await execAsync(`reg add "${driverRegPath}" /v PnPCapabilities /t REG_DWORD /d 24 /f /reg:64`, { windowsHide: true });
          AuditStore.record({
            category: 'network',
            action: 'Disabled Adapter Power Saving',
            details: `Set PnPCapabilities=24 for adapter '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        case 'adapter_eee_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*EEE' -RegistryValue 0"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Energy-Efficient Ethernet',
            details: `Set *EEE=0 for adapter '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'adapter_green_ethernet_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -DisplayName '*Green*' -RegistryValue 0 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Disabled Green Ethernet',
            details: `Set Green Ethernet=0 for adapter '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'adapter_prefer_ethernet': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetIPInterface -InterfaceAlias '${adapterName}' -InterfaceMetric 10 -AutomaticMetric Disabled"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Set Preferred Ethernet Metric',
            details: `Interface metric set to 10 for '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        case 'network_delivery_optimization_off': {
          const key = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization';
          await execAsync(`reg add "${key}" /v DODownloadMode /t REG_DWORD /d 0 /f /reg:64`, { windowsHide: true });
          AuditStore.record({
            category: 'network',
            action: 'Disabled Delivery Optimization P2P',
            details: 'Configured DODownloadMode=0 to block background P2P seeding.',
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        case 'adapter_speed_duplex': {
          if (!value || typeof value !== 'string') {
            return { success: false, requiresAutoRevert: false, error: 'Invalid speed & duplex selection.' };
          }
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*SpeedDuplex' -RegistryValue ${value}"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Changed Adapter Speed & Duplex',
            details: `Set *SpeedDuplex=${value} on '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: true };
        }

        case 'wifi_roaming_aggressiveness': {
          if (!value || typeof value !== 'string') {
            return { success: false, requiresAutoRevert: false, error: 'Invalid roaming aggressiveness value.' };
          }
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*RoamAggressiveness' -DisplayValue '${value}'"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Updated Wi-Fi Roaming Aggressiveness',
            details: `Set roaming aggressiveness to '${value}' on '${adapterName}'`,
            reversible: true,
          });
          return { success: true, requiresAutoRevert: false };
        }

        default:
          return { success: false, requiresAutoRevert: false, error: `Unknown adapter tweak ID: ${tweakId}` };
      }
    } catch (err: any) {
      return { success: false, requiresAutoRevert: false, error: err.message || 'Failed to apply tweak' };
    }
  }

  /**
   * Reverts an adapter tweak back to Microsoft default
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
      const driverRegPath = await this.getDriverRegistryPath(safeAdapter);

      switch (tweakId) {
        case 'adapter_power_saving_off': {
          if (driverRegPath) {
            await execAsync(`reg delete "${driverRegPath}" /v PnPCapabilities /f /reg:64`, { windowsHide: true });
          }
          AuditStore.record({
            category: 'network',
            action: 'Reverted Adapter Power Saving',
            details: `Removed PnPCapabilities override for '${adapterName}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_eee_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*EEE' -RegistryValue 1 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Energy-Efficient Ethernet',
            details: `Restored default *EEE for '${adapterName}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_green_ethernet_off': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -DisplayName '*Green*' -RegistryValue 1 -ErrorAction SilentlyContinue"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Green Ethernet',
            details: `Restored default Green Ethernet for '${adapterName}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_prefer_ethernet': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetIPInterface -InterfaceAlias '${adapterName}' -AutomaticMetric Enabled"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Restored Automatic Interface Metric',
            details: `AutomaticMetric enabled for '${adapterName}'`,
            reversible: false,
          });
          return { success: true };
        }

        case 'network_delivery_optimization_off': {
          await execAsync(
            'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" /v DODownloadMode /f /reg:64',
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Restored Delivery Optimization Defaults',
            details: 'Removed DODownloadMode policy override.',
            reversible: false,
          });
          return { success: true };
        }

        case 'adapter_speed_duplex': {
          await execAsync(
            `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*SpeedDuplex' -RegistryValue 0"`,
            { windowsHide: true }
          );
          AuditStore.record({
            category: 'network',
            action: 'Reverted Speed & Duplex to Auto',
            details: `Restored Auto Negotiation for '${adapterName}'`,
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
}
