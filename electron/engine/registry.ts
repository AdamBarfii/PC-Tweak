import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RegistryValueType = 'REG_DWORD' | 'REG_SZ' | 'REG_QWORD' | 'REG_BINARY';

export interface RegistryQueryResponse {
  exists: boolean;
  value?: string | number;
  type?: RegistryValueType;
}

/**
 * 64-bit Registry Engine enforcing direct reg.exe calls with /reg:64
 * to bypass WOW64 redirection without spawning intermediate cmd.exe shells.
 */
export class RegistryEngine {
  /**
   * Reads a registry value directly via reg.exe.
   */
  static async getValue(
    hive: 'HKLM' | 'HKCU',
    keyPath: string,
    valueName: string
  ): Promise<RegistryQueryResponse> {
    const fullPath = `${hive}\\${keyPath}`;

    try {
      const { stdout } = await execFileAsync(
        'reg.exe',
        ['query', fullPath, '/v', valueName, '/reg:64'],
        { timeout: 3000, windowsHide: true }
      );

      // Output format:
      //     AllowCortana    REG_DWORD    0x0
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(valueName)) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 3) {
            const type = parts[1] as RegistryValueType;
            const rawVal = parts.slice(2).join(' ');

            let parsedVal: string | number = rawVal;
            if (type === 'REG_DWORD' || type === 'REG_QWORD') {
              parsedVal = parseInt(rawVal, 16);
            }
            return { exists: true, value: parsedVal, type };
          }
        }
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Writes/sets a registry value directly via reg.exe without cmd.exe.
   */
  static async setValue(
    hive: 'HKLM' | 'HKCU',
    keyPath: string,
    valueName: string,
    valueType: RegistryValueType,
    value: string | number
  ): Promise<boolean> {
    const fullPath = `${hive}\\${keyPath}`;
    let formattedVal = value.toString();

    if (valueType === 'REG_DWORD' || valueType === 'REG_QWORD') {
      formattedVal = typeof value === 'number' ? value.toString() : parseInt(value, 10).toString();
    }

    try {
      await execFileAsync(
        'reg.exe',
        ['add', fullPath, '/v', valueName, '/t', valueType, '/d', formattedVal, '/f', '/reg:64'],
        { timeout: 3000, windowsHide: true }
      );
      return true;
    } catch (err) {
      console.error(`Failed to set registry key: reg.exe add ${fullPath} /v ${valueName}`, err);
      return false;
    }
  }

  /**
   * Deletes a registry value directly via reg.exe.
   */
  static async deleteValue(
    hive: 'HKLM' | 'HKCU',
    keyPath: string,
    valueName: string
  ): Promise<boolean> {
    const fullPath = `${hive}\\${keyPath}`;

    try {
      await execFileAsync(
        'reg.exe',
        ['delete', fullPath, '/v', valueName, '/f', '/reg:64'],
        { timeout: 3000, windowsHide: true }
      );
      return true;
    } catch {
      return false;
    }
  }
}
