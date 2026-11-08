import test from 'node:test';
import assert from 'node:assert/strict';

function formatMaskHex(mask) {
  const hex = mask.toString(16).toUpperCase();
  const padded = hex.padStart(8, '0');
  return `0x${padded}`;
}

function calculateTopology(cpuName, physicalCores, logicalProcessors) {
  const nameUpper = cpuName.toUpperCase();
  const isAmdVCacheDualCcd =
    nameUpper.includes('AMD') &&
    (nameUpper.includes('7900X3D') ||
      nameUpper.includes('7950X3D') ||
      nameUpper.includes('9900X3D') ||
      nameUpper.includes('9950X3D'));

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
      isIntelHybrid = true;
      pCores = physicalCores >= 20 ? 8 : 6;
      eCores = physicalCores - pCores;
    }
  }

  let architecture = 'uniform';
  let recommendedMode = 'all-cores';
  let mask = (1n << BigInt(logicalProcessors)) - 1n;
  let description = 'All CPU cores allocated.';

  if (isIntelHybrid && eCores > 0) {
    architecture = 'intel-hybrid';
    recommendedMode = 'pcores-only';
    const pThreads = pCores * 2 <= logicalProcessors ? pCores * 2 : pCores;
    mask = (1n << BigInt(pThreads)) - 1n;
    description = `Intel Hybrid detected (${pCores} P-Cores, ${eCores} E-Cores). Masks out low-power E-cores to prevent thread migration micro-stutter.`;
  } else if (isAmdVCacheDualCcd) {
    architecture = 'amd-dual-ccd-vcache';
    recommendedMode = 'vcache-ccd-only';
    const ccd0Threads = Math.floor(logicalProcessors / 2);
    mask = (1n << BigInt(ccd0Threads)) - 1n;
    description = `AMD 3D V-Cache Dual-CCD detected. Pins game to CCD0 (3D V-Cache) to prevent cross-CCD latency penalties.`;
  } else {
    architecture = 'uniform';
    if (logicalProcessors >= 6) {
      recommendedMode = 'isolate-core0';
      const isSmt = logicalProcessors > physicalCores;
      const maskExclusion = isSmt ? 3n : 1n;
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

test('CPU Topology & Affinity Engine Tests', async (t) => {
  await t.test('correctly identifies Intel 13700K hybrid architecture with 8 P-cores and 8 E-cores', () => {
    const topo = calculateTopology('13th Gen Intel(R) Core(TM) i7-13700K', 16, 24);
    assert.equal(topo.architecture, 'intel-hybrid');
    assert.equal(topo.hasEcores, true);
    assert.equal(topo.pCoreCount, 8);
    assert.equal(topo.eCoreCount, 8);
    assert.equal(topo.recommendedMode, 'pcores-only');
    assert.equal(topo.recommendedMaskHex, '0x0000FFFF');
  });

  await t.test('correctly identifies Intel 13600K hybrid architecture with 6 P-cores and 8 E-cores', () => {
    const topo = calculateTopology('13th Gen Intel(R) Core(TM) i5-13600K', 14, 20);
    assert.equal(topo.architecture, 'intel-hybrid');
    assert.equal(topo.hasEcores, true);
    assert.equal(topo.pCoreCount, 6);
    assert.equal(topo.eCoreCount, 8);
    assert.equal(topo.recommendedMode, 'pcores-only');
    assert.equal(topo.recommendedMaskHex, '0x00000FFF');
  });

  await t.test('correctly identifies AMD Ryzen 9 7900X3D dual-CCD architecture', () => {
    const topo = calculateTopology('AMD Ryzen 9 7900X3D 12-Core Processor', 12, 24);
    assert.equal(topo.architecture, 'amd-dual-ccd-vcache');
    assert.equal(topo.hasEcores, false);
    assert.equal(topo.recommendedMode, 'vcache-ccd-only');
    assert.equal(topo.recommendedMaskHex, '0x00000FFF');
  });

  await t.test('correctly identifies AMD Ryzen 9 7950X3D dual-CCD architecture', () => {
    const topo = calculateTopology('AMD Ryzen 9 7950X3D 16-Core Processor', 16, 32);
    assert.equal(topo.architecture, 'amd-dual-ccd-vcache');
    assert.equal(topo.recommendedMode, 'vcache-ccd-only');
    assert.equal(topo.recommendedMaskHex, '0x0000FFFF');
  });

  await t.test('correctly isolates CPU 0 on uniform 8-core / 16-thread CPU (e.g. Ryzen 7800X3D)', () => {
    const topo = calculateTopology('AMD Ryzen 7 7800X3D 8-Core Processor', 8, 16);
    assert.equal(topo.architecture, 'uniform');
    assert.equal(topo.hasEcores, false);
    assert.equal(topo.recommendedMode, 'isolate-core0');
    assert.equal(topo.recommendedMaskHex, '0x0000FFFC');
  });

  await t.test('correctly isolates CPU 0 on uniform 4-core / 8-thread CPU (e.g. Core i3-12100F)', () => {
    const topo = calculateTopology('12th Gen Intel(R) Core(TM) i3-12100F', 4, 8);
    assert.equal(topo.architecture, 'uniform');
    assert.equal(topo.recommendedMode, 'isolate-core0');
    assert.equal(topo.recommendedMaskHex, '0x000000FC');
  });

  await t.test('allocates all cores on low-core-count uniform CPUs (e.g. 4 cores, 4 threads)', () => {
    const topo = calculateTopology('Intel(R) Core(TM) i5-6500 CPU @ 3.20GHz', 4, 4);
    assert.equal(topo.architecture, 'uniform');
    assert.equal(topo.recommendedMode, 'all-cores');
    assert.equal(topo.recommendedMaskHex, '0x0000000F');
  });

  await t.test('formatMaskHex formats BigInt numbers with standard padding', () => {
    assert.equal(formatMaskHex(65535n), '0x0000FFFF');
    assert.equal(formatMaskHex(4095n), '0x00000FFF');
    assert.equal(formatMaskHex(252n), '0x000000FC');
  });
});
