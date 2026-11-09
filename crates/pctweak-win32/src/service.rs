use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
#[cfg(windows)]
use windows_sys::Win32::Foundation::*;
#[cfg(windows)]
use windows_sys::Win32::System::Services::*;
use crate::error::Win32Error;
use crate::registry::to_wide_null;

static CRITICAL_SERVICES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    let mut s = HashSet::new();
    s.insert("rpcss");
    s.insert("rpceptmapper");
    s.insert("dcomlaunch");
    s.insert("plugplay");
    s.insert("audiosrv");
    s.insert("audioendpointbuilder");
    s.insert("dhcp");
    s.insert("dnscache");
    s.insert("cryptsvc");
    s.insert("eventlog");
    s.insert("schedule");
    s.insert("windefend");
    s.insert("mpssvc");
    s.insert("samss");
    s.insert("lsm");
    s.insert("power");
    s.insert("themes");
    s.insert("lanmanworkstation");
    s.insert("lanmanserver");
    s.insert("coremessagingregistrar");
    s.insert("keyiso");
    s.insert("vaultsvc");
    s.insert("brokerinfrastructure");
    s.insert("systemeventsbroker");
    s.insert("wuauserv");
    s.insert("bits");
    s
});

pub fn is_critical_service(service_name: &str) -> bool {
    let lower = service_name.trim().to_ascii_lowercase();
    CRITICAL_SERVICES.contains(lower.as_str())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceStartType {
    Boot = 0,       // SERVICE_BOOT_START
    System = 1,     // SERVICE_SYSTEM_START
    Auto = 2,       // SERVICE_AUTO_START
    Demand = 3,     // SERVICE_DEMAND_START (Manual)
    Disabled = 4,   // SERVICE_DISABLED
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceState {
    Stopped = 1,
    StartPending = 2,
    StopPending = 3,
    Running = 4,
    ContinuePending = 5,
    PausePending = 6,
    Paused = 7,
    Unknown = 0,
}

#[cfg(windows)]
pub struct ScmHandle(pub SC_HANDLE);

#[cfg(windows)]
impl Drop for ScmHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CloseServiceHandle(self.0) };
        }
    }
}

#[cfg(windows)]
pub struct ServiceHandle(pub SC_HANDLE);

#[cfg(windows)]
impl Drop for ServiceHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CloseServiceHandle(self.0) };
        }
    }
}

pub struct ServiceManager;

impl ServiceManager {
    #[cfg(windows)]
    pub fn open_scm(desired_access: u32) -> Result<ScmHandle, Win32Error> {
        let scm = unsafe { OpenSCManagerW(std::ptr::null(), std::ptr::null(), desired_access) };
        if scm.is_null() {
            let err = unsafe { GetLastError() };
            Err(Win32Error::from_win32(err, "OpenSCManagerW", "SCM"))
        } else {
            Ok(ScmHandle(scm))
        }
    }

    pub fn get_service_status(service_name: &str) -> Result<ServiceState, Win32Error> {
        #[cfg(windows)]
        {
            let scm = Self::open_scm(SC_MANAGER_CONNECT)?;
            let name_w = to_wide_null(service_name);
            let srv = unsafe { OpenServiceW(scm.0, name_w.as_ptr(), SERVICE_QUERY_STATUS) };
            if srv.is_null() {
                let err = unsafe { GetLastError() };
                return Err(Win32Error::from_win32(err, "OpenServiceW", service_name));
            }
            let srv = ServiceHandle(srv);

            let mut status: SERVICE_STATUS = unsafe { std::mem::zeroed() };
            let success = unsafe {
                QueryServiceStatus(srv.0, &mut status)
            };

            if success == 0 {
                let err = unsafe { GetLastError() };
                Err(Win32Error::from_win32(err, "QueryServiceStatus", service_name))
            } else {
                Ok(match status.dwCurrentState {
                    1 => ServiceState::Stopped,
                    2 => ServiceState::StartPending,
                    3 => ServiceState::StopPending,
                    4 => ServiceState::Running,
                    5 => ServiceState::ContinuePending,
                    6 => ServiceState::PausePending,
                    7 => ServiceState::Paused,
                    _ => ServiceState::Unknown,
                })
            }
        }
        #[cfg(not(windows))]
        {
            let _ = service_name;
            Err(Win32Error::Raw {
                operation: "QueryServiceStatusProcess",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn configure_startup(service_name: &str, start_type: ServiceStartType) -> Result<(), Win32Error> {
        if is_critical_service(service_name) {
            return Err(Win32Error::CriticalServiceProtected {
                name: service_name.to_string(),
            });
        }

        #[cfg(windows)]
        {
            let scm = Self::open_scm(SC_MANAGER_CONNECT)?;
            let name_w = to_wide_null(service_name);
            let srv = unsafe { OpenServiceW(scm.0, name_w.as_ptr(), SERVICE_CHANGE_CONFIG) };
            if srv.is_null() {
                let err = unsafe { GetLastError() };
                return Err(Win32Error::from_win32(err, "OpenServiceW", service_name));
            }
            let srv = ServiceHandle(srv);

            let success = unsafe {
                ChangeServiceConfigW(
                    srv.0,
                    SERVICE_NO_CHANGE,
                    start_type as u32,
                    SERVICE_NO_CHANGE,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                )
            };

            if success == 0 {
                let err = unsafe { GetLastError() };
                Err(Win32Error::from_win32(err, "ChangeServiceConfigW", service_name))
            } else {
                Ok(())
            }
        }
        #[cfg(not(windows))]
        {
            let _ = start_type;
            Err(Win32Error::Raw {
                operation: "ChangeServiceConfigW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn stop_service(service_name: &str, timeout: Duration) -> Result<(), Win32Error> {
        if is_critical_service(service_name) {
            return Err(Win32Error::CriticalServiceProtected {
                name: service_name.to_string(),
            });
        }

        #[cfg(windows)]
        {
            let scm = Self::open_scm(SC_MANAGER_CONNECT)?;
            let name_w = to_wide_null(service_name);
            let srv = unsafe { OpenServiceW(scm.0, name_w.as_ptr(), SERVICE_STOP | SERVICE_QUERY_STATUS) };
            if srv.is_null() {
                let err = unsafe { GetLastError() };
                return Err(Win32Error::from_win32(err, "OpenServiceW", service_name));
            }
            let srv = ServiceHandle(srv);

            let mut status: SERVICE_STATUS = unsafe { std::mem::zeroed() };
            let success = unsafe { ControlService(srv.0, SERVICE_CONTROL_STOP, &mut status) };
            if success == 0 {
                let err = unsafe { GetLastError() };
                // 1062 = ERROR_SERVICE_NOT_ACTIVE
                if err == 1062 {
                    return Ok(());
                }
                return Err(Win32Error::from_win32(err, "ControlService(STOP)", service_name));
            }

            // Wait loop until SERVICE_STOPPED
            let start = Instant::now();
            while start.elapsed() < timeout {
                let mut status: SERVICE_STATUS = unsafe { std::mem::zeroed() };
                unsafe {
                    QueryServiceStatus(srv.0, &mut status);
                }
                if status.dwCurrentState == SERVICE_STOPPED {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(50));
            }

            Err(Win32Error::ServiceTimeout {
                name: service_name.to_string(),
                desired_state: "STOPPED",
                timeout_ms: timeout.as_millis() as u64,
            })
        }
        #[cfg(not(windows))]
        {
            let _ = timeout;
            Err(Win32Error::Raw {
                operation: "ControlService",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn start_service(service_name: &str) -> Result<(), Win32Error> {
        #[cfg(windows)]
        {
            let scm = Self::open_scm(SC_MANAGER_CONNECT)?;
            let name_w = to_wide_null(service_name);
            let srv = unsafe { OpenServiceW(scm.0, name_w.as_ptr(), SERVICE_START) };
            if srv.is_null() {
                let err = unsafe { GetLastError() };
                return Err(Win32Error::from_win32(err, "OpenServiceW", service_name));
            }
            let srv = ServiceHandle(srv);

            let success = unsafe { StartServiceW(srv.0, 0, std::ptr::null_mut()) };
            if success == 0 {
                let err = unsafe { GetLastError() };
                // 1056 = ERROR_SERVICE_ALREADY_RUNNING
                if err == 1056 {
                    return Ok(());
                }
                Err(Win32Error::from_win32(err, "StartServiceW", service_name))
            } else {
                Ok(())
            }
        }
        #[cfg(not(windows))]
        {
            let _ = service_name;
            Err(Win32Error::Raw {
                operation: "StartServiceW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }
}
