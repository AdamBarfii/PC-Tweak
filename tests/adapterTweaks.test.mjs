import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper: check PnPCapabilities power down status
function isPowerSavingDisabled(pnpVal) {
  if (pnpVal === undefined || pnpVal === null) return false;
  const num = typeof pnpVal === 'string' ? parseInt(pnpVal, 16) : pnpVal;
  return (num & 0x10) === 0x10 || num === 24 || num === 0x100;
}

// Helper: parse Speed & Duplex options from CIM strings
function parseSpeedDuplexOptions(validDisplaysStr, validRegsStr) {
  if (!validDisplaysStr || !validRegsStr) {
    return [
      { label: 'Auto Negotiation', value: '0' },
      { label: '1.0 Gbps Full Duplex', value: '6' },
      { label: '100 Mbps Full Duplex', value: '4' }
    ];
  }
  const displays = validDisplaysStr.split('|');
  const regs = validRegsStr.split('|');
  const result = [];
  for (let i = 0; i < displays.length; i++) {
    result.push({
      label: displays[i],
      value: regs[i] || String(i)
    });
  }
  return result;
}

// Helper: parse netsh wlan show interfaces
function parseWifiTelemetry(output) {
  if (!output || output.includes('There is no wireless interface') || output.includes('not running')) {
    return { hasWifi: false, warnings: [] };
  }

  const getVal = (pattern) => {
    const m = output.match(pattern);
    return m ? m[1].trim() : undefined;
  };

  const ssid = getVal(/SSID\s*:\s*(.+)/i);
  const channelStr = getVal(/Channel\s*:\s*(\d+)/i);
  const channel = channelStr ? parseInt(channelStr, 10) : undefined;
  const signalStr = getVal(/Signal\s*:\s*(\d+)%/i);
  const signalPercentage = signalStr ? parseInt(signalStr, 10) : undefined;

  const warnings = [];
  let band = 'Unknown';
  if (channel) {
    if (channel <= 14) {
      band = '2.4 GHz';
      warnings.push('2.4 GHz band detected. 5 GHz/6 GHz recommended.');
    } else if (channel >= 36 && channel <= 177) {
      band = '5 GHz';
    } else if (channel >= 180) {
      band = '6 GHz';
    }
  }

  if (signalPercentage !== undefined && signalPercentage < 50) {
    warnings.push(`Weak signal (${signalPercentage}%).`);
  }

  // Security check: verify no password fields exist
  assert.equal(output.includes('Key Content'), false, 'Wi-Fi security violation: never parse passwords!');

  return {
    hasWifi: true,
    ssid,
    channel,
    band,
    signalPercentage,
    warnings
  };
}

describe('Adapter Tweaks & Wi-Fi Inspector Tests', () => {
  describe('Power Saving & PnPCapabilities Check', () => {
    test('correctly identifies disabled power down on 24 (0x18)', () => {
      assert.equal(isPowerSavingDisabled(24), true);
      assert.equal(isPowerSavingDisabled('18'), true);
    });

    test('correctly identifies disabled power down on 0x100', () => {
      assert.equal(isPowerSavingDisabled(256), true);
      assert.equal(isPowerSavingDisabled('100'), true);
    });

    test('treats 0, null, or undefined as power saving enabled (default)', () => {
      assert.equal(isPowerSavingDisabled(0), false);
      assert.equal(isPowerSavingDisabled(null), false);
      assert.equal(isPowerSavingDisabled(undefined), false);
    });
  });

  describe('Speed & Duplex Option Parser', () => {
    test('parses real driver pipe-delimited display and registry values', () => {
      const displays = 'Auto Negotiation|10 Mbps Half Duplex|10 Mbps Full Duplex|1.0 Gbps Full Duplex';
      const regs = '0|1|2|6';
      const opts = parseSpeedDuplexOptions(displays, regs);

      assert.equal(opts.length, 4);
      assert.equal(opts[0].label, 'Auto Negotiation');
      assert.equal(opts[0].value, '0');
      assert.equal(opts[3].label, '1.0 Gbps Full Duplex');
      assert.equal(opts[3].value, '6');
    });

    test('falls back safely to standard options when driver omits lists', () => {
      const opts = parseSpeedDuplexOptions('', '');
      assert.equal(opts.length, 3);
      assert.equal(opts[0].label, 'Auto Negotiation');
    });
  });

  describe('Driver Property Support Guardrails', () => {
    test('marks unexposed properties as not supported without throwing', () => {
      const advProps = {
        '*speedduplex': { value: '0', display: 'Auto Negotiation' },
        '*flowcontrol': { value: '3', display: 'Rx & Tx Enabled' }
      };

      const hasEee = Boolean(advProps['*eee']);
      const hasGreen = Boolean(advProps['*greenethernet']);

      assert.equal(hasEee, false);
      assert.equal(hasGreen, false);
    });

    test('correctly detects exposed EEE and Green Ethernet when present', () => {
      const advProps = {
        '*eee': { value: '0', display: 'Disabled' },
        '*greenethernet': { value: '0', display: 'Disabled' }
      };

      const hasEee = Boolean(advProps['*eee']);
      const eeeDisabled = advProps['*eee'].value === '0';

      assert.equal(hasEee, true);
      assert.equal(eeeDisabled, true);
    });
  });

  describe('Wi-Fi Telemetry & Security Protection', () => {
    test('handles absence of wireless hardware gracefully', () => {
      const res = parseWifiTelemetry('The Wireless AutoConfig Service (wlansvc) is not running.');
      assert.equal(res.hasWifi, false);
      assert.equal(res.warnings.length, 0);
    });

    test('detects 2.4 GHz band and triggers jitter warning', () => {
      const mockOut = `
        Name                   : Wi-Fi
        Description            : Intel(R) Wi-Fi 6 AX200 160MHz
        State                  : connected
        SSID                   : HomeNetwork
        Radio type             : 802.11ax
        Channel                : 6
        Receive rate (Mbps)    : 144
        Transmit rate (Mbps)   : 144
        Signal                 : 85%
      `;
      const res = parseWifiTelemetry(mockOut);
      assert.equal(res.hasWifi, true);
      assert.equal(res.ssid, 'HomeNetwork');
      assert.equal(res.band, '2.4 GHz');
      assert.equal(res.signalPercentage, 85);
      assert.ok(res.warnings.some(w => w.includes('2.4 GHz')));
    });

    test('identifies 5 GHz band and flags low signal warning when < 50%', () => {
      const mockOut = `
        Name                   : Wi-Fi
        Description            : Intel(R) Wi-Fi 6 AX200 160MHz
        State                  : connected
        SSID                   : Fast5G
        Radio type             : 802.11ax
        Channel                : 44
        Receive rate (Mbps)    : 300
        Transmit rate (Mbps)   : 300
        Signal                 : 35%
      `;
      const res = parseWifiTelemetry(mockOut);
      assert.equal(res.hasWifi, true);
      assert.equal(res.band, '5 GHz');
      assert.equal(res.signalPercentage, 35);
      assert.ok(res.warnings.some(w => w.includes('Weak signal')));
    });
  });
});
