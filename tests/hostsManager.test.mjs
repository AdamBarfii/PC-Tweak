import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const DEFAULT_WINDOWS_HOSTS_CONTENT = `# Copyright (c) 1993-2009 Microsoft Corp.
#
# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.
#
# This file contains the mappings of IP addresses to host names. Each
# entry should be kept on an individual line. The IP address should
# be placed in the first column followed by the corresponding host name.
# The IP address and the host name should be separated by at least one
# space.
#
# Additionally, comments (such as these) may be inserted on individual
# lines or following the machine name denoted by a '#' symbol.
#
# For example:
#
#      102.54.94.97     rhino.acme.com          # source server
#       38.25.63.10     x.acme.com              # x client host

# localhost name resolution is handled within DNS itself.
#	127.0.0.1       localhost
#	::1             localhost
`;

function parseHostsContent(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let activeMappingsCount = 0;
  let customMappingsCount = 0;
  let loopbackMappingsCount = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      entries.push({
        lineIndex: index + 1,
        raw: line,
        isComment: false,
        isEmpty: true,
        isLoopback: false,
        isCustom: false,
      });
      return;
    }

    if (trimmed.startsWith('#')) {
      entries.push({
        lineIndex: index + 1,
        raw: line,
        comment: trimmed.replace(/^#\s*/, ''),
        isComment: true,
        isEmpty: false,
        isLoopback: false,
        isCustom: false,
      });
      return;
    }

    const [mappingPart, ...commentParts] = line.split('#');
    const inlineComment = commentParts.length > 0 ? commentParts.join('#').trim() : undefined;
    const tokens = mappingPart.trim().split(/\s+/);

    if (tokens.length >= 2) {
      const ip = tokens[0];
      const domain = tokens.slice(1).join(' ');
      const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0';
      const isStandardLocalhost = isLoopback && (domain.toLowerCase() === 'localhost' || domain.toLowerCase() === 'broadcasthost');
      const isCustom = !isStandardLocalhost;

      activeMappingsCount++;
      if (isLoopback) loopbackMappingsCount++;
      if (isCustom) customMappingsCount++;

      entries.push({
        lineIndex: index + 1,
        raw: line,
        ip,
        domain,
        comment: inlineComment,
        isComment: false,
        isEmpty: false,
        isLoopback,
        isCustom,
      });
    } else {
      entries.push({
        lineIndex: index + 1,
        raw: line,
        isComment: false,
        isEmpty: false,
        isLoopback: false,
        isCustom: true,
      });
    }
  });

  return {
    entries,
    activeMappingsCount,
    customMappingsCount,
    loopbackMappingsCount,
  };
}

describe('Hosts File Manager & Parser Tests', () => {
  it('parses standard clean Microsoft hosts file without false custom mappings', () => {
    const report = parseHostsContent(DEFAULT_WINDOWS_HOSTS_CONTENT);

    assert.equal(report.activeMappingsCount, 0, 'Clean default hosts file should have 0 active uncommented mappings');
    assert.equal(report.customMappingsCount, 0, 'Clean default hosts file should have 0 custom mappings');
    assert.ok(report.entries.length > 5, 'Should have multiple comment entries');
  });

  it('correctly parses active loopback and custom domain redirects', () => {
    const testContent = `
# Sample header
# 127.0.0.1 localhost

127.0.0.1 localhost
::1 localhost
127.0.0.1 blacklist.teamspeak.com # VoIP block
109.94.209.70 fitgirlrepacks.in # Malicious clone redirect
::1 dev.mysite.local
`;

    const report = parseHostsContent(testContent);

    assert.equal(report.activeMappingsCount, 5, 'Should identify 5 active mappings');
    assert.equal(report.loopbackMappingsCount, 4, 'Should identify 4 loopback mappings (127.0.0.1 and ::1)');
    assert.equal(report.customMappingsCount, 3, 'Should identify 3 custom mappings (teamspeak, fitgirl, dev.mysite.local)');

    const teamspeak = report.entries.find((e) => e.domain === 'blacklist.teamspeak.com');
    assert.ok(teamspeak, 'Should find teamspeak entry');
    assert.equal(teamspeak.ip, '127.0.0.1');
    assert.equal(teamspeak.comment, 'VoIP block');
    assert.equal(teamspeak.isLoopback, true);
    assert.equal(teamspeak.isCustom, true);

    const fitgirl = report.entries.find((e) => e.domain === 'fitgirlrepacks.in');
    assert.ok(fitgirl, 'Should find fitgirl entry');
    assert.equal(fitgirl.ip, '109.94.209.70');
    assert.equal(fitgirl.comment, 'Malicious clone redirect');
    assert.equal(fitgirl.isLoopback, false);
    assert.equal(fitgirl.isCustom, true);
  });

  it('handles empty lines and pure comments properly', () => {
    const commentOnly = `
# Just a comment
# Another comment line

# Trailing comment
`;
    const report = parseHostsContent(commentOnly);
    assert.equal(report.activeMappingsCount, 0);
    assert.equal(report.customMappingsCount, 0);
    assert.equal(report.entries.filter((e) => e.isComment).length, 3);
    assert.equal(report.entries.filter((e) => e.isEmpty).length, 3);
  });
});
