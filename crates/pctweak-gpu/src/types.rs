use serde::{Deserialize, Serialize};
use crate::error::GpuError;

pub const MIN_SAFE_CORE_OFFSET: i32 = -50;
pub const MAX_SAFE_CORE_OFFSET: i32 = 120;
pub const MIN_SAFE_MEM_OFFSET: i32 = 0;
pub const MAX_SAFE_MEM_OFFSET: i32 = 350;
pub const MIN_SAFE_POWER_LIMIT: u32 = 100;
pub const MAX_SAFE_POWER_LIMIT: u32 = 105;
pub const PREFLIGHT_MAX_TEMP_C: u32 = 55;
pub const CEILING_MEM_TEMP_C: u32 = 75;
pub const CEILING_CORE_TEMP_C: u32 = 78;
pub const TRIPWIRE_GPU_TEMP_C: f32 = 85.0;
pub const TRIPWIRE_HOTSPOT_TEMP_C: f32 = 92.0;
pub const TRIPWIRE_CPU_TEMP_C: f32 = 85.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GpuOffsets {
    pub core_offset_mhz: i32, // [-50, +120]
    pub mem_offset_mhz: i32,  // [0, +350]
    pub power_limit_pct: u32, // [100, 105]
    pub fan_speed_pct: u32,   // [0, 100], 0 = auto profile
    pub voltage_mv: i32,      // MUST be 0 (+0 mV stock only)
}

impl Default for GpuOffsets {
    fn default() -> Self {
        Self {
            core_offset_mhz: 0,
            mem_offset_mhz: 0,
            power_limit_pct: 100,
            fan_speed_pct: 0,
            voltage_mv: 0,
        }
    }
}

impl GpuOffsets {
    /// Validates zero overvolting and clamps offsets to safe hardware bounds.
    pub fn clamp_and_validate(&self) -> Result<GpuOffsets, GpuError> {
        // 1. Strict Zero Overvolting Check
        if self.voltage_mv != 0 {
            return Err(GpuError::VoltageTamperingProhibited);
        }

        // 2. Hardware Clamping
        let clamped_core = self.core_offset_mhz.clamp(MIN_SAFE_CORE_OFFSET, MAX_SAFE_CORE_OFFSET);
        let clamped_mem = self.mem_offset_mhz.clamp(MIN_SAFE_MEM_OFFSET, MAX_SAFE_MEM_OFFSET);
        let clamped_power = self.power_limit_pct.clamp(MIN_SAFE_POWER_LIMIT, MAX_SAFE_POWER_LIMIT);
        let clamped_fan = self.fan_speed_pct.min(100);

        Ok(GpuOffsets {
            core_offset_mhz: clamped_core,
            mem_offset_mhz: clamped_mem,
            power_limit_pct: clamped_power,
            fan_speed_pct: clamped_fan,
            voltage_mv: 0,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuCapabilities {
    pub is_supported: bool,
    pub gpu_vendor: GpuVendor,
    pub gpu_name: String,
    pub can_tune_core_clock: bool,
    pub can_tune_memory_clock: bool,
    pub can_tune_power_limit: bool,
    pub can_tune_fan_speed: bool,
    pub voltage_locked: bool, // ALWAYS true
    pub max_core_offset_mhz: i32, // 120
    pub min_core_offset_mhz: i32, // -50
    pub max_mem_offset_mhz: i32,  // 350
    pub min_mem_offset_mhz: i32,  // 0
    pub max_power_limit_pct: u32, // 105
    pub min_power_limit_pct: u32, // 100
    pub temp_tripwire_gpu: f32,   // 85.0
    pub temp_tripwire_hotspot: f32, // 92.0
    pub temp_tripwire_cpu: f32,   // 85.0
    pub is_in_memory_only: bool,  // ALWAYS true
}

impl Default for GpuCapabilities {
    fn default() -> Self {
        Self {
            is_supported: true,
            gpu_vendor: GpuVendor::Unknown,
            gpu_name: "Generic Display Adapter".to_string(),
            can_tune_core_clock: true,
            can_tune_memory_clock: true,
            can_tune_power_limit: true,
            can_tune_fan_speed: true,
            voltage_locked: true,
            max_core_offset_mhz: MAX_SAFE_CORE_OFFSET,
            min_core_offset_mhz: MIN_SAFE_CORE_OFFSET,
            max_mem_offset_mhz: MAX_SAFE_MEM_OFFSET,
            min_mem_offset_mhz: MIN_SAFE_MEM_OFFSET,
            max_power_limit_pct: MAX_SAFE_POWER_LIMIT,
            min_power_limit_pct: MIN_SAFE_POWER_LIMIT,
            temp_tripwire_gpu: TRIPWIRE_GPU_TEMP_C,
            temp_tripwire_hotspot: TRIPWIRE_HOTSPOT_TEMP_C,
            temp_tripwire_cpu: TRIPWIRE_CPU_TEMP_C,
            is_in_memory_only: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuTelemetry {
    pub core_clock_mhz: u32,
    pub mem_clock_mhz: u32,
    pub gpu_temp: u32,
    pub gpu_hotspot_temp: Option<u32>,
    pub cpu_temp: Option<u32>,
    pub power_watts: u32,
    pub power_limit_pct: u32,
    pub fan_speed_pct: u32,
    pub fan_rpm: Option<u32>,
    pub gpu_load_pct: u32,
    pub voltage_mv: u32, // Standard stock reading (e.g. 950 mV)
    pub applied_core_offset: i32,
    pub applied_mem_offset: i32,
    pub watchdog_active: bool,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverclockAnalytics {
    pub thermal_headroom_c: f32,
    pub silicon_stability_index: u32,
    pub estimated_fps_gain_pct: f32,
    pub memory_bandwidth_delta_gbps: f32,
    pub gflops_delta: i32,
    pub baseline_temp: u32,
    pub current_temp: u32,
    pub peak_temp_recorded: u32,
    pub tdr_events_detected: u32,
    pub rollback_count: u32,
    pub active_profile_name: String,
    pub last_tuned_timestamp: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoOcStage {
    Preflight,
    MemoryScan,
    CoreScan,
    StressVerify,
    Completed,
    Aborted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoOverclockStep {
    pub stage: AutoOcStage,
    pub current_step: u32,
    pub total_steps: u32,
    pub tested_core_offset: i32,
    pub tested_mem_offset: i32,
    pub current_temp: u32,
    pub stability_score: u32,
    pub status_message: String,
    pub is_safe: bool,
}
