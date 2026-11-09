use std::time::Duration;
use pctweak_win32::error::Win32Error;
use pctweak_win32::mock::{MockRegistryStore, MockServiceStore, RegistryBackend, ServiceBackend};
use pctweak_win32::registry::{to_wide_null, RegHive, RegValue};
use pctweak_win32::service::{is_critical_service, ServiceManager, ServiceStartType, ServiceState};
use pctweak_win32::telemetry::{calculate_cpu_usage, get_cpu_snapshot, get_memory_telemetry};
use pctweak_win32::timer::{query_timer_resolution, TimerResolutionGuard};

// =========================================================================
// 1. CRITICAL SERVICE WHITELIST & TAMPER PROTECTION HARNESS
// =========================================================================

#[test]
fn test_adversarial_all_26_critical_services_protection() {
    let critical_services = [
        "RpcSs",
        "Rpceptmapper",
        "DcomLaunch",
        "PlugPlay",
        "Audiosrv",
        "AudioEndpointBuilder",
        "Dhcp",
        "Dnscache",
        "CryptSvc",
        "EventLog",
        "Schedule",
        "WinDefend",
        "mpssvc",
        "SamSs",
        "LSM",
        "Power",
        "Themes",
        "LanmanWorkstation",
        "LanmanServer",
        "CoreMessagingRegistrar",
        "KeyIso",
        "VaultSvc",
        "BrokerInfrastructure",
        "SystemEventsBroker",
        "wuauserv",
        "bits",
    ];

    assert_eq!(critical_services.len(), 26, "Expected exactly 26 critical Windows services");

    for &svc in &critical_services {
        // 1. Standard casing
        assert!(
            is_critical_service(svc),
            "Critical service '{}' not recognized by whitelist",
            svc
        );

        // 2. Case variations (lower, upper, mixed, whitespace)
        assert!(is_critical_service(&svc.to_lowercase()));
        assert!(is_critical_service(&svc.to_uppercase()));
        assert!(is_critical_service(&format!("  {}  ", svc)));

        // 3. ServiceManager::configure_startup MUST reject with CriticalServiceProtected
        let config_res = ServiceManager::configure_startup(svc, ServiceStartType::Disabled);
        assert!(config_res.is_err(), "ServiceManager::configure_startup must fail on critical service '{}'", svc);
        match config_res.unwrap_err() {
            Win32Error::CriticalServiceProtected { name } => {
                assert_eq!(name, svc);
            }
            other => panic!("Expected CriticalServiceProtected, got {:?}", other),
        }

        // 4. ServiceManager::stop_service MUST reject with CriticalServiceProtected
        let stop_res = ServiceManager::stop_service(svc, Duration::from_millis(100));
        assert!(stop_res.is_err(), "ServiceManager::stop_service must fail on critical service '{}'", svc);
        match stop_res.unwrap_err() {
            Win32Error::CriticalServiceProtected { name } => {
                assert_eq!(name, svc);
            }
            other => panic!("Expected CriticalServiceProtected, got {:?}", other),
        }
    }

    // Non-critical services MUST return false
    let non_critical = [
        "DiagTrack",
        "WerSvc",
        "MapsBroker",
        "dmwappushservice",
        "RetailDemo",
        "XblAuthManager",
        "XboxGipSvc",
    ];
    for &svc in &non_critical {
        assert!(!is_critical_service(svc), "Service '{}' should NOT be marked critical", svc);
    }
}

// =========================================================================
// 2. WIDE STRING ENCODING & REGISTRY VALUES
// =========================================================================

#[test]
fn test_adversarial_wide_null_encoding_edge_cases() {
    // Empty string
    let empty_w = to_wide_null("");
    assert_eq!(empty_w, vec![0]);

    // Standard ASCII
    let ascii_w = to_wide_null("ABC");
    assert_eq!(ascii_w, vec![65, 66, 67, 0]);

    // Unicode string with Persian characters
    let unicode_str = "تنظیمات";
    let unicode_w = to_wide_null(unicode_str);
    assert_eq!(unicode_w.last(), Some(&0));
    assert_eq!(unicode_w.len(), unicode_str.encode_utf16().count() + 1);
}

#[test]
fn test_mock_registry_store_transactions_and_clobbering() {
    let mock = MockRegistryStore::new();

    // Set Dword
    mock.set_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl", &RegValue::Dword(2)).unwrap();
    let val = mock.get_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl").unwrap();
    assert_eq!(val, RegValue::Dword(2));

    // Overwrite with Sz
    mock.set_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl", &RegValue::Sz("Performance".into())).unwrap();
    let val2 = mock.get_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl").unwrap();
    assert_eq!(val2, RegValue::Sz("Performance".into()));

    // Delete value
    mock.delete_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl").unwrap();
    let val3 = mock.get_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl");
    assert!(val3.is_err());

    // Deleting again should be idempotent
    assert!(mock.delete_value(RegHive::HkeyLocalMachine, "SYSTEM\\CurrentControlSet\\Control", "PriorityControl").is_ok());
}

#[test]
fn test_mock_service_store_lifecycle() {
    let mock = MockServiceStore::new();

    mock.register_service("WerSvc", ServiceState::Running, ServiceStartType::Auto);
    assert_eq!(mock.get_status("WerSvc").unwrap(), ServiceState::Running);

    mock.configure_startup("WerSvc", ServiceStartType::Disabled).unwrap();
    mock.stop_service("WerSvc").unwrap();
    assert_eq!(mock.get_status("WerSvc").unwrap(), ServiceState::Stopped);

    mock.start_service("WerSvc").unwrap();
    assert_eq!(mock.get_status("WerSvc").unwrap(), ServiceState::Running);

    // Critical service attempt in mock
    mock.register_service("RpcSs", ServiceState::Running, ServiceStartType::Auto);
    let err = mock.stop_service("RpcSs").unwrap_err();
    match err {
        Win32Error::CriticalServiceProtected { name } => assert_eq!(name, "RpcSs"),
        other => panic!("Expected CriticalServiceProtected, got {:?}", other),
    }
}

// =========================================================================
// 3. HIGH-FREQUENCY CPU TELEMETRY & WORKING SET STRESS
// =========================================================================

#[test]
fn test_adversarial_high_frequency_cpu_and_memory_telemetry() {
    // Stress call get_cpu_snapshot() and calculate_cpu_usage() in rapid loop
    let mut prev = get_cpu_snapshot().expect("Failed to get initial CPU snapshot");
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(5));
        let curr = get_cpu_snapshot().expect("Failed to get CPU snapshot");
        let cpu = calculate_cpu_usage(prev, curr);
        assert!(
            cpu >= 0.0 && cpu <= 100.0,
            "CPU usage {}% out of bounds [0, 100]",
            cpu
        );
        prev = curr;
    }

    // Inspect memory working set telemetry
    let mem = get_memory_telemetry().expect("Failed to query GlobalMemoryStatusEx");
    // total_phys_bytes > 1GB
    assert!(mem.total_phys_bytes > 1_000_000_000, "Total physical RAM must be > 1GB");
    assert!(mem.avail_phys_bytes > 0, "Available physical RAM must be > 0");
    assert!(mem.avail_phys_bytes <= mem.total_phys_bytes, "Avail RAM cannot exceed total RAM");
    assert!(mem.load_percent <= 100, "Memory load % cannot exceed 100%");
    assert_eq!(mem.used_phys_bytes, mem.total_phys_bytes - mem.avail_phys_bytes);
}

#[test]
fn test_timer_resolution_guard_lifecycle() {
    let guard = TimerResolutionGuard::request_half_millisecond();
    assert!(guard.is_ok(), "Failed to request 0.5ms timer resolution");

    let g = guard.unwrap();
    assert!(g.active, "TimerResolutionGuard must be active");
    assert_eq!(g.desired_100ns, 5000); // 5000 * 100ns = 0.5ms

    let (min_res, max_res, actual_res) = query_timer_resolution().expect("Failed to query timer resolution");
    assert!(min_res > 0);
    assert!(max_res > 0);
    assert!(actual_res > 0);

    drop(g); // Drops and restores system resolution
}
