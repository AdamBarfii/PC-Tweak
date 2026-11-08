/**
 * PC Tweak - Native Disk Optimizer & Safe Junk Cleaner Engine
 * 
 * Accurately analyzes, measures, and cleans temporary files with strict safety guardrails:
 * - User temp files are filtered by age (only files older than 24h are deleted to prevent breaking installers).
 * - Locked or in-use files are skipped gracefully without aborting the cleaning pass.
 * - Native Windows TRIM is invoked for SSDs via Optimize-Volume.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getNativePowerShellPath, execFileWithTimeout } from '../processUtils';

export interface DiskJunkCategory {
  id: string;
  nameKey: string;
  descriptionKey: string;
  paths: string[];
  sizeBytes: number;
  fileCount: number;
  safeToClean: boolean;
  defaultSelected: boolean;
}

export interface DiskCleanResult {
  success: boolean;
  reclaimedBytes: number;
  filesDeleted: number;
  errorsCount: number;
  cleanedCategoryIds: string[];
}

export interface DriveStatusInfo {
  driveLetter: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  percentUsed: number;
  mediaType: 'SSD' | 'HDD' | 'Unknown';
  supportsTrim: boolean;
}

export class DiskOptimizerEngine {
  private static readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Resolves environment paths safely.
   */
  private static resolvePaths(): Record<string, string[]> {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const userTemp = os.tmpdir();

    return {
      user_temp: [userTemp],
      system_temp: [path.join(systemRoot, 'Temp')],
      windows_update_download: [path.join(systemRoot, 'SoftwareDistribution', 'Download')],
      crash_dumps_wer: [
        path.join(localAppData, 'CrashDumps'),
        path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
        path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
      ],
      delivery_optimization: [path.join(systemRoot, 'SoftwareDistribution', 'DeliveryOptimization')],
      directx_shader_cache: [
        path.join(localAppData, 'D3DSCache'),
        path.join(localAppData, 'NVIDIA', 'DXCache'),
        path.join(localAppData, 'AMD', 'DxCache'),
      ],
      thumbnail_cache: [path.join(localAppData, 'Microsoft', 'Windows', 'Explorer')],
      recycle_bin: [],
    };
  }

  /**
   * Scans a directory recursively and sums up eligible file sizes and counts.
   */
  private static scanDirectory(
    dirPath: string,
    filterAgeMs: number = 0,
    filePattern?: RegExp,
    depth: number = 0,
    maxDepth: number = 4
  ): { sizeBytes: number; fileCount: number } {
    let sizeBytes = 0;
    let fileCount = 0;

    if (depth > maxDepth || !fs.existsSync(dirPath)) {
      return { sizeBytes, fileCount };
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            const sub = this.scanDirectory(fullPath, filterAgeMs, filePattern, depth + 1, maxDepth);
            sizeBytes += sub.sizeBytes;
            fileCount += sub.fileCount;
          } else if (entry.isFile()) {
            if (filePattern && !filePattern.test(entry.name)) {
              continue;
            }
            const stat = fs.statSync(fullPath);
            if (filterAgeMs > 0 && now - stat.mtimeMs < filterAgeMs) {
              continue; // Skip files younger than filter age
            }
            sizeBytes += stat.size;
            fileCount += 1;
          }
        } catch {
          // File access denied or file locked, skip gracefully
        }
      }
    } catch {
      // Directory access denied, skip gracefully
    }

    return { sizeBytes, fileCount };
  }

  /**
   * Scans all cleanable categories and calculates exact file counts and byte sizes.
   */
  static async scanCategories(): Promise<DiskJunkCategory[]> {
    const paths = this.resolvePaths();
    const categories: DiskJunkCategory[] = [
      {
        id: 'user_temp',
        nameKey: 'optimizer.disk.userTemp',
        descriptionKey: 'optimizer.disk.userTempDesc',
        paths: paths.user_temp,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'system_temp',
        nameKey: 'optimizer.disk.systemTemp',
        descriptionKey: 'optimizer.disk.systemTempDesc',
        paths: paths.system_temp,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'windows_update_download',
        nameKey: 'optimizer.disk.windowsUpdate',
        descriptionKey: 'optimizer.disk.windowsUpdateDesc',
        paths: paths.windows_update_download,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'crash_dumps_wer',
        nameKey: 'optimizer.disk.crashDumps',
        descriptionKey: 'optimizer.disk.crashDumpsDesc',
        paths: paths.crash_dumps_wer,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'delivery_optimization',
        nameKey: 'optimizer.disk.deliveryOpt',
        descriptionKey: 'optimizer.disk.deliveryOptDesc',
        paths: paths.delivery_optimization,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'directx_shader_cache',
        nameKey: 'optimizer.disk.shaderCache',
        descriptionKey: 'optimizer.disk.shaderCacheDesc',
        paths: paths.directx_shader_cache,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: true,
      },
      {
        id: 'thumbnail_cache',
        nameKey: 'optimizer.disk.thumbCache',
        descriptionKey: 'optimizer.disk.thumbCacheDesc',
        paths: paths.thumbnail_cache,
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: false,
      },
      {
        id: 'recycle_bin',
        nameKey: 'optimizer.disk.recycleBin',
        descriptionKey: 'optimizer.disk.recycleBinDesc',
        paths: [],
        sizeBytes: 0,
        fileCount: 0,
        safeToClean: true,
        defaultSelected: false,
      },
    ];

    for (const cat of categories) {
      if (cat.id === 'recycle_bin') {
        const binMetrics = await this.queryRecycleBinMetrics();
        cat.sizeBytes = binMetrics.sizeBytes;
        cat.fileCount = binMetrics.fileCount;
        continue;
      }

      const filePattern = cat.id === 'thumbnail_cache' ? /^thumbcache_.*\.db$/i : undefined;
      const ageFilter = cat.id === 'user_temp' ? this.ONE_DAY_MS : 0;

      for (const p of cat.paths) {
        const result = this.scanDirectory(p, ageFilter, filePattern);
        cat.sizeBytes += result.sizeBytes;
        cat.fileCount += result.fileCount;
      }
    }

    return categories;
  }

  /**
   * Queries Windows Recycle Bin size and file count via PowerShell.
   */
  private static async queryRecycleBinMetrics(): Promise<{ sizeBytes: number; fileCount: number }> {
    try {
      const ps = getNativePowerShellPath();
      const script = `
        try {
          $shell = New-Object -ComObject Shell.Application
          $bin = $shell.NameSpace(0xA)
          $items = $bin.Items()
          $count = $items.Count
          $size = 0
          foreach ($item in $items) {
            $size += $item.Size
          }
          [PSCustomObject]@{ Count = $count; Size = $size } | ConvertTo-Json -Compress
        } catch {
          '{"Count":0,"Size":0}'
        }
      `.trim();

      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 3000 });
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        return {
          sizeBytes: Number(parsed.Size || 0),
          fileCount: Number(parsed.Count || 0),
        };
      }
    } catch {}
    return { sizeBytes: 0, fileCount: 0 };
  }

  /**
   * Recursively deletes eligible files inside a target directory.
   */
  private static deleteDirectoryContents(
    dirPath: string,
    filterAgeMs: number = 0,
    filePattern?: RegExp,
    depth: number = 0,
    maxDepth: number = 4
  ): { deletedBytes: number; deletedCount: number; errorsCount: number } {
    let deletedBytes = 0;
    let deletedCount = 0;
    let errorsCount = 0;

    if (depth > maxDepth || !fs.existsSync(dirPath)) {
      return { deletedBytes, deletedCount, errorsCount };
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            const sub = this.deleteDirectoryContents(fullPath, filterAgeMs, filePattern, depth + 1, maxDepth);
            deletedBytes += sub.deletedBytes;
            deletedCount += sub.deletedCount;
            errorsCount += sub.errorsCount;

            // Attempt to remove directory if empty
            try {
              fs.rmdirSync(fullPath);
            } catch {}
          } else if (entry.isFile()) {
            if (filePattern && !filePattern.test(entry.name)) {
              continue;
            }
            const stat = fs.statSync(fullPath);
            if (filterAgeMs > 0 && now - stat.mtimeMs < filterAgeMs) {
              continue; // Protect recent files
            }

            const fileSize = stat.size;
            fs.unlinkSync(fullPath);
            deletedBytes += fileSize;
            deletedCount += 1;
          }
        } catch {
          // File is locked or in use by another process: skip safely
          errorsCount += 1;
        }
      }
    } catch {
      errorsCount += 1;
    }

    return { deletedBytes, deletedCount, errorsCount };
  }

  /**
   * Cleans all selected categories safely.
   */
  static async cleanCategories(categoryIds: string[]): Promise<DiskCleanResult> {
    const paths = this.resolvePaths();
    let totalReclaimedBytes = 0;
    let totalFilesDeleted = 0;
    let totalErrorsCount = 0;
    const cleanedCategoryIds: string[] = [];

    for (const catId of categoryIds) {
      if (catId === 'recycle_bin') {
        try {
          const ps = getNativePowerShellPath();
          await execFileWithTimeout(ps, ['-NoProfile', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'], { timeout: 5000 });
          cleanedCategoryIds.push(catId);
        } catch {
          totalErrorsCount += 1;
        }
        continue;
      }

      const targetPaths = paths[catId];
      if (!targetPaths || targetPaths.length === 0) continue;

      const filePattern = catId === 'thumbnail_cache' ? /^thumbcache_.*\.db$/i : undefined;
      const ageFilter = catId === 'user_temp' ? this.ONE_DAY_MS : 0;

      for (const p of targetPaths) {
        const res = this.deleteDirectoryContents(p, ageFilter, filePattern);
        totalReclaimedBytes += res.deletedBytes;
        totalFilesDeleted += res.deletedCount;
        totalErrorsCount += res.errorsCount;
      }
      cleanedCategoryIds.push(catId);
    }

    return {
      success: true,
      reclaimedBytes: totalReclaimedBytes,
      filesDeleted: totalFilesDeleted,
      errorsCount: totalErrorsCount,
      cleanedCategoryIds,
    };
  }

  /**
   * Retrieves drive health, capacity, and SSD/HDD media type for drive C:.
   */
  static async getDriveStatus(driveLetter: string = 'C'): Promise<DriveStatusInfo> {
    const letter = driveLetter.toUpperCase().replace(/[^A-Z]/g, '') || 'C';
    const ps = getNativePowerShellPath();

    const script = `
      try {
        $vol = Get-Volume -DriveLetter ${letter} -ErrorAction Stop
        $disk = Get-PhysicalDisk | Where-Object { $_.DeviceID -eq 0 } | Select-Object -First 1
        $mediaType = if ($disk -and $disk.MediaType) { $disk.MediaType } else { 'Unknown' }
        [PSCustomObject]@{
          DriveLetter = '${letter}'
          TotalBytes = [int64]$vol.Size
          FreeBytes = [int64]$vol.SizeRemaining
          MediaType = $mediaType
        } | ConvertTo-Json -Compress
      } catch {
        '{"DriveLetter":"${letter}","TotalBytes":0,"FreeBytes":0,"MediaType":"Unknown"}'
      }
    `.trim();

    try {
      const { stdout } = await execFileWithTimeout(ps, ['-NoProfile', '-Command', script], { timeout: 3500 });
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const total = Number(parsed.TotalBytes || 0);
        const free = Number(parsed.FreeBytes || 0);
        const used = Math.max(0, total - free);
        const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
        const media = String(parsed.MediaType || 'Unknown').toUpperCase();
        const mediaType = media.includes('SSD') ? 'SSD' : media.includes('HDD') ? 'HDD' : 'Unknown';

        return {
          driveLetter: letter,
          totalBytes: total,
          freeBytes: free,
          usedBytes: used,
          percentUsed,
          mediaType,
          supportsTrim: mediaType === 'SSD',
        };
      }
    } catch (err) {
      console.warn('Failed to get drive status:', err);
    }

    return {
      driveLetter: letter,
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      percentUsed: 0,
      mediaType: 'Unknown',
      supportsTrim: false,
    };
  }

  /**
   * Invokes native Windows TRIM on SSD or optimization on HDD.
   */
  static async optimizeDrive(driveLetter: string = 'C'): Promise<{ success: boolean; message: string }> {
    const letter = driveLetter.toUpperCase().replace(/[^A-Z]/g, '') || 'C';
    const ps = getNativePowerShellPath();
    const driveInfo = await this.getDriveStatus(letter);

    const isSsd = driveInfo.mediaType === 'SSD';
    const command = isSsd
      ? `Optimize-Volume -DriveLetter ${letter} -ReTrim -Verbose`
      : `Optimize-Volume -DriveLetter ${letter} -Defrag -Verbose`;

    try {
      await execFileWithTimeout(ps, ['-NoProfile', '-Command', command], { timeout: 30000 });
      return {
        success: true,
        message: isSsd
          ? `Successfully issued TRIM command to SSD Drive ${letter}:.`
          : `Successfully analyzed and optimized Drive ${letter}:.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || `Failed to optimize Drive ${letter}:.`,
      };
    }
  }
}
