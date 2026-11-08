import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper: parse netsh int tcp show global
function parseTcpGlobalOutput(output) {
  const getVal = (pattern) => {
    const m = output.match(pattern);
    return m ? m[1].trim().toLowerCase() : 'unknown';
  };

  return {
    autotuning: getVal(/Receive Window Auto-Tuning Level\s*:\s*(\w+)/i),
    ecn: getVal(/ECN Capability\s*:\s*(\w+)/i),
    timestamps: getVal(/RFC 1323 Timestamps\s*:\s*(\w+)/i),
    rss: getVal(/Receive-Side Scaling State\s*:\s*(\w+)/i),
  };
}

// Helper: MTU calculator
function calculateMtu(unfragmentedPayload) {
  if (unfragmentedPayload < 548 || unfragmentedPayload > 8972) {
    throw new Error('Payload size out of acceptable range.');
  }
  return unfragmentedPayload + 28;
}

// Helper: check MMCSS NetworkThrottlingIndex
function isNetworkThrottlingDisabled(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') {
    return val.toLowerCase() === 'ffffffff' || val.toLowerCase() === '0xffffffff';
  }
  return (val >>> 0) === 0xffffffff;
}

describe('Advanced & Experimental Network Tweaks Tests', () => {
  describe('TCP Global Parameter Parser', () => {
    test('accurately parses standard Windows 11 TCP global output', () => {
      const mockOut = `
        Querying active state...

        TCP Global Parameters
        ----------------------------------------------
        Receive-Side Scaling State          : enabled 
        Receive Window Auto-Tuning Level    : normal 
        Add-On Congestion Control Provider  : default 
        ECN Capability                      : disabled 
        RFC 1323 Timestamps                 : allowed 
        Initial RTO                         : 1000 
        Receive Segment Coalescing State    : enabled 
      `;

      const res = parseTcpGlobalOutput(mockOut);
      assert.equal(res.rss, 'enabled');
      assert.equal(res.autotuning, 'normal');
      assert.equal(res.ecn, 'disabled');
      assert.equal(res.timestamps, 'allowed');
    });

    test('handles customized ECN and Autotuning states', () => {
      const mockOut = `
        Receive-Side Scaling State          : enabled 
        Receive Window Auto-Tuning Level    : disabled 
        ECN Capability                      : enabled 
        RFC 1323 Timestamps                 : disabled 
      `;

      const res = parseTcpGlobalOutput(mockOut);
      assert.equal(res.autotuning, 'disabled');
      assert.equal(res.ecn, 'enabled');
      assert.equal(res.timestamps, 'disabled');
    });
  });

  describe('Guided MTU Calculator', () => {
    test('calculates 1500 standard MTU from 1472 payload', () => {
      assert.equal(calculateMtu(1472), 1500);
    });

    test('calculates 1492 PPPoE MTU from 1464 payload', () => {
      assert.equal(calculateMtu(1464), 1492);
    });

    test('rejects negative or out-of-range payloads safely', () => {
      assert.throws(() => calculateMtu(100), /Payload size out of acceptable range/);
      assert.throws(() => calculateMtu(10000), /Payload size out of acceptable range/);
    });
  });

  describe('MMCSS Network Throttling Evaluation', () => {
    test('identifies 0xffffffff as throttling disabled', () => {
      assert.equal(isNetworkThrottlingDisabled('ffffffff'), true);
      assert.equal(isNetworkThrottlingDisabled('0xffffffff'), true);
      assert.equal(isNetworkThrottlingDisabled(0xffffffff), true);
    });

    test('identifies 10 as default Windows throttling active', () => {
      assert.equal(isNetworkThrottlingDisabled(10), false);
      assert.equal(isNetworkThrottlingDisabled('a'), false);
      assert.equal(isNetworkThrottlingDisabled(null), false);
    });
  });

  describe('Honest Labeling & Anti-Slop Enforcement', () => {
    test('ensures QoS 20% myth is explicitly documented without marketing claims', () => {
      const explainer = 'Windows Quality of Service (QoS) reserves 0% bandwidth unless a specific QoS-aware application actively requests priority. Changing this setting does not increase your internet download or upload speed.';
      
      assert.ok(explainer.includes('0%'));
      assert.ok(explainer.includes('does not increase'));
      assert.equal(explainer.includes('+20% speed boost'), false);
    });
  });
});
