import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface BaselineRun {
  runIndex: number;
  pollingHz: number;
  jitterP99Ms: number;
  jitterMedianMs: number;
  timerResMs: number;
  timestamp: string;
}

export interface BaselineSession {
  sessionId: string;
  timestamp: string;
  runs: BaselineRun[];
  jitterSpreadMs: number; // max - min
  avgJitterMs: number;
  avgPollingHz: number;
  timerResMs: number;
}

export interface PostTweakBenchmark {
  id: string;
  timestamp: string;
  tweakName: string;
  baselineId: string;
  postRun: {
    pollingHz: number;
    jitterP99Ms: number;
    timerResMs: number;
  };
  noiseSpreadMs: number;
  deltaJitterMs: number;
  improved: boolean;
  improvementPercent: number;
  status: 'improved' | 'no_measurable_change';
  reverted: boolean;
}

export interface BenchmarkData {
  latestBaseline: BaselineSession | null;
  baselineHistory: BaselineSession[];
  postTweakBenchmarks: PostTweakBenchmark[];
}

export class BenchmarkStore {
  private static filePath: string;

  private static getStoragePath(): string {
    if (!this.filePath) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'benchmarks.json');
    }
    return this.filePath;
  }

  private static readData(): BenchmarkData {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) {
        return { latestBaseline: null, baselineHistory: [], postTweakBenchmarks: [] };
      }
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { latestBaseline: null, baselineHistory: [], postTweakBenchmarks: [] };
    }
  }

  private static writeData(data: BenchmarkData): void {
    const p = this.getStoragePath();
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  }

  static getLatestBaseline(): BaselineSession | null {
    return this.readData().latestBaseline;
  }

  static saveBaseline(session: BaselineSession): void {
    const data = this.readData();
    data.latestBaseline = session;
    data.baselineHistory.unshift(session);
    if (data.baselineHistory.length > 20) {
      data.baselineHistory = data.baselineHistory.slice(0, 20);
    }
    this.writeData(data);
  }

  static savePostTweak(result: PostTweakBenchmark): void {
    const data = this.readData();
    data.postTweakBenchmarks.unshift(result);
    if (data.postTweakBenchmarks.length > 50) {
      data.postTweakBenchmarks = data.postTweakBenchmarks.slice(0, 50);
    }
    this.writeData(data);
  }

  static getLatestPostTweak(): PostTweakBenchmark | null {
    const list = this.readData().postTweakBenchmarks;
    return list.length > 0 ? list[0] : null;
  }
}
