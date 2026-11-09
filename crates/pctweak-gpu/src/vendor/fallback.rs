use std::sync::Mutex;
use crate::error::GpuError;
use crate::types::{GpuCapabilities, GpuOffsets, GpuTelemetry, GpuVendor};
use super::GpuVendorAdapter;

pub struct FallbackAdapter {
    current_offsets: Mutex<GpuOffsets>,
    baseline_temp: u32,
}

impl FallbackAdapter {
    pub fn new() -> Self {
        Self {
            current_offsets: Mutex::new(GpuOffsets::default()),
            baseline_temp: 42,
        }
    }

    pub fn with_temp(temp: u32) -> Self {
        Self {
            current_offsets: Mutex::new(GpuOffsets::default()),
            baseline_temp: temp,
        }
    }
}

impl Default for FallbackAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl GpuVendorAdapter for FallbackAdapter {
    fn vendor(&self) -> GpuVendor {
        GpuVendor::Unknown
    }

    fn capabilities(&self) -> GpuCapabilities {
        GpuCapabilities {
            is_supported: true,
            gpu_vendor: GpuVendor::Unknown,
            gpu_name: "Fallback Virtual GPU Adapter".to_string(),
            can_tune_core_clock: true,
            can_tune_memory_clock: true,
            can_tune_power_limit: true,
            can_tune_fan_speed: true,
            voltage_locked: true,
            ..Default::default()
        }
    }

    fn get_telemetry(&self) -> Result<GpuTelemetry, GpuError> {
        let offsets = self.current_offsets.lock().unwrap().clone();
        let core_clock = (1750 + offsets.core_offset_mhz).max(0) as u32;
        let mem_clock = (7000 + offsets.mem_offset_mhz).max(0) as u32;

        Ok(GpuTelemetry {
            core_clock_mhz: core_clock,
            mem_clock_mhz: mem_clock,
            gpu_temp: self.baseline_temp,
            gpu_hotspot_temp: Some(self.baseline_temp + 8),
            cpu_temp: Some(48),
            power_watts: 145,
            power_limit_pct: offsets.power_limit_pct,
            fan_speed_pct: offsets.fan_speed_pct,
            fan_rpm: Some(1200),
            gpu_load_pct: 12,
            voltage_mv: 950, // Stock voltage reading
            applied_core_offset: offsets.core_offset_mhz,
            applied_mem_offset: offsets.mem_offset_mhz,
            watchdog_active: true,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        })
    }

    fn apply_in_memory_offsets(&self, offsets: &GpuOffsets) -> Result<(), GpuError> {
        let validated = offsets.clamp_and_validate()?;
        *self.current_offsets.lock().unwrap() = validated;
        Ok(())
    }

    fn reset_to_stock(&self) -> Result<(), GpuError> {
        *self.current_offsets.lock().unwrap() = GpuOffsets::default();
        Ok(())
    }
}
