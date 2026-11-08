import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dns from 'node:dns';
import { performance } from 'node:perf_hooks';
import { DnsPreset, DnsStore } from '../storage/dnsStore';
import { AuditStore } from '../storage/auditStore';

const execAsync = promisify(exec);

export interface CurrentDnsInfo {
  adapterName: string;
  isDhcp: boolean;
  servers: string[];
  dohActive: boolean;
}

export interface DnsBenchmarkResult {
  serverId: string;
  serverName: string;
  serverIp: string;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  successCount: number;
  failureCount: number;
  testedCount: number;
}

interface DnsSnapshot {
  adapterName: string;
  wasDhcp: boolean;
  servers: string[];
  timestamp: string;
}

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Sanitizes network adapter interface names to prevent command injection in netsh/PowerShell.
 * Preserves normal characters like spaces, dashes, dots, underscores, parentheses, brackets, #.
 * Rejects/strips shell metacharacters: quotes, semicolons, backticks, dollar signs, ampersands, pipes, etc.
 */
export function sanitizeInterfaceAlias(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9 \-_().#\[\]]/g, '').trim();
}

/**
 * Validates a DNS-over-HTTPS (DoH) URI template.
 * Strictly enforces https: protocol and disallows whitespace and shell metacharacters.
 */
export function isValidDohTemplate(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  if (/[\s'"`;$<>`|\\]/.test(urlStr)) return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class DnsEngine {
  private static dnsSnapshots = new Map<string, DnsSnapshot>();

  /**
   * Reads real current DNS configuration for a network adapter
   */
  static async getCurrentDns(adapterName: string): Promise<CurrentDnsInfo> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    let isDhcp = true;
    let servers: string[] = [];
    let dohActive = false;

    if (!safeAdapter) {
      return { adapterName, isDhcp: true, servers: [], dohActive: false };
    }

    try {
      const cmd = `powershell -NoProfile -Command "netsh interface ipv4 show dnsservers name=\\"${safeAdapter}\\""`;
      const { stdout } = await execAsync(cmd, { windowsHide: true });

      if (stdout.includes('Statically Configured DNS Servers')) {
        isDhcp = false;
      }

      // Extract all IPv4 addresses from netsh output
      const matches = stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
      servers = Array.from(new Set(matches)).filter((ip) => IPV4_REGEX.test(ip));

      // Query DoH state
      try {
        const { stdout: dohOut } = await execAsync(
          'powershell -NoProfile -Command "Get-DnsClientDohServerAddress -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ServerAddress"',
          { windowsHide: true }
        );
        const configuredDohIps = dohOut.split('\n').map((s) => s.trim()).filter(Boolean);
        dohActive = servers.some((s) => configuredDohIps.includes(s));
      } catch {}
    } catch (err) {
      console.error(`Failed to get DNS for adapter ${safeAdapter}:`, err);
    }

    return {
      adapterName: safeAdapter,
      isDhcp,
      servers,
      dohActive,
    };
  }

  /**
   * Applies a DNS preset to the specified adapter with automatic snapshot capture
   */
  static async applyPreset(
    adapterName: string,
    preset: DnsPreset,
    enableDoh = false
  ): Promise<{ success: boolean; requiresAutoRevert: boolean; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) {
      return { success: false, requiresAutoRevert: false, error: 'Invalid or unsafe network adapter name.' };
    }

    try {
      // 1. Capture snapshot before applying
      const current = await this.getCurrentDns(safeAdapter);
      this.dnsSnapshots.set(safeAdapter.toLowerCase(), {
        adapterName: safeAdapter,
        wasDhcp: current.isDhcp,
        servers: current.servers,
        timestamp: new Date().toISOString(),
      });

      // 2. Validate IP format to prevent command injection
      if (!IPV4_REGEX.test(preset.primaryIpv4)) {
        return { success: false, requiresAutoRevert: false, error: 'Invalid primary IPv4 address format.' };
      }
      if (preset.secondaryIpv4 && !IPV4_REGEX.test(preset.secondaryIpv4)) {
        return { success: false, requiresAutoRevert: false, error: 'Invalid secondary IPv4 address format.' };
      }

      const serverList = [preset.primaryIpv4];
      if (preset.secondaryIpv4) serverList.push(preset.secondaryIpv4);
      const serverParams = serverList.map((ip) => `'${ip}'`).join(', ');

      // 3. Set static DNS on adapter
      const setDnsCmd = `powershell -NoProfile -Command "Set-DnsClientServerAddress -InterfaceAlias \\"${safeAdapter}\\" -ServerAddresses @(${serverParams})"`;
      await execAsync(setDnsCmd, { windowsHide: true });

      // 4. Configure DoH template if enabled and available
      if (enableDoh && preset.dohTemplate) {
        if (!isValidDohTemplate(preset.dohTemplate)) {
          return {
            success: false,
            requiresAutoRevert: false,
            error: 'Invalid DoH template URL. Must use https:// protocol without shell metacharacters.',
          };
        }
        try {
          const dohCmd = `powershell -NoProfile -Command "Add-DnsClientDohServerAddress -ServerAddress '${preset.primaryIpv4}' -DohTemplate '${preset.dohTemplate.trim()}' -AllowFallbackToUdp \\$true -AutoUpgrade \\$true -ErrorAction SilentlyContinue"`;
          await execAsync(dohCmd, { windowsHide: true });
        } catch {}
      }

      // 5. Quick DNS sanity check: verify that resolution is functional
      try {
        const testResolver = new dns.promises.Resolver({ timeout: 2500, tries: 1 });
        testResolver.setServers([preset.primaryIpv4]);
        await testResolver.resolve4('cloudflare.com');
      } catch (err: any) {
        // Immediate rollback if chosen DNS cannot resolve domains
        await this.revertDns(safeAdapter);
        return {
          success: false,
          requiresAutoRevert: false,
          error: `Selected DNS server (${preset.primaryIpv4}) did not respond to queries. Automatically restored previous configuration.`,
        };
      }

      AuditStore.record({
        category: 'network',
        action: 'Applied DNS Preset',
        details: `Adapter ${safeAdapter} set to ${preset.name} (${serverList.join(', ')})`,
        reversible: true,
      });

      return { success: true, requiresAutoRevert: true };
    } catch (err: any) {
      return { success: false, requiresAutoRevert: false, error: err.message || 'Failed to apply DNS preset' };
    }
  }

  /**
   * Resets adapter DNS back to automatic DHCP
   */
  static async resetDnsToDhcp(adapterName: string): Promise<{ success: boolean; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) {
      return { success: false, error: 'Invalid or unsafe network adapter name.' };
    }

    try {
      const current = await this.getCurrentDns(safeAdapter);
      this.dnsSnapshots.set(safeAdapter.toLowerCase(), {
        adapterName: safeAdapter,
        wasDhcp: current.isDhcp,
        servers: current.servers,
        timestamp: new Date().toISOString(),
      });

      const cmd = `powershell -NoProfile -Command "Set-DnsClientServerAddress -InterfaceAlias \\"${safeAdapter}\\" -ResetServerAddresses"`;
      await execAsync(cmd, { windowsHide: true });

      AuditStore.record({
        category: 'network',
        action: 'Reset DNS to Automatic',
        details: `Adapter ${safeAdapter} reset to automatic DHCP DNS`,
        reversible: true,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reset DNS to DHCP' };
    }
  }

  /**
   * Reverts the adapter to its previous snapshot state
   */
  static async revertDns(adapterName: string): Promise<{ success: boolean; error?: string }> {
    const safeAdapter = sanitizeInterfaceAlias(adapterName);
    if (!safeAdapter) {
      return { success: false, error: 'Invalid or unsafe network adapter name.' };
    }

    const snap = this.dnsSnapshots.get(safeAdapter.toLowerCase());
    if (!snap) {
      return { success: false, error: 'No snapshot available to revert for this adapter.' };
    }

    try {
      if (snap.wasDhcp) {
        const cmd = `powershell -NoProfile -Command "Set-DnsClientServerAddress -InterfaceAlias \\"${safeAdapter}\\" -ResetServerAddresses"`;
        await execAsync(cmd, { windowsHide: true });
      } else {
        const safeServers = snap.servers.filter((ip) => IPV4_REGEX.test(ip));
        const serverParams = safeServers.map((ip) => `'${ip}'`).join(', ');
        const cmd = `powershell -NoProfile -Command "Set-DnsClientServerAddress -InterfaceAlias \\"${safeAdapter}\\" -ServerAddresses @(${serverParams})"`;
        await execAsync(cmd, { windowsHide: true });
      }

      this.dnsSnapshots.delete(safeAdapter.toLowerCase());

      AuditStore.record({
        category: 'network',
        action: 'Reverted DNS Settings',
        details: `Restored ${safeAdapter} DNS to ${snap.wasDhcp ? 'DHCP' : snap.servers.join(', ')}`,
        reversible: false,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to revert DNS' };
    }
  }

  /**
   * Flushes Windows DNS Client resolver cache
   */
  static async flushDnsCache(): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync('powershell -NoProfile -Command "Clear-DnsClientCache"', { windowsHide: true });
      await execAsync('ipconfig /flushdns', { windowsHide: true });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to flush DNS cache' };
    }
  }

  /**
   * Executes a real UDP multi-domain benchmark against DNS servers concurrently, bypassing local OS caching
   */
  static async benchmarkDns(
    servers: { id: string; name: string; ip: string }[],
    domains = ['google.com', 'cloudflare.com', 'microsoft.com']
  ): Promise<DnsBenchmarkResult[]> {
    const benchmarkTasks = servers.map(async (server): Promise<DnsBenchmarkResult> => {
      const latencies: number[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Create isolated resolver pointed directly to this server IP
      const resolver = new dns.promises.Resolver({ timeout: 1500, tries: 1 });
      try {
        resolver.setServers([server.ip]);
      } catch {
        return {
          serverId: server.id,
          serverName: server.name,
          serverIp: server.ip,
          minMs: 0,
          medianMs: 0,
          p95Ms: 0,
          maxMs: 0,
          successCount: 0,
          failureCount: domains.length,
          testedCount: domains.length,
        };
      }

      for (const domain of domains) {
        const start = performance.now();
        try {
          await resolver.resolve4(domain);
          const elapsed = performance.now() - start;
          latencies.push(Number(elapsed.toFixed(1)));
          successCount++;
        } catch {
          failureCount++;
        }
      }

      latencies.sort((a, b) => a - b);
      const totalCount = domains.length;

      let minMs = 0;
      let maxMs = 0;
      let medianMs = 0;
      let p95Ms = 0;

      if (latencies.length > 0) {
        minMs = latencies[0];
        maxMs = latencies[latencies.length - 1];

        // Median calculation
        const mid = Math.floor(latencies.length / 2);
        medianMs =
          latencies.length % 2 !== 0
            ? latencies[mid]
            : Number(((latencies[mid - 1] + latencies[mid]) / 2).toFixed(1));

        // P95 calculation
        const p95Idx = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
        p95Ms = latencies[p95Idx];
      }

      return {
        serverId: server.id,
        serverName: server.name,
        serverIp: server.ip,
        minMs,
        medianMs,
        p95Ms,
        maxMs,
        successCount,
        failureCount,
        testedCount: totalCount,
      };
    });

    const results = await Promise.all(benchmarkTasks);

    // Sort by median latency ascending (fastest first, but keep real numbers)
    return results.sort((a, b) => {
      if (a.successCount === 0) return 1;
      if (b.successCount === 0) return -1;
      return a.medianMs - b.medianMs;
    });
  }
}
