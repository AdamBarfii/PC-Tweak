#[cfg(windows)]
use windows_sys::Win32::Foundation::{BOOL, FILETIME};
#[cfg(windows)]
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use crate::error::Win32Error;

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetSystemTimes(
        lp_idle_time: *mut FILETIME,
        lp_kernel_time: *mut FILETIME,
        lp_user_time: *mut FILETIME,
    ) -> BOOL;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SystemCpuSnapshot {
    pub idle_time: u64,
    pub kernel_time: u64,
    pub user_time: u64,
}

#[cfg(windows)]
fn filetime_to_u64(ft: FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64)
}

pub fn get_cpu_snapshot() -> Result<SystemCpuSnapshot, Win32Error> {
    #[cfg(windows)]
    unsafe {
        let mut idle = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };

        let success = GetSystemTimes(&mut idle, &mut kernel, &mut user);
        if success == 0 {
            return Err(Win32Error::Raw {
                operation: "GetSystemTimes",
                code: 0,
                message: "Failed to get system times".into(),
            });
        }

        Ok(SystemCpuSnapshot {
            idle_time: filetime_to_u64(idle),
            kernel_time: filetime_to_u64(kernel),
            user_time: filetime_to_u64(user),
        })
    }
    #[cfg(not(windows))]
    {
        Err(Win32Error::Raw {
            operation: "GetSystemTimes",
            code: 0,
            message: "Non-windows platform".into(),
        })
    }
}

pub fn calculate_cpu_usage(prev: SystemCpuSnapshot, curr: SystemCpuSnapshot) -> f32 {
    let idle_delta = curr.idle_time.saturating_sub(prev.idle_time);
    let kernel_delta = curr.kernel_time.saturating_sub(prev.kernel_time);
    let user_delta = curr.user_time.saturating_sub(prev.user_time);

    let total = kernel_delta + user_delta; // on Windows, kernel time includes idle
    if total == 0 {
        return 0.0;
    }
    let busy = total.saturating_sub(idle_delta);
    ((busy as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as f32
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemoryTelemetry {
    pub load_percent: u32,
    pub total_phys_bytes: u64,
    pub avail_phys_bytes: u64,
    pub used_phys_bytes: u64,
}

pub fn get_memory_telemetry() -> Result<MemoryTelemetry, Win32Error> {
    #[cfg(windows)]
    unsafe {
        let mut status: MEMORYSTATUSEX = std::mem::zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;

        let success = GlobalMemoryStatusEx(&mut status);
        if success == 0 {
            return Err(Win32Error::Raw {
                operation: "GlobalMemoryStatusEx",
                code: 0,
                message: "Failed to get memory status".into(),
            });
        }

        Ok(MemoryTelemetry {
            load_percent: status.dwMemoryLoad,
            total_phys_bytes: status.ullTotalPhys,
            avail_phys_bytes: status.ullAvailPhys,
            used_phys_bytes: status.ullTotalPhys.saturating_sub(status.ullAvailPhys),
        })
    }
    #[cfg(not(windows))]
    {
        Err(Win32Error::Raw {
            operation: "GlobalMemoryStatusEx",
            code: 0,
            message: "Non-windows platform".into(),
        })
    }
}
