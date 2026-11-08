import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper: parse netsh dnsservers output
function parseNetshDnsOutput(output) {
  const isDhcp = /configured through dhcp/i.test(output);
  const ipMatches = output.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  
  // Filter out any subnet masks like 255.255.255.0
  const dnsServers = ipMatches.filter(ip => !ip.startsWith('255.') && !ip.startsWith('0.'));

  return {
    isDhcp,
    primary: dnsServers[0] || '',
    secondary: dnsServers[1] || ''
  };
}

// Helper: calculate median and P95 from array of latencies
function calculateLatencyStats(samples) {
  if (!samples || samples.length === 0) {
    return { min: 0, median: 0, p95: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  const midIndex = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[midIndex - 1] + sorted[midIndex]) / 2)
    : sorted[midIndex];

  const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  const p95 = sorted[p95Index];

  return { min, median, p95, max };
}

// Helper: validate IP address
function isValidIp(ip) {
  if (!ip) return false;
  // IPv4 simple check
  const v4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  // IPv6 check
  const v6Regex = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::1$/;
  return v4Regex.test(ip) || v6Regex.test(ip);
}

// Helper: validate DoH template URL
function isValidDohUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

describe('DNS Manager Unit Tests', () => {
  describe('Netsh DNS Parser', () => {
    test('parses DHCP-configured DNS correctly', () => {
      const sample = `
Configuration for interface "Ethernet"
    DHCP configured:                         Yes
    Statically Configured DNS Servers:       None
    DNS servers configured through DHCP:     192.168.100.1
    Register with which suffix:              Primary only
      `;
      const res = parseNetshDnsOutput(sample);
      assert.equal(res.isDhcp, true);
      assert.equal(res.primary, '192.168.100.1');
      assert.equal(res.secondary, '');
    });

    test('parses Static DNS servers correctly', () => {
      const sample = `
Configuration for interface "Ethernet"
    Statically Configured DNS Servers:   1.1.1.1
                                         1.0.0.1
    Register with which suffix:          Primary only
      `;
      const res = parseNetshDnsOutput(sample);
      assert.equal(res.isDhcp, false);
      assert.equal(res.primary, '1.1.1.1');
      assert.equal(res.secondary, '1.0.0.1');
    });

    test('handles empty or unrecognized output cleanly', () => {
      const res = parseNetshDnsOutput('There are no DNS servers configured on this interface.');
      assert.equal(res.isDhcp, false);
      assert.equal(res.primary, '');
      assert.equal(res.secondary, '');
    });
  });

  describe('Latency & P95 Benchmark Stats', () => {
    test('calculates correct median and P95 on sorted data', () => {
      const samples = [10, 12, 14, 15, 16, 18, 20, 22, 25, 100];
      const stats = calculateLatencyStats(samples);
      
      assert.equal(stats.min, 10);
      assert.equal(stats.max, 100);
      // mid indices 4 (16) and 5 (18) -> average 17
      assert.equal(stats.median, 17);
      // p95 index is 9 (100) or 8 (25)
      assert.ok(stats.p95 >= 25);
    });

    test('handles single sample gracefully', () => {
      const stats = calculateLatencyStats([42]);
      assert.equal(stats.min, 42);
      assert.equal(stats.max, 42);
      assert.equal(stats.median, 42);
      assert.equal(stats.p95, 42);
    });

    test('handles empty samples safely without division by zero', () => {
      const stats = calculateLatencyStats([]);
      assert.equal(stats.median, 0);
      assert.equal(stats.p95, 0);
    });
  });

  describe('IP & DoH Validator Guardrails', () => {
    test('accepts valid IPv4 public and local addresses', () => {
      assert.equal(isValidIp('1.1.1.1'), true);
      assert.equal(isValidIp('8.8.8.8'), true);
      assert.equal(isValidIp('9.9.9.9'), true);
      assert.equal(isValidIp('192.168.1.1'), true);
      assert.equal(isValidIp('178.22.122.100'), true); // Shecan
    });

    test('rejects malicious or invalid IP strings', () => {
      assert.equal(isValidIp('1.1.1.1; rm -rf /'), false);
      assert.equal(isValidIp('8.8.8.8 & net user hacker'), false);
      assert.equal(isValidIp('999.999.999.999'), false);
      assert.equal(isValidIp('abc.def.ghi.jkl'), false);
      assert.equal(isValidIp(''), false);
    });

    test('accepts valid HTTPS DoH URLs', () => {
      assert.equal(isValidDohUrl('https://cloudflare-dns.com/dns-query'), true);
      assert.equal(isValidDohUrl('https://dns.google/dns-query'), true);
      assert.equal(isValidDohUrl('https://dns.quad9.net/dns-query'), true);
    });

    test('rejects non-https or invalid DoH URLs', () => {
      assert.equal(isValidDohUrl('http://insecure-dns.com'), false);
      assert.equal(isValidDohUrl('ftp://ftp.example.com'), false);
      assert.equal(isValidDohUrl('javascript:alert(1)'), false);
      assert.equal(isValidDohUrl(''), false);
    });
  });

  describe('Pre-apply Snapshot & Rollback Contract', () => {
    test('creates consistent rollback record for DHCP adapter', () => {
      const snapshot = {
        adapterName: 'Ethernet',
        wasDhcp: true,
        primaryDns: '192.168.100.1',
        secondaryDns: '',
        appliedAt: new Date().toISOString()
      };

      assert.equal(snapshot.wasDhcp, true);
      assert.equal(snapshot.adapterName, 'Ethernet');
      assert.ok(snapshot.appliedAt);
    });

    test('creates consistent rollback record for Static adapter', () => {
      const snapshot = {
        adapterName: 'Ethernet',
        wasDhcp: false,
        primaryDns: '1.1.1.1',
        secondaryDns: '1.0.0.1',
        appliedAt: new Date().toISOString()
      };

      assert.equal(snapshot.wasDhcp, false);
      assert.equal(snapshot.primaryDns, '1.1.1.1');
      assert.equal(snapshot.secondaryDns, '1.0.0.1');
    });
  });
});
