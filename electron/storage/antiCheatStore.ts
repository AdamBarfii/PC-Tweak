import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import initSqlJs from 'sql.js';

export type AntiCheatSafetyLevel = 'safe' | 'caution' | 'blocked-risk';

export interface AntiCheatRequirement {
  id: string;
  name: string;
  serviceNames: string[];
  driverNames: string[];
  games: string[];
  requiredSecureBoot: 'required' | 'recommended' | 'optional';
  requiredTpm: '2.0' | '1.2' | 'optional';
  requiredVbs: 'required' | 'recommended' | 'optional';
  requiredHypervisor: 'required' | 'optional';
  requiredIommu?: 'required' | 'recommended' | 'optional';
  requiredOsVersion?: string;
  disallowedBootFlags: string[];
  blockedTweaks: string[];
  supportUrl: string;
  lastVerified: string;
  note: string;
}

export const DEFAULT_ANTICHEAT_REQUIREMENTS: AntiCheatRequirement[] = [
  {
    id: 'vanguard',
    name: 'Riot Vanguard',
    serviceNames: ['vgc'],
    driverNames: ['vgk.sys', 'vgk'],
    games: ['Valorant', 'League of Legends'],
    requiredSecureBoot: 'required',
    requiredTpm: '2.0',
    requiredVbs: 'recommended',
    requiredHypervisor: 'required',
    requiredIommu: 'recommended',
    requiredOsVersion: 'Windows 11 21H2+',
    disallowedBootFlags: ['testsigning', 'nointegritychecks', 'hypervisorlaunchtype off', 'debug'],
    blockedTweaks: [
      'vbs_hvci_off',
      'hypervisor_launch_off',
      'test_signing_on',
      'gaming_boot_entry',
      'bcdedit_custom_entry',
      'driver_signature_off',
    ],
    supportUrl: 'https://support-valorant.riotgames.com/hc/en-us/articles/16941644084883-Vanguard-Restrictions',
    lastVerified: '2026-03-20',
    note: 'Windows 11 strictly enforces UEFI Secure Boot, TPM 2.0, and Hypervisor for Riot Vanguard. Disabling VBS or boot integrity triggers VAN 1067 / VAN 9003.',
  },
  {
    id: 'faceit',
    name: 'FACEIT Anti-Cheat',
    serviceNames: ['FACEIT', 'FACEITService'],
    driverNames: ['faceit.sys', 'faceit'],
    games: ['Counter-Strike 2 (FACEIT)'],
    requiredSecureBoot: 'required',
    requiredTpm: '2.0',
    requiredVbs: 'recommended',
    requiredHypervisor: 'required',
    requiredIommu: 'recommended',
    requiredOsVersion: 'Windows 10/11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks', 'hypervisorlaunchtype off', 'debug'],
    blockedTweaks: [
      'vbs_hvci_off',
      'hypervisor_launch_off',
      'test_signing_on',
      'gaming_boot_entry',
      'bcdedit_custom_entry',
      'driver_signature_off',
    ],
    supportUrl: 'https://support.faceit.com/hc/en-us/articles/360014237399-Common-Issues-Fixes',
    lastVerified: '2026-03-15',
    note: 'Secure Boot and TPM 2.0 are mandatory on Windows 11. Hypervisor launch cannot be disabled.',
  },
  {
    id: 'eac',
    name: 'Easy Anti-Cheat / EOS',
    serviceNames: ['EasyAntiCheat', 'EasyAntiCheat_EOS'],
    driverNames: ['easyanticheat.sys', 'easyanticheat_eos.sys'],
    games: ['Fortnite', 'Apex Legends', 'Rust', 'The Finals'],
    requiredSecureBoot: 'recommended',
    requiredTpm: 'optional',
    requiredVbs: 'optional',
    requiredHypervisor: 'optional',
    requiredIommu: 'optional',
    requiredOsVersion: 'Windows 10/11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks', 'debug'],
    blockedTweaks: [
      'test_signing_on',
      'driver_signature_off',
      'gaming_boot_entry',
    ],
    supportUrl: 'https://www.easy.ac/en-us/support/game/issues/guide/',
    lastVerified: '2026-03-10',
    note: 'Kernel driver blocks test signing and kernel debugging. Driver signature enforcement must remain enabled.',
  },
  {
    id: 'battleye',
    name: 'BattlEye',
    serviceNames: ['BEService'],
    driverNames: ['bedaisy.sys', 'bedaisy'],
    games: ['Rainbow Six Siege', 'Destiny 2', 'PUBG', 'DayZ'],
    requiredSecureBoot: 'recommended',
    requiredTpm: 'optional',
    requiredVbs: 'optional',
    requiredHypervisor: 'optional',
    requiredIommu: 'optional',
    requiredOsVersion: 'Windows 10/11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks', 'debug'],
    blockedTweaks: [
      'test_signing_on',
      'driver_signature_off',
      'gaming_boot_entry',
    ],
    supportUrl: 'https://www.battleye.com/support/faq/',
    lastVerified: '2026-03-01',
    note: 'Blocks execution if Windows Test Signing or kernel debugging is active.',
  },
  {
    id: 'ricochet',
    name: 'Ricochet Anti-Cheat',
    serviceNames: [],
    driverNames: ['randgrid.sys', 'randgrid'],
    games: ['Call of Duty: Warzone', 'Call of Duty: Modern Warfare III'],
    requiredSecureBoot: 'required',
    requiredTpm: '2.0',
    requiredVbs: 'optional',
    requiredHypervisor: 'optional',
    requiredIommu: 'optional',
    requiredOsVersion: 'Windows 10/11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks', 'debug'],
    blockedTweaks: [
      'test_signing_on',
      'driver_signature_off',
      'gaming_boot_entry',
    ],
    supportUrl: 'https://support.activision.com/warzone-2/articles/ricochet-anti-cheat-pc',
    lastVerified: '2026-02-25',
    note: 'Secure Boot and TPM 2.0 required on Windows 11. Kernel driver verifies code signatures.',
  },
  {
    id: 'eaac',
    name: 'EA AntiCheat (EAAC)',
    serviceNames: ['EAAntiCheatService'],
    driverNames: ['eaanticheat.sys'],
    games: ['EA SPORTS FC 24/25', 'Battlefield 2042'],
    requiredSecureBoot: 'required',
    requiredTpm: 'optional',
    requiredVbs: 'optional',
    requiredHypervisor: 'optional',
    requiredIommu: 'optional',
    requiredOsVersion: 'Windows 11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks'],
    blockedTweaks: [
      'test_signing_on',
      'driver_signature_off',
      'gaming_boot_entry',
    ],
    supportUrl: 'https://help.ea.com/en/help/pc/ea-anticheat/',
    lastVerified: '2026-03-05',
    note: 'Secure Boot is strictly required for FIFA / EA Sports FC on Windows 11.',
  },
  {
    id: 'ace',
    name: 'Anti-Cheat Expert (ACE)',
    serviceNames: ['AntiCheatExpert', 'ACE-BASE'],
    driverNames: ['ace-base.sys', 'anticheatexpert.sys'],
    games: ['PUBG Mobile (PC)', 'Arena Breakout: Infinite'],
    requiredSecureBoot: 'recommended',
    requiredTpm: 'optional',
    requiredVbs: 'optional',
    requiredHypervisor: 'optional',
    requiredIommu: 'optional',
    requiredOsVersion: 'Windows 10/11',
    disallowedBootFlags: ['testsigning', 'nointegritychecks'],
    blockedTweaks: [
      'test_signing_on',
      'driver_signature_off',
      'gaming_boot_entry',
    ],
    supportUrl: 'https://anti-cheat.qq.com/',
    lastVerified: '2026-02-18',
    note: 'Monitors kernel code integrity and active system boot parameters.',
  },
];

export class AntiCheatStore {
  private static dbPath: string;
  private static jsonPath: string;
  private static inMemoryCache: AntiCheatRequirement[] | null = null;
  private static sqlInstance: any = null;

  private static getStoragePaths(): { dbPath: string; jsonPath: string } {
    if (!this.dbPath) {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const storageDir = path.join(userDataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.dbPath = path.join(storageDir, 'antiCheatRequirements.db');
      this.jsonPath = path.join(storageDir, 'antiCheatRequirements.json');
    }
    return { dbPath: this.dbPath, jsonPath: this.jsonPath };
  }

  /**
   * Initializes SQLite Database and creates the anti_cheat_requirements table.
   */
  private static async initSqliteDb(): Promise<any> {
    if (this.sqlInstance) return this.sqlInstance;

    try {
      const SQL = await initSqlJs();
      const { dbPath } = this.getStoragePaths();

      let db: any;
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
      } else {
        db = new SQL.Database();
      }

      // Create SQLite Table
      db.run(`
        CREATE TABLE IF NOT EXISTS anti_cheat_requirements (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          games TEXT NOT NULL,
          service_names TEXT NOT NULL,
          driver_names TEXT NOT NULL,
          required_secure_boot TEXT NOT NULL,
          required_tpm TEXT NOT NULL,
          required_vbs TEXT NOT NULL,
          required_hypervisor TEXT NOT NULL,
          required_iommu TEXT,
          required_os_version TEXT,
          disallowed_boot_flags TEXT NOT NULL,
          blocked_tweaks TEXT NOT NULL,
          support_url TEXT NOT NULL,
          last_verified TEXT NOT NULL,
          note TEXT NOT NULL
        );
      `);

      this.sqlInstance = db;
      return db;
    } catch {
      return null;
    }
  }

  /**
   * Reads requirements from SQLite table with fallback to JSON and defaults.
   */
  static getRequirements(): AntiCheatRequirement[] {
    if (this.inMemoryCache && this.inMemoryCache.length > 0) {
      return this.inMemoryCache;
    }

    const { jsonPath } = this.getStoragePaths();
    try {
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.inMemoryCache = parsed;
          return parsed;
        }
      }
    } catch {}

    this.saveAll(DEFAULT_ANTICHEAT_REQUIREMENTS);
    this.inMemoryCache = DEFAULT_ANTICHEAT_REQUIREMENTS;
    return DEFAULT_ANTICHEAT_REQUIREMENTS;
  }

  static getRequirementById(id: string): AntiCheatRequirement | null {
    const list = this.getRequirements();
    return list.find((item) => item.id.toLowerCase() === id.toLowerCase()) || null;
  }

  static updateRequirement(req: AntiCheatRequirement): boolean {
    const list = this.getRequirements();
    const idx = list.findIndex((x) => x.id.toLowerCase() === req.id.toLowerCase());
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...req };
    } else {
      list.push(req);
    }
    this.saveAll(list);
    return true;
  }

  static resetToDefaults(): void {
    this.saveAll(DEFAULT_ANTICHEAT_REQUIREMENTS);
  }

  /**
   * Persists to both SQLite .db file and .json store.
   */
  private static saveAll(reqs: AntiCheatRequirement[]): void {
    const { dbPath, jsonPath } = this.getStoragePaths();
    this.inMemoryCache = reqs;

    // 1. Write human-readable JSON
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(reqs, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write requirements JSON:', err);
    }

    // 2. Write SQLite Database file
    this.initSqliteDb().then((db) => {
      if (!db) return;
      try {
        db.run('BEGIN TRANSACTION;');
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO anti_cheat_requirements (
            id, name, games, service_names, driver_names,
            required_secure_boot, required_tpm, required_vbs, required_hypervisor,
            required_iommu, required_os_version, disallowed_boot_flags,
            blocked_tweaks, support_url, last_verified, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);

        for (const r of reqs) {
          stmt.run([
            r.id,
            r.name,
            JSON.stringify(r.games),
            JSON.stringify(r.serviceNames),
            JSON.stringify(r.driverNames),
            r.requiredSecureBoot,
            r.requiredTpm,
            r.requiredVbs,
            r.requiredHypervisor,
            r.requiredIommu || 'optional',
            r.requiredOsVersion || 'Windows 10/11',
            JSON.stringify(r.disallowedBootFlags),
            JSON.stringify(r.blockedTweaks),
            r.supportUrl,
            r.lastVerified,
            r.note,
          ]);
        }
        stmt.free();
        db.run('COMMIT;');

        const binaryArray = db.export();
        const buffer = Buffer.from(binaryArray);
        fs.writeFileSync(dbPath, buffer);
      } catch (err) {
        console.error('Failed to commit to SQLite database:', err);
      }
    });
  }
}
