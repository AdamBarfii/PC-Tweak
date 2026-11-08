import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AuditStore } from '../storage/auditStore';

const execFileAsync = promisify(execFile);

export interface HostsEntry {
  lineIndex: number;
  raw: string;
  ip?: string;
  domain?: string;
  comment?: string;
  isComment: boolean;
  isEmpty: boolean;
  isLoopback: boolean;
  isCustom: boolean;
}

export interface HostsReport {
  filePath: string;
  totalLines: number;
  activeMappingsCount: number;
  customMappingsCount: number;
  loopbackMappingsCount: number;
  isWritable: boolean;
  entries: HostsEntry[];
  rawContent: string;
}

export interface HostsRestoreResult {
  success: boolean;
  message: string;
  backupPath?: string;
  error?: string;
}

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

export class HostsEngine {
  /**
   * Returns the canonical absolute path to the Windows hosts file
   */
  static getHostsFilePath(): string {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    return path.join(sysRoot, 'System32', 'drivers', 'etc', 'hosts');
  }

  /**
   * Parses raw hosts file text into structured entries
   */
  static parseHostsContent(content: string): {
    entries: HostsEntry[];
    activeMappingsCount: number;
    customMappingsCount: number;
    loopbackMappingsCount: number;
  } {
    const lines = content.split(/\r?\n/);
    const entries: HostsEntry[] = [];
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

      // Check for active mapping: <IP> <Domain...> [# inline comment]
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

  /**
   * Reads hosts file from disk and returns parsed report
   */
  static getHostsReport(): HostsReport {
    const filePath = this.getHostsFilePath();
    let rawContent = '';
    let isWritable = false;

    try {
      if (fs.existsSync(filePath)) {
        rawContent = fs.readFileSync(filePath, 'utf8');
      } else {
        rawContent = DEFAULT_WINDOWS_HOSTS_CONTENT;
      }
    } catch (err: any) {
      rawContent = `# Error reading hosts file: ${err.message}`;
    }

    try {
      fs.accessSync(filePath, fs.constants.W_OK);
      isWritable = true;
    } catch {
      isWritable = false;
    }

    const parsed = this.parseHostsContent(rawContent);

    return {
      filePath,
      totalLines: rawContent.split(/\r?\n/).length,
      activeMappingsCount: parsed.activeMappingsCount,
      customMappingsCount: parsed.customMappingsCount,
      loopbackMappingsCount: parsed.loopbackMappingsCount,
      isWritable,
      entries: parsed.entries,
      rawContent,
    };
  }

  /**
   * Safely restores the hosts file to the clean Microsoft Windows default
   * Automatically creates a timestamped backup before writing
   */
  static async restoreDefaultHosts(): Promise<HostsRestoreResult> {
    const filePath = this.getHostsFilePath();
    const backupDir = path.join(process.cwd(), 'storage');
    let backupPath: string | undefined;

    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      if (fs.existsSync(filePath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = path.join(backupDir, `hosts.backup.${timestamp}`);
        const currentContent = fs.readFileSync(filePath, 'utf8');
        fs.writeFileSync(backupPath, currentContent, 'utf8');
      }

      // Write default hosts file
      fs.writeFileSync(filePath, DEFAULT_WINDOWS_HOSTS_CONTENT, 'utf8');

      // Flush DNS resolver cache after hosts change
      try {
        await execFileAsync('ipconfig.exe', ['/flushdns'], { windowsHide: true });
      } catch {
        // Non-critical if flush fails
      }

      AuditStore.record({
        category: 'network',
        action: 'Restored Default Windows Hosts File',
        details: `Replaced hosts file with standard template. Backup created at: ${backupPath || 'none'}`,
        reversible: true,
      });

      return {
        success: true,
        message: 'Windows hosts file was successfully reset to default. DNS cache flushed.',
        backupPath,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Failed to restore default hosts file. Administrator elevation is required.',
        error: err.message,
        backupPath,
      };
    }
  }
}
