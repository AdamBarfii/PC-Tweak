import { ipcMain, BrowserWindow, shell } from 'electron';
import { ChildProcess, spawn, execFile } from 'node:child_process';
import readline from 'node:readline';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { InputProfiler, getRawInputBinaryPath } from '../engine/inputProfiler';
import { RegistryEngine } from '../engine/registry';
import { BenchmarkStore, BaselineSession, PostTweakBenchmark } from '../storage/benchmarkStore';
import { AuditStore } from '../storage/auditStore';
import { InputOptimizerEngine } from '../engine/inputOptimizerEngine';

const execFileAsync = promisify(execFile);

let activeStreamProcess: ChildProcess | null = null;
let lastSpiSnapshot: { speed: number; accel_disabled: boolean } | null = null;

export function registerInputLabIpc() {
  // 1. Device and factors enumeration
  ipcMain.handle('input:getDevices', async () => {
    return await InputProfiler.getConnectedDevices();
  });

  ipcMain.handle('input:getFactors', async () => {
    return await InputProfiler.getSystemInputFactors();
  });

  // 2. Real Raw Input Streaming from Native Rust Helper
  ipcMain.handle('input:startSampling', async (event) => {
    if (activeStreamProcess && !activeStreamProcess.killed) {
      return { success: true, running: true };
    }

    const bin = getRawInputBinaryPath();
    if (!fs.existsSync(bin)) {
      return { success: false, error: 'pctweak-rawinput.exe binary not found' };
    }

    try {
      activeStreamProcess = spawn(bin, ['stream'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const rl = readline.createInterface({
        input: activeStreamProcess.stdout!,
        terminal: false,
      });

      const sender = event.sender;

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const stats = JSON.parse(trimmed);
          if (!sender.isDestroyed()) {
            sender.send('input:stats', stats);
          }
        } catch {}
      });

      activeStreamProcess.on('exit', () => {
        activeStreamProcess = null;
      });

      // Cleanup when sender window closes
      const win = BrowserWindow.fromWebContents(sender);
      if (win) {
        win.once('closed', () => {
          if (activeStreamProcess && !activeStreamProcess.killed) {
            activeStreamProcess.kill();
            activeStreamProcess = null;
          }
        });
      }

      return { success: true, running: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('input:stopSampling', async () => {
    if (activeStreamProcess && !activeStreamProcess.killed) {
      activeStreamProcess.kill();
      activeStreamProcess = null;
    }
    return { success: true };
  });

  // 3. True Win32 NtQueryTimerResolution
  ipcMain.handle('input:getTimerResolution', async () => {
    const bin = getRawInputBinaryPath();
    if (fs.existsSync(bin)) {
      try {
        const { stdout } = await execFileAsync(bin, ['get-timer'], { windowsHide: true });
        return JSON.parse(stdout.trim());
      } catch {}
    }
    return { min_ms: 15.625, max_ms: 0.5, current_ms: 1.0 };
  });

  // 4. True Win32 SystemParametersInfoW Mouse Settings
  ipcMain.handle('input:getMouseSpi', async () => {
    const bin = getRawInputBinaryPath();
    if (fs.existsSync(bin)) {
      try {
        const { stdout } = await execFileAsync(bin, ['get-mouse'], { windowsHide: true });
        return JSON.parse(stdout.trim());
      } catch {}
    }

    // Fallback: read registry
    const sens = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
    const speed = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
    const rawSpeed = typeof sens.value === 'number' ? sens.value : parseInt(sens.value as string, 10) || 10;
    const isAccelOn = speed.value !== 0 && speed.value !== '0';

    return {
      speed: rawSpeed,
      threshold1: isAccelOn ? 6 : 0,
      threshold2: isAccelOn ? 10 : 0,
      accel: isAccelOn ? 1 : 0,
      accel_disabled: !isAccelOn,
    };
  });

  ipcMain.handle(
    'input:setMouseSpi',
    async (_event, payload: { speed: number; accelDisabled: boolean }) => {
      const bin = getRawInputBinaryPath();
      const speed = Math.max(1, Math.min(20, payload.speed));
      const accelArg = payload.accelDisabled ? '0' : '1';

      let prevState: any = null;

      if (fs.existsSync(bin)) {
        try {
          const { stdout } = await execFileAsync(
            bin,
            ['set-mouse', '--speed', speed.toString(), '--accel', accelArg],
            { windowsHide: true }
          );
          const parsed = JSON.parse(stdout.trim());
          if (parsed.previous_state) {
            prevState = parsed.previous_state;
            lastSpiSnapshot = {
              speed: parsed.previous_state.speed,
              accel_disabled: parsed.previous_state.accel_disabled,
            };
          }
        } catch {}
      }

      // Also persist to Registry for boot persistence
      await RegistryEngine.setValue(
        'HKCU',
        'Control Panel\\Mouse',
        'MouseSensitivity',
        'REG_SZ',
        speed.toString()
      );

      if (payload.accelDisabled) {
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
      } else {
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
      }

      // Record to audit log
      AuditStore.record({
        category: 'input',
        action: 'Updated Mouse Settings',
        details: `Pointer Speed: ${Math.round((speed / 10) * 6)}/11, Acceleration: ${
          payload.accelDisabled ? 'Disabled (1:1)' : 'Enabled'
        }`,
        reversible: true,
      });

      return { success: true, previous_state: prevState };
    }
  );

  ipcMain.handle('input:undoMouseSpi', async () => {
    if (!lastSpiSnapshot) {
      return { success: false, error: 'No previous mouse state stored for undo' };
    }

    const bin = getRawInputBinaryPath();
    const speed = lastSpiSnapshot.speed;
    const accelArg = lastSpiSnapshot.accel_disabled ? '0' : '1';

    if (fs.existsSync(bin)) {
      try {
        await execFileAsync(
          bin,
          ['set-mouse', '--speed', speed.toString(), '--accel', accelArg],
          { windowsHide: true }
        );
      } catch {}
    }

    await RegistryEngine.setValue(
      'HKCU',
      'Control Panel\\Mouse',
      'MouseSensitivity',
      'REG_SZ',
      speed.toString()
    );

    AuditStore.record({
      category: 'input',
      action: 'Reverted Mouse Settings',
      details: `Restored Pointer Speed: ${Math.round((speed / 10) * 6)}/11, Acceleration: ${
        lastSpiSnapshot.accel_disabled ? 'Disabled' : 'Enabled'
      }`,
      reversible: false,
    });

    const restored = { ...lastSpiSnapshot };
    lastSpiSnapshot = null;
    return { success: true, restored };
  });

  // 5. Classic mouse settings endpoint (maintained for existing consumers)
  ipcMain.handle('input:getMouseSettings', async () => {
    const sens = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSensitivity');
    const speed = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed');
    const scroll = await RegistryEngine.getValue('HKCU', 'Control Panel\\Desktop', 'WheelScrollLines');
    const dblClick = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'DoubleClickSpeed');
    const trails = await RegistryEngine.getValue('HKCU', 'Control Panel\\Mouse', 'MouseTrails');

    const rawSens =
      typeof sens.value === 'number' ? sens.value : parseInt(sens.value as string, 10) || 10;
    const pointerSpeed = Math.max(1, Math.min(11, Math.round((rawSens / 10) * 6)));
    const isPrecisionOn = speed.value !== 0 && speed.value !== '0';

    return {
      pointerSpeed: pointerSpeed || 6,
      pointerPrecision: isPrecisionOn,
      scrollSpeed: parseInt(scroll.value as string, 10) || 3,
      doubleClickSpeed: parseInt(dblClick.value as string, 10) || 550,
      disableTrails: trails.value === '0' || trails.value === 0,
      disableAcceleration: !isPrecisionOn,
    };
  });

  ipcMain.handle('input:saveMouseSettings', async (_event, settings: any) => {
    if (settings.pointerSpeed !== undefined) {
      const speed = Math.max(1, Math.min(20, Math.round((settings.pointerSpeed / 6) * 10)));
      await RegistryEngine.setValue(
        'HKCU',
        'Control Panel\\Mouse',
        'MouseSensitivity',
        'REG_SZ',
        speed.toString()
      );
    }

    if (settings.disableAcceleration !== undefined) {
      if (settings.disableAcceleration) {
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
      } else {
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '1');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
        await RegistryEngine.setValue('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
      }
    }

    if (settings.scrollSpeed !== undefined) {
      await RegistryEngine.setValue(
        'HKCU',
        'Control Panel\\Desktop',
        'WheelScrollLines',
        'REG_SZ',
        settings.scrollSpeed.toString()
      );
    }

    if (settings.doubleClickSpeed !== undefined) {
      await RegistryEngine.setValue(
        'HKCU',
        'Control Panel\\Mouse',
        'DoubleClickSpeed',
        'REG_SZ',
        settings.doubleClickSpeed.toString()
      );
    }

    if (settings.disableTrails !== undefined) {
      await RegistryEngine.setValue(
        'HKCU',
        'Control Panel\\Mouse',
        'MouseTrails',
        'REG_SZ',
        settings.disableTrails ? '0' : '2'
      );
    }

    return { success: true };
  });

  // 6. Benchmark 3-Run Baseline & Post-Tweak Persistence
  ipcMain.handle('input:saveBaseline', async (_event, session: BaselineSession) => {
    BenchmarkStore.saveBaseline(session);
    AuditStore.record({
      category: 'input',
      action: 'Completed 3-Run Baseline Benchmark',
      details: `Avg Hz: ${session.avgPollingHz}Hz, Avg Jitter: ${session.avgJitterMs.toFixed(3)}ms, Noise Spread: ±${session.jitterSpreadMs.toFixed(3)}ms`,
      reversible: false,
    });
    return { success: true };
  });

  ipcMain.handle('input:getBaseline', async () => {
    return BenchmarkStore.getLatestBaseline();
  });

  ipcMain.handle('input:savePostTweak', async (_event, result: PostTweakBenchmark) => {
    BenchmarkStore.savePostTweak(result);
    AuditStore.record({
      category: 'input',
      action: `Post-Tweak Benchmark: ${result.tweakName}`,
      details: result.status === 'improved'
        ? `Improvement: +${result.improvementPercent.toFixed(1)}% (Delta exceeds 2x noise spread)`
        : `No measurable change (Delta ${result.deltaJitterMs.toFixed(3)}ms within noise spread of 2x ±${result.noiseSpreadMs.toFixed(3)}ms)`,
      reversible: true,
    });
    return { success: true };
  });

  ipcMain.handle('input:getPostTweak', async () => {
    return BenchmarkStore.getLatestPostTweak();
  });

  // 7. Audit Log Endpoints
  ipcMain.handle('audit:list', async (_event, limit?: number) => {
    return AuditStore.listAudit(limit || 30);
  });

  ipcMain.handle('audit:record', async (_event, entry: any) => {
    return AuditStore.record(entry);
  });

  // 8. Single-Page Input Lag Optimizer Endpoints
  ipcMain.handle('input:getOptimizerState', async () => {
    return await InputOptimizerEngine.getFullState();
  });

  ipcMain.handle('input:applyOptimizerTweak', async (_event, tweakId: string) => {
    return await InputOptimizerEngine.applyTweak(tweakId);
  });

  ipcMain.handle('input:revertOptimizerTweak', async (_event, tweakId: string) => {
    return await InputOptimizerEngine.revertTweak(tweakId);
  });

  ipcMain.handle('input:undoAllOptimizer', async () => {
    return await InputOptimizerEngine.undoAll();
  });

  ipcMain.handle('input:resetOptimizerDefaults', async () => {
    return await InputOptimizerEngine.resetEverythingToDefaults();
  });

  ipcMain.handle('input:runSilentHealthCheck', async () => {
    return await InputOptimizerEngine.runSilentHealthCheck();
  });

  ipcMain.handle('input:openDisplaySettings', async () => {
    try {
      await shell.openExternal('ms-settings:display');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });
}
