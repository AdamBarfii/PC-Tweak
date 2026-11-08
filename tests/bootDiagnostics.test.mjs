import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function parseEvent100Xml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return null;

  const extractDataValue = (name) => {
    const regex = new RegExp(`<Data\\s+Name=['"]${name}['"]>(\\d+)<\\/Data>`, 'i');
    const match = xmlText.match(regex);
    return match ? parseInt(match[1], 10) : 0;
  };

  const totalDurationMs = extractDataValue('BootDuration');
  const mainPathMs = extractDataValue('MainPathBootTime');
  const kernelInitMs = extractDataValue('BootKernelInitTime');
  const driverInitMs = extractDataValue('BootDriverInitTime');
  const smssInitMs = extractDataValue('BootSmssInitTime');
  const postBootMs = extractDataValue('BootPostBootTime');

  if (totalDurationMs === 0 && mainPathMs === 0 && kernelInitMs === 0) {
    return null;
  }

  return {
    totalDurationMs,
    mainPathMs,
    kernelInitMs,
    driverInitMs,
    smssInitMs,
    postBootMs,
  };
}

function analyzePhases(phases, totalDurationMs) {
  const list = [
    { phase: 'postboot', ms: phases.postBootMs, label: 'Post-Boot Startup Applications' },
    { phase: 'driver', ms: phases.driverInitMs, label: 'Driver Initialization' },
    { phase: 'kernel', ms: phases.kernelInitMs, label: 'Kernel Initialization' },
    { phase: 'smss', ms: phases.smssInitMs, label: 'Session Manager Subsystem' },
  ];

  list.sort((a, b) => b.ms - a.ms);
  const top = list[0];
  const baseTotal = totalDurationMs > 0 ? totalDurationMs : phases.mainPathMs + phases.postBootMs;
  const percent = baseTotal > 0 ? Math.round((top.ms / baseTotal) * 100) : 0;

  const recommendations = [];
  if (phases.postBootMs > 12000) {
    recommendations.push(
      'Post-boot apps took over 12s to reach idle. Disable high-impact startup apps in Windows Settings > Apps > Startup.'
    );
  }
  if (phases.driverInitMs > 6000) {
    recommendations.push(
      'Driver initialization took over 6s. Audit non-essential device drivers and ensure GPU/chipset drivers are updated.'
    );
  }
  if (phases.mainPathMs < 15000 && phases.mainPathMs > 0) {
    recommendations.push('Main boot path is within fast NVMe/SSD benchmarks (<15 seconds).');
  }
  if (recommendations.length === 0) {
    recommendations.push('System boot phases completed within normal parameters.');
  }

  const totalSeconds = (baseTotal / 1000).toFixed(1);
  const summary = `System took ${totalSeconds}s to boot. Largest phase was ${top.label} at ${(top.ms / 1000).toFixed(1)}s (${percent}%).`;

  return {
    slowestPhase: top.phase,
    slowestPhasePercent: percent,
    summary,
    recommendations,
  };
}

describe('System Boot Breakdown Diagnostics Tests', () => {
  it('parses valid Windows Diagnostics-Performance Event 100 XML', () => {
    const mockXml = `
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Diagnostics-Performance" Guid="{cfc18da0-e462-411a-878d-71583b8d8130}" />
    <EventID>100</EventID>
    <Version>2</Version>
  </System>
  <EventData>
    <Data Name="BootDuration">21450</Data>
    <Data Name="MainPathBootTime">12350</Data>
    <Data Name="BootKernelInitTime">1850</Data>
    <Data Name="BootDriverInitTime">3200</Data>
    <Data Name="BootSmssInitTime">1100</Data>
    <Data Name="BootPostBootTime">9100</Data>
  </EventData>
</Event>
`;

    const parsed = parseEvent100Xml(mockXml);
    assert.ok(parsed, 'Parsed object should not be null');
    assert.equal(parsed.totalDurationMs, 21450);
    assert.equal(parsed.mainPathMs, 12350);
    assert.equal(parsed.kernelInitMs, 1850);
    assert.equal(parsed.driverInitMs, 3200);
    assert.equal(parsed.smssInitMs, 1100);
    assert.equal(parsed.postBootMs, 9100);
  });

  it('returns null for corrupted or empty Event 100 XML', () => {
    assert.equal(parseEvent100Xml(''), null);
    assert.equal(parseEvent100Xml('<Event><NoData/></Event>'), null);
    assert.equal(parseEvent100Xml(null), null);
  });

  it('correctly calculates slowest boot phase and generates recommendations', () => {
    const phases = {
      kernelInitMs: 1500,
      driverInitMs: 2500,
      smssInitMs: 900,
      postBootMs: 14500, // PostBoot is largest (>12s)
      mainPathMs: 11000,
    };
    const totalMs = 25500;

    const analysis = analyzePhases(phases, totalMs);
    assert.equal(analysis.slowestPhase, 'postboot');
    assert.ok(analysis.slowestPhasePercent > 50, 'Post-boot should account for > 50% of boot delay');
    assert.ok(
      analysis.recommendations.some((r) => r.includes('startup apps')),
      'Should recommend disabling high-impact startup apps'
    );
  });

  it('flags driver initialization bottleneck when driverInitMs exceeds threshold', () => {
    const phases = {
      kernelInitMs: 1800,
      driverInitMs: 8500, // Driver init > 6s
      smssInitMs: 1200,
      postBootMs: 3000,
      mainPathMs: 14000,
    };
    const totalMs = 17000;

    const analysis = analyzePhases(phases, totalMs);
    assert.equal(analysis.slowestPhase, 'driver');
    assert.ok(
      analysis.recommendations.some((r) => r.includes('Driver initialization took over 6s')),
      'Should recommend auditing device drivers'
    );
  });
});
