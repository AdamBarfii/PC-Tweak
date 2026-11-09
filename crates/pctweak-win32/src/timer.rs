#[cfg(windows)]
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleA, GetProcAddress};
use crate::error::Win32Error;

#[cfg(windows)]
#[link(name = "winmm")]
unsafe extern "system" {
    fn timeBeginPeriod(u_period: u32) -> u32;
    fn timeEndPeriod(u_period: u32) -> u32;
}

#[cfg(windows)]
type NtQueryTimerResolutionFn = unsafe extern "system" fn(
    minimum_resolution: *mut u32,
    maximum_resolution: *mut u32,
    actual_resolution: *mut u32,
) -> i32;

#[cfg(windows)]
type NtSetTimerResolutionFn = unsafe extern "system" fn(
    desired_resolution: u32,
    set_resolution: u8,
    actual_resolution: *mut u32,
) -> i32;

pub struct TimerResolutionGuard {
    pub desired_100ns: u32,
    pub active: bool,
}

impl TimerResolutionGuard {
    pub fn request_half_millisecond() -> Result<Self, Win32Error> {
        Self::request(5000) // 5000 * 100ns = 0.500 ms
    }

    pub fn request(desired_100ns: u32) -> Result<Self, Win32Error> {
        #[cfg(windows)]
        unsafe {
            timeBeginPeriod(1);

            let ntdll = GetModuleHandleA(b"ntdll.dll\0".as_ptr());
            if !ntdll.is_null() {
                let proc = GetProcAddress(ntdll, b"NtSetTimerResolution\0".as_ptr());
                if let Some(set_fn) = proc {
                    let set_timer: NtSetTimerResolutionFn = std::mem::transmute(set_fn);
                    let mut actual = 0u32;
                    let status = set_timer(desired_100ns, 1, &mut actual);
                    if status == 0 {
                        return Ok(Self {
                            desired_100ns,
                            active: true,
                        });
                    }
                }
            }
            Ok(Self {
                desired_100ns,
                active: true,
            })
        }
        #[cfg(not(windows))]
        {
            Ok(Self {
                desired_100ns,
                active: false,
            })
        }
    }
}

impl Drop for TimerResolutionGuard {
    fn drop(&mut self) {
        if self.active {
            #[cfg(windows)]
            unsafe {
                timeEndPeriod(1);
                let ntdll = GetModuleHandleA(b"ntdll.dll\0".as_ptr());
                if !ntdll.is_null() {
                    let proc = GetProcAddress(ntdll, b"NtSetTimerResolution\0".as_ptr());
                    if let Some(set_fn) = proc {
                        let set_timer: NtSetTimerResolutionFn = std::mem::transmute(set_fn);
                        let mut actual = 0u32;
                        let _ = set_timer(self.desired_100ns, 0, &mut actual);
                    }
                }
            }
        }
    }
}

pub fn query_timer_resolution() -> Result<(u32, u32, u32), Win32Error> {
    #[cfg(windows)]
    unsafe {
        let ntdll = GetModuleHandleA(b"ntdll.dll\0".as_ptr());
        if !ntdll.is_null() {
            let proc = GetProcAddress(ntdll, b"NtQueryTimerResolution\0".as_ptr());
            if let Some(query_fn) = proc {
                let query_timer: NtQueryTimerResolutionFn = std::mem::transmute(query_fn);
                let mut min_res = 0u32;
                let mut max_res = 0u32;
                let mut actual = 0u32;
                let status = query_timer(&mut min_res, &mut max_res, &mut actual);
                if status == 0 {
                    return Ok((min_res, max_res, actual));
                }
            }
        }
        // Fallback default (15.625ms, 0.5ms, 1.0ms in 100ns units)
        Ok((156250, 5000, 10000))
    }
    #[cfg(not(windows))]
    {
        Ok((156250, 5000, 10000))
    }
}
