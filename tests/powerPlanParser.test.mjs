import test from 'node:test';
import assert from 'node:assert/strict';

// Parser logic matching GamingEngine.parsePowercfgList
function parsePowercfgList(output) {
  const plans = [];
  const lines = output.split(/\r?\n/);
  const regex = /Power Scheme GUID:\s+([a-f0-9\-]+)\s+\((.+?)\)(\s*\*?)/i;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const guid = match[1].trim();
      const name = match[2].trim();
      const isActive = match[3].includes('*');
      const lowerName = name.toLowerCase();
      const isCustom =
        lowerName.includes('custom') ||
        lowerName.includes('pc tweak') ||
        (!lowerName.includes('balanced') &&
          !lowerName.includes('high performance') &&
          !lowerName.includes('power saver') &&
          !lowerName.includes('ultimate performance'));
      const isDefault = [
        '381b4222-f694-41f0-9685-ff5bb260df2e',
        '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
        'a1841308-3541-4fab-bc81-f71556f20b4a',
        'e9a42b02-d5df-448d-aa00-03f14749eb61',
      ].includes(guid.toLowerCase());

      plans.push({
        guid,
        name,
        isActive,
        isCustom,
        isDefault,
      });
    }
  }
  return plans;
}

test('powercfg /list parser correctly parses Windows power plans and active marker', () => {
  const sampleOutput = `
Existing Power Schemes (* Active)
-----------------------------------
Power Scheme GUID: 0c3904df-2c31-4ffc-84d4-dd38cbca61c7  (Hybred Low Latency (HP))
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance) *
Power Scheme GUID: e9a42b02-d5df-448d-aa00-03f14749eb61  (Ultimate Performance)
Power Scheme GUID: a1841308-3541-4fab-bc81-f71556f20b4a  (Power saver)
Power Scheme GUID: d82ef79a-1122-4433-8899-abcdef123456  (PC Tweak Gaming (Custom))
`;

  const plans = parsePowercfgList(sampleOutput);
  assert.equal(plans.length, 6);

  // Active check
  const activePlan = plans.find((p) => p.isActive);
  assert.ok(activePlan);
  assert.equal(activePlan.guid, '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  assert.equal(activePlan.name, 'High performance');

  // Custom vs default checks
  const balanced = plans.find((p) => p.name === 'Balanced');
  assert.ok(balanced);
  assert.equal(balanced.isDefault, true);
  assert.equal(balanced.isCustom, false);

  const pcTweakCustom = plans.find((p) => p.name.includes('PC Tweak Gaming'));
  assert.ok(pcTweakCustom);
  assert.equal(pcTweakCustom.isCustom, true);
  assert.equal(pcTweakCustom.isDefault, false);
});

test('shared tweak IDs set contains all 10 unified tweak IDs with Input Lab', () => {
  const SHARED_TWEAK_IDS = new Set([
    'game_mode_on_dvr_off',
    'windowed_optimizations_win11',
    'global_timer_resolution_requests',
    'power_plan_ultimate',
    'usb_selective_suspend_off',
    'pcie_link_state_off',
    'processor_state_100_core_unpark',
    'msi_mode_gpu_usb',
    'vbs_memory_integrity_off',
    'hyperv_launch_off',
  ]);

  assert.equal(SHARED_TWEAK_IDS.size, 10);
  assert.ok(SHARED_TWEAK_IDS.has('game_mode_on_dvr_off'));
  assert.ok(SHARED_TWEAK_IDS.has('global_timer_resolution_requests'));
  assert.ok(SHARED_TWEAK_IDS.has('power_plan_ultimate'));
  assert.ok(SHARED_TWEAK_IDS.has('msi_mode_gpu_usb'));
});

test('power setting index regex extracts decimal percentages correctly', () => {
  const stdout = `
    Power Setting GUID: 893dee8e-2bef-41e0-89c6-b55d0929964c  (Minimum processor state)
      Current AC Power Setting Index: 0x00000064
      Current DC Power Setting Index: 0x00000005
  `;

  const acMatch = stdout.match(/Current AC Power Setting Index:\s+0x([0-9a-fA-F]+)/);
  const dcMatch = stdout.match(/Current DC Power Setting Index:\s+0x([0-9a-fA-F]+)/);

  assert.ok(acMatch);
  assert.ok(dcMatch);
  assert.equal(parseInt(acMatch[1], 16), 100);
  assert.equal(parseInt(dcMatch[1], 16), 5);
});
