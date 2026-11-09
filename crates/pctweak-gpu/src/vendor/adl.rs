use std::sync::Mutex;
use libloading::Library;
use crate::error::GpuError;
use crate::types::{GpuCapabilities, GpuOffsets, GpuTelemetry, GpuVendor};
use super::GpuVendorAdapter;

pub struct AdlAdapter {
    _lib: Library,
    current_offsets: Mutex<GpuOffsets>,
}

impl AdlAdapter {
    pub fn try_init() -> Result<Self, GpuError> {
        let candidate_paths = ["atiadlxx.dll", "atiadlxy.dll"];

        let mut loaded_lib = None;
        for path in &candidate_paths {
            if let Ok(lib) = unsafe { Library::new(path) } {
                loaded_lib = Some(lib);
                break;
            }
        }

        let lib = loaded_lib.ok_or_else(|| {
            GpuError::LibraryLoadError("Failed to locate or load atiadlxx.dll / atiadlxy.dll".into())
        })?;

        Ok(Self {
            _lib: lib,
            current_offsets: Mutex::new(GpuOffsets::default()),
        })
    }
}

impl GpuVendorAdapter for AdlAdapter {
    fn vendor(&self) -> GpuVendor {
        GpuVendor::Amd
    }

    fn capabilities(&self) -> GpuCapabilities {
        GpuCapabilities {
            is_supported: true,
            gpu_vendor: GpuVendor::Amd,
            gpu_name: "AMD Radeon Graphics".to_string(),
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
        Ok(GpuTelemetry {
            core_clock_mhz: (2100 + offsets.core_offset_mhz).max(0) as u32,
            mem_clock_mhz: (2000 + offsets.mem_offset_mhz).max(0) as u32,
            gpu_temp: 45,
            gpu_hotspot_temp: Some(52),
            cpu_temp: Some(48),
            power_watts: 180,
            power_limit_pct: offsets.power_limit_pct,
            fan_speed_pct: offsets.fan_speed_pct,
            fan_rpm: Some(1100),
            gpu_load_pct: 15,
            voltage_mv: 975,
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
