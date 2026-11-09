use std::ffi::{c_char, c_void, CStr};
use std::sync::Mutex;
use libloading::{Library, Symbol};
use crate::error::GpuError;
use crate::types::{GpuCapabilities, GpuOffsets, GpuTelemetry, GpuVendor};
use super::GpuVendorAdapter;

type NvmlReturn = i32;
const NVML_SUCCESS: NvmlReturn = 0;
const NVML_TEMPERATURE_GPU: u32 = 0;
const NVML_CLOCK_GRAPHICS: u32 = 0;
const NVML_CLOCK_MEM: u32 = 2;

pub type NvmlDevice = *mut c_void;

#[repr(C)]
pub struct NvmlUtilization {
    pub gpu: u32,
    pub memory: u32,
}

pub struct NvmlBindings {
    _lib: Library,
    pub init: unsafe extern "C" fn() -> NvmlReturn,
    pub shutdown: unsafe extern "C" fn() -> NvmlReturn,
    pub device_get_count: unsafe extern "C" fn(*mut u32) -> NvmlReturn,
    pub device_get_handle_by_index: unsafe extern "C" fn(u32, *mut NvmlDevice) -> NvmlReturn,
    pub device_get_name: unsafe extern "C" fn(NvmlDevice, *mut c_char, u32) -> NvmlReturn,
    pub device_get_temperature: unsafe extern "C" fn(NvmlDevice, u32, *mut u32) -> NvmlReturn,
    pub device_get_clock_info: unsafe extern "C" fn(NvmlDevice, u32, *mut u32) -> NvmlReturn,
    pub device_get_power_usage: unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn,
    pub device_get_utilization_rates: unsafe extern "C" fn(NvmlDevice, *mut NvmlUtilization) -> NvmlReturn,
    pub device_get_fan_speed: unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn,
    pub device_set_gpc_clk_vf_offset: Option<unsafe extern "C" fn(NvmlDevice, i32) -> NvmlReturn>,
    pub device_set_mem_clk_vf_offset: Option<unsafe extern "C" fn(NvmlDevice, i32) -> NvmlReturn>,
    pub device_set_power_management_limit: Option<unsafe extern "C" fn(NvmlDevice, u32) -> NvmlReturn>,
    pub device_reset_gpu_locked_clocks: Option<unsafe extern "C" fn(NvmlDevice) -> NvmlReturn>,
    pub error_string: unsafe extern "C" fn(NvmlReturn) -> *const c_char,
}

impl NvmlBindings {
    pub fn try_load() -> Result<Self, GpuError> {
        let candidate_paths = [
            "nvml.dll",
            r"C:\Windows\System32\nvml.dll",
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvml.dll",
        ];

        let mut loaded_lib = None;
        for path in &candidate_paths {
            if let Ok(lib) = unsafe { Library::new(path) } {
                loaded_lib = Some(lib);
                break;
            }
        }

        let lib = loaded_lib.ok_or_else(|| {
            GpuError::LibraryLoadError("Failed to locate or load nvml.dll".into())
        })?;

        unsafe {
            let init: Symbol<unsafe extern "C" fn() -> NvmlReturn> = lib
                .get(b"nvmlInit_v2")
                .or_else(|_| lib.get(b"nvmlInit"))
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing nvmlInit: {e}")))?;

            let shutdown: Symbol<unsafe extern "C" fn() -> NvmlReturn> = lib
                .get(b"nvmlShutdown")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing nvmlShutdown: {e}")))?;

            let device_get_count: Symbol<unsafe extern "C" fn(*mut u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetCount_v2")
                .or_else(|_| lib.get(b"nvmlDeviceGetCount"))
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing device count: {e}")))?;

            let device_get_handle_by_index: Symbol<unsafe extern "C" fn(u32, *mut NvmlDevice) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetHandleByIndex_v2")
                .or_else(|_| lib.get(b"nvmlDeviceGetHandleByIndex"))
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing handle by index: {e}")))?;

            let device_get_name: Symbol<unsafe extern "C" fn(NvmlDevice, *mut c_char, u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetName")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing get name: {e}")))?;

            let device_get_temperature: Symbol<unsafe extern "C" fn(NvmlDevice, u32, *mut u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetTemperature")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing get temp: {e}")))?;

            let device_get_clock_info: Symbol<unsafe extern "C" fn(NvmlDevice, u32, *mut u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetClockInfo")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing clock info: {e}")))?;

            let device_get_power_usage: Symbol<unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetPowerUsage")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing power usage: {e}")))?;

            let device_get_utilization_rates: Symbol<unsafe extern "C" fn(NvmlDevice, *mut NvmlUtilization) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetUtilizationRates")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing utilization: {e}")))?;

            let device_get_fan_speed: Symbol<unsafe extern "C" fn(NvmlDevice, *mut u32) -> NvmlReturn> = lib
                .get(b"nvmlDeviceGetFanSpeed")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing fan speed: {e}")))?;

            let error_string: Symbol<unsafe extern "C" fn(NvmlReturn) -> *const c_char> = lib
                .get(b"nvmlErrorString")
                .map_err(|e| GpuError::LibraryLoadError(format!("Missing error string: {e}")))?;

            let device_set_gpc_clk_vf_offset = lib.get(b"nvmlDeviceSetGpcClkVfOffset").ok().map(|s| *s);
            let device_set_mem_clk_vf_offset = lib.get(b"nvmlDeviceSetMemClkVfOffset").ok().map(|s| *s);
            let device_set_power_management_limit = lib.get(b"nvmlDeviceSetPowerManagementLimit").ok().map(|s| *s);
            let device_reset_gpu_locked_clocks = lib.get(b"nvmlDeviceResetGpuLockedClocks").ok().map(|s| *s);

            Ok(Self {
                init: *init,
                shutdown: *shutdown,
                device_get_count: *device_get_count,
                device_get_handle_by_index: *device_get_handle_by_index,
                device_get_name: *device_get_name,
                device_get_temperature: *device_get_temperature,
                device_get_clock_info: *device_get_clock_info,
                device_get_power_usage: *device_get_power_usage,
                device_get_utilization_rates: *device_get_utilization_rates,
                device_get_fan_speed: *device_get_fan_speed,
                device_set_gpc_clk_vf_offset,
                device_set_mem_clk_vf_offset,
                device_set_power_management_limit,
                device_reset_gpu_locked_clocks,
                error_string: *error_string,
                _lib: lib,
            })
        }
    }
}

pub struct NvmlAdapter {
    bindings: NvmlBindings,
    device: NvmlDevice,
    device_name: String,
    current_offsets: Mutex<GpuOffsets>,
}

unsafe impl Send for NvmlAdapter {}
unsafe impl Sync for NvmlAdapter {}

impl NvmlAdapter {
    pub fn try_init() -> Result<Self, GpuError> {
        let bindings = NvmlBindings::try_load()?;
        unsafe {
            let res = (bindings.init)();
            if res != NVML_SUCCESS {
                return Err(GpuError::DriverApiError("nvmlInit failed".into()));
            }

            let mut count = 0u32;
            (bindings.device_get_count)(&mut count);
            if count == 0 {
                (bindings.shutdown)();
                return Err(GpuError::DriverApiError("No NVIDIA GPUs found".into()));
            }

            let mut device: NvmlDevice = std::ptr::null_mut();
            (bindings.device_get_handle_by_index)(0, &mut device);

            let mut name_buf = [0i8; 64];
            (bindings.device_get_name)(device, name_buf.as_mut_ptr(), 64);
            let device_name = CStr::from_ptr(name_buf.as_ptr())
                .to_string_lossy()
                .into_owned();

            Ok(Self {
                bindings,
                device,
                device_name,
                current_offsets: Mutex::new(GpuOffsets::default()),
            })
        }
    }
}

impl Drop for NvmlAdapter {
    fn drop(&mut self) {
        let _ = self.reset_to_stock();
        unsafe {
            (self.bindings.shutdown)();
        }
    }
}

impl GpuVendorAdapter for NvmlAdapter {
    fn vendor(&self) -> GpuVendor {
        GpuVendor::Nvidia
    }

    fn capabilities(&self) -> GpuCapabilities {
        GpuCapabilities {
            is_supported: true,
            gpu_vendor: GpuVendor::Nvidia,
            gpu_name: self.device_name.clone(),
            can_tune_core_clock: self.bindings.device_set_gpc_clk_vf_offset.is_some(),
            can_tune_memory_clock: self.bindings.device_set_mem_clk_vf_offset.is_some(),
            can_tune_power_limit: self.bindings.device_set_power_management_limit.is_some(),
            can_tune_fan_speed: false,
            voltage_locked: true,
            ..Default::default()
        }
    }

    fn get_telemetry(&self) -> Result<GpuTelemetry, GpuError> {
        unsafe {
            let mut temp = 0u32;
            (self.bindings.device_get_temperature)(self.device, NVML_TEMPERATURE_GPU, &mut temp);

            let mut core_clock = 0u32;
            (self.bindings.device_get_clock_info)(self.device, NVML_CLOCK_GRAPHICS, &mut core_clock);

            let mut mem_clock = 0u32;
            (self.bindings.device_get_clock_info)(self.device, NVML_CLOCK_MEM, &mut mem_clock);

            let mut power_milliwatts = 0u32;
            (self.bindings.device_get_power_usage)(self.device, &mut power_milliwatts);

            let mut util = NvmlUtilization { gpu: 0, memory: 0 };
            (self.bindings.device_get_utilization_rates)(self.device, &mut util);

            let mut fan = 0u32;
            let _ = (self.bindings.device_get_fan_speed)(self.device, &mut fan);

            let offsets = self.current_offsets.lock().unwrap().clone();

            Ok(GpuTelemetry {
                core_clock_mhz: core_clock,
                mem_clock_mhz: mem_clock,
                gpu_temp: temp,
                gpu_hotspot_temp: None,
                cpu_temp: None,
                power_watts: power_milliwatts / 1000,
                power_limit_pct: offsets.power_limit_pct,
                fan_speed_pct: fan,
                fan_rpm: None,
                gpu_load_pct: util.gpu,
                voltage_mv: 950,
                applied_core_offset: offsets.core_offset_mhz,
                applied_mem_offset: offsets.mem_offset_mhz,
                watchdog_active: true,
                timestamp_ms: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            })
        }
    }

    fn apply_in_memory_offsets(&self, offsets: &GpuOffsets) -> Result<(), GpuError> {
        let validated = offsets.clamp_and_validate()?;

        unsafe {
            if let Some(set_core) = self.bindings.device_set_gpc_clk_vf_offset {
                // NVML offset in kHz (offset_mhz * 1000)
                let ret = set_core(self.device, validated.core_offset_mhz * 1000);
                if ret != NVML_SUCCESS {
                    return Err(GpuError::DriverApiError("Failed to set core clock offset".into()));
                }
            }

            if let Some(set_mem) = self.bindings.device_set_mem_clk_vf_offset {
                let ret = set_mem(self.device, validated.mem_offset_mhz * 1000);
                if ret != NVML_SUCCESS {
                    return Err(GpuError::DriverApiError("Failed to set memory clock offset".into()));
                }
            }
        }

        *self.current_offsets.lock().unwrap() = validated;
        Ok(())
    }

    fn reset_to_stock(&self) -> Result<(), GpuError> {
        let stock = GpuOffsets::default();
        let _ = self.apply_in_memory_offsets(&stock);
        if let Some(reset_fn) = self.bindings.device_reset_gpu_locked_clocks {
            unsafe {
                reset_fn(self.device);
            }
        }
        Ok(())
    }
}
