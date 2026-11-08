import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface DnsPreset {
  id: string;
  name: string;
  category?: 'iranian' | 'global' | 'custom';
  description?: string;
  primaryIpv4: string;
  secondaryIpv4?: string;
  primaryIpv6?: string;
  secondaryIpv6?: string;
  dohTemplate?: string;
  isDefault: boolean;
  isCustom?: boolean;
}

export const DEFAULT_DNS_PRESETS: DnsPreset[] = [
  // ----------------------------------------------------
  // Iranian Anti-Sanction & Gaming DNS Servers
  // ----------------------------------------------------
  {
    id: 'radar',
    name: 'Radar Game (رادار گیم)',
    category: 'iranian',
    description: 'Dedicated Iranian gaming ping reducer and game sanction bypass.',
    primaryIpv4: '10.202.10.10',
    secondaryIpv4: '10.202.10.11',
    isDefault: true,
  },
  {
    id: 'electro',
    name: 'Electro (الکترو)',
    category: 'iranian',
    description: 'Iranian gaming and anti-sanction DNS network with fast routing.',
    primaryIpv4: '78.157.42.101',
    secondaryIpv4: '78.157.42.100',
    dohTemplate: 'https://elc.ir/dns-query',
    isDefault: true,
  },
  {
    id: 'shecan',
    name: 'Shecan (شکن)',
    category: 'iranian',
    description: 'High-reliability anti-sanction DNS for games, software, and dev services.',
    primaryIpv4: '178.22.122.100',
    secondaryIpv4: '185.51.200.2',
    dohTemplate: 'https://free.shecan.ir/dns-query',
    isDefault: true,
  },
  {
    id: '403online',
    name: '403.online (سامانه ۴۰۳)',
    category: 'iranian',
    description: 'Official sanction bypass for developers, IT tools, and international games.',
    primaryIpv4: '10.202.10.202',
    secondaryIpv4: '10.202.10.102',
    isDefault: true,
  },
  {
    id: 'begzar',
    name: 'Begzar (بگذر)',
    category: 'iranian',
    description: 'Anti-sanction and open web DNS for fast unblocked connections.',
    primaryIpv4: '185.55.226.26',
    secondaryIpv4: '185.55.225.25',
    isDefault: true,
  },

  // ----------------------------------------------------
  // Worldwide Low-Latency & Security DNS Servers
  // ----------------------------------------------------
  {
    id: 'cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    category: 'global',
    description: 'Fastest global anycast public resolver with privacy focus.',
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
    category: 'global',
    description: 'Highly resilient global infrastructure with worldwide edge nodes.',
    primaryIpv4: '8.8.8.8',
    secondaryIpv4: '8.8.4.4',
    primaryIpv6: '2001:4860:4860::8888',
    secondaryIpv6: '2001:4860:4860::8844',
    dohTemplate: 'https://dns.google/dns-query',
    isDefault: true,
  },
  {
    id: 'quad9',
    name: 'Quad9 (9.9.9.9)',
    category: 'global',
    description: 'Threat blocking and malware filtering with zero telemetry logging.',
    primaryIpv4: '9.9.9.9',
    secondaryIpv4: '149.112.112.112',
    primaryIpv6: '2620:fe::fe',
    secondaryIpv6: '2620:fe::9',
    dohTemplate: 'https://dns.quad9.net/dns-query',
    isDefault: true,
  },
  {
    id: 'opendns',
    name: 'OpenDNS (Cisco)',
    category: 'global',
    description: 'Cisco enterprise cloud security, anti-phishing, and high availability.',
    primaryIpv4: '208.67.222.222',
    secondaryIpv4: '208.67.220.220',
    dohTemplate: 'https://doh.opendns.com/dns-query',
    isDefault: true,
  },
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    category: 'global',
    description: 'System-wide blocking of intrusive ads, web analytics, and phishing.',
    primaryIpv4: '94.140.14.14',
    secondaryIpv4: '94.140.15.15',
    dohTemplate: 'https://dns.adguard-dns.com/dns-query',
    isDefault: true,
  },
  {
    id: 'controld',
    name: 'Control D',
    category: 'global',
    description: 'Next-gen lightning fast uncensored DNS with modern anycast.',
    primaryIpv4: '76.76.2.0',
    secondaryIpv4: '76.76.10.0',
    dohTemplate: 'https://freedns.controld.com/p0',
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
      const parsed: DnsPreset[] = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.saveAll(DEFAULT_DNS_PRESETS);
        return DEFAULT_DNS_PRESETS;
      }

      // Automatically merge any newly introduced default presets into existing storage
      let hasNewDefaults = false;
      const mergedList = [...parsed];

      for (const def of DEFAULT_DNS_PRESETS) {
        const existingIdx = mergedList.findIndex((item) => item.id === def.id);
        if (existingIdx === -1) {
          mergedList.push(def);
          hasNewDefaults = true;
        } else {
          // Update default metadata (category, description, updated IPs) if it is a default preset
          if (mergedList[existingIdx].isDefault) {
            mergedList[existingIdx] = {
              ...def,
              ...mergedList[existingIdx],
              category: def.category,
              description: def.description,
            };
          }
        }
      }

      if (hasNewDefaults) {
        this.saveAll(mergedList);
      }

      return mergedList;
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
      category: 'custom',
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
