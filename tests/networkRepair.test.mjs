import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Repair tools specification whitelist
const VALID_REPAIR_ACTIONS = [
  'flush_dns',
  'renew_ip',
  'restart_adapter',
  'reset_winsock',
  'reset_tcpip',
  'reset_firewall'
];

function isWhitelistedRepairAction(actionId) {
  return VALID_REPAIR_ACTIONS.includes(actionId);
}

// Generate batch script content
function generateNetworkRecoveryBat() {
  return `@echo off
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
}

// Tool properties inspection helper
function getToolFlags(actionId) {
  switch (actionId) {
    case 'flush_dns':
      return { reboot: false, disconnects: false, admin: false };
    case 'renew_ip':
      return { reboot: false, disconnects: true, admin: true };
    case 'restart_adapter':
      return { reboot: false, disconnects: true, admin: true };
    case 'reset_winsock':
      return { reboot: true, disconnects: false, admin: true };
    case 'reset_tcpip':
      return { reboot: true, disconnects: true, admin: true };
    case 'reset_firewall':
      return { reboot: false, disconnects: false, admin: true };
    default:
      return null;
  }
}

describe('Network Repair & Safety Architecture Tests', () => {
  describe('Repair Command Whitelist Guardrails', () => {
    test('permits all 6 valid repair actions', () => {
      for (const action of VALID_REPAIR_ACTIONS) {
        assert.equal(isWhitelistedRepairAction(action), true);
      }
    });

    test('rejects unauthorized or arbitrary command strings', () => {
      assert.equal(isWhitelistedRepairAction('format C:'), false);
      assert.equal(isWhitelistedRepairAction('rmdir /s /q'), false);
      assert.equal(isWhitelistedRepairAction('custom_script'), false);
      assert.equal(isWhitelistedRepairAction(''), false);
    });
  });

  describe('Safe Mode Recovery Batch Generator', () => {
    test('contains essential recovery commands for complete offline repair', () => {
      const bat = generateNetworkRecoveryBat();

      assert.ok(bat.includes('netsh interface ipv4 set dnsservers name="Ethernet" source=dhcp'));
      assert.ok(bat.includes('netsh int ip reset resetlog.txt'));
      assert.ok(bat.includes('netsh winsock reset'));
      assert.ok(bat.includes('ipconfig /flushdns'));
      assert.ok(bat.includes('netsh advfirewall reset'));
      assert.ok(bat.includes('DODownloadMode'));
    });
  });

  describe('Consequence & Confirmation Flag Guardrails', () => {
    test('accurately identifies reboot-required tools', () => {
      assert.equal(getToolFlags('reset_winsock').reboot, true);
      assert.equal(getToolFlags('reset_tcpip').reboot, true);
      assert.equal(getToolFlags('flush_dns').reboot, false);
      assert.equal(getToolFlags('renew_ip').reboot, false);
    });

    test('accurately identifies disconnect-causing tools', () => {
      assert.equal(getToolFlags('renew_ip').disconnects, true);
      assert.equal(getToolFlags('restart_adapter').disconnects, true);
      assert.equal(getToolFlags('reset_tcpip').disconnects, true);
      assert.equal(getToolFlags('flush_dns').disconnects, false);
    });
  });
});
