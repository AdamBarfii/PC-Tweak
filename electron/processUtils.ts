import path from 'node:path';
import fs from 'node:fs';
import { exec, execFile, ChildProcess } from 'node:child_process';

/**
 * Returns the 64-bit native PowerShell executable path.
 * If running inside a 32-bit Node/SysWOW64 process on 64-bit Windows,
 * routes through the virtual 'Sysnative' folder to invoke native 64-bit PowerShell
 * to prevent 32-bit CIM/WMI hang and child process multiplication.
 */
export function getNativePowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  if (process.arch === 'ia32' && process.env.PROCESSOR_ARCHITEW6432) {
    const sysnative = path.join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(sysnative)) return sysnative;
  }
  const system32 = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (fs.existsSync(system32)) return system32;
  return 'powershell.exe';
}

/**
 * Forcibly terminates a Windows process and its entire child process tree.
 * Standard child.kill() leaves orphan WMI/CIM/PowerShell child processes alive.
 */
export function killProcessTree(pid: number | undefined): void {
  if (!pid || pid <= 0) return;
  try {
    exec(`taskkill /F /T /PID ${pid}`, { windowsHide: true });
  } catch {}
}

/**
 * Executes an executable with an enforced timeout and automatic process tree termination.
 */
export function execFileWithTimeout(
  file: string,
  args: string[],
  options: { timeout?: number; windowsHide?: boolean; maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = options.timeout ?? 2500;
  return new Promise((resolve, reject) => {
    let child: ChildProcess | null = null;
    let timer: NodeJS.Timeout | null = null;

    child = execFile(
      file,
      args,
      {
        windowsHide: options.windowsHide ?? true,
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 2,
      },
      (err, stdout, stderr) => {
        if (timer) clearTimeout(timer);
        if (err) {
          return reject(err);
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    );

    timer = setTimeout(() => {
      if (child && child.pid) {
        killProcessTree(child.pid);
      }
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${file} ${args.join(' ')}`));
    }, timeoutMs);
  });
}
