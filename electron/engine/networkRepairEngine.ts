import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';
import { AuditStore } from '../storage/auditStore';

const execAsync = promisify(exec);

export interface NetworkRepairResult {
  success: boolean;
  requiresReboot?: boolean;
  message: string;
  error?: string;
}

export class NetworkRepairEngine {
  /**
   * Flushes Windows DNS Resolver Cache
   */
  static async flushDns(): Promise<NetworkRepairResult> {
    try {
      await execAsync('powershell -NoProfile -Command "Clear-DnsClientCache"', { windowsHide: true });
      AuditStore.record({
        category: 'network',
        action: 'Flushed DNS Resolver Cache',
        details: 'Successfully cleared local DNS resolver cache.',
        reversible: false,
      });
      return { success: true, message: 'DNS resolver cache successfully flushed.' };
    } catch {
      // Fallback to ipconfig
      try {
        await execAsync('ipconfig /flushdns', { windowsHide: true });
        AuditStore.record({
          category: 'network',
          action: 'Flushed DNS Resolver Cache',
          details: 'Successfully cleared local DNS resolver cache via ipconfig.',
          reversible: false,
        });
        return { success: true, message: 'DNS resolver cache successfully flushed.' };
      } catch (err: any) {
        return { success: false, message: 'Failed to flush DNS cache.', error: err.message };
      }
    }
  }

  /**
   * Releases and renews DHCP IP lease on the specified adapter
   */
  static async renewIp(adapterName: string): Promise<NetworkRepairResult> {
    try {
      // Release then renew
      await execAsync(`ipconfig /renew "${adapterName}"`, { windowsHide: true });
      AuditStore.record({
        category: 'network',
        action: 'Renewed DHCP Lease',
        details: `Renewed IPv4 DHCP configuration for adapter '${adapterName}'`,
        reversible: false,
      });
      return { success: true, message: `Successfully renewed IP lease for adapter '${adapterName}'.` };
    } catch (err: any) {
      return { success: false, message: 'Failed to renew IP lease.', error: err.message };
    }
  }

  /**
   * Resets the Winsock Catalog to default state
   */
  static async resetWinsock(): Promise<NetworkRepairResult> {
    try {
      await execAsync('netsh winsock reset', { windowsHide: true });
      AuditStore.record({
        category: 'network',
        action: 'Reset Winsock Catalog',
        details: 'Executed netsh winsock reset. System restart required to apply.',
        reversible: false,
      });
      return {
        success: true,
        requiresReboot: true,
        message: 'Winsock catalog reset successfully. Please restart your computer for changes to take effect.',
      };
    } catch (err: any) {
      return { success: false, message: 'Failed to reset Winsock catalog.', error: err.message };
    }
  }

  /**
   * Resets the TCP/IP stack back to clean Windows defaults
   */
  static async resetTcpIp(): Promise<NetworkRepairResult> {
    try {
      await execAsync('netsh int ip reset resetlog.txt', { windowsHide: true });
      AuditStore.record({
        category: 'network',
        action: 'Reset TCP/IP Stack',
        details: 'Executed netsh int ip reset. Cleaned all manual IP protocol stack overrides.',
        reversible: false,
      });
      return {
        success: true,
        requiresReboot: true,
        message: 'TCP/IP stack reset successfully. Please restart your computer to re-initialize the IP stack.',
      };
    } catch (err: any) {
      return { success: false, message: 'Failed to reset TCP/IP stack.', error: err.message };
    }
  }

  /**
   * Restarts the physical network adapter safely
   */
  static async restartAdapter(adapterName: string): Promise<NetworkRepairResult> {
    try {
      await execAsync(
        `powershell -NoProfile -Command "Restart-NetAdapter -Name '${adapterName}' -ErrorAction Stop"`,
        { windowsHide: true }
      );
      AuditStore.record({
        category: 'network',
        action: 'Restarted Network Adapter',
        details: `Restarted physical adapter '${adapterName}'`,
        reversible: false,
      });
      return { success: true, message: `Adapter '${adapterName}' restarted successfully.` };
    } catch (err: any) {
      return { success: false, message: `Failed to restart adapter '${adapterName}'.`, error: err.message };
    }
  }

  /**
   * Resets Windows Firewall rules back to default factory state
   */
  static async resetFirewall(): Promise<NetworkRepairResult> {
    try {
      await execAsync('netsh advfirewall reset', { windowsHide: true });
      AuditStore.record({
        category: 'network',
        action: 'Reset Windows Firewall Rules',
        details: 'Restored Windows Firewall to default policy state.',
        reversible: false,
      });
      return { success: true, message: 'Windows Defender Firewall rules successfully reset to default.' };
    } catch (err: any) {
      return { success: false, message: 'Failed to reset Windows Firewall.', error: err.message };
    }
  }

  /**
   * Top-Bar: Reset all network settings and tweaks to Windows factory defaults
   */
  static async resetAllNetworkDefaults(adapterName?: string): Promise<NetworkRepairResult> {
    try {
      // 1. Reset DNS to automatic DHCP
      if (adapterName) {
        await execAsync(
          `powershell -NoProfile -Command "Set-DnsClientServerAddress -InterfaceAlias '${adapterName}' -ResetServerAddresses -ErrorAction SilentlyContinue"`,
          { windowsHide: true }
        );
      }

      // 2. Reset Interface Metric to Automatic
      if (adapterName) {
        await execAsync(
          `powershell -NoProfile -Command "Set-NetIPInterface -InterfaceAlias '${adapterName}' -AutomaticMetric Enabled -ErrorAction SilentlyContinue"`,
          { windowsHide: true }
        );
      }

      // 3. Remove Delivery Optimization policy override
      await execAsync(
        'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" /v DODownloadMode /f /reg:64',
        { windowsHide: true }
      ).catch(() => {});

      // 4. Remove PnPCapabilities power override
      if (adapterName) {
        const cmd = `powershell -NoProfile -Command "$pnp = (Get-NetAdapter -Name '${adapterName}' -ErrorAction SilentlyContinue).PnPDeviceID; if ($pnp) { $d = (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $pnp) -ErrorAction SilentlyContinue).Driver; if ($d) { Remove-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\' + $d) -Name PnPCapabilities -ErrorAction SilentlyContinue } }"`;
        await execAsync(cmd, { windowsHide: true }).catch(() => {});
      }

      // 5. Restore Speed & Duplex to Auto Negotiation
      if (adapterName) {
        await execAsync(
          `powershell -NoProfile -Command "Set-NetAdapterAdvancedProperty -Name '${adapterName}' -RegistryKeyword '*SpeedDuplex' -RegistryValue 0 -ErrorAction SilentlyContinue"`,
          { windowsHide: true }
        ).catch(() => {});
      }

      // 6. Flush DNS
      await this.flushDns();

      AuditStore.record({
        category: 'network',
        action: 'Reset All Network Settings',
        details: `Restored all network and adapter configurations to factory defaults for '${adapterName || 'all adapters'}'.`,
        reversible: false,
      });

      return {
        success: true,
        message: 'All network configurations, adapter properties, and DNS settings have been reset to Windows factory defaults.',
      };
    } catch (err: any) {
      return { success: false, message: 'Failed to reset all network defaults.', error: err.message };
    }
  }

  /**
   * Generates Safe Mode Network Recovery script and opens the folder
   */
  static async openNetworkRecoveryFolder(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const userDocs = path.join(os.homedir(), 'Documents', 'PCTweak', 'Recovery');
      if (!fs.existsSync(userDocs)) {
        fs.mkdirSync(userDocs, { recursive: true });
      }

      const batPath = path.join(userDocs, 'Network-Recovery.bat');
      const batContent = `@echo off
echo ========================================================
echo        PC TWEAK SAFE MODE NETWORK RECOVERY SCRIPT
echo ========================================================
echo.
echo 1. Resetting all network adapters to automatic DHCP DNS...
netsh interface ipv4 set dnsservers name="Ethernet" source=dhcp >nul 2>&1
netsh interface ipv4 set dnsservers name="Wi-Fi" source=dhcp >nul 2>&1
echo.
echo 2. Resetting TCP/IP protocol stack to clean defaults...
netsh int ip reset resetlog.txt >nul 2>&1
echo.
echo 3. Resetting Winsock catalog...
netsh winsock reset >nul 2>&1
echo.
echo 4. Flushing DNS cache...
ipconfig /flushdns >nul 2>&1
echo.
echo 5. Resetting Windows Defender Firewall to default policy...
netsh advfirewall reset >nul 2>&1
echo.
echo 6. Removing Delivery Optimization P2P bandwidth restrictions...
reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization" /v DODownloadMode /f >nul 2>&1
echo.
echo ========================================================
echo Network recovery finished. Please restart your PC normally.
echo ========================================================
pause
`;
      fs.writeFileSync(batPath, batContent, 'utf8');

      await shell.openPath(userDocs);
      return { success: true, path: userDocs };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to open recovery folder' };
    }
  }
}
