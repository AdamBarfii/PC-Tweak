import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Strict hostname, IPv4, or IPv6 validation regex
const HOST_REGEX = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:\d{1,3}\.){3}\d{1,3}$|^[a-fA-F0-9:]+$/;

/**
 * Validates a target host against command injection and disallowed shell metacharacters.
 */
export function isValidTargetHost(host: string): boolean {
  if (!host || typeof host !== 'string' || host.length > 253) return false;
  // Disallow any shell metacharacters, spaces, path traversal, or command delimiters
  if (/[\s&|;<>`$'"\\!%*?^/{}[\]]/.test(host)) return false;
  return HOST_REGEX.test(host.trim());
}

export interface GameServerDefinition {
  id: string;
  game: string;
  gameId: string;
  region: string;
  regionId: string;
  location: string;
  host: string;
  port: number;
  provider: string;
  recommendedMtu: number;
}

export interface GameServerBenchmarkResult {
  id: string;
  game: string;
  gameId: string;
  region: string;
  regionId: string;
  location: string;
  host: string;
  rtt: number | null;
  jitter: number;
  packetLossPercent: number;
  isBestRoute?: boolean;
  status: 'optimal' | 'good' | 'fair' | 'poor' | 'offline';
  timestamp: number;
}

export interface NetworkTestTarget {
  id: string;
  name: string;
  host: string;
  port?: number;
  isGateway?: boolean;
  isDns?: boolean;
  isPublic?: boolean;
}

export interface NetworkSample {
  timestamp: number;
  targetId: string;
  targetHost: string;
  rtt: number | null;
  isTimeout: boolean;
  usedTcpFallback: boolean;
  jitter: number;
}

export interface NetworkTestSummary {
  targetId: string;
  targetHost: string;
  durationSeconds: number;
  totalSamples: number;
  successfulSamples: number;
  packetLossPercent: number;
  minRtt: number;
  avgRtt: number;
  p99Rtt: number;
  maxRtt: number;
  jitter: number;
  samples: NetworkSample[];
}

export interface BaselineReport {
  targetHost: string;
  runs: { min: number; avg: number; max: number; jitter: number }[];
  noiseSpread: number;
  baselineAvg: number;
}

export class NetworkTestEngine {
  private static isRunning = false;
  private static stopRequested = false;
  private static activeJitterMap = new Map<string, number>();
  private static lastRttMap = new Map<string, number>();

  /**
   * Performs an ICMP ping probe with TCP connect fallback
   */
  static async probeTarget(target: NetworkTestTarget): Promise<NetworkSample> {
    const timestamp = Date.now();
    let rtt: number | null = null;
    let usedTcpFallback = false;

    // Reject invalid host strings before invoking any processes
    if (!isValidTargetHost(target.host)) {
      return {
        timestamp,
        targetId: target.id,
        targetHost: target.host,
        rtt: null,
        isTimeout: true,
        usedTcpFallback: false,
        jitter: 0,
      };
    }

    // 1. Attempt standard Windows ICMP echo via direct execFile (bypasses cmd.exe shell)
    try {
      const { stdout } = await execFileAsync('ping.exe', ['-n', '1', '-w', '1000', target.host.trim()], {
        windowsHide: true,
      });
      if (stdout.includes('time<1ms')) {
        rtt = 0.5;
      } else {
        const match = stdout.match(/time[<=]([0-9]+)ms/i);
        if (match) {
          rtt = Number(match[1]);
        }
      }
    } catch {
      // Ping exited with code 1 or timed out
    }

    // 2. If ICMP timed out or failed, attempt TCP connect fallback
    if (rtt === null) {
      const tcpPorts = target.port ? [target.port] : [80, 443, 53];
      for (const port of tcpPorts) {
        try {
          const tcpRtt = await this.probeTcpConnect(target.host, port, 1200);
          if (tcpRtt !== null) {
            rtt = tcpRtt;
            usedTcpFallback = true;
            break;
          }
        } catch {}
      }
    }

    const isTimeout = rtt === null;

    // 3. RFC 3550 Interarrival Jitter Calculation
    // J_i = J_{i-1} + (|D(i-1, i)| - J_{i-1}) / 16
    let currentJitter = this.activeJitterMap.get(target.id) || 0;
    if (rtt !== null) {
      const lastRtt = this.lastRttMap.get(target.id);
      if (lastRtt !== undefined) {
        const d = Math.abs(rtt - lastRtt);
        currentJitter = currentJitter + (d - currentJitter) / 16;
        this.activeJitterMap.set(target.id, currentJitter);
      }
      this.lastRttMap.set(target.id, rtt);
    }

    return {
      timestamp,
      targetId: target.id,
      targetHost: target.host,
      rtt,
      isTimeout,
      usedTcpFallback,
      jitter: Number(currentJitter.toFixed(2)),
    };
  }

  /**
   * Measures TCP three-way handshake time in milliseconds
   */
  private static probeTcpConnect(host: string, port: number, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const start = performance.now();
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.connect(port, host, () => {
        if (!resolved) {
          resolved = true;
          const latency = performance.now() - start;
          socket.destroy();
          resolve(Number(latency.toFixed(2)));
        }
      });

      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(null);
        }
      });

      socket.on('error', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(null);
        }
      });
    });
  }

  /**
   * Executes a continuous test stream over durationSeconds, emitting samples as they arrive
   */
  static async startTest(
    targets: NetworkTestTarget[],
    durationSeconds: number,
    onSample: (sample: NetworkSample) => void
  ): Promise<NetworkTestSummary[]> {
    if (this.isRunning) {
      throw new Error('A network test is already in progress.');
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.activeJitterMap.clear();
    this.lastRttMap.clear();

    const collectedSamples = new Map<string, NetworkSample[]>();
    for (const t of targets) {
      collectedSamples.set(t.id, []);
    }

    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;

    try {
      while (Date.now() < endTime && !this.stopRequested) {
        for (const target of targets) {
          if (this.stopRequested) break;
          const sample = await this.probeTarget(target);
          collectedSamples.get(target.id)?.push(sample);
          onSample(sample);
        }

        // Delay between probe batches to avoid flooding the link
        if (!this.stopRequested) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } finally {
      this.isRunning = false;
      this.stopRequested = false;
    }

    // Compile statistical summary per target
    const summaries: NetworkTestSummary[] = [];

    for (const target of targets) {
      const samples = collectedSamples.get(target.id) || [];
      const successful = samples.filter((s) => s.rtt !== null && !s.isTimeout);
      const rtts = successful.map((s) => s.rtt!).sort((a, b) => a - b);

      const totalCount = samples.length;
      const successCount = successful.length;
      const packetLossPercent = totalCount > 0 ? Number((((totalCount - successCount) / totalCount) * 100).toFixed(1)) : 0;

      let minRtt = 0;
      let maxRtt = 0;
      let avgRtt = 0;
      let p99Rtt = 0;

      if (rtts.length > 0) {
        minRtt = Number(rtts[0].toFixed(1));
        maxRtt = Number(rtts[rtts.length - 1].toFixed(1));
        const sum = rtts.reduce((acc, val) => acc + val, 0);
        avgRtt = Number((sum / rtts.length).toFixed(1));

        const p99Index = Math.min(Math.floor(rtts.length * 0.99), rtts.length - 1);
        p99Rtt = Number(rtts[p99Index].toFixed(1));
      }

      const finalJitter = this.activeJitterMap.get(target.id) || 0;

      summaries.push({
        targetId: target.id,
        targetHost: target.host,
        durationSeconds,
        totalSamples: totalCount,
        successfulSamples: successCount,
        packetLossPercent,
        minRtt,
        avgRtt,
        p99Rtt,
        maxRtt,
        jitter: Number(finalJitter.toFixed(2)),
        samples,
      });
    }

    return summaries;
  }

  static stopTest(): void {
    if (this.isRunning) {
      this.stopRequested = true;
    }
  }

  static isTestRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Runs 3 consecutive baseline test cycles (5s each) and computes noise spread
   */
  static async runBaseline(target: NetworkTestTarget): Promise<BaselineReport> {
    const runs: { min: number; avg: number; max: number; jitter: number }[] = [];

    for (let i = 0; i < 3; i++) {
      const summaries = await this.startTest([target], 5, () => {});
      const summary = summaries[0];
      runs.push({
        min: summary.minRtt,
        avg: summary.avgRtt,
        max: summary.maxRtt,
        jitter: summary.jitter,
      });
      // Short rest between baseline runs
      await new Promise((r) => setTimeout(r, 500));
    }

    const avgs = runs.map((r) => r.avg);
    const minAvg = Math.min(...avgs);
    const maxAvg = Math.max(...avgs);
    const noiseSpread = Number((maxAvg - minAvg).toFixed(2));
    const baselineAvg = Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2));

    return {
      targetHost: target.host,
      runs,
      noiseSpread,
      baselineAvg,
    };
  }

  /**
   * Compares a post-tweak measurement against the baseline noise spread
   * Only confirms improvement if delta exceeds 2x noise spread
   */
  static compareDelta(
    postTweakSummary: NetworkTestSummary,
    baseline: BaselineReport
  ): { improved: boolean; deltaMs: number; spreadMs: number; message: string } {
    const deltaMs = Number((baseline.baselineAvg - postTweakSummary.avgRtt).toFixed(2));
    const spreadMs = baseline.noiseSpread;
    const threshold = 2 * spreadMs;

    if (deltaMs > threshold && deltaMs > 0.5) {
      return {
        improved: true,
        deltaMs,
        spreadMs,
        message: `Latency improved by ${deltaMs}ms (exceeds 2x baseline noise spread of ${spreadMs}ms).`,
      };
    }

    return {
      improved: false,
      deltaMs,
      spreadMs,
      message: `No measurable change: delta of ${deltaMs}ms is within baseline noise spread (${spreadMs}ms).`,
    };
  }

  /**
   * Resolves the path to data/game_servers.json across development and packaged builds
   */
  private static getGameServersPath(): string {
    const candidates = [
      path.join(__dirname, '../../data/game_servers.json'),
      path.join(__dirname, '../data/game_servers.json'),
      path.join(process.cwd(), 'data/game_servers.json'),
      path.join(process.resourcesPath || '', 'data/game_servers.json'),
      path.join(process.resourcesPath || '', 'resources/data/game_servers.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return path.join(process.cwd(), 'data/game_servers.json');
  }

  /**
   * Retrieves the catalog of verified competitive game server endpoints
   */
  static getGameServers(): GameServerDefinition[] {
    try {
      const filePath = this.getGameServersPath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load game_servers.json:', err);
    }
    return [];
  }

  /**
   * Benchmarks game servers using the Hybrid ICMP + TCP SYN fallback engine
   */
  static async benchmarkGameServers(
    gameIdFilter?: string,
    onProgress?: (result: GameServerBenchmarkResult) => void
  ): Promise<GameServerBenchmarkResult[]> {
    const allServers = this.getGameServers();
    const targets = gameIdFilter && gameIdFilter !== 'all'
      ? allServers.filter((s) => s.gameId === gameIdFilter)
      : allServers;

    const results: GameServerBenchmarkResult[] = [];

    for (const server of targets) {
      const target: NetworkTestTarget = {
        id: server.id,
        name: `${server.game} (${server.location})`,
        host: server.host,
        port: server.port,
        isPublic: true,
      };

      // Probe target with dual-sample burst for immediate jitter estimation
      const sample1 = await this.probeTarget(target);
      await new Promise((r) => setTimeout(r, 40));
      const sample2 = await this.probeTarget(target);

      const rtt = sample2.rtt !== null ? sample2.rtt : sample1.rtt;
      const jitter = sample2.jitter || sample1.jitter || 0;
      const isLoss = sample1.isTimeout && sample2.isTimeout;
      const lossPercent = isLoss ? 100 : sample1.isTimeout || sample2.isTimeout ? 50 : 0;

      let status: 'optimal' | 'good' | 'fair' | 'poor' | 'offline' = 'offline';
      if (rtt !== null) {
        if (rtt < 50) status = 'optimal';
        else if (rtt < 80) status = 'good';
        else if (rtt < 120) status = 'fair';
        else status = 'poor';
      }

      const benchmarkResult: GameServerBenchmarkResult = {
        id: server.id,
        game: server.game,
        gameId: server.gameId,
        region: server.region,
        regionId: server.regionId,
        location: server.location,
        host: server.host,
        rtt: rtt !== null ? Number(rtt.toFixed(1)) : null,
        jitter: Number(jitter.toFixed(1)),
        packetLossPercent: lossPercent,
        status,
        timestamp: Date.now(),
      };

      results.push(benchmarkResult);
      onProgress?.(benchmarkResult);
    }

    // Determine Best Route per game (lowest non-null RTT)
    const gameGroups = new Map<string, GameServerBenchmarkResult[]>();
    for (const res of results) {
      if (!gameGroups.has(res.gameId)) gameGroups.set(res.gameId, []);
      gameGroups.get(res.gameId)!.push(res);
    }

    for (const group of gameGroups.values()) {
      const valid = group.filter((r) => r.rtt !== null);
      if (valid.length > 0) {
        valid.sort((a, b) => (a.rtt ?? 9999) - (b.rtt ?? 9999));
        valid[0].isBestRoute = true;
      }
    }

    return results;
  }

  /**
   * Runs a 10s live stability monitor on a single game server node
   */
  static async monitorGameServer(
    serverId: string,
    durationSeconds: number = 10,
    onSample?: (sample: NetworkSample) => void
  ): Promise<NetworkTestSummary> {
    const servers = this.getGameServers();
    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      throw new Error(`Game server with id "${serverId}" not found.`);
    }

    const target: NetworkTestTarget = {
      id: server.id,
      name: `${server.game} - ${server.location}`,
      host: server.host,
      port: server.port,
      isPublic: true,
    };

    const summaries = await this.startTest([target], durationSeconds, onSample || (() => {}));
    return summaries[0];
  }
}
