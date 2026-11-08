import test from 'node:test';
import assert from 'node:assert/strict';

// Strict hostname, IPv4, or IPv6 validation regex (mirroring networkTestEngine.ts)
const HOST_REGEX = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:\d{1,3}\.){3}\d{1,3}$|^[a-fA-F0-9:]+$/;

function isValidTargetHost(host) {
  if (!host || typeof host !== 'string' || host.length > 253) return false;
  if (/[\s&|;<>`$'"\\!%*?^/{}[\]]/.test(host)) return false;
  return HOST_REGEX.test(host.trim());
}

function sanitizeInterfaceAlias(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9 \-_().#\[\]]/g, '').trim();
}

function isValidDohTemplate(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  if (/[\s'"`;$<>`|\\]/.test(urlStr)) return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

test('Security: Target host validation strictly rejects remote command injection payloads', () => {
  const maliciousHosts = [
    '127.0.0.1 & calc.exe',
    'google.com; whoami',
    '$(calc)',
    '1.1.1.1 | calc',
    '1.1.1.1`calc`',
    '1.1.1.1 > out.txt',
    '::1 & echo hacked',
    "' or 1=1 --",
    '1.1.1.1\nwhoami',
    '1.1.1.1\r\ncalc.exe',
    '8.8.8.8; Start-Process powershell',
    '${env:COMPUTERNAME}',
    '%COMSPEC%',
  ];

  for (const malicious of maliciousHosts) {
    const isValid = isValidTargetHost(malicious);
    assert.equal(isValid, false, `Expected malicious host "${malicious}" to be rejected`);
  }
});

test('Security: Target host validation accepts legitimate IPv4, IPv6, and FQDN hosts', () => {
  const legitimateHosts = [
    '1.1.1.1',
    '8.8.8.8',
    '127.0.0.1',
    '192.168.1.1',
    'google.com',
    'dns.quad9.net',
    'one.one.one.one',
    '::1',
    '2606:4700:4700::1111',
  ];

  for (const host of legitimateHosts) {
    const isValid = isValidTargetHost(host);
    assert.equal(isValid, true, `Expected legitimate host "${host}" to be accepted`);
  }
});

test('Security: DoH URI template validation enforces HTTPS and rejects shell metacharacters', () => {
  const invalidTemplates = [
    'http://dns.google/dns-query', // Insecure HTTP
    "https://dns.google/dns-query'; Start-Process calc; '", // PowerShell injection
    'https://dns.google/dns-query && calc',
    'https://dns.google/dns-query$foo',
    'https://dns.google/dns-query`whoami`',
    'https://dns.google/dns-query|more',
    'ftp://dns.google/dns-query',
    'javascript:alert(1)',
    'https://dns.google/dns-query\ncalc.exe',
  ];

  for (const t of invalidTemplates) {
    assert.equal(isValidDohTemplate(t), false, `Expected DoH template "${t}" to be rejected`);
  }

  const validTemplates = [
    'https://cloudflare-dns.com/dns-query',
    'https://dns.google/dns-query',
    'https://dns.quad9.net/dns-query',
  ];

  for (const t of validTemplates) {
    assert.equal(isValidDohTemplate(t), true, `Expected valid DoH template "${t}" to be accepted`);
  }
});

test('Security: Network interface alias sanitization strips shell injection attempts', () => {
  const testCases = [
    { input: 'Ethernet', expected: 'Ethernet' },
    { input: 'Wi-Fi 2', expected: 'Wi-Fi 2' },
    { input: 'Local Area Connection (vEthernet)', expected: 'Local Area Connection (vEthernet)' },
    { input: 'Ethernet; Remove-Item C:\\ -Recurse', expected: 'Ethernet Remove-Item C -Recurse' },
    { input: 'Wi-Fi" && calc.exe', expected: 'Wi-Fi  calc.exe' },
    { input: 'Ethernet`id`', expected: 'Ethernetid' },
    { input: "Ethernet' | Out-File evil.ps1", expected: 'Ethernet  Out-File evil.ps1' },
    { input: 'NIC [Realtek] #1', expected: 'NIC [Realtek] #1' },
  ];

  for (const tc of testCases) {
    const sanitized = sanitizeInterfaceAlias(tc.input);
    assert.equal(sanitized, tc.expected);
    assert.equal(/['";`$|&<>]/.test(sanitized), false, `Sanitized string contains unsafe characters: ${sanitized}`);
  }
});

test('Security: DNS IPv4 validation strictly enforces standard octets without trailing garbage', () => {
  const invalidIps = [
    '1.1.1.1; calc',
    '256.1.1.1',
    '1.2.3.4.5',
    '1.1.1.1/24',
    '1.1.1.1 & whoami',
    '',
    'localhost',
  ];

  for (const ip of invalidIps) {
    assert.equal(IPV4_REGEX.test(ip), false, `Expected IP "${ip}" to be rejected`);
  }

  const validIps = ['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '9.9.9.9', '192.168.0.1'];
  for (const ip of validIps) {
    assert.equal(IPV4_REGEX.test(ip), true, `Expected valid IP "${ip}" to be accepted`);
  }
});
