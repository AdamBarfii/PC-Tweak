/**
 * PC Tweak - High-Polling Input Queue Depth Engine
 *
 * Implements:
 * 1. MouseDataQueueSize Management (mouclass): 100 (Default) | 128 (1000Hz) | 200/256 (4000Hz/8000Hz)
 *    Prevents buffer dropouts and skipped mouse packets on high polling rate esports mice
 * 2. KeyboardDataQueueSize Management (kbdclass): 100 (Default) | 128 (Competitive) | 256 (High-Rate)
 * 3. Pre-modification snapshot capture and atomic rollback
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface InputQueueStatus {
  mouseQueueSize: number; // default 100
  keyboardQueueSize: number; // default 100
  isMouseOptimized: boolean; // >= 128
  isKeyboardOptimized: boolean; // >= 128
}

export interface InputQueueSnapshot {
  originalMouseQueueSize: number | null;
  originalKeyboardQueueSize: number | null;
  timestamp: string;
}

function getStoragePath(): string {
  const userDataDir = app ? app.getPath('userData') : process.cwd();
  const dir = path.join(userDataDir, 'storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'inputQueueSnapshot.json');
}

function loadSnapshot(): InputQueueSnapshot | null {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load Input Queue snapshot:', err);
  }
  return null;
}

function saveSnapshot(snapshot: InputQueueSnapshot): void {
  try {
    fs.writeFileSync(getStoragePath(), JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save Input Queue snapshot:', err);
  }
}

export async function getInputQueueStatus(): Promise<InputQueueStatus> {
  let mouseQueueSize = 100;
  let keyboardQueueSize = 100;

  // 1. Query mouclass\Parameters
  try {
    const { stdout: mouseOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
      '/v',
      'MouseDataQueueSize',
    ]);
    const mMatch = mouseOut.match(/MouseDataQueueSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (mMatch) {
      mouseQueueSize = parseInt(mMatch[1], 16);
    }
  } catch {
    mouseQueueSize = 100;
  }

  // 2. Query kbdclass\Parameters
  try {
    const { stdout: kbdOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
      '/v',
      'KeyboardDataQueueSize',
    ]);
    const kMatch = kbdOut.match(/KeyboardDataQueueSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (kMatch) {
      keyboardQueueSize = parseInt(kMatch[1], 16);
    }
  } catch {
    keyboardQueueSize = 100;
  }

  return {
    mouseQueueSize,
    keyboardQueueSize,
    isMouseOptimized: mouseQueueSize >= 128,
    isKeyboardOptimized: keyboardQueueSize >= 128,
  };
}

async function captureSnapshotBeforeEdit(): Promise<void> {
  const existing = loadSnapshot();
  if (existing) return; // Keep initial baseline

  let originalMouse: number | null = null;
  let originalKbd: number | null = null;

  try {
    const { stdout: mouseOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
      '/v',
      'MouseDataQueueSize',
    ]);
    const mMatch = mouseOut.match(/MouseDataQueueSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (mMatch) originalMouse = parseInt(mMatch[1], 16);
  } catch {}

  try {
    const { stdout: kbdOut } = await execFileAsync('reg', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
      '/v',
      'KeyboardDataQueueSize',
    ]);
    const kMatch = kbdOut.match(/KeyboardDataQueueSize\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i);
    if (kMatch) originalKbd = parseInt(kMatch[1], 16);
  } catch {}

  saveSnapshot({
    originalMouseQueueSize: originalMouse,
    originalKeyboardQueueSize: originalKbd,
    timestamp: new Date().toISOString(),
  });
}

export async function setMouseQueueSize(size: number): Promise<{ success: boolean; message: string }> {
  try {
    // Validate bounds: between 50 and 512
    const safeSize = Math.max(50, Math.min(512, Math.round(size)));
    await captureSnapshotBeforeEdit();

    await execFileAsync('reg', [
      'add',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
      '/v',
      'MouseDataQueueSize',
      '/t',
      'REG_DWORD',
      '/d',
      String(safeSize),
      '/f',
    ]);

    return {
      success: true,
      message: `Mouse buffer queue depth set to ${safeSize} packets (${
        safeSize >= 256 ? 'High-Rate 4K/8K' : safeSize >= 128 ? 'Esports 1000Hz' : 'Default'
      }). Reboot recommended to take full effect.`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update MouseDataQueueSize. Run as Administrator.' };
  }
}

export async function setKeyboardQueueSize(size: number): Promise<{ success: boolean; message: string }> {
  try {
    // Validate bounds: between 50 and 512
    const safeSize = Math.max(50, Math.min(512, Math.round(size)));
    await captureSnapshotBeforeEdit();

    await execFileAsync('reg', [
      'add',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
      '/v',
      'KeyboardDataQueueSize',
      '/t',
      'REG_DWORD',
      '/d',
      String(safeSize),
      '/f',
    ]);

    return {
      success: true,
      message: `Keyboard buffer queue depth set to ${safeSize} packets. Reboot recommended to take full effect.`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to update KeyboardDataQueueSize. Run as Administrator.' };
  }
}

export async function revertInputQueue(): Promise<{ success: boolean; message: string }> {
  try {
    const snapshot = loadSnapshot();
    const mouseTarget = snapshot?.originalMouseQueueSize ?? 100;
    const kbdTarget = snapshot?.originalKeyboardQueueSize ?? 100;

    await execFileAsync('reg', [
      'add',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters',
      '/v',
      'MouseDataQueueSize',
      '/t',
      'REG_DWORD',
      '/d',
      String(mouseTarget),
      '/f',
    ]);

    await execFileAsync('reg', [
      'add',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters',
      '/v',
      'KeyboardDataQueueSize',
      '/t',
      'REG_DWORD',
      '/d',
      String(kbdTarget),
      '/f',
    ]);

    return { success: true, message: 'Mouse and Keyboard buffer depths restored to baseline.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to revert input queue sizes' };
  }
}
