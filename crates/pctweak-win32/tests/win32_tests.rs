use pctweak_win32::error::Win32Error;
use pctweak_win32::mock::{MockRegistryStore, MockServiceStore, RegistryBackend, ServiceBackend};
use pctweak_win32::registry::{to_wide_null, RegHive, RegValue};
use pctweak_win32::security::is_process_elevated;
use pctweak_win32::service::{is_critical_service, ServiceManager, ServiceStartType, ServiceState};
use pctweak_win32::telemetry::{calculate_cpu_usage, get_cpu_snapshot, get_memory_telemetry, SystemCpuSnapshot};
use pctweak_win32::timer::{query_timer_resolution, TimerResolutionGuard};
use std::time::Duration;

#[test]
fn test_critical_service_whitelist_invariant() {
    let critical_list = [
        "rpcss", "rpceptmapper", "dcomlaunch", "plugplay", "audiosrv",
        "audioendpointbuilder", "dhcp", "dnscache", "cryptsvc", "eventlog",
        "schedule", "windefend", "mpssvc", "samss", "lsm", "power", "themes",
        "lanmanworkstation", "lanmanserver", "coremessagingregistrar", "keyiso",
        "vaultsvc", "brokerinfrastructure", "systemeventsbroker", "wuauserv", "bits",
    ];

    assert_eq!(critical_list.len(), 26);

    for &srv in &critical_list {
        assert!(is_critical_service(srv), "Service '{}' should be critical", srv);
        assert!(is_critical_service(&srv.to_uppercase()), "Case-insensitive check for '{}'", srv);

        // Attempting to stop or configure via ServiceManager must be rejected
        let stop_res = ServiceManager::stop_service(srv, Duration::from_millis(100));
        assert_eq!(
            stop_res,
            Err(Win32Error::CriticalServiceProtected {
                name: srv.to_string()
            })
        );

        let cfg_res = ServiceManager::configure_startup(srv, ServiceStartType::Disabled);
        assert_eq!(
            cfg_res,
            Err(Win32Error::CriticalServiceProtected {
                name: srv.to_string()
            })
        );
    }

    // Non-critical services should return false
    assert!(!is_critical_service("DiagTrack"));
    assert!(!is_critical_service("XboxGipSvc"));
    assert!(!is_critical_service("SysMain"));
}

#[test]
fn test_to_wide_null_encoding() {
    let wide = to_wide_null("Hello");
    assert_eq!(wide, vec![72, 101, 108, 108, 111, 0]);

    let wide_empty = to_wide_null("");
    assert_eq!(wide_empty, vec![0]);
}

#[test]
fn test_cpu_and_memory_telemetry() {
    let snap1 = get_cpu_snapshot();
    assert!(snap1.is_ok());
    let s1 = snap1.unwrap();

    let snap2 = SystemCpuSnapshot {
        idle_time: s1.idle_time + 1000,
        kernel_time: s1.kernel_time + 2000,
        user_time: s1.user_time + 1000,
    };

    let usage = calculate_cpu_usage(s1, snap2);
    assert!(usage >= 0.0 && usage <= 100.0);

    let mem = get_memory_telemetry();
    assert!(mem.is_ok());
    let m = mem.unwrap();
    assert!(m.load_percent <= 100);
    assert!(m.total_phys_bytes > 0);
    assert_eq!(m.used_phys_bytes + m.avail_phys_bytes, m.total_phys_bytes);
}

#[test]
fn test_timer_resolution_guard() {
    let (min_res, max_res, cur_res) = query_timer_resolution().unwrap();
    assert!(min_res > 0);
    assert!(max_res > 0);
    assert!(cur_res > 0);

    // Request 0.5ms resolution
    let guard = TimerResolutionGuard::request_half_millisecond().unwrap();
    assert_eq!(guard.desired_100ns, 5000);
    assert!(guard.active);
    // Automatically drops and restores timer period cleanly
}

#[test]
fn test_mock_registry_backend() {
    let store = MockRegistryStore::new();

    // Verify NotFound initially
    let not_found = store.get_value(RegHive::HkeyLocalMachine, "Software\\Test", "NonExistent");
    assert!(matches!(not_found, Err(Win32Error::NotFound { .. })));

    // Set value
    store
        .set_value(
            RegHive::HkeyLocalMachine,
            "Software\\Test",
            "SettingA",
            &RegValue::Dword(123),
        )
        .unwrap();

    // Read back
    let val = store
        .get_value(RegHive::HkeyLocalMachine, "Software\\Test", "SettingA")
        .unwrap();
    assert_eq!(val, RegValue::Dword(123));

    // Delete value
    store
        .delete_value(RegHive::HkeyLocalMachine, "Software\\Test", "SettingA")
        .unwrap();
    let after_del = store.get_value(RegHive::HkeyLocalMachine, "Software\\Test", "SettingA");
    assert!(matches!(after_del, Err(Win32Error::NotFound { .. })));
}

#[test]
fn test_mock_service_backend() {
    let store = MockServiceStore::new();

    // Register a mock service
    store.register_service("test_service", ServiceState::Stopped, ServiceStartType::Demand);

    let status = store.get_status("test_service").unwrap();
    assert_eq!(status, ServiceState::Stopped);

    store.start_service("test_service").unwrap();
    assert_eq!(store.get_status("test_service").unwrap(), ServiceState::Running);

    store.stop_service("test_service").unwrap();
    assert_eq!(store.get_status("test_service").unwrap(), ServiceState::Stopped);

    // Critical service protection in mock
    let err = store.stop_service("rpcss").unwrap_err();
    assert!(matches!(err, Win32Error::CriticalServiceProtected { .. }));
}

#[test]
fn test_security_elevation_check() {
    let is_elevated = is_process_elevated();
    // Simply asserting that it returns a bool without crashing or panicking
    let _ = is_elevated;
}
