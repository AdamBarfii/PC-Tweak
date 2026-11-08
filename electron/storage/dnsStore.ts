import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface DnsPreset {
  id: string;
  name: string;
  primaryIpv4: string;
  secondaryIpv4?: string;
  primaryIpv6?: string;
  secondaryIpv6?: string;
  dohTemplate?: string;
  isDefault: boolean;
  isCustom?: boolean;
}

export const DEFAULT_DNS_PRESETS: DnsPreset[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    primaryIpv4: '1.1.1.1',
    secondaryIpv4: '1.0.0.1',
    primaryIpv6: '2606:4700:4700::1111',
    secondaryIpv6: '2606:4700:4700::1001',
    dohTemplate: 'https://cloudflare-dns.com/dns-query',
    isDefault: true,
  },
  {
    id: 'google',
    name: 'Google Public DNS (8.8.8.8)',
    primaryIpv4: '8.8.8.8',
    secondaryIpv4: '8.8.4.4',
    primaryIpv6: '2001:4860:4860::8888',
    secondaryIpv6: '2001:4860:4860::8844',
    dohTemplate: 'https://dns.google/dns-query',
    isDefault: true,
  },
  {
    id: 'quad9',
    name: 'Quad9 (Malware Blocking)',
    primaryIpv4: '9.9.9.9',
    secondaryIpv4: '149.112.112.112',
    primaryIpv6: '2620:fe::fe',
    secondaryIpv6: '2620:fe::9',
    dohTemplate: 'https://dns.quad9.net/dns-query',
    isDefault: true,
  },
  {
    id: 'shecan',
    name: 'Shecan (شکن - Anti-Sanction)',
    primaryIpv4: '178.22.122.100',
    secondaryIpv4: '185.51.200.2',
    dohTemplate: 'https://free.shecan.ir/dns-query',
    isDefault: true,
  },
  {
    id: 'electro',
    name: 'Electro (الکترو - Gaming DNS)',
    primaryIpv4: '78.157.42.100',
    secondaryIpv4: '78.157.42.101',
    dohTemplate: 'https://elc.ir/dns-query',
    isDefault: true,
  },
];

export class DnsStore {
  private static filePath: string;

  private static getStoragePath(): string {
    if (!this.filePath) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.filePath = path.join(storageDir, 'dnsPresets.json');
    }
    return this.filePath;
  }

  static listPresets(): DnsPreset[] {
    try {
      const p = this.getStoragePath();
      if (!fs.existsSync(p)) {
        this.saveAll(DEFAULT_DNS_PRESETS);
        return DEFAULT_DNS_PRESETS;
      }
      const content = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.saveAll(DEFAULT_DNS_PRESETS);
        return DEFAULT_DNS_PRESETS;
      }
      return parsed;
    } catch {
      return DEFAULT_DNS_PRESETS;
    }
  }

  private static saveAll(presets: DnsPreset[]): void {
    const p = this.getStoragePath();
    fs.writeFileSync(p, JSON.stringify(presets, null, 2), 'utf8');
  }

  static addPreset(preset: Omit<DnsPreset, 'id' | 'isDefault'>): DnsPreset {
    const all = this.listPresets();
    const id = `custom_${Date.now()}`;
    const newPreset: DnsPreset = {
      ...preset,
      id,
      isDefault: false,
      isCustom: true,
    };
    all.push(newPreset);
    this.saveAll(all);
    return newPreset;
  }

  static updatePreset(id: string, updates: Partial<DnsPreset>): DnsPreset | null {
    const all = this.listPresets();
    const index = all.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const updated = { ...all[index], ...updates };
    all[index] = updated;
    this.saveAll(all);
    return updated;
  }

  static deletePreset(id: string): boolean {
    const all = this.listPresets();
    const filtered = all.filter((p) => p.id !== id);
    if (filtered.length === all.length) return false;
    this.saveAll(filtered);
    return true;
  }

  static resetToDefaults(): DnsPreset[] {
    this.saveAll(DEFAULT_DNS_PRESETS);
    return DEFAULT_DNS_PRESETS;
  }
}
