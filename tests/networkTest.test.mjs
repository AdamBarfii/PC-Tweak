import test from 'node:test';
import assert from 'node:assert/strict';

test('Virtual Adapter Filter: accurately detects VPNs and tunnels while preserving physical hardware', () => {
  const isVirtual = (name, desc) => {
    const patterns = [
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
    return patterns.some((p) => p.test(name) || p.test(desc));
  };

  // Virtual / VPN adapters found on test system
  assert.equal(isVirtual('Ezconnect Virtual Adapter', 'WireSock Virtual Adapter'), true);
  assert.equal(isVirtual('Ethernet 3', 'TAP-Windows Adapter V9'), true);
  assert.equal(isVirtual('Hamachi', 'LogMeIn Hamachi Virtual Ethernet Adapter'), true);
  assert.equal(isVirtual('AmneziaVPN', 'WireGuard Tunnel'), true);
  assert.equal(isVirtual('Local Area Connection 2', 'OpenVPN Data Channel Offload for ExpressVPN'), true);

  // Physical network cards
  assert.equal(isVirtual('Ethernet', 'Realtek PCIe GbE Family Controller'), false);
  assert.equal(isVirtual('Wi-Fi', 'Intel(R) Wi-Fi 6 AX200 160MHz'), false);
  assert.equal(isVirtual('Ethernet 2', 'Intel(R) Ethernet Connection I219-V'), false);
});

test('RFC 3550 Jitter Algorithm: accurately calculates packet interarrival variation', () => {
  // Formula: J_i = J_{i-1} + (|D(i-1, i)| - J_{i-1}) / 16
  const computeJitter = (rtts) => {
    let jitter = 0;
    for (let i = 1; i < rtts.length; i++) {
      const d = Math.abs(rtts[i] - rtts[i - 1]);
      jitter = jitter + (d - jitter) / 16;
    }
    return Number(jitter.toFixed(2));
  };

  // Perfectly steady 20ms connection -> jitter = 0
  assert.equal(computeJitter([20, 20, 20, 20, 20]), 0);

  // Jittered samples: [20, 25, 18, 30, 22]
  const jitterResult = computeJitter([20, 25, 18, 30, 22]);
  assert.ok(jitterResult > 0);
  assert.ok(jitterResult < 15);
});

test('ICMP Ping Regex Parser: correctly handles sub-millisecond and standard Windows outputs', () => {
  const parsePing = (stdout) => {
    if (stdout.includes('time<1ms')) return 0.5;
    const match = stdout.match(/time[<=]([0-9]+)ms/i);
    return match ? Number(match[1]) : null;
  };

  const outputSubMs = 'Reply from 127.0.0.1: bytes=32 time<1ms TTL=128';
  const outputNormal = 'Reply from 8.8.8.8: bytes=32 time=42ms TTL=119';
  const outputTimeout = 'Request timed out.';

  assert.equal(parsePing(outputSubMs), 0.5);
  assert.equal(parsePing(outputNormal), 42);
  assert.equal(parsePing(outputTimeout), null);
});

test('Baseline Delta Rule: strictly enforces delta > 2x noise spread for performance claims', () => {
  const compareDelta = (postAvg, baselineAvg, noiseSpread) => {
    const deltaMs = Number((baselineAvg - postAvg).toFixed(2));
    const threshold = 2 * noiseSpread;
    const improved = deltaMs > threshold && deltaMs > 0.5;

    return {
      improved,
      deltaMs,
      spreadMs: noiseSpread,
    };
  };

  // Baseline avg: 30ms, Noise spread: 1.5ms (Threshold = 3.0ms)
  // Scenario A: Post tweak avg is 25ms (Delta = 5ms > 3.0ms) -> Confirmed Improvement
  const scenarioA = compareDelta(25.0, 30.0, 1.5);
  assert.equal(scenarioA.improved, true);
  assert.equal(scenarioA.deltaMs, 5.0);

  // Scenario B: Post tweak avg is 28.5ms (Delta = 1.5ms <= 3.0ms) -> No Measurable Change
  const scenarioB = compareDelta(28.5, 30.0, 1.5);
  assert.equal(scenarioB.improved, false);
  assert.equal(scenarioB.deltaMs, 1.5);
});
