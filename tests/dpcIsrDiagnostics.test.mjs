import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const KNOWN_DRIVER_HOTSPOTS = {
  nvlddmkm: {
    category: 'gpu',
    severity: 'high',
    potentialCause: 'NVIDIA GPU driver DPC spikes.',
    recommendation: 'Perform clean driver reinstall.',
  },
  ndis: {
    category: 'network',
    severity: 'high',
    potentialCause: 'Network interface card interrupt storms.',
    recommendation: 'Enable RSS and configure Interrupt Moderation.',
  },
  tcpip: {
    category: 'network',
    severity: 'medium',
    potentialCause: 'TCP/IP stack processing bottlenecks.',
    recommendation: 'Ensure Large Send Offload v2 is active.',
  },
  storport: {
    category: 'storage',
    severity: 'high',
    potentialCause: 'Storage port controller delays.',
    recommendation: 'Set Storage Link Power Management to Active.',
  },
  storahci: {
    category: 'storage',
    severity: 'medium',
    potentialCause: 'SATA AHCI Link Power Management aggressive sleep states.',
    recommendation: 'Disable SATA Link Power Management.',
  },
  wdf01000: {
    category: 'system',
    severity: 'high',
    potentialCause: 'Kernel-Mode Driver Framework overhead.',
    recommendation: 'Update motherboard chipset drivers.',
  },
  acpi: {
    category: 'system',
    severity: 'medium',
    potentialCause: 'Motherboard ACPI power management throttling.',
    recommendation: 'Use Ultimate Performance power plan.',
  },
  dxgkrnl: {
    category: 'gpu',
    severity: 'medium',
    potentialCause: 'DirectX Graphics Kernel overhead.',
    recommendation: 'Close conflicting game overlay injectors.',
  },
  rtkvhd64: {
    category: 'audio',
    severity: 'medium',
    potentialCause: 'Realtek High Definition Audio Driver buffer underrun.',
    recommendation: 'Disable exclusive audio enhancement effects.',
  },
};

function parseDriverQueryCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const cols = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
    if (!cols || cols.length < 7) continue;

    const cleanCols = cols.map((c) =>
      c.replace(/^,/, '').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim()
    );

    const moduleName = (cleanCols[0] || '').toLowerCase();
    const displayName = cleanCols[1] || cleanCols[0];
    const description = cleanCols[2] || displayName;
    const state = cleanCols[5] === 'Running' ? 'Running' : cleanCols[5] === 'Stopped' ? 'Stopped' : 'Unknown';

    const hotspot = KNOWN_DRIVER_HOTSPOTS[moduleName];

    if (hotspot) {
      results.push({
        moduleName: cleanCols[0],
        displayName,
        description,
        category: hotspot.category,
        state,
        isKnownBottleneck: true,
        severity: hotspot.severity,
        potentialCause: hotspot.potentialCause,
        recommendation: hotspot.recommendation,
      });
    } else {
      let category = 'other';
      const lowerDesc = (description + ' ' + displayName).toLowerCase();
      if (
        lowerDesc.includes('network') ||
        lowerDesc.includes('ethernet') ||
        lowerDesc.includes('wi-fi') ||
        lowerDesc.includes('wireless') ||
        lowerDesc.includes('802.11')
      ) {
        category = 'network';
      } else if (
        lowerDesc.includes('graphics') ||
        lowerDesc.includes('display') ||
        lowerDesc.includes('nvidia') ||
        lowerDesc.includes('amd') ||
        lowerDesc.includes('intel hd')
      ) {
        category = 'gpu';
      } else if (
        lowerDesc.includes('storage') ||
        lowerDesc.includes('controller') ||
        lowerDesc.includes('nvme') ||
        lowerDesc.includes('sata') ||
        lowerDesc.includes('ahci')
      ) {
        category = 'storage';
      } else if (lowerDesc.includes('audio') || lowerDesc.includes('sound')) {
        category = 'audio';
      }

      results.push({
        moduleName: cleanCols[0],
        displayName,
        description,
        category,
        state,
        isKnownBottleneck: false,
        severity: 'low',
        potentialCause: 'Standard kernel-level driver operation.',
        recommendation: 'No action required.',
      });
    }
  }

  return results;
}

describe('DPC & ISR Driver Latency Diagnostics Tests', () => {
  it('correctly parses driverquery CSV and identifies known latency bottlenecks', () => {
    const mockCsv = `"Module Name","Display Name","Description","Driver Type","Start Mode","State","Status","Accept Stop","Accept Pause","Paged Pool(bytes)","Code(bytes)","BSS(bytes)","Link Date","Path","Init(bytes)"
"nvlddmkm","NVIDIA Windows Kernel Mode Driver","NVIDIA Windows Kernel Mode Driver","Kernel ","Manual","Running","OK","TRUE","FALSE","24,576","63,897,600","0","","C:\\WINDOWS\\system32\\DriverStore\\FileRepository\\nv_dispi.inf_amd64_123\\nvlddmkm.sys","4,096"
"ndis","Network Driver Interface System","Network Driver Interface System","Kernel ","Boot","Running","OK","TRUE","FALSE","131,072","1,048,576","0","","C:\\WINDOWS\\system32\\drivers\\ndis.sys","4,096"
"tcpip","TCP/IP Protocol Driver","TCP/IP Protocol Driver","Kernel ","Boot","Running","OK","TRUE","FALSE","98,304","2,097,152","0","","C:\\WINDOWS\\system32\\drivers\\tcpip.sys","4,096"
"storport","Microsoft Storage Port Driver","Microsoft Storage Port Driver","Kernel ","Boot","Running","OK","TRUE","FALSE","32,768","524,288","0","","C:\\WINDOWS\\system32\\drivers\\storport.sys","4,096"
"wdf01000","Kernel Mode Driver Framework Runtime","Kernel Mode Driver Framework Runtime","Kernel ","Boot","Running","OK","TRUE","FALSE","65,536","786,432","0","","C:\\WINDOWS\\system32\\drivers\\wdf01000.sys","4,096"
"acpi","Microsoft ACPI Driver","Microsoft ACPI Driver","Kernel ","Boot","Running","OK","TRUE","FALSE","184,320","466,944","0","","C:\\WINDOWS\\system32\\drivers\\ACPI.sys","24,576"
"beep","Beep","Beep","Kernel ","System","Running","OK","TRUE","FALSE","4,096","16,384","0","","C:\\WINDOWS\\system32\\drivers\\beep.sys","4,096"
"1394ohci","1394 OHCI Compliant Host Controller","1394 OHCI Compliant Host Controller","Kernel ","Manual","Stopped","OK","FALSE","FALSE","4,096","229,376","0","","C:\\WINDOWS\\system32\\drivers\\1394ohci.sys","4,096"
`;

    const drivers = parseDriverQueryCsv(mockCsv);

    assert.ok(drivers.length >= 7, 'Should parse all driver lines');

    const nvidia = drivers.find((d) => d.moduleName.toLowerCase() === 'nvlddmkm');
    assert.ok(nvidia, 'Should identify nvlddmkm');
    assert.equal(nvidia.isKnownBottleneck, true);
    assert.equal(nvidia.category, 'gpu');
    assert.equal(nvidia.severity, 'high');
    assert.equal(nvidia.state, 'Running');

    const ndis = drivers.find((d) => d.moduleName.toLowerCase() === 'ndis');
    assert.ok(ndis, 'Should identify ndis');
    assert.equal(ndis.isKnownBottleneck, true);
    assert.equal(ndis.category, 'network');
    assert.equal(ndis.severity, 'high');

    const storport = drivers.find((d) => d.moduleName.toLowerCase() === 'storport');
    assert.ok(storport, 'Should identify storport');
    assert.equal(storport.isKnownBottleneck, true);
    assert.equal(storport.category, 'storage');

    const beep = drivers.find((d) => d.moduleName.toLowerCase() === 'beep');
    assert.ok(beep, 'Should identify standard kernel driver');
    assert.equal(beep.isKnownBottleneck, false);
    assert.equal(beep.category, 'other');

    const stopped = drivers.find((d) => d.moduleName.toLowerCase() === '1394ohci');
    assert.ok(stopped);
    assert.equal(stopped.state, 'Stopped');
  });

  it('handles empty or malformed CSV gracefully without crashing', () => {
    assert.deepEqual(parseDriverQueryCsv(''), []);
    assert.deepEqual(parseDriverQueryCsv('Only one header line'), []);
  });
});
