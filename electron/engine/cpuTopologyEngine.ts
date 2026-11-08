/**
 * PC Tweak - CPU Topology & Core Affinity Engine
 *
 * Automatically detects processor architecture:
 * - Intel 12th-14th Gen / Arrow Lake Hybrid (P-cores vs E-cores)
 * - AMD Ryzen 3D V-Cache Dual-CCD (CCD0 3D Cache vs CCD1 Frequency)
 * - Uniform Multi-Core CPUs (Ryzen 7800X3D/5800X3D, older Intel/AMD)
 *
 * Generates optimal bitmasks for Image File Execution Options (IFEO)
 * to eliminate 1% low frame drops and thread-bouncing micro-stutter in FPS games.
 */

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CpuTopologyInfo {
  cpuName: string;
  physicalCores: number;
  logicalProcessors: number;
  architecture: 'intel-hybrid' | 'amd-dual-ccd-vcache' | 'uniform';
  hasEcores: boolean;
  pCoreCount: number;
  eCoreCount: number;
  recommendedMode: 'pcores-only' | 'vcache-ccd-only' | 'isolate-core0' | 'all-cores';
  recommendedMaskHex: string;
  recommendedMaskDec: string;
  description: string;
}

let cachedTopology: CpuTopologyInfo | null = null;

/**
 * Format a BigInt affinity mask into a standardized 8-digit or 16-digit hex string.
 */
export function formatMaskHex(mask: bigint): string {
  const hex = mask.toString(16).toUpperCase();
  const padded = hex.padStart(8, '0');
  return `0x${padded}`;
}

/**
 * Calculate recommended CPU affinity mask based on topology metrics.
 */
export function calculateTopology(
  cpuName: string,
  physicalCores: number,
  logicalProcessors: number
): CpuTopologyInfo {
  const nameUpper = cpuName.toUpperCase();
  const isAmdVCacheDualCcd =
    nameUpper.includes('AMD') &&
    (nameUpper.includes('7900X3D') ||
      nameUpper.includes('7950X3D') ||
      nameUpper.includes('9900X3D') ||
      nameUpper.includes('9950X3D'));

  // Intel Hybrid detection:
  // On Intel hybrid CPUs with Hyper-Threading on P-cores (12th, 13th, 14th gen):
  // logicalProcessors = 2 * P + E
  // physicalCores = P + E
  // Subtracting gives: P = logicalProcessors - physicalCores; E = physicalCores - P
  let isIntelHybrid = false;
  let pCores = physicalCores;
  let eCores = 0;

  if (nameUpper.includes('INTEL')) {
    if (logicalProcessors > physicalCores && physicalCores * 2 !== logicalProcessors) {
      const calculatedP = logicalProcessors - physicalCores;
      const calculatedE = physicalCores - calculatedP;
      if (calculatedP > 0 && calculatedE > 0) {
        isIntelHybrid = true;
        pCores = calculatedP;
        eCores = calculatedE;
      }
    } else if (nameUpper.includes('ULTRA') && physicalCores >= 14) {
      // Intel Core Ultra 200 (Arrow Lake) without Hyper-Threading
      // Typically 8P + 16E (Ultra 9), 8P + 12E (Ultra 7), or 6P + 8E (Ultra 5)
      isIntelHybrid = true;
      pCores = physicalCores >= 20 ? 8 : 6;
      eCores = physicalCores - pCores;
    }
  }

  let architecture: 'intel-hybrid' | 'amd-dual-ccd-vcache' | 'uniform' = 'uniform';
  let recommendedMode: 'pcores-only' | 'vcache-ccd-only' | 'isolate-core0' | 'all-cores' = 'all-cores';
  let mask: bigint = (1n << BigInt(logicalProcessors)) - 1n;
  let description = 'All CPU cores allocated.';

  if (isIntelHybrid && eCores > 0) {
    architecture = 'intel-hybrid';
    recommendedMode = 'pcores-only';
    // On Intel Hybrid, P-core threads occupy bits 0 to (2*pCores - 1)
    const pThreads = pCores * 2 <= logicalProcessors ? pCores * 2 : pCores;
    mask = (1n << BigInt(pThreads)) - 1n;
    description = `Intel Hybrid detected (${pCores} P-Cores, ${eCores} E-Cores). Masks out low-power E-cores to prevent thread migration micro-stutter.`;
  } else if (isAmdVCacheDualCcd) {
    architecture = 'amd-dual-ccd-vcache';
    recommendedMode = 'vcache-ccd-only';
    // CCD0 has 3D V-Cache (half the total threads)
    const ccd0Threads = Math.floor(logicalProcessors / 2);
    mask = (1n << BigInt(ccd0Threads)) - 1n;
    description = `AMD 3D V-Cache Dual-CCD detected. Pins game to CCD0 (3D V-Cache) to prevent cross-CCD latency penalties.`;
  } else {
    architecture = 'uniform';
    // On uniform multi-core CPUs with >= 6 threads (e.g. 6-core or 8-core CPUs like Ryzen 7800X3D):
    // Isolating Core 0 leaves the remaining cores dedicated solely to the game's render loop,
    // keeping Windows DWM, timer interrupts, and mouse polling from causing frame drops.
    if (logicalProcessors >= 6) {
      recommendedMode = 'isolate-core0';
      const isSmt = logicalProcessors > physicalCores;
      const maskExclusion = isSmt ? 3n : 1n; // Exclude thread 0 & 1 if SMT, else thread 0
      const allMask = (1n << BigInt(logicalProcessors)) - 1n;
      mask = allMask ^ maskExclusion;
      description = `Uniform architecture (${physicalCores} Cores, ${logicalProcessors} Threads). Dedicates Core 0 to Windows DPC and mouse polling, freeing remaining cores for game execution.`;
    } else {
      recommendedMode = 'all-cores';
      mask = (1n << BigInt(logicalProcessors)) - 1n;
      description = `Uniform architecture (${physicalCores} Cores). All cores allocated to maintain adequate compute throughput.`;
    }
  }

  return {
    cpuName,
    physicalCores,
    logicalProcessors,
    architecture,
    hasEcores: eCores > 0,
    pCoreCount: pCores,
    eCoreCount: eCores,
    recommendedMode,
    recommendedMaskHex: formatMaskHex(mask),
    recommendedMaskDec: mask.toString(10),
    description,
  };
}

/**
 * Get system CPU topology with automatic in-memory caching.
 */
export async function getCpuTopology(forceRefresh = false): Promise<CpuTopologyInfo> {
  if (cachedTopology && !forceRefresh) {
    return cachedTopology;
  }

  const cpus = os.cpus();
  const logicalProcessors = cpus.length || 4;
  const cpuName = cpus[0]?.model?.trim() || 'Generic x64 Processor';

  let physicalCores = logicalProcessors;
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).NumberOfCores"',
      { timeout: 3000, windowsHide: true }
    );
    const parsed = parseInt(stdout.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      physicalCores = parsed;
    }
  } catch {
    // Graceful fallback: assume physical cores is half if logical > 4, or equal
    physicalCores = logicalProcessors > 4 ? Math.floor(logicalProcessors / 2) : logicalProcessors;
  }

  cachedTopology = calculateTopology(cpuName, physicalCores, logicalProcessors);
  return cachedTopology;
}
