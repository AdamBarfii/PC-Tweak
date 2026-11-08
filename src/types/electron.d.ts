export interface SystemMetrics {
  cpuUsage: number;
  cpuSpeedGhz: number | null;
  memoryUsedGb: number;
  memoryTotalGb: number;
  memoryPercentage: number;
  gpuLoad: number | null;
  gpuTemp: number | null;
  gpuModel?: string | null;
  diskReadMb?: number;
  diskWriteMb?: number;
  uptimeSeconds: number;
}

export interface SystemInfo {
  osName: string;
  osBuild: string;
  osArchitecture: string;
  cpuModel: string;
  totalMemoryGb: number;
  isElevated: boolean;
  hostname: string;
  gpuModel?: string | null;
  ramDetails?: string | null;
  cpuCores?: number;
  cpuThreads?: number;
}

export type TweakCategory =
  | 'all'
  | 'system'
  | 'gaming'
  | 'network'
  | 'privacy'
  | 'advanced';

export type ImpactLevel = 'safe' | 'moderate' | 'advanced' | 'extreme';
export type AntiCheatSafetyLevel = 'safe' | 'caution' | 'blocked-risk';

export interface TweakStatusItem {
  id: string;
  nameKey: string;
  descriptionKey: string;
  category: 'system' | 'gaming' | 'network' | 'privacy' | 'advanced';
  impact: ImpactLevel;
  requiresReboot: boolean;
  minWindowsBuild?: number;
  maxWindowsBuild?: number;
  isApplied: boolean;
  isSupported: boolean;
  warningKey?: string;
  anticheat?: AntiCheatSafetyLevel;
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface DetectedAntiCheat {
  id: string;
  name: string;
  games: string[];
  isRunning: boolean;
  serviceName?: string;
  driverName?: string;
}

export interface DriverBottleneckInfo {
  moduleName: string;
  displayName: string;
  description: string;
  category: 'gpu' | 'network' | 'storage' | 'system' | 'audio' | 'other';
  state: 'Running' | 'Stopped' | 'Unknown';
  isKnownBottleneck: boolean;
  severity: 'low' | 'medium' | 'high';
  potentialCause: string;
  recommendation: string;
}

export interface DpcIsrReport {
  timestamp: number;
  dpcPercent: number | null;
  interruptPercent: number | null;
  overallStatus: 'optimal' | 'moderate' | 'high_latency';
  runningDriversCount: number;
  flaggedDriversCount: number;
  drivers: DriverBottleneckInfo[];
  recommendations: string[];
  isElevated: boolean;
}

export interface BootPhaseBreakdown {
  kernelInitMs: number;
  driverInitMs: number;
  smssInitMs: number;
  postBootMs: number;
  mainPathMs: number;
}

export interface BootBreakdownReport {
  success: boolean;
  hasEventLog: boolean;
  totalBootDurationMs: number;
  phases: BootPhaseBreakdown;
  lastBootTimestamp: string;
  slowestPhase: 'kernel' | 'driver' | 'smss' | 'postboot' | 'none';
  slowestPhasePercent: number;
  summary: string;
  recommendations: string[];
  isElevated: boolean;
}

export interface HostsEntry {
  lineIndex: number;
  raw: string;
  ip?: string;
  domain?: string;
  comment?: string;
  isComment: boolean;
  isEmpty: boolean;
  isLoopback: boolean;
  isCustom: boolean;
}

export interface HostsReport {
  filePath: string;
  totalLines: number;
  activeMappingsCount: number;
  customMappingsCount: number;
  loopbackMappingsCount: number;
  isWritable: boolean;
  entries: HostsEntry[];
  rawContent: string;
}

export interface HostsRestoreResult {
  success: boolean;
  message: string;
  backupPath?: string;
  error?: string;
}

export interface SystemSecurityBaseline {
  secureBootEnabled: boolean;
  tpmPresent: boolean;
  tpmVersion: string;
  tpmInitialized: boolean;
  vbsEnabled: boolean;
  hvciEnabled: boolean;
  osVersion: string;
  testSigningEnabled: boolean;
}

export interface AntiCheatEvaluation {
  antiCheatId: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  reasons: string[];
  supportUrl: string;
  lastVerified: string;
  note: string;
}

export interface AntiCheatDetectionResult {
  detectedAntiCheats: DetectedAntiCheat[];
  systemBaseline: SystemSecurityBaseline;
  evaluations: AntiCheatEvaluation[];
  isCompetitiveSafeActive: boolean;
  hasAntiCheatInstalled: boolean;
}

export interface AntiCheatRequirementItem {
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

export interface BackupRecord {
  id: string;
  timestamp: string;
  title: string;
  type: 'single_tweak' | 'batch' | 'profile_apply';
  tweakIds: string[];
  systemRestorePointId?: number;
  snapshots?: any[];
  status: 'active' | 'reverted';
}

export interface SystemRestorePoint {
  sequenceNumber: number;
  description: string;
  creationTime: string;
  restorePointType: string;
}

// --- Input Lab Types ---

export interface DetectedInputDevice {
  id: string;
  name: string;
  type: 'mouse' | 'keyboard' | 'other';
  connection: 'usb' | 'bluetooth' | 'wireless_2_4g' | 'internal' | 'unknown';
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
}

export interface SystemInputFactors {
  timerResolutionMs: number;
  displayRefreshRateHz: number;
  mouseAccelerationEnabled: boolean;
  pointerSpeedLevel: number;
  mouseQueueSize: number;
  keyboardDelay: number;
  keyboardSpeed: number;
  stickyKeysActive: boolean;
  filterKeysActive?: boolean;
  altShiftToggleDisabled?: boolean;
  activePowerPlan: string;
  runningVendorSoftware?: string[];
}

export type UserGoal = 'competitive_fps' | 'general' | 'work_productivity' | 'laptop_battery';

export interface SmartRecommendation {
  tweakId: string;
  category: 'mouse' | 'keyboard' | 'system';
  titleKey: string;
  reasoningKey: string;
  expectedBenefitKey: string;
  confidence: number;
  impact: ImpactLevel;
  isApplied: boolean;
  whyThisAppliesToYou: string;
  measuredDelta?: {
    metricName: string;
    beforeValue: string | number;
    afterValue: string | number;
  };
}

export type TuningProfileCategory = 'esports' | 'streaming' | 'battery' | 'default' | 'custom';

export interface TuningProfileMouseSettings {
  pointerSpeed: number; // 1 to 11 (6 = neutral 1:1, 10 in Windows registry)
  enhancePointerAccuracy: boolean;
  disableAcceleration: boolean;
  disableTrails?: boolean;
  rawInputMode?: boolean;
  scrollSpeed?: number;
  doubleClickSpeed?: number;
  pointerPrecision?: boolean;
  improveScrollSmoothness?: boolean;
  smartSensitivity?: boolean;
}

export interface TuningProfileDirectXSettings {
  flipModel?: boolean;
  maxFrameLatency?: boolean;
  shaderCacheBoost?: boolean;
  tdrDelay?: boolean;
}

export interface TuningProfile {
  id: string;
  name: string;
  category: TuningProfileCategory;
  description: string;
  isBuiltIn: boolean;
  createdAt: string;
  tweakIds: string[];
  directX?: TuningProfileDirectXSettings;
  mouseSettings?: TuningProfileMouseSettings;
  keyboardTweaks?: string[];
  gameTag?: 'CS2' | 'VALORANT' | 'APEX' | 'OVERWATCH' | 'CUSTOM' | string;
}

export type GameInputProfile = TuningProfile;

export interface AppSettings {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  language: 'en' | 'fa';
  hardwarePollingInterval: number; // 500 to 5000 ms
  autoUpdate: boolean;
  theme: 'dark' | 'light' | 'system';
}

export interface SettingsUpdateResult {
  success: boolean;
  settings: AppSettings;
  error?: string;
}

export interface ResetAppDataResult {
  success: boolean;
  clearedFiles: string[];
  error?: string;
}

export interface RawInputStats {
  type: 'raw_input_stats';
  polling_hz: number | null;
  jitter_p99_ms: number | null;
  jitter_median_ms: number | null;
  min_interval_ms: number | null;
  max_interval_ms: number | null;
  median_interval_ms?: number | null;
  p99_interval_ms?: number | null;
  timer_resolution_ms: number;
  sufficient_movement: boolean;
  sample_count: number;
  movement_counts: number;
  dropped_events?: number;
}

export interface BaselineRun {
  runIndex: number;
  pollingHz: number;
  jitterP99Ms: number;
  jitterMedianMs: number;
  timerResMs: number;
  timestamp: string;
}

export interface BaselineSession {
  sessionId: string;
  timestamp: string;
  runs: BaselineRun[];
  jitterSpreadMs: number;
  avgJitterMs: number;
  avgPollingHz: number;
  timerResMs: number;
}

export interface PostTweakBenchmark {
  id: string;
  timestamp: string;
  tweakName: string;
  baselineId: string;
  postRun: {
    pollingHz: number;
    jitterP99Ms: number;
    timerResMs: number;
  };
  noiseSpreadMs: number;
  deltaJitterMs: number;
  improved: boolean;
  improvementPercent: number;
  status: 'improved' | 'no_measurable_change';
  reverted: boolean;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  category: 'input' | 'system' | 'power' | 'network' | 'profile';
  action: string;
  details: string;
  reversible: boolean;
  reverted?: boolean;
}

export type TweakRiskLevel = 'safe' | 'moderate' | 'advanced';

export interface OptimizerTweakItem {
  id: string;
  group: 'mouse_keyboard' | 'system_latency' | 'advanced';
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  risk: TweakRiskLevel;
  requiresAdmin: boolean;
  requiresReboot: boolean;
  isApplied: boolean;
  currentStateText: string;
  currentStateTextFa: string;
  isSupported: boolean;
  blockedReason?: string;
  blockedReasonFa?: string;
  isInfoOnly?: boolean;
  infoActionLabel?: string;
  anticheat?: AntiCheatSafetyLevel;
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface OptimizerState {
  restorePointStatus: {
    available: boolean;
    lastCreatedTimestamp?: string;
  };
  tweaks: OptimizerTweakItem[];
  hasReversibleChanges: boolean;
  isLaptopOnBattery: boolean;
}

export interface PowerPlanItem {
  guid: string;
  name: string;
  isActive: boolean;
  isCustom: boolean;
  isDefault: boolean;
}

export interface KeyPowerSettings {
  minProcessorStateAc: number;
  minProcessorStateDc: number;
  coreParkingText: string;
  usbSelectiveSuspend: boolean;
  pcieLinkState: boolean;
}

export interface HardwareSpecs {
  cpu: {
    name: string;
    cores: number;
    threads: number;
    summary: string;
  };
  gpu: {
    name: string;
    driverVersion: string;
    driverDate: string;
  };
  formFactor: 'Desktop' | 'Laptop';
  isLaptopOnBattery: boolean;
  activePowerPlan: string;
  activePowerPlanGuid: string;
  display: {
    refreshRate: number;
    maxRefreshRate: number;
    displayMode: string;
    rebarStatus: 'Enabled' | 'Disabled' | 'Not Supported';
    xmpStatus: {
      enabled: boolean;
      speedMt: number;
      ratedSpeedMt?: number;
    };
    driverDate: string;
  };
}

export interface GamingTweakItem {
  id: string;
  section: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  risk: 'safe' | 'moderate' | 'advanced' | 'experimental';
  requiresAdmin: boolean;
  requiresReboot: boolean;
  isApplied: boolean;
  currentStateText: string;
  currentStateTextFa: string;
  isSupported: boolean;
  blockedReason?: string;
  warning?: string;
  anticheat?: AntiCheatSafetyLevel;
  anticheatNote?: string;
  affectedAntiCheats?: string[];
}

export interface BottleneckItem {
  id: string;
  category: 'ram' | 'display' | 'gpu' | 'rebar' | 'hags' | 'storage_type' | 'storage_space' | 'thermal' | 'driver';
  title: string;
  titleFa: string;
  status: 'optimal' | 'warning' | 'critical' | 'info';
  currentValue: string;
  currentValueFa: string;
  recommendation: string;
  recommendationFa: string;
  actionLabel?: string;
  actionId?: string;
}

export interface BottleneckAuditReport {
  items: BottleneckItem[];
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  overallScore: number;
  timestamp: string;
}

export interface InstalledGame {
  id: string;
  name: string;
  platform: 'steam' | 'epic' | 'gog' | 'custom';
  installPath: string;
  exePath: string;
  exeName: string;
  gpuPreference: boolean;
  disableFullscreenOptimizations: boolean;
  highCpuPriority: boolean;
}

export interface GameSessionConfig {
  enabled: boolean;
  autoSwitchPowerPlan: boolean;
  throttleBackgroundApps: boolean;
  focusAssist: boolean;
  monitoredProcesses: string[];
}

export interface GameSessionStatus {
  isActive: boolean;
  activeGame: string | null;
  sessionStartedAt: number | null;
  config: GameSessionConfig;
  throttledProcessCount: number;
}

export interface NetworkAdapterInfo {
  id: string;
  name: string;
  description: string;
  status: 'Up' | 'Disconnected' | 'Disabled' | 'Unknown';
  linkSpeed: string;
  mediaType: 'Ethernet' | 'Wi-Fi' | 'Other';
  ipv4Address: string | null;
  defaultGateway: string | null;
  dnsServers: string[];
  isMetered: boolean;
  macAddress: string;
  isPhysical: boolean;
}

export interface NetworkModuleOverview {
  adapters: NetworkAdapterInfo[];
  activeAdapter: NetworkAdapterInfo | null;
  isRdpActive: boolean;
  hasReversibleChanges: boolean;
}

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

export interface CurrentDnsInfo {
  adapterName: string;
  isDhcp: boolean;
  servers: string[];
  dohActive: boolean;
}

export interface DnsBenchmarkResult {
  serverId: string;
  serverName: string;
  serverIp: string;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  successCount: number;
  failureCount: number;
  testedCount: number;
}

export interface NetworkTestTarget {
  id: string;
  name: string;
  host: string;
  port?: number;
  isGateway?: boolean;
  isDns?: boolean;
  isPublic?: boolean;
}

export interface NetworkSample {
  timestamp: number;
  targetId: string;
  targetHost: string;
  rtt: number | null;
  isTimeout: boolean;
  usedTcpFallback: boolean;
  jitter: number;
}

export interface NetworkTestSummary {
  targetId: string;
  targetHost: string;
  durationSeconds: number;
  totalSamples: number;
  successfulSamples: number;
  packetLossPercent: number;
  minRtt: number;
  avgRtt: number;
  p99Rtt: number;
  maxRtt: number;
  jitter: number;
  samples: NetworkSample[];
}

export interface BaselineReport {
  targetHost: string;
  runs: { min: number; avg: number; max: number; jitter: number }[];
  noiseSpread: number;
  baselineAvg: number;
}

export interface GameServerDefinition {
  id: string;
  game: string;
  gameId: string;
  region: string;
  regionId: string;
  location: string;
  host: string;
  port: number;
  provider: string;
  recommendedMtu: number;
}

export interface GameServerBenchmarkResult {
  id: string;
  game: string;
  gameId: string;
  region: string;
  regionId: string;
  location: string;
  host: string;
  rtt: number | null;
  jitter: number;
  packetLossPercent: number;
  isBestRoute?: boolean;
  status: 'optimal' | 'good' | 'fair' | 'poor' | 'offline';
  timestamp: number;
}

export interface AdapterTweakOption {
  label: string;
  value: string;
}

export interface AdapterTweakItem {
  id: string;
  name: string;
  description: string;
  impact: 'safe' | 'moderate' | 'advanced';
  isSupported: boolean;
  unsupportedReason?: string;
  isApplied: boolean;
  currentValueDisplay: string;
  requiresReboot: boolean;
  requiresAutoRevert: boolean;
  options?: AdapterTweakOption[];
}

export interface WifiDetailsInfo {
  hasWifi: boolean;
  interfaceName?: string;
  ssid?: string;
  band?: string;
  channel?: number;
  signalPercentage?: number;
  radioType?: string;
  receiveRateMbps?: number;
  transmitRateMbps?: number;
  roamingAggressiveness?: {
    isSupported: boolean;
    currentValue: string;
    options: string[];
  };
  warnings: string[];
}

export interface AdapterDetailsInfo {
  adapterName: string;
  isLaptop: boolean;
  isMetered: boolean;
  interfaceMetric: number;
  automaticMetric: boolean;
  speedDuplex: {
    currentDisplay: string;
    currentValue: string;
    validOptions: AdapterTweakOption[];
  };
  tweaks: AdapterTweakItem[];
}

export interface AdvancedNetworkTweakItem {
  id: string;
  name: string;
  description: string;
  impact: 'safe' | 'moderate' | 'advanced' | 'experimental';
  isSupported: boolean;
  unsupportedReason?: string;
  isApplied: boolean;
  currentValueDisplay: string;
  requiresReboot: boolean;
  requiresAutoRevert: boolean;
  category: 'driver' | 'tcp_stack' | 'experimental';
  options?: { label: string; value: string }[];
}

export interface TcpGlobalState {
  autotuning: string;
  ecn: string;
  timestamps: string;
  rss: string;
}

export interface AdvancedNetworkOverview {
  adapterName: string;
  netCfgInstanceId: string | null;
  currentMtu: number;
  tcpGlobal: TcpGlobalState;
  tweaks: AdvancedNetworkTweakItem[];
}

export interface GamingModuleState {
  hardware: HardwareSpecs;
  powerPlans: PowerPlanItem[];
  keySettings: KeyPowerSettings;
  gamingSettings: GamingTweakItem[];
  advancedSettings?: GamingTweakItem[];
  experimentalSettings?: GamingTweakItem[];
  bottleneckAudit?: BottleneckAuditReport;
  games?: InstalledGame[];
  sessionStatus?: GameSessionStatus;
  restorePointAvailable: boolean;
  hasReversibleChanges: boolean;
}

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onNavigate?: (callback: (tab: string) => void) => () => void;

  // System & Elevation
  getSystemInfo: () => Promise<SystemInfo>;
  getSystemMetrics: () => Promise<SystemMetrics>;
  requestElevation: () => Promise<boolean>;

  // Tweaks
  getTweaksList: (category?: string) => Promise<TweakStatusItem[]>;
  applyTweak: (tweakId: string) => Promise<{ success: boolean; requiresReboot: boolean; error?: string }>;
  revertTweak: (tweakId: string) => Promise<{ success: boolean; requiresReboot: boolean; error?: string }>;
  batchApplyTweaks: (
    tweakIds: string[],
    createRestorePoint: boolean
  ) => Promise<{ success: boolean; count: number; backupId?: string }>;

  // Backups & System Restore
  listBackups: () => Promise<BackupRecord[]>;
  restoreBackup: (backupId: string) => Promise<{ success: boolean; error?: string }>;
  deleteBackup: (backupId: string) => Promise<boolean>;
  isRestorePointAvailable: () => Promise<boolean>;
  enableRestorePoint: () => Promise<boolean>;
  createRestorePoint: (description: string) => Promise<{ success: boolean; message: string }>;
  listRestorePoints: () => Promise<SystemRestorePoint[]>;

  // Input Lab & Real Native Raw Input Stream
  getInputDevices: () => Promise<DetectedInputDevice[]>;
  getInputFactors: () => Promise<SystemInputFactors>;
  getMouseSettings: () => Promise<{
    pointerSpeed: number;
    pointerPrecision: boolean;
    scrollSpeed: number;
    doubleClickSpeed: number;
    disableTrails: boolean;
    enhancePointerAccuracy?: boolean;
    disableAcceleration: boolean;
  }>;
  saveMouseSettings: (settings: {
    pointerSpeed?: number;
    pointerPrecision?: boolean;
    scrollSpeed?: number;
    doubleClickSpeed?: number;
    disableTrails?: boolean;
    disableAcceleration?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  startInputSampling: () => Promise<{ success: boolean; running?: boolean; error?: string }>;
  stopInputSampling: () => Promise<{ success: boolean }>;
  getTimerResolution: () => Promise<{ min_ms: number; max_ms: number; current_ms: number }>;
  getMouseSpi: () => Promise<{
    speed: number;
    threshold1: number;
    threshold2: number;
    accel: number;
    accel_disabled: boolean;
  }>;
  setMouseSpi: (payload: { speed: number; accelDisabled: boolean }) => Promise<{
    success: boolean;
    previous_state?: any;
    error?: string;
  }>;
  undoMouseSpi: () => Promise<{ success: boolean; restored?: any; error?: string }>;
  saveBaseline: (session: BaselineSession) => Promise<{ success: boolean }>;
  getBaseline: () => Promise<BaselineSession | null>;
  savePostTweak: (result: PostTweakBenchmark) => Promise<{ success: boolean }>;
  getPostTweak: () => Promise<PostTweakBenchmark | null>;
  listAudit: (limit?: number) => Promise<AuditRecord[]>;
  recordAudit: (record: Omit<AuditRecord, 'id' | 'timestamp'>) => Promise<AuditRecord>;
  onInputStats: (callback: (stats: RawInputStats) => void) => () => void;

  // Input Lag Optimizer API
  getOptimizerState: () => Promise<OptimizerState>;
  applyOptimizerTweak: (tweakId: string) => Promise<{ success: boolean; requiresReboot: boolean; error?: string }>;
  revertOptimizerTweak: (tweakId: string) => Promise<{ success: boolean; error?: string }>;
  undoAllOptimizer: () => Promise<{ success: boolean; revertedCount: number }>;
  resetOptimizerDefaults: () => Promise<{ success: boolean }>;
  runSilentHealthCheck: () => Promise<{ passed: boolean; dropPercent: number; reason?: string }>;
  openDisplaySettings: () => Promise<{ success: boolean; error?: string }>;

  // Gaming & Power Module API
  getGamingState: () => Promise<GamingModuleState>;
  setActivePowerPlan: (guid: string) => Promise<{ success: boolean; error?: string }>;
  createCustomGamingPlan: () => Promise<{ success: boolean; guid?: string; error?: string }>;
  applyGamingTweak: (tweakId: string) => Promise<{ success: boolean; requiresReboot: boolean; error?: string }>;
  revertGamingTweak: (tweakId: string) => Promise<{ success: boolean; error?: string }>;
  undoAllGaming: () => Promise<{ success: boolean; revertedCount: number }>;
  resetGamingDefaults: () => Promise<{ success: boolean }>;
  openPanicRecoveryFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  runBottleneckAudit: () => Promise<BottleneckAuditReport>;
  fixBottleneck: (actionId: string) => Promise<{ success: boolean; error?: string }>;
  scanInstalledGames: () => Promise<InstalledGame[]>;
  setGameSetting: (payload: {
    exePath: string;
    exeName: string;
    setting: 'gpu_preference' | 'disable_fso' | 'high_priority';
    enabled: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  addCustomGame: (exePath: string) => Promise<{ success: boolean; game?: InstalledGame; error?: string }>;
  browseGameExe: () => Promise<{ canceled: boolean; filePath?: string }>;
  getGameSessionStatus: () => Promise<GameSessionStatus>;
  updateGameSessionConfig: (config: Partial<GameSessionConfig>) => Promise<GameSessionStatus>;
  triggerGameSession: (gameName: string) => Promise<GameSessionStatus>;
  endGameSession: () => Promise<GameSessionStatus>;

  // Network Module API
  getNetworkOverview: () => Promise<NetworkModuleOverview>;
  undoAllNetwork: (adapterName?: string) => Promise<{ success: boolean; count: number; message: string; error?: string }>;
  confirmNetworkChanges: () => Promise<{ success: boolean; message: string }>;
  getWatchdogState: () => Promise<{ isArmed: boolean; remainingSeconds: number; record?: any }>;
  onWatchdogTick: (callback: (data: { remainingSeconds: number; tweakName: string }) => void) => () => void;
  onWatchdogConfirmed: (callback: (data: { tweakName: string }) => void) => () => void;
  onWatchdogReverted: (callback: (data: { tweakName: string; reason: string }) => void) => () => void;
  startNetworkTest: (payload: { targets: NetworkTestTarget[]; durationSeconds: number }) => Promise<NetworkTestSummary[]>;
  stopNetworkTest: () => Promise<{ success: boolean }>;
  runNetworkBaseline: (target: NetworkTestTarget) => Promise<BaselineReport>;
  compareNetworkDelta: (payload: {
    summary: NetworkTestSummary;
    baseline: BaselineReport;
  }) => Promise<{ improved: boolean; deltaMs: number; spreadMs: number; message: string }>;
  onNetworkTestSample: (callback: (sample: NetworkSample) => void) => () => void;

  // Gaming Server Radar API
  getGameServers: () => Promise<GameServerDefinition[]>;
  benchmarkGameServers: (gameIdFilter?: string) => Promise<GameServerBenchmarkResult[]>;
  onGameServerBenchmarkProgress: (callback: (result: GameServerBenchmarkResult) => void) => () => void;
  monitorGameServer: (payload: { serverId: string; durationSeconds?: number }) => Promise<NetworkTestSummary>;
  onGameServerMonitorSample: (callback: (sample: NetworkSample) => void) => () => void;
  optimizeGameRoute: (payload: { gameId: string; serverId: string; adapterName?: string }) => Promise<{
    success: boolean;
    message: string;
    appliedTweaks: string[];
  }>;

  // DNS Manager API
  getCurrentDns: (adapterName: string) => Promise<CurrentDnsInfo>;
  listDnsPresets: () => Promise<DnsPreset[]>;
  saveDnsPreset: (payload: {
    id?: string;
    preset: Omit<DnsPreset, 'id' | 'isDefault'>;
  }) => Promise<DnsPreset>;
  deleteDnsPreset: (id: string) => Promise<boolean>;
  applyDns: (payload: {
    adapterName: string;
    preset: DnsPreset;
    enableDoh?: boolean;
  }) => Promise<{ success: boolean; requiresAutoRevert: boolean; error?: string }>;
  resetDnsToDhcp: (adapterName: string) => Promise<{ success: boolean; error?: string }>;
  revertDns: (adapterName: string) => Promise<{ success: boolean; error?: string }>;
  flushDnsCache: () => Promise<{ success: boolean; error?: string }>;
  benchmarkDns: (payload: {
    servers: { id: string; name: string; ip: string }[];
    domains?: string[];
  }) => Promise<DnsBenchmarkResult[]>;

  // Adapter Tweaks & Wi-Fi API
  getAdapterDetails: (adapterName: string) => Promise<AdapterDetailsInfo>;
  getWifiDetails: () => Promise<WifiDetailsInfo>;
  applyAdapterTweak: (payload: {
    adapterName: string;
    tweakId: string;
    value?: any;
  }) => Promise<{ success: boolean; requiresAutoRevert: boolean; error?: string }>;
  revertAdapterTweak: (payload: {
    adapterName: string;
    tweakId: string;
  }) => Promise<{ success: boolean; error?: string }>;

  // Network Repair & Safety API
  executeNetworkRepair: (payload: {
    actionId: string;
    adapterName?: string;
  }) => Promise<{ success: boolean; requiresReboot?: boolean; message: string; error?: string }>;
  resetAllNetworkDefaults: (adapterName?: string) => Promise<{ success: boolean; message: string; error?: string }>;
  openNetworkRecoveryFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // Advanced & Experimental Network API
  getAdvancedNetworkState: (adapterName: string) => Promise<AdvancedNetworkOverview>;
  applyAdvancedNetworkTweak: (payload: {
    adapterName: string;
    tweakId: string;
    value?: any;
  }) => Promise<{ success: boolean; requiresAutoRevert: boolean; error?: string }>;
  revertAdvancedNetworkTweak: (payload: {
    adapterName: string;
    tweakId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  detectOptimalMtu: (targetHost?: string) => Promise<{
    optimalMtu: number;
    unfragmentedPayload: number;
    isDefault1500: boolean;
  }>;
  setNetworkMtu: (payload: {
    adapterName: string;
    mtu: number;
  }) => Promise<{ success: boolean; message: string; error?: string }>;

  // Advanced checks & cleanups
  checkConflicts: () => Promise<{
    isDockerInstalled: boolean;
    isWslInstalled: boolean;
    isUsePlatformClockActive: boolean;
    isLaptopOnBattery: boolean;
  }>;
  removeUsePlatformClock: () => Promise<{ success: boolean; error?: string }>;

  // Anti-Cheat Safety API
  getAntiCheatStatus: (forceRefresh?: boolean) => Promise<AntiCheatDetectionResult>;
  setCompetitiveSafeMode: (enabled: boolean) => Promise<{ success: boolean; isCompetitiveSafeActive: boolean }>;
  applyCompetitiveSafePreset: () => Promise<{ success: boolean; appliedCount: number; revertedCount: number; message: string }>;
  getAntiCheatRequirements: () => Promise<AntiCheatRequirementItem[]>;
  updateAntiCheatRequirement: (req: AntiCheatRequirementItem) => Promise<{ success: boolean }>;

  // Profiles Suite
  listProfiles: () => Promise<TuningProfile[]>;
  saveProfile: (profile: TuningProfile) => Promise<{ success: boolean; id?: string; error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string } | boolean>;
  applyProfile: (profile: TuningProfile) => Promise<{
    success: boolean;
    appliedCount?: number;
    requiresReboot?: boolean;
    message?: string;
    error?: string;
  }>;
  exportProfile: (profile: TuningProfile) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  importProfile: () => Promise<{ success: boolean; profile?: TuningProfile; canceled?: boolean; error?: string }>;
  importProfileFromJson: (jsonContent: string) => Promise<{ success: boolean; profile?: TuningProfile; error?: string }>;

  // Settings & Preferences API
  getSettings: () => Promise<AppSettings>;
  setSettings: (partial: Partial<AppSettings>) => Promise<SettingsUpdateResult>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<SettingsUpdateResult>;
  resetSettings: () => Promise<SettingsUpdateResult>;
  resetAppData: () => Promise<ResetAppDataResult>;

  // Diagnostics & Benchmarks Suite
  getDpcIsrReport: () => Promise<DpcIsrReport>;
  getBootBreakdown: () => Promise<BootBreakdownReport>;
  getHostsReport: () => Promise<HostsReport>;
  restoreDefaultHosts: () => Promise<HostsRestoreResult>;

  // In-Game HUD & Overlay API
  getOverlayConfig: () => Promise<OverlayConfig>;
  saveOverlayConfig: (config: Partial<OverlayConfig>) => Promise<OverlayConfig>;
  toggleOverlay: () => Promise<boolean>;
  onOverlayTelemetry: (callback: (telemetry: OverlayTelemetry) => void) => () => void;
  onOverlayConfigUpdate: (callback: (config: OverlayConfig) => void) => () => void;

  // FPS Esports & Shooter Optimizer API
  getCpuTopology: (forceRefresh?: boolean) => Promise<CpuTopologyInfo>;
  getRunningProcesses: () => Promise<RunningProcessItem[]>;
  getFpsGameProfiles: () => Promise<FpsGameProfile[]>;
  applyFpsGameTweak: (
    exeName: string,
    tweakType: 'cpuAffinity' | 'priority' | 'gpuPreference' | 'qosDscp',
    enable: boolean,
    customMaskHex?: string
  ) => Promise<{ success: boolean; message: string; profile: FpsGameProfile }>;
  optimizeAllForFpsGame: (
    exeName: string,
    customMaskHex?: string
  ) => Promise<{ success: boolean; message: string; profile: FpsGameProfile }>;
  revertFpsGame: (exeName: string) => Promise<{ success: boolean; message: string; profile: FpsGameProfile }>;

  // GPU Pipeline & Hardware MSI Interrupts API
  getGpuDevices: () => Promise<GpuDeviceInfo[]>;
  setGpuMsi: (instanceId: string, enableMsi: boolean, priority: number) => Promise<{ success: boolean; message: string }>;
  revertGpuMsi: (instanceId: string) => Promise<{ success: boolean; message: string }>;

  // DirectX Low-Latency Presentation Engine API
  getDirectXPresentationStatus: () => Promise<DirectXPresentationStatus>;
  setMaxFrameLatency: (enabled: boolean) => Promise<{ success: boolean; message: string }>;
  setFlipModelUpgrade: (enabled: boolean) => Promise<{ success: boolean; message: string }>;
  setTdrDelay: (extended: boolean) => Promise<{ success: boolean; message: string }>;
  setShaderCacheBoost: (boosted: boolean) => Promise<{ success: boolean; message: string }>;
  applyCompetitiveDirectXPreset: () => Promise<{ success: boolean; appliedCount: number; message: string }>;
  revertDirectXPresentation: () => Promise<{ success: boolean; message: string }>;

  // High-Polling Input Queue Depth API
  getInputQueueStatus: () => Promise<InputQueueStatus>;
  setMouseQueueSize: (size: number) => Promise<{ success: boolean; message: string }>;
  setKeyboardQueueSize: (size: number) => Promise<{ success: boolean; message: string }>;
  revertInputQueue: () => Promise<{ success: boolean; message: string }>;

  // System Optimizer (RAM, Disk, Services, Tasks, CPU)
  optimizerGetRamProcesses: (limit?: number) => Promise<ProcessMemoryInfo[]>;
  optimizerTrimRam: () => Promise<RamTrimResult>;
  optimizerEndProcess: (pid: number) => Promise<{ success: boolean; message: string }>;
  optimizerScanDisk: () => Promise<DiskJunkCategory[]>;
  optimizerCleanDisk: (categoryIds: string[]) => Promise<DiskCleanResult>;
  optimizerGetDriveStatus: (driveLetter?: string) => Promise<DriveStatusInfo>;
  optimizerOptimizeDrive: (driveLetter?: string) => Promise<{ success: boolean; message: string }>;
  optimizerScanServices: () => Promise<WindowsServiceItem[]>;
  optimizerSetServiceStartup: (
    serviceName: string,
    startupType: 'Automatic' | 'Manual' | 'Disabled'
  ) => Promise<{ success: boolean; message: string }>;
  optimizerDeleteOrphanedService: (serviceName: string) => Promise<{ success: boolean; message: string }>;
  optimizerScanTasks: () => Promise<ScheduledTaskItem[]>;
  optimizerSetTaskState: (
    taskPath: string,
    taskName: string,
    enabled: boolean
  ) => Promise<{ success: boolean; message: string }>;
  optimizerDeleteOrphanedTask: (taskPath: string, taskName: string) => Promise<{ success: boolean; message: string }>;
  optimizerGetPowerPlans: () => Promise<CpuPowerPlan[]>;
  optimizerSetActivePowerPlan: (guid: string) => Promise<{ success: boolean; message: string }>;
  optimizerUnlockUltimatePower: () => Promise<{ success: boolean; guid?: string; message: string }>;
  optimizerGetCpuProcesses: (limit?: number) => Promise<ProcessCpuInfo[]>;
  optimizerSetProcessPriority: (
    pid: number,
    priority: 'Idle' | 'BelowNormal' | 'Normal' | 'AboveNormal' | 'High'
  ) => Promise<{ success: boolean; message: string }>;

  // Automation & Smart Suggestions
  getAutomationConfig: () => Promise<AutomationConfig>;
  updateAutomationConfig: (partial: Partial<AutomationConfig>) => Promise<{ success: boolean; config: AutomationConfig }>;
  getAutomationLogs: (limit?: number) => Promise<AutomationLogEntry[]>;
  clearAutomationLogs: () => Promise<{ success: boolean }>;
  getSmartSuggestions: () => Promise<SmartSuggestion[]>;
  applySmartSuggestion: (id: string) => Promise<{ success: boolean; message: string }>;
  applyAllSmartSuggestions: () => Promise<{ success: boolean; appliedCount: number; message: string }>;
  dismissSmartSuggestion: (id: string) => Promise<{ success: boolean }>;

  // Safe Overclocking & Performance Analytics Suite
  overclockGetCapabilities: () => Promise<OverclockCapabilities>;
  overclockGetTelemetry: () => Promise<OverclockTelemetry>;
  overclockApplyOffset: (payload: {
    coreOffsetMhz: number;
    memOffsetMhz: number;
    powerLimitPct?: number;
    fanSpeedPct?: number;
  }) => Promise<{
    success: boolean;
    applied: { coreOffset: number; memOffset: number; powerLimit: number; fanSpeed?: number };
    error?: string;
  }>;
  overclockRevertStock: () => Promise<{ success: boolean; message: string }>;
  overclockStartAutoScan: () => Promise<{ success: boolean; message: string }>;
  overclockStopAutoScan: () => Promise<{ success: boolean }>;
  overclockGetAnalytics: () => Promise<OverclockAnalytics>;
  overclockListProfiles: () => Promise<OverclockProfile[]>;
  overclockSaveProfile: (profile: Omit<OverclockProfile, 'id' | 'createdAt'>) => Promise<{ success: boolean; profile: OverclockProfile }>;
  onOverclockTelemetry: (callback: (telemetry: OverclockTelemetry) => void) => () => void;
  onOverclockAutoScanStep: (callback: (step: AutoOverclockStep) => void) => () => void;

  // Events listener
  onMetricsUpdate: (callback: (metrics: SystemMetrics) => void) => () => void;
}

export type OverlayCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type OverlayLayout = 'compact' | 'expanded';

export interface OverlayConfig {
  enabled: boolean;
  corner: OverlayCorner;
  layout: OverlayLayout;
  opacity: number;
  showFps: boolean;
  showDpc: boolean;
  showCpu: boolean;
  showGpu: boolean;
  showRam: boolean;
  hotkey: string;
}

export interface OverlayTelemetry {
  fps: number | null;
  dpcPercent: number | null;
  dpcLatencyUs: number | null;
  cpuUsage: number;
  cpuSpeedGhz: number | null;
  gpuLoad: number | null;
  gpuTemp: number | null;
  memoryPercentage: number;
  memoryUsedGb: number;
  uptimeSeconds: number;
}

export interface CpuTopologyInfo {
  cpuName: string;
  physicalCores: number;
  logicalProcessors: number;
  architecture: 'intel-hybrid' | 'amd-dual-ccd-vcache' | 'uniform';
  hasEcores: boolean;
  pCoreCount: number;
  eCoreCount: number;
  recommendedMode: 'pcores-only' | 'vcache-ccd-only' | 'isolate-core0' | 'all-cores';
  recommendedMaskHex: string;
  recommendedMaskDec: string;
  description: string;
}

export interface FpsGameProfile {
  exeName: string;
  displayName: string;
  isRunning: boolean;
  pid?: number;
  memoryUsage?: string;
  isKnownShooter: boolean;
  isConfigured: boolean;
  cpuAffinityEnabled: boolean;
  cpuAffinityMaskHex?: string;
  priorityEnabled: boolean;
  gpuPreferenceEnabled: boolean;
  qosDscpEnabled: boolean;
  lastUpdated?: string;
}

export interface RunningProcessItem {
  exeName: string;
  displayName: string;
  pid: number;
  memoryUsage: string;
  isKnownShooter: boolean;
}

export interface GpuDeviceInfo {
  name: string;
  pnpDeviceId: string;
  instanceId: string;
  driverVersion: string;
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Unknown';
  isDiscrete: boolean;
  msiSupported: boolean;
  devicePriority: number;
  devicePriorityText: 'High' | 'Normal' | 'Low' | 'Default';
}

export interface DirectXPresentationStatus {
  maxFrameLatency: number;
  isMaxFrameLatencyActive: boolean;
  swapEffectUpgradeEnable: boolean;
  tdrDelay: number;
  isTdrDelayExtended: boolean;
  shaderCacheSizeMb: number;
  isShaderCacheBoosted: boolean;
  isCompetitivePresetActive: boolean;
}

export interface InputQueueStatus {
  mouseQueueSize: number;
  keyboardQueueSize: number;
  isMouseOptimized: boolean;
  isKeyboardOptimized: boolean;
}

export interface ProcessMemoryInfo {
  pid: number;
  name: string;
  workingSetMb: number;
  privateBytesMb: number;
  isSystemCritical: boolean;
}

export interface RamTrimResult {
  success: boolean;
  freedMb: number;
  memoryBeforeMb: number;
  memoryAfterMb: number;
  timestamp: string;
}

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

export interface WindowsServiceItem {
  name: string;
  displayName: string;
  status: 'Running' | 'Stopped';
  startupType: 'Automatic' | 'Manual' | 'Disabled';
  imagePath: string;
  isOrphaned: boolean;
  isCritical: boolean;
  category: 'telemetry' | 'bloat' | 'orphan' | 'system' | 'third_party';
  recommendation: 'disable' | 'manual' | 'clean' | 'keep';
  descriptionKey: string;
}

export interface ScheduledTaskItem {
  taskPath: string;
  taskName: string;
  fullPath: string;
  state: 'Ready' | 'Running' | 'Disabled';
  actionExecutable: string;
  isOrphaned: boolean;
  isCritical: boolean;
  category: 'telemetry' | 'orphan' | 'updater' | 'maintenance' | 'system';
  recommendation: 'disable' | 'clean' | 'keep';
  descriptionKey: string;
}

export interface CpuPowerPlan {
  guid: string;
  name: string;
  isActive: boolean;
  isUltimate: boolean;
}

export interface ProcessCpuInfo {
  pid: number;
  name: string;
  cpuSeconds: number;
  priorityClass: string;
  isSystemCritical: boolean;
}

export interface AutomationConfig {
  masterEnabled: boolean;
  notifyOnAutoAction: boolean;
  autoTrimRam: {
    enabled: boolean;
    thresholdPercent: number;
    cooldownMinutes: number;
    trimOnGameExit: boolean;
  };
  autoCleanDisk: {
    enabled: boolean;
    thresholdMb: number;
    frequency: 'threshold_only' | 'daily' | 'weekly';
    categories: string[];
  };
  autoTrimSsd: {
    enabled: boolean;
    frequencyDays: number;
    lastRunTimestamp?: string;
  };
  autoGameBoost: {
    enabled: boolean;
    powerPlanSwitch: boolean;
    throttleBackground: boolean;
    trimRamOnLaunch: boolean;
  };
  autoTelemetrySentinel: {
    enabled: boolean;
    autoDisableOnDetect: boolean;
  };
}

export interface AutomationLogEntry {
  id: string;
  timestamp: string;
  type: 'ram_trim' | 'disk_clean' | 'ssd_trim' | 'game_boost' | 'telemetry_silenced';
  title: string;
  detail: string;
  reclaimedBytes?: number;
}

export interface SmartSuggestion {
  id: string;
  category: 'storage' | 'memory' | 'gaming' | 'privacy' | 'performance';
  impact: 'safe' | 'moderate' | 'high';
  titleKey: string;
  descriptionKey: string;
  descriptionParams?: Record<string, any>;
  actionType:
    | 'clean_disk'
    | 'trim_ram'
    | 'set_power_plan'
    | 'disable_telemetry'
    | 'clean_orphans'
    | 'enable_game_mode'
    | 'run_trim';
  actionPayload?: any;
  isDismissed?: boolean;
}

export interface OverclockCapabilities {
  isSupported: boolean;
  gpuVendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Unknown';
  gpuName: string;
  driverVersion?: string;
  canTuneCoreClock: boolean;
  canTuneMemoryClock: boolean;
  canTunePowerLimit: boolean;
  canTuneFanSpeed: boolean;
  voltageLocked: boolean; // Always true: Strict Zero Overvolting
  maxCoreOffsetMhz: number; // Safe clamp: e.g. +120
  minCoreOffsetMhz: number; // e.g. 0 or -50
  maxMemOffsetMhz: number; // Safe clamp: e.g. +350
  minMemOffsetMhz: number; // e.g. 0
  maxPowerLimitPct: number; // Safe clamp: e.g. 105
  minPowerLimitPct: number; // Safe clamp: e.g. 100
  tempTripwireGpu: number; // 80°C
  tempTripwireCpu: number; // 85°C
  isInMemoryOnly: boolean; // Always true: Boot-loop immunity
  unsupportedReason?: string;
}

export interface OverclockTelemetry {
  coreClockMhz: number;
  memClockMhz: number;
  gpuTemp: number;
  gpuHotspotTemp: number | null;
  powerWatts: number;
  powerLimitPct: number;
  fanSpeedPct: number;
  fanRpm: number | null;
  gpuLoadPct: number;
  voltageMv: number;
  appliedCoreOffset: number;
  appliedMemOffset: number;
  watchdogActive: boolean;
  timestamp: number;
}

export interface AutoOverclockStep {
  stage: 'idle' | 'preflight' | 'memory_scan' | 'core_scan' | 'stress_verify' | 'completed' | 'aborted';
  currentStep: number;
  totalSteps: number;
  testedCoreOffset: number;
  testedMemOffset: number;
  currentTemp: number;
  stabilityScore: number;
  statusMessage: string;
  isSafe: boolean;
}

export interface OverclockAnalytics {
  thermalHeadroomC: number;
  siliconStabilityIndex: number;
  estimatedFpsGainPct: number;
  memoryBandwidthDeltaGbps: number;
  gflopsDelta: number;
  baselineTemp: number;
  currentTemp: number;
  peakTempRecorded: number;
  tdrEventsDetected: number;
  rollbackCount: number;
  activeProfileName: string;
  lastTunedTimestamp?: string;
}

export interface OverclockProfile {
  id: string;
  name: string;
  coreOffsetMhz: number;
  memOffsetMhz: number;
  powerLimitPct: number;
  fanSpeedPct?: number;
  isStock: boolean;
  stabilityScore: number;
  createdAt: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

declare module 'sql.js';
