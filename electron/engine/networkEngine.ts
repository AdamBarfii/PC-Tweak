import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { RegistryEngine } from './registry';
import { AuditStore } from '../storage/auditStore';
import { BackupStore } from '../storage/backupStore';
import { DnsEngine } from './dnsEngine';
import { AdapterTweaksEngine } from './adapterTweaksEngine';
import { AdvancedNetworkEngine } from './advancedNetworkEngine';

const execAsync = promisify(exec);

export interface NetworkAdapterInfo {
  id: string;
  name: string;
  description: string;
  status: 'Up' | 'Disconnected' | 'Disabled' | 'Unknown';
  linkSpeed: string;
  mediaType: 'Ethernet' | 'Wi-Fi' | 'Other';
  ipv4Address: string | null;
  defaultGateway: string | null;
  dnsServers: string[];
  isMetered: boolean;
  macAddress: string;
  isPhysical: boolean;
}

export interface NetworkModuleOverview {
  adapters: NetworkAdapterInfo[];
  activeAdapter: NetworkAdapterInfo | null;
  isRdpActive: boolean;
  hasReversibleChanges: boolean;
}

const VIRTUAL_ADAPTER_PATTERNS = [
  /wiresock/i,
  /tap-/i,
  /vpn/i,
  /amnezia/i,
  /hamachi/i,
  /openvpn/i,
  /hyper-v/i,
  /wsl/i,
  /vmware/i,
  /virtualbox/i,
  /docker/i,
  /loopback/i,
  /wireguard/i,
];

export class NetworkEngine {
  private static snapshotStore = new Map<string, any>();

  /**
   * Identifies whether an adapter is virtual/VPN based on its name and description
   */
  static isVirtualAdapter(name: string, description: string): boolean {
    return VIRTUAL_ADAPTER_PATTERNS.some((p) => p.test(name) || p.test(description));
  }

  /**
   * Retrieves all network adapters, isolating physical hardware from virtual tunnels
   */
  static async getAdapters(): Promise<NetworkAdapterInfo[]> {
    const adapters: NetworkAdapterInfo[] = [];

    try {
      // 1. Query all adapters via Get-NetAdapter
      const getNetAdapterCmd = `powershell -NoProfile -Command "Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed, MediaType, MacAddress | ConvertTo-Json -Compress"`;
      const { stdout: netAdapterOut } = await execAsync(getNetAdapterCmd, { windowsHide: true });
      if (!netAdapterOut.trim()) return [];

      let parsed: any[] = [];
      try {
        const json = JSON.parse(netAdapterOut.trim());
        parsed = Array.isArray(json) ? json : [json];
      } catch {
        return [];
      }

      // 2. Query IP configuration for active adapters
      const ipConfigCmd = `powershell -NoProfile -Command "Get-NetIPConfiguration | Select-Object InterfaceAlias, IPv4Address, @{Name='Gateway';Expression={$_.IPv4DefaultGateway.NextHop}}, @{Name='DNS';Expression={$_.DNSServer.ServerAddresses}} | ConvertTo-Json -Compress"`;
      let ipConfigs: any[] = [];
      try {
        const { stdout: ipOut } = await execAsync(ipConfigCmd, { windowsHide: true });
        if (ipOut.trim()) {
          const json = JSON.parse(ipOut.trim());
          ipConfigs = Array.isArray(json) ? json : [json];
        }
      } catch {}

      // 3. Query metered connection state
      let meteredNames = new Set<string>();
      try {
        const meteredCmd = `powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object { $_.Cost -and $_.Cost -ne 'Unrestricted' } | Select-Object -ExpandProperty InterfaceAlias"`;
        const { stdout: meteredOut } = await execAsync(meteredCmd, { windowsHide: true });
        meteredOut
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((name) => meteredNames.add(name.toLowerCase()));
      } catch {}

      for (const item of parsed) {
        const name = String(item.Name || '');
        const desc = String(item.InterfaceDescription || '');
        const isVirtual = this.isVirtualAdapter(name, desc);

        const ipEntry = ipConfigs.find(
          (c) => String(c.InterfaceAlias || '').toLowerCase() === name.toLowerCase()
        );

        let ipv4: string | null = null;
        if (ipEntry?.IPv4Address) {
          if (Array.isArray(ipEntry.IPv4Address)) {
            ipv4 = String(ipEntry.IPv4Address[0] || '');
          } else if (typeof ipEntry.IPv4Address === 'object') {
            ipv4 = String(ipEntry.IPv4Address.IPAddress || '');
          } else {
            ipv4 = String(ipEntry.IPv4Address);
          }
        }

        const gateway = ipEntry?.Gateway ? String(ipEntry.Gateway) : null;
        let dnsServers: string[] = [];
        if (ipEntry?.DNS) {
          if (Array.isArray(ipEntry.DNS)) {
            dnsServers = ipEntry.DNS.map((d: any) => String(d)).filter(Boolean);
          } else if (typeof ipEntry.DNS === 'string') {
            dnsServers = [ipEntry.DNS];
          }
        }

        const mediaTypeRaw = String(item.MediaType || '');
        let mediaType: 'Ethernet' | 'Wi-Fi' | 'Other' = 'Other';
        if (mediaTypeRaw.includes('802.3') || desc.toLowerCase().includes('ethernet') || desc.toLowerCase().includes('pcie')) {
          mediaType = 'Ethernet';
        } else if (mediaTypeRaw.includes('802.11') || desc.toLowerCase().includes('wi-fi') || desc.toLowerCase().includes('wireless')) {
          mediaType = 'Wi-Fi';
        }

        adapters.push({
          id: name.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
          name,
          description: desc,
          status: item.Status === 'Up' ? 'Up' : item.Status === 'Disabled' ? 'Disabled' : 'Disconnected',
          linkSpeed: String(item.LinkSpeed || 'Unknown'),
          mediaType,
          ipv4Address: ipv4,
          defaultGateway: gateway,
          dnsServers,
          isMetered: meteredNames.has(name.toLowerCase()),
          macAddress: String(item.MacAddress || ''),
          isPhysical: !isVirtual,
        });
      }
    } catch (err) {
      console.error('Failed to query network adapters:', err);
    }

    return adapters;
  }

  /**
   * Retrieves full overview of active hardware and connectivity
   */
  static async getOverview(): Promise<NetworkModuleOverview> {
    const allAdapters = await this.getAdapters();

    // Physical adapters prioritized, active 'Up' adapter first
    const physical = allAdapters.filter((a) => a.isPhysical);
    const active =
      physical.find((a) => a.status === 'Up' && a.defaultGateway) ||
      physical.find((a) => a.status === 'Up') ||
      physical[0] ||
      null;

    // Detect RDP active session
    let isRdpActive = false;
    try {
      const { stdout } = await execAsync('powershell -NoProfile -Command "Get-Process -Name mstsc -ErrorAction SilentlyContinue"', { windowsHide: true });
      isRdpActive = stdout.includes('mstsc');
    } catch {}

    return {
      adapters: physical,
      activeAdapter: active,
      isRdpActive,
      hasReversibleChanges: this.snapshotStore.size > 0,
    };
  }

  /**
   * Undoes all network tweaks, restoring DNS, adapter properties, and TCP/MMCSS settings
   */
  static async undoAll(
    adapterName?: string
  ): Promise<{ success: boolean; count: number; message: string; error?: string }> {
    let revertedCount = 0;
    const errors: string[] = [];

    // 1. Resolve target adapter name if not provided
    let targetAdapter = adapterName;
    if (!targetAdapter) {
      const overview = await this.getOverview();
      targetAdapter = overview.activeAdapter?.name;
    }

    if (!targetAdapter) {
      return { success: false, count: 0, message: 'No active network adapter found to undo.' };
    }

    // 2. Revert DNS (restore previous snapshot or reset to DHCP)
    try {
      const dnsRes = await DnsEngine.revertDns(targetAdapter);
      if (dnsRes.success) {
        revertedCount++;
      } else {
        // Fallback: reset to DHCP
        const dhcpRes = await DnsEngine.resetDnsToDhcp(targetAdapter);
        if (dhcpRes.success) revertedCount++;
      }
    } catch (e: any) {
      errors.push(`DNS: ${e.message}`);
    }

    // 3. Revert Adapter Tweaks
    const adapterTweaks = [
      'adapter_power_saving_off',
      'adapter_eee_off',
      'adapter_green_ethernet_off',
      'adapter_prefer_ethernet',
      'network_delivery_optimization_off',
    ];

    for (const tweakId of adapterTweaks) {
      try {
        const res = await AdapterTweaksEngine.revertTweak(targetAdapter, tweakId);
        if (res.success) revertedCount++;
      } catch (e: any) {
        errors.push(`${tweakId}: ${e.message}`);
      }
    }

    // 4. Revert Advanced Network Tweaks
    const advancedTweaks = [
      'adapter_interrupt_moderation_off',
      'adapter_flow_control_off',
      'adapter_lso_off',
      'adapter_rsc_off',
      'tcp_nagle_algorithm_off',
      'tcp_autotuning_normal',
      'tcp_ecn_toggle',
      'mmcss_network_throttling_off',
      'mmcss_system_responsiveness_zero',
    ];

    for (const tweakId of advancedTweaks) {
      try {
        const res = await AdvancedNetworkEngine.revertTweak(targetAdapter, tweakId);
        if (res.success) revertedCount++;
      } catch (e: any) {
        errors.push(`${tweakId}: ${e.message}`);
      }
    }

    // 5. Restore any active backups in BackupStore tagged with network tweaks
    try {
      const backups = BackupStore.listBackups();
      for (const b of backups) {
        if (
          b.status === 'active' &&
          b.tweakIds &&
          b.tweakIds.some(
            (id) =>
              id.startsWith('adapter_') ||
              id.startsWith('tcp_') ||
              id.startsWith('network_') ||
              id.startsWith('mmcss_')
          )
        ) {
          for (const snapshot of b.snapshots) {
            if (snapshot.actionType === 'registry') {
              const { hive, path: regPath, valueName, valueType } = snapshot.metadata;
              const orig = snapshot.originalValue;
              if (orig && orig.exists) {
                await RegistryEngine.setValue(hive, regPath, valueName, valueType, orig.value);
              } else {
                await RegistryEngine.deleteValue(hive, regPath, valueName);
              }
            }
          }
          BackupStore.updateStatus(b.id, 'reverted');
        }
      }
    } catch {}

    AuditStore.record({
      category: 'network',
      action: 'Undo All Network Settings',
      details: `Reverted ${revertedCount} network settings on adapter '${targetAdapter}' to Windows defaults`,
      reversible: false,
    });

    return {
      success: errors.length === 0 || revertedCount > 0,
      count: revertedCount,
      message: `Successfully reverted ${revertedCount} network settings on '${targetAdapter}' to Windows defaults.`,
    };
  }
}
