/**
 * PC Tweak - System Optimizer IPC Module
 * 
 * Bridges all native RAM, Disk, Service, Scheduled Task, and CPU optimizer engines to the renderer process.
 */

import { ipcMain } from 'electron';
import { RamOptimizerEngine } from '../engine/ramOptimizerEngine';
import { DiskOptimizerEngine } from '../engine/diskOptimizerEngine';
import { ServiceOptimizerEngine } from '../engine/serviceOptimizerEngine';
import { TaskOptimizerEngine } from '../engine/taskOptimizerEngine';
import { CpuOptimizerEngine } from '../engine/cpuOptimizerEngine';

export function registerOptimizerIpc() {
  // RAM Optimizer
  ipcMain.handle('optimizer:ram:getProcesses', async (_event, limit?: number) => {
    return await RamOptimizerEngine.getTopMemoryProcesses(limit);
  });

  ipcMain.handle('optimizer:ram:trim', async () => {
    return await RamOptimizerEngine.trimWorkingSets();
  });

  ipcMain.handle('optimizer:ram:endProcess', async (_event, pid: number) => {
    return await RamOptimizerEngine.endProcess(pid);
  });

  // Disk Optimizer
  ipcMain.handle('optimizer:disk:scan', async () => {
    return await DiskOptimizerEngine.scanCategories();
  });

  ipcMain.handle('optimizer:disk:clean', async (_event, categoryIds: string[]) => {
    return await DiskOptimizerEngine.cleanCategories(categoryIds);
  });

  ipcMain.handle('optimizer:disk:getDriveStatus', async (_event, driveLetter?: string) => {
    return await DiskOptimizerEngine.getDriveStatus(driveLetter);
  });

  ipcMain.handle('optimizer:disk:optimizeDrive', async (_event, driveLetter?: string) => {
    return await DiskOptimizerEngine.optimizeDrive(driveLetter);
  });

  // Service Optimizer
  ipcMain.handle('optimizer:services:scan', async () => {
    return await ServiceOptimizerEngine.scanServices();
  });

  ipcMain.handle(
    'optimizer:services:setStartup',
    async (_event, serviceName: string, startupType: 'Automatic' | 'Manual' | 'Disabled') => {
      return await ServiceOptimizerEngine.setServiceStartup(serviceName, startupType);
    }
  );

  ipcMain.handle('optimizer:services:deleteOrphaned', async (_event, serviceName: string) => {
    return await ServiceOptimizerEngine.deleteOrphanedService(serviceName);
  });

  // Scheduled Task Optimizer
  ipcMain.handle('optimizer:tasks:scan', async () => {
    return await TaskOptimizerEngine.scanTasks();
  });

  ipcMain.handle(
    'optimizer:tasks:setState',
    async (_event, taskPath: string, taskName: string, enabled: boolean) => {
      return await TaskOptimizerEngine.setTaskState(taskPath, taskName, enabled);
    }
  );

  ipcMain.handle('optimizer:tasks:deleteOrphaned', async (_event, taskPath: string, taskName: string) => {
    return await TaskOptimizerEngine.deleteOrphanedTask(taskPath, taskName);
  });

  // CPU Optimizer
  ipcMain.handle('optimizer:cpu:getPowerPlans', async () => {
    return await CpuOptimizerEngine.getPowerPlans();
  });

  ipcMain.handle('optimizer:cpu:setActivePowerPlan', async (_event, guid: string) => {
    return await CpuOptimizerEngine.setActivePowerPlan(guid);
  });

  ipcMain.handle('optimizer:cpu:unlockUltimate', async () => {
    return await CpuOptimizerEngine.unlockUltimatePerformance();
  });

  ipcMain.handle('optimizer:cpu:getTopProcesses', async (_event, limit?: number) => {
    return await CpuOptimizerEngine.getTopCpuProcesses(limit);
  });

  ipcMain.handle(
    'optimizer:cpu:setPriority',
    async (_event, pid: number, priority: 'Idle' | 'BelowNormal' | 'Normal' | 'AboveNormal' | 'High') => {
      return await CpuOptimizerEngine.setProcessPriority(pid, priority);
    }
  );
}
