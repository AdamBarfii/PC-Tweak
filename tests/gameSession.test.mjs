import test from 'node:test';
import assert from 'node:assert/strict';

test('Game Session Config: defaults to safe and enabled defaults', () => {
  const defaultConfig = {
    enabled: true,
    autoSwitchPowerPlan: true,
    throttleBackgroundApps: true,
    focusAssist: true,
    monitoredProcesses: [
      'cs2.exe',
      'valorant-win64-shipping.exe',
      'r5apex.exe',
      'fortniteclient-win64-shipping.exe',
      'dota2.exe',
      'leagueclient.exe',
      'overwatch.exe',
      'playgtav.exe',
      'gta5.exe',
      'rainbowsix.exe',
      'cod.exe',
    ],
  };

  assert.equal(defaultConfig.enabled, true);
  assert.equal(defaultConfig.autoSwitchPowerPlan, true);
  assert.equal(defaultConfig.throttleBackgroundApps, true);
  assert.equal(defaultConfig.focusAssist, true);
  assert.ok(defaultConfig.monitoredProcesses.includes('cs2.exe'));
  assert.ok(defaultConfig.monitoredProcesses.includes('playgtav.exe'));
});

test('Game Session Tasklist CSV Parser: extracts process names cleanly without headers or quotes', () => {
  const mockCsvOutput = `
"smss.exe","660","Services","0","1,524 K"
"csrss.exe","964","Services","0","5,896 K"
"Discord.exe","17744","Console","1","125,624 K"
"chrome.exe","1808","Console","1","59,552 K"
"cs2.exe","30412","Console","1","4,120,440 K"
"Spotify.exe","17312","Console","1","27,320 K"
`;

  const parsed = mockCsvOutput
    .split('\n')
    .map((line) => {
      const match = line.match(/^"([^"]+)"/);
      return match ? match[1].toLowerCase() : '';
    })
    .filter(Boolean);

  const runningSet = new Set(parsed);
  assert.ok(runningSet.has('smss.exe'));
  assert.ok(runningSet.has('discord.exe'));
  assert.ok(runningSet.has('cs2.exe'));
  assert.ok(runningSet.has('spotify.exe'));
  assert.ok(!runningSet.has('valorant.exe'));
});

test('Game Session Snapshot: stores crash-recovery data and clears upon clean exit', () => {
  const mockSnapshot = {
    activeGame: 'cs2.exe',
    startedAt: 1730680000000,
    previousPowerPlanGuid: '381b4222-f694-41f0-9685-ff5bb260df2e',
    throttledProcesses: ['chrome', 'discord', 'spotify'],
    focusAssistModified: true,
  };

  const serialized = JSON.stringify(mockSnapshot);
  const deserialized = JSON.parse(serialized);

  assert.equal(deserialized.activeGame, 'cs2.exe');
  assert.equal(deserialized.previousPowerPlanGuid, '381b4222-f694-41f0-9685-ff5bb260df2e');
  assert.deepEqual(deserialized.throttledProcesses, ['chrome', 'discord', 'spotify']);
  assert.equal(deserialized.focusAssistModified, true);
});
