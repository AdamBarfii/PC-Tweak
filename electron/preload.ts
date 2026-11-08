import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onNavigate: (callback: (tab: string) => void) => {
    const subscription = (_event: any, tab: string) => callback(tab);
    ipcRenderer.on('nav:navigate', subscription);
    return () => {
      ipcRenderer.removeListener('nav:navigate', subscription);
    };
  },

  // System telemetry
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
  getSystemMetrics: () => ipcRenderer.invoke('system:getMetrics'),
  requestElevation: () => ipcRenderer.invoke('system:requestElevation'),

  // Tweaks
  getTweaksList: (category?: string) => ipcRenderer.invoke('tweaks:list', category),
  applyTweak: (tweakId: string) => ipcRenderer.invoke('tweaks:apply', tweakId),
  revertTweak: (tweakId: string) => ipcRenderer.invoke('tweaks:revert', tweakId),
  batchApplyTweaks: (tweakIds: string[], createRestorePoint: boolean) =>
    ipcRenderer.invoke('tweaks:batchApply', tweakIds, createRestorePoint),

  // Backups & System Restore
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (backupId: string) => ipcRenderer.invoke('backup:restore', backupId),
  deleteBackup: (backupId: string) => ipcRenderer.invoke('backup:delete', backupId),
  isRestorePointAvailable: () => ipcRenderer.invoke('restorePoint:isAvailable'),
  enableRestorePoint: () => ipcRenderer.invoke('restorePoint:enable'),
  createRestorePoint: (description: string) => ipcRenderer.invoke('restorePoint:create', description),
  listRestorePoints: () => ipcRenderer.invoke('restorePoint:list'),

  // Input Lab & Real Native Raw Input Stream
  getInputDevices: () => ipcRenderer.invoke('input:getDevices'),
  getInputFactors: () => ipcRenderer.invoke('input:getFactors'),
  getMouseSettings: () => ipcRenderer.invoke('input:getMouseSettings'),
  saveMouseSettings: (settings: any) => ipcRenderer.invoke('input:saveMouseSettings', settings),
  startInputSampling: () => ipcRenderer.invoke('input:startSampling'),
  stopInputSampling: () => ipcRenderer.invoke('input:stopSampling'),
  getTimerResolution: () => ipcRenderer.invoke('input:getTimerResolution'),
  getMouseSpi: () => ipcRenderer.invoke('input:getMouseSpi'),
  setMouseSpi: (payload: { speed: number; accelDisabled: boolean }) =>
    ipcRenderer.invoke('input:setMouseSpi', payload),
  undoMouseSpi: () => ipcRenderer.invoke('input:undoMouseSpi'),
  saveBaseline: (session: any) => ipcRenderer.invoke('input:saveBaseline', session),
  getBaseline: () => ipcRenderer.invoke('input:getBaseline'),
  savePostTweak: (result: any) => ipcRenderer.invoke('input:savePostTweak', result),
  getPostTweak: () => ipcRenderer.invoke('input:getPostTweak'),
  listAudit: (limit?: number) => ipcRenderer.invoke('audit:list', limit),
  recordAudit: (record: any) => ipcRenderer.invoke('audit:record', record),

  // Input Lag Optimizer Single-Page API
  getOptimizerState: () => ipcRenderer.invoke('input:getOptimizerState'),
  applyOptimizerTweak: (tweakId: string) => ipcRenderer.invoke('input:applyOptimizerTweak', tweakId),
  revertOptimizerTweak: (tweakId: string) => ipcRenderer.invoke('input:revertOptimizerTweak', tweakId),
  undoAllOptimizer: () => ipcRenderer.invoke('input:undoAllOptimizer'),
  resetOptimizerDefaults: () => ipcRenderer.invoke('input:resetOptimizerDefaults'),
  runSilentHealthCheck: () => ipcRenderer.invoke('input:runSilentHealthCheck'),
  openDisplaySettings: () => ipcRenderer.invoke('input:openDisplaySettings'),

  onInputStats: (callback: (stats: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('input:stats', subscription);
    return () => {
      ipcRenderer.removeListener('input:stats', subscription);
    };
  },

  // Gaming & Power Module API
  getGamingState: () => ipcRenderer.invoke('gaming:getFullState'),
  setActivePowerPlan: (guid: string) => ipcRenderer.invoke('gaming:setActivePowerPlan', guid),
  createCustomGamingPlan: () => ipcRenderer.invoke('gaming:createCustomGamingPlan'),
  applyGamingTweak: (tweakId: string) => ipcRenderer.invoke('gaming:applyTweak', tweakId),
  revertGamingTweak: (tweakId: string) => ipcRenderer.invoke('gaming:revertTweak', tweakId),
  undoAllGaming: () => ipcRenderer.invoke('gaming:undoAll'),
  resetGamingDefaults: () => ipcRenderer.invoke('gaming:resetDefaults'),
  openPanicRecoveryFolder: () => ipcRenderer.invoke('gaming:openPanicRecoveryFolder'),
  runBottleneckAudit: () => ipcRenderer.invoke('gaming:runBottleneckAudit'),
  fixBottleneck: (actionId: string) => ipcRenderer.invoke('gaming:fixBottleneck', actionId),
  scanInstalledGames: () => ipcRenderer.invoke('gaming:scanGames'),
  setGameSetting: (payload: {
    exePath: string;
    exeName: string;
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority';
    enabled: boolean;
  }) => ipcRenderer.invoke('gaming:setGameSetting', payload),
  addCustomGame: (exePath: string) => ipcRenderer.invoke('gaming:addCustomGame', exePath),
  browseGameExe: () => ipcRenderer.invoke('gaming:browseExe'),
  getGameSessionStatus: () => ipcRenderer.invoke('gaming:getSessionStatus'),
  updateGameSessionConfig: (config: any) => ipcRenderer.invoke('gaming:updateSessionConfig', config),
  triggerGameSession: (gameName: string) => ipcRenderer.invoke('gaming:triggerSession', gameName),
  endGameSession: () => ipcRenderer.invoke('gaming:endSession'),

  // Network Module API
  getNetworkOverview: () => ipcRenderer.invoke('network:getOverview'),
  undoAllNetwork: (adapterName?: string) => ipcRenderer.invoke('network:undoAll', adapterName),
  confirmNetworkChanges: () => ipcRenderer.invoke('network:confirmChanges'),
  getWatchdogState: () => ipcRenderer.invoke('network:getWatchdogState'),
  onWatchdogTick: (callback: (data: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:watchdogTick', subscription);
    return () => {
      ipcRenderer.removeListener('network:watchdogTick', subscription);
    };
  },
  onWatchdogConfirmed: (callback: (data: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:watchdogConfirmed', subscription);
    return () => {
      ipcRenderer.removeListener('network:watchdogConfirmed', subscription);
    };
  },
  onWatchdogReverted: (callback: (data: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:watchdogReverted', subscription);
    return () => {
      ipcRenderer.removeListener('network:watchdogReverted', subscription);
    };
  },
  startNetworkTest: (payload: { targets: any[]; durationSeconds: number }) =>
    ipcRenderer.invoke('network:startTest', payload),
  stopNetworkTest: () => ipcRenderer.invoke('network:stopTest'),
  runNetworkBaseline: (target: any) => ipcRenderer.invoke('network:runBaseline', target),
  compareNetworkDelta: (payload: { summary: any; baseline: any }) =>
    ipcRenderer.invoke('network:compareDelta', payload),
  onNetworkTestSample: (callback: (sample: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:testSample', subscription);
    return () => {
      ipcRenderer.removeListener('network:testSample', subscription);
    };
  },

  // Gaming Server Radar API
  getGameServers: () => ipcRenderer.invoke('network:getGameServers'),
  benchmarkGameServers: (gameIdFilter?: string) =>
    ipcRenderer.invoke('network:benchmarkGameServers', gameIdFilter),
  onGameServerBenchmarkProgress: (callback: (result: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:gameServerBenchmarkProgress', subscription);
    return () => {
      ipcRenderer.removeListener('network:gameServerBenchmarkProgress', subscription);
    };
  },
  monitorGameServer: (payload: { serverId: string; durationSeconds?: number }) =>
    ipcRenderer.invoke('network:monitorGameServer', payload),
  onGameServerMonitorSample: (callback: (sample: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('network:gameServerMonitorSample', subscription);
    return () => {
      ipcRenderer.removeListener('network:gameServerMonitorSample', subscription);
    };
  },
  optimizeGameRoute: (payload: { gameId: string; serverId: string; adapterName?: string }) =>
    ipcRenderer.invoke('network:optimizeGameRoute', payload),

  // DNS Manager API
  getCurrentDns: (adapterName: string) => ipcRenderer.invoke('network:getCurrentDns', adapterName),
  listDnsPresets: () => ipcRenderer.invoke('network:listDnsPresets'),
  saveDnsPreset: (payload: any) => ipcRenderer.invoke('network:saveDnsPreset', payload),
  deleteDnsPreset: (id: string) => ipcRenderer.invoke('network:deleteDnsPreset', id),
  applyDns: (payload: any) => ipcRenderer.invoke('network:applyDns', payload),
  resetDnsToDhcp: (adapterName: string) => ipcRenderer.invoke('network:resetDnsToDhcp', adapterName),
  revertDns: (adapterName: string) => ipcRenderer.invoke('network:revertDns', adapterName),
  flushDnsCache: () => ipcRenderer.invoke('network:flushDnsCache'),
  benchmarkDns: (payload: any) => ipcRenderer.invoke('network:benchmarkDns', payload),

  // Adapter Tweaks & Wi-Fi API
  getAdapterDetails: (adapterName: string) => ipcRenderer.invoke('network:getAdapterDetails', adapterName),
  getWifiDetails: () => ipcRenderer.invoke('network:getWifiDetails'),
  applyAdapterTweak: (payload: any) => ipcRenderer.invoke('network:applyAdapterTweak', payload),
  revertAdapterTweak: (payload: any) => ipcRenderer.invoke('network:revertAdapterTweak', payload),

  // Network Repair & Safety API
  executeNetworkRepair: (payload: { actionId: string; adapterName?: string }) =>
    ipcRenderer.invoke('network:executeRepair', payload),
  resetAllNetworkDefaults: (adapterName?: string) =>
    ipcRenderer.invoke('network:resetAllDefaults', adapterName),
  openNetworkRecoveryFolder: () => ipcRenderer.invoke('network:openRecoveryFolder'),

  // Advanced & Experimental Network API
  getAdvancedNetworkState: (adapterName: string) =>
    ipcRenderer.invoke('network:getAdvancedState', adapterName),
  applyAdvancedNetworkTweak: (payload: any) =>
    ipcRenderer.invoke('network:applyAdvancedTweak', payload),
  revertAdvancedNetworkTweak: (payload: any) =>
    ipcRenderer.invoke('network:revertAdvancedTweak', payload),
  detectOptimalMtu: (targetHost?: string) =>
    ipcRenderer.invoke('network:detectOptimalMtu', targetHost),
  setNetworkMtu: (payload: { adapterName: string; mtu: number }) =>
    ipcRenderer.invoke('network:setMtu', payload),

  // Anti-Cheat Safety Suite
  getAntiCheatStatus: (forceRefresh?: boolean) => ipcRenderer.invoke('anticheat:getStatus', forceRefresh),
  setCompetitiveSafeMode: (enabled: boolean) => ipcRenderer.invoke('anticheat:setCompetitiveSafeMode', enabled),
  applyCompetitiveSafePreset: () => ipcRenderer.invoke('anticheat:applyPreset'),
  getAntiCheatRequirements: () => ipcRenderer.invoke('anticheat:getRequirements'),
  updateAntiCheatRequirement: (req: any) => ipcRenderer.invoke('anticheat:updateRequirement', req),

  // Profiles Suite
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile: any) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('profiles:delete', profileId),
  applyProfile: (profile: any) => ipcRenderer.invoke('profiles:apply', profile),
  exportProfile: (profile: any) => ipcRenderer.invoke('profiles:export', profile),
  importProfile: () => ipcRenderer.invoke('profiles:import'),
  importProfileFromJson: (jsonContent: string) => ipcRenderer.invoke('profiles:importJson', jsonContent),

  // Settings & Preferences API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: any) => ipcRenderer.invoke('settings:set', partial),
  updateSettings: (partial: any) => ipcRenderer.invoke('settings:set', partial),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  resetAppData: () => ipcRenderer.invoke('settings:resetAppData'),

  // Advanced checks & cleanups
  checkConflicts: () => ipcRenderer.invoke('system:checkConflicts'),
  removeUsePlatformClock: () => ipcRenderer.invoke('system:removeUsePlatformClock'),

  // Diagnostics & Benchmarks Suite
  getDpcIsrReport: () => ipcRenderer.invoke('diagnostics:getDpcIsrReport'),
  getBootBreakdown: () => ipcRenderer.invoke('diagnostics:getBootBreakdown'),
  getHostsReport: () => ipcRenderer.invoke('hosts:getReport'),
  restoreDefaultHosts: () => ipcRenderer.invoke('hosts:restoreDefault'),

  // In-Game HUD & Overlay API
  getOverlayConfig: () => ipcRenderer.invoke('overlay:getConfig'),
  saveOverlayConfig: (config: any) => ipcRenderer.invoke('overlay:saveConfig', config),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  onOverlayTelemetry: (callback: (telemetry: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('overlay:telemetry', subscription);
    return () => {
      ipcRenderer.removeListener('overlay:telemetry', subscription);
    };
  },
  onOverlayConfigUpdate: (callback: (config: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('overlay:configUpdate', subscription);
    return () => {
      ipcRenderer.removeListener('overlay:configUpdate', subscription);
    };
  },

  // FPS Esports & Shooter Optimizer API
  getCpuTopology: (forceRefresh?: boolean) => ipcRenderer.invoke('fps:getCpuTopology', forceRefresh),
  getRunningProcesses: () => ipcRenderer.invoke('fps:getRunningProcesses'),
  getFpsGameProfiles: () => ipcRenderer.invoke('fps:getGameProfiles'),
  applyFpsGameTweak: (exeName: string, tweakType: string, enable: boolean, customMaskHex?: string) =>
    ipcRenderer.invoke('fps:applyGameTweak', exeName, tweakType, enable, customMaskHex),
  optimizeAllForFpsGame: (exeName: string, customMaskHex?: string) =>
    ipcRenderer.invoke('fps:optimizeAll', exeName, customMaskHex),
  revertFpsGame: (exeName: string) => ipcRenderer.invoke('fps:revertGame', exeName),

  // GPU Pipeline & Hardware MSI Interrupts API
  getGpuDevices: () => ipcRenderer.invoke('gpuPipeline:getDevices'),
  setGpuMsi: (instanceId: string, enableMsi: boolean, priority: number) =>
    ipcRenderer.invoke('gpuPipeline:setMsi', instanceId, enableMsi, priority),
  revertGpuMsi: (instanceId: string) => ipcRenderer.invoke('gpuPipeline:revertMsi', instanceId),

  // DirectX Low-Latency Presentation Engine API
  getDirectXPresentationStatus: () => ipcRenderer.invoke('directX:getStatus'),
  setMaxFrameLatency: (enabled: boolean) => ipcRenderer.invoke('directX:setMaxFrameLatency', enabled),
  setFlipModelUpgrade: (enabled: boolean) => ipcRenderer.invoke('directX:setFlipModel', enabled),
  setTdrDelay: (extended: boolean) => ipcRenderer.invoke('directX:setTdrDelay', extended),
  setShaderCacheBoost: (boosted: boolean) => ipcRenderer.invoke('directX:setShaderCacheBoost', boosted),
  applyCompetitiveDirectXPreset: () => ipcRenderer.invoke('directX:applyCompetitivePreset'),
  revertDirectXPresentation: () => ipcRenderer.invoke('directX:revert'),

  // High-Polling Input Queue Depth API
  getInputQueueStatus: () => ipcRenderer.invoke('inputQueue:getStatus'),
  setMouseQueueSize: (size: number) => ipcRenderer.invoke('inputQueue:setMouseQueue', size),
  setKeyboardQueueSize: (size: number) => ipcRenderer.invoke('inputQueue:setKeyboardQueue', size),
  revertInputQueue: () => ipcRenderer.invoke('inputQueue:revert'),

  // System Optimizer (RAM, Disk, Services, Tasks, CPU) API
  optimizerGetRamProcesses: (limit?: number) => ipcRenderer.invoke('optimizer:ram:getProcesses', limit),
  optimizerTrimRam: () => ipcRenderer.invoke('optimizer:ram:trim'),
  optimizerEndProcess: (pid: number) => ipcRenderer.invoke('optimizer:ram:endProcess', pid),
  optimizerScanDisk: () => ipcRenderer.invoke('optimizer:disk:scan'),
  optimizerCleanDisk: (categoryIds: string[]) => ipcRenderer.invoke('optimizer:disk:clean', categoryIds),
  optimizerGetDriveStatus: (driveLetter?: string) => ipcRenderer.invoke('optimizer:disk:getDriveStatus', driveLetter),
  optimizerOptimizeDrive: (driveLetter?: string) => ipcRenderer.invoke('optimizer:disk:optimizeDrive', driveLetter),
  optimizerScanServices: () => ipcRenderer.invoke('optimizer:services:scan'),
  optimizerSetServiceStartup: (serviceName: string, startupType: string) =>
    ipcRenderer.invoke('optimizer:services:setStartup', serviceName, startupType),
  optimizerDeleteOrphanedService: (serviceName: string) =>
    ipcRenderer.invoke('optimizer:services:deleteOrphaned', serviceName),
  optimizerScanTasks: () => ipcRenderer.invoke('optimizer:tasks:scan'),
  optimizerSetTaskState: (taskPath: string, taskName: string, enabled: boolean) =>
    ipcRenderer.invoke('optimizer:tasks:setState', taskPath, taskName, enabled),
  optimizerDeleteOrphanedTask: (taskPath: string, taskName: string) =>
    ipcRenderer.invoke('optimizer:tasks:deleteOrphaned', taskPath, taskName),
  optimizerGetPowerPlans: () => ipcRenderer.invoke('optimizer:cpu:getPowerPlans'),
  optimizerSetActivePowerPlan: (guid: string) => ipcRenderer.invoke('optimizer:cpu:setActivePowerPlan', guid),
  optimizerUnlockUltimatePower: () => ipcRenderer.invoke('optimizer:cpu:unlockUltimate'),
  optimizerGetCpuProcesses: (limit?: number) => ipcRenderer.invoke('optimizer:cpu:getTopProcesses', limit),
  optimizerSetProcessPriority: (pid: number, priority: string) =>
    ipcRenderer.invoke('optimizer:cpu:setPriority', pid, priority),

  // Automation & Smart Suggestions API
  getAutomationConfig: () => ipcRenderer.invoke('automation:getConfig'),
  updateAutomationConfig: (partial: any) => ipcRenderer.invoke('automation:updateConfig', partial),
  getAutomationLogs: (limit?: number) => ipcRenderer.invoke('automation:getLogs', limit),
  clearAutomationLogs: () => ipcRenderer.invoke('automation:clearLogs'),
  getSmartSuggestions: () => ipcRenderer.invoke('suggestions:get'),
  applySmartSuggestion: (id: string) => ipcRenderer.invoke('suggestions:apply', id),
  applyAllSmartSuggestions: () => ipcRenderer.invoke('suggestions:applyAll'),
  dismissSmartSuggestion: (id: string) => ipcRenderer.invoke('suggestions:dismiss', id),

  // Safe Overclocking & Performance Analytics Suite
  overclockGetCapabilities: () => ipcRenderer.invoke('overclock:getCapabilities'),
  overclockGetTelemetry: () => ipcRenderer.invoke('overclock:getTelemetry'),
  overclockApplyOffset: (payload: any) => ipcRenderer.invoke('overclock:applyOffset', payload),
  overclockRevertStock: () => ipcRenderer.invoke('overclock:revertStock'),
  overclockStartAutoScan: () => ipcRenderer.invoke('overclock:startAutoScan'),
  overclockStopAutoScan: () => ipcRenderer.invoke('overclock:stopAutoScan'),
  overclockGetAnalytics: () => ipcRenderer.invoke('overclock:getAnalytics'),
  overclockListProfiles: () => ipcRenderer.invoke('overclock:listProfiles'),
  overclockSaveProfile: (profile: any) => ipcRenderer.invoke('overclock:saveProfile', profile),
  onOverclockTelemetry: (callback: (telemetry: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('overclock:telemetry', subscription);
    return () => {
      ipcRenderer.removeListener('overclock:telemetry', subscription);
    };
  },
  onOverclockAutoScanStep: (callback: (step: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('overclock:scanStep', subscription);
    return () => {
      ipcRenderer.removeListener('overclock:scanStep', subscription);
    };
  },

  // Metrics event stream
  onMetricsUpdate: (callback: (metrics: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('metrics:update', subscription);
    return () => {
      ipcRenderer.removeListener('metrics:update', subscription);
    };
  },
});
