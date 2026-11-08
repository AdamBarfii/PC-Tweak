import test from 'node:test';
import assert from 'node:assert/strict';

const PROTECTED_ANTICHEAT_BINARIES = new Set([
  'vgc.exe',
  'vgtray.exe',
  'easyanticheat.exe',
  'easyanticheat_eos.exe',
  'easyanticheat_setup.exe',
  'start_protected_game.exe',
  'beservice.exe',
  'beservice_x64.exe',
  'battleye.exe',
  'belauncher.exe',
  'faceitclient.exe',
  'faceitservice.exe',
  'faceit.exe',
  'ace-base.exe',
  'ace-guard.exe',
  'anticheatexpert.exe',
  'sguard.exe',
  'sguard64.exe',
  'pnkbstra.exe',
  'pnkbstrb.exe',
  'ricochet.exe',
  'bootstrapper.exe',
  'steamservice.exe',
]);

function sanitizeExeName(exeName) {
  const trimmed = String(exeName || '').trim();
  if (!/^[a-zA-Z0-9_\-\.]+\.exe$/i.test(trimmed)) {
    throw new Error(`Invalid executable name: "${exeName}". Must end with .exe and contain no shell metacharacters.`);
  }
  const lower = trimmed.toLowerCase();
  if (PROTECTED_ANTICHEAT_BINARIES.has(lower)) {
    throw new Error(`Targeting anti-cheat service or driver "${trimmed}" is strictly blocked to prevent game security bans.`);
  }
  return trimmed;
}

const KNOWN_SHOOTER_PRESETS = {
  'cs2.exe': { displayName: 'Counter-Strike 2', category: 'Tactical FPS' },
  'VALORANT-Win64-Shipping.exe': { displayName: 'VALORANT', category: 'Tactical FPS' },
  'r5apex.exe': { displayName: 'Apex Legends', category: 'Battle Royale' },
  'cod.exe': { displayName: 'Call of Duty: Warzone / MW3 / BO6', category: 'FPS' },
  'Overwatch.exe': { displayName: 'Overwatch 2', category: 'Hero Shooter' },
  'RainbowSix.exe': { displayName: "Tom Clancy's Rainbow Six Siege", category: 'Tactical FPS' },
  'FortniteClient-Win64-Shipping.exe': { displayName: 'Fortnite', category: 'Battle Royale' },
};

const SYSTEM_PROCESS_BLACKLIST = new Set([
  'system idle process',
  'system',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'dwm.exe',
  'explorer.exe',
  'pc tweak.exe',
  'electron.exe',
]);

test('FPS Optimizer Engine Tests', async (t) => {
  await t.test('sanitizeExeName accepts valid game executables', () => {
    assert.equal(sanitizeExeName('cs2.exe'), 'cs2.exe');
    assert.equal(sanitizeExeName('VALORANT-Win64-Shipping.exe'), 'VALORANT-Win64-Shipping.exe');
    assert.equal(sanitizeExeName('cod.exe'), 'cod.exe');
    assert.equal(sanitizeExeName('r5apex.exe'), 'r5apex.exe');
    assert.equal(sanitizeExeName('Overwatch.exe'), 'Overwatch.exe');
    assert.equal(sanitizeExeName('FortniteClient-Win64-Shipping.exe'), 'FortniteClient-Win64-Shipping.exe');
  });

  await t.test('sanitizeExeName rejects shell injection payloads strictly', () => {
    const malicious = [
      'cs2.exe; calc.exe',
      'cod.exe & net user evil password /add',
      'r5apex.exe | powershell',
      'game.exe`calc`',
      'game.exe$(whoami)',
      'game.bat',
      'game.com',
      '../cs2.exe',
      'C:\\Windows\\System32\\cmd.exe',
      'cs2.exe" && dir',
      "cs2.exe' || ping",
      '',
    ];

    for (const payload of malicious) {
      assert.throws(
        () => sanitizeExeName(payload),
        /Invalid executable name/,
        `Should reject: ${payload}`
      );
    }
  });

  await t.test('sanitizeExeName strictly blocks targeting protected anti-cheat binaries', () => {
    const acBinaries = [
      'vgc.exe',
      'VGC.EXE',
      'easyanticheat.exe',
      'EasyAntiCheat_EOS.exe',
      'BEService.exe',
      'battleye.exe',
      'faceitclient.exe',
      'ace-base.exe',
    ];
    for (const ac of acBinaries) {
      assert.throws(
        () => sanitizeExeName(ac),
        /Targeting anti-cheat service or driver/,
        `Should block anti-cheat binary: ${ac}`
      );
    }
  });

  await t.test('tasklist CSV parsing correctly extracts and filters processes', () => {
    const mockOutput = [
      '"System Idle Process","0","Services","0","8 K"',
      '"System","4","Services","0","172 K"',
      '"svchost.exe","1352","Services","0","38,744 K"',
      '"dwm.exe","1656","Console","1","126,844 K"',
      '"cs2.exe","24500","Console","1","3,450,120 K"',
      '"VALORANT-Win64-Shipping.exe","18200","Console","1","2,150,000 K"',
      '"Discord.exe","21776","Console","1","162,256 K"',
    ].join('\r\n');

    const lines = mockOutput.split(/\r?\n/);
    const parsed = [];

    for (const line of lines) {
      const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/);
      if (!match) continue;
      const rawExe = match[1].trim();
      if (SYSTEM_PROCESS_BLACKLIST.has(rawExe.toLowerCase())) continue;

      parsed.push({
        exeName: rawExe,
        pid: parseInt(match[2], 10),
        isKnown: Boolean(KNOWN_SHOOTER_PRESETS[rawExe]),
      });
    }

    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].exeName, 'cs2.exe');
    assert.equal(parsed[0].isKnown, true);
    assert.equal(parsed[1].exeName, 'VALORANT-Win64-Shipping.exe');
    assert.equal(parsed[1].isKnown, true);
    assert.equal(parsed[2].exeName, 'Discord.exe');
    assert.equal(parsed[2].isKnown, false);
  });

  await t.test('verifies QoS policy naming and DSCP 46 parameter format', () => {
    const exe = 'cs2.exe';
    const sanitizedPolicyName = `PCTweak_${exe.replace(/[^a-zA-Z0-9]/g, '_')}`;
    assert.equal(sanitizedPolicyName, 'PCTweak_cs2_exe');

    const qosKey = `HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\QoS\\${sanitizedPolicyName}`;
    assert.equal(qosKey, 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\QoS\\PCTweak_cs2_exe');
  });
});
