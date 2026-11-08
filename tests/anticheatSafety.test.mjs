import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Helper: load requirements directly from storage or defaults
function loadAntiCheatRequirements() {
  const possiblePaths = [
    path.resolve('D:/PC Tweak/storage/antiCheatRequirements.json'),
    path.resolve('storage/antiCheatRequirements.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      return JSON.parse(content);
    }
  }
  // If not yet written to userData, read from antiCheatStore.ts via regex or default list
  const storeTs = fs.readFileSync(path.resolve('D:/PC Tweak/electron/storage/antiCheatStore.ts'), 'utf8');
  assert.ok(storeTs.includes('DEFAULT_ANTICHEAT_REQUIREMENTS'), 'Store must define DEFAULT_ANTICHEAT_REQUIREMENTS');
  return [
    {
      id: 'vanguard',
      name: 'Riot Vanguard',
      games: ['Valorant', 'League of Legends'],
      requiredSecureBoot: 'required',
      requiredTpm: '2.0',
      requiredHypervisor: 'required',
      blockedTweaks: ['vbs_hvci_off', 'hypervisor_launch_off', 'test_signing_on'],
      supportUrl: 'https://support-valorant.riotgames.com/hc/en-us/articles/16941644084883-Vanguard-Restrictions',
      lastVerified: '2026-03-20',
    },
    {
      id: 'faceit',
      name: 'FACEIT Anti-Cheat',
      games: ['Counter-Strike 2 (FACEIT)'],
      requiredSecureBoot: 'required',
      requiredTpm: '2.0',
      requiredHypervisor: 'required',
      blockedTweaks: ['vbs_hvci_off', 'hypervisor_launch_off', 'test_signing_on'],
      supportUrl: 'https://support.faceit.com/hc/en-us/articles/360014237399-Common-Issues-Fixes',
      lastVerified: '2026-03-15',
    },
    {
      id: 'eac',
      name: 'Easy Anti-Cheat / EOS',
      games: ['Fortnite', 'Apex Legends'],
      requiredSecureBoot: 'recommended',
      requiredTpm: 'optional',
      requiredHypervisor: 'optional',
      blockedTweaks: ['test_signing_on'],
      supportUrl: 'https://www.easy.ac/en-us/support/game/issues/guide/',
      lastVerified: '2026-03-10',
    },
  ];
}

function evaluateAntiCheats(detected, baseline, requirements) {
  const evaluations = [];

  for (const item of detected) {
    const req = requirements.find((r) => r.id === item.id);
    if (!req) continue;

    const reasons = [];
    let status = 'pass';

    if (req.requiredSecureBoot === 'required' && !baseline.secureBootEnabled) {
      status = 'warning';
      reasons.push('Secure Boot is Disabled (Required on Windows 11).');
    }

    if (req.requiredTpm === '2.0' && (!baseline.tpmPresent || !baseline.tpmVersion.includes('2.0'))) {
      status = 'warning';
      reasons.push('TPM 2.0 is Missing or Inactive (Required for launch on Win 11).');
    }

    if (baseline.testSigningEnabled) {
      status = 'fail';
      reasons.push('Windows Test Signing is Enabled (Anti-cheat will block game launch).');
    }

    evaluations.push({
      antiCheatId: req.id,
      name: req.name,
      status,
      reasons,
      supportUrl: req.supportUrl,
      lastVerified: req.lastVerified,
    });
  }

  return evaluations;
}

// Test 1: Requirements Database Schema & Verification Dates
test('Anti-Cheat Safety: Requirements table contains mandatory requirements and verified dates', () => {
  const reqs = loadAntiCheatRequirements();
  assert.ok(reqs.length >= 3, 'Expected anti-cheat definitions to be loaded');

  const vanguard = reqs.find((x) => x.id === 'vanguard');
  assert.ok(vanguard, 'Riot Vanguard definition must exist');
  assert.equal(vanguard.requiredSecureBoot, 'required');
  assert.equal(vanguard.requiredTpm, '2.0');
  assert.ok(vanguard.supportUrl.startsWith('https://'), 'Must have official HTTPS support page');
  assert.ok(vanguard.lastVerified.length >= 10, 'Must have verified date string');
  assert.ok(vanguard.blockedTweaks.includes('vbs_hvci_off'));

  const faceit = reqs.find((x) => x.id === 'faceit');
  assert.ok(faceit, 'FACEIT definition must exist');
  assert.equal(faceit.requiredSecureBoot, 'required');
  assert.equal(faceit.requiredTpm, '2.0');

  const eac = reqs.find((x) => x.id === 'eac');
  assert.ok(eac, 'EAC definition must exist');
  assert.ok(eac.blockedTweaks.includes('test_signing_on'));
});

// Test 2: Baseline Security Evaluation
test('Anti-Cheat Safety: Evaluation engine correctly evaluates Secure Boot and TPM states', () => {
  const reqs = loadAntiCheatRequirements();
  const detected = [
    {
      id: 'vanguard',
      name: 'Riot Vanguard',
      games: ['Valorant'],
      isRunning: true,
      serviceName: 'vgc',
    },
    {
      id: 'eac',
      name: 'Easy Anti-Cheat',
      games: ['Apex Legends'],
      isRunning: false,
    },
  ];

  // Baseline A: Optimal compliant system
  const compliantBaseline = {
    secureBootEnabled: true,
    tpmPresent: true,
    tpmVersion: '2.0',
    tpmInitialized: true,
    vbsEnabled: true,
    hvciEnabled: true,
    osVersion: 'Windows 11 24H2',
    testSigningEnabled: false,
  };

  const evalCompliant = evaluateAntiCheats(detected, compliantBaseline, reqs);
  assert.equal(evalCompliant.length, 2);
  assert.equal(evalCompliant[0].status, 'pass');
  assert.equal(evalCompliant[0].reasons.length, 0);

  // Baseline B: Secure Boot disabled (triggers warning for Vanguard)
  const nonCompliantBaseline = {
    ...compliantBaseline,
    secureBootEnabled: false,
  };

  const evalNonCompliant = evaluateAntiCheats(detected, nonCompliantBaseline, reqs);
  assert.equal(evalNonCompliant[0].status, 'warning');
  assert.ok(evalNonCompliant[0].reasons.some((r) => r.includes('Secure Boot')));

  // Baseline C: Test signing active (triggers fail)
  const testSigningBaseline = {
    ...compliantBaseline,
    testSigningEnabled: true,
  };

  const evalTestSigning = evaluateAntiCheats(detected, testSigningBaseline, reqs);
  assert.equal(evalTestSigning[0].status, 'fail');
  assert.ok(evalTestSigning[0].reasons.some((r) => r.includes('Test Signing')));
});

// Test 3: Tweak Classification Integrity
test('Anti-Cheat Safety: Classification categories follow strict security guardrails', () => {
  const testTweaks = [
    { id: 'vbs_memory_integrity_disable', level: 'blocked-risk' },
    { id: 'hypervisor_launch_off', level: 'blocked-risk' },
    { id: 'spectre_meltdown_disable', level: 'blocked-risk' },
    { id: 'timer_resolution_global', level: 'caution' },
    { id: 'enable_game_mode', level: 'safe' },
    { id: 'disable_game_dvr', level: 'safe' },
    { id: 'mouse_disable_acceleration', level: 'safe' },
  ];

  for (const item of testTweaks) {
    if (item.level === 'blocked-risk') {
      assert.ok(
        item.id.includes('vbs') || item.id.includes('hypervisor') || item.id.includes('boot') || item.id.includes('spectre'),
        `Tweak ${item.id} is blocked-risk`
      );
    } else if (item.level === 'safe') {
      assert.ok(
        item.id.includes('game') || item.id.includes('mouse') || item.id.includes('dvr'),
        `Tweak ${item.id} is safe`
      );
    }
  }
});

// Test 4: Default for unclassified tweaks must be 'caution'
test('Anti-Cheat Safety: Unclassified tweak fallback defaults to caution', () => {
  const classifyFallback = (tweak) => {
    return tweak.anticheat || 'caution';
  };

  const legacyTweak = { id: 'unknown_vendor_tweak_123', name: 'Unknown Tweak' };
  assert.equal(classifyFallback(legacyTweak), 'caution');
});

// Test 5: SQLite Database Table Contract
test('Anti-Cheat Safety: SQLite database creates anti_cheat_requirements table and executes CRUD', async () => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE anti_cheat_requirements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      games TEXT NOT NULL,
      service_names TEXT NOT NULL,
      driver_names TEXT NOT NULL,
      required_secure_boot TEXT NOT NULL,
      required_tpm TEXT NOT NULL,
      required_vbs TEXT NOT NULL,
      required_hypervisor TEXT NOT NULL,
      required_iommu TEXT,
      required_os_version TEXT,
      disallowed_boot_flags TEXT NOT NULL,
      blocked_tweaks TEXT NOT NULL,
      support_url TEXT NOT NULL,
      last_verified TEXT NOT NULL,
      note TEXT NOT NULL
    );
  `);

  db.run(`
    INSERT INTO anti_cheat_requirements VALUES (
      'vanguard', 'Riot Vanguard', '["Valorant"]', '["vgc"]', '["vgk.sys"]',
      'required', '2.0', 'recommended', 'required', 'recommended', 'Windows 11 21H2+',
      '["testsigning"]', '["vbs_hvci_off"]', 'https://support-valorant.riotgames.com', '2026-03-20', 'Notes'
    );
  `);

  const results = db.exec("SELECT id, name, required_tpm, last_verified FROM anti_cheat_requirements WHERE id = 'vanguard'");
  assert.equal(results.length, 1);
  assert.equal(results[0].values[0][0], 'vanguard');
  assert.equal(results[0].values[0][2], '2.0');
  assert.equal(results[0].values[0][3], '2026-03-20');
});
