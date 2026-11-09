use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pctweak_core::models::anticheat::{AntiCheatVetoGate, TweakSafetyLevel};
use pctweak_core::error::CoreError;
use pctweak_gpu::auto_oc::AutoOcScanner;
use pctweak_gpu::error::GpuError;
use pctweak_gpu::types::{
    GpuOffsets, CEILING_CORE_TEMP_C, CEILING_MEM_TEMP_C,
    MAX_SAFE_CORE_OFFSET, MAX_SAFE_MEM_OFFSET, MAX_SAFE_POWER_LIMIT,
    MIN_SAFE_CORE_OFFSET, MIN_SAFE_MEM_OFFSET, MIN_SAFE_POWER_LIMIT,
};
use pctweak_gpu::vendor::{FallbackAdapter, GpuVendorAdapter};
use pctweak_gpu::watchdog::{RevertCallback, TempSampler, WatchdogHandle};

// =========================================================================
// 1. ADVERSARIAL GPU OFFSETS BOUNDARIES & EXTREMES
// =========================================================================

#[test]
fn test_adversarial_core_offset_bounds_and_extremes() {
    let test_cases = vec![
        // (input_core, expected_clamped)
        (-51, MIN_SAFE_CORE_OFFSET),
        (-50, MIN_SAFE_CORE_OFFSET),
        (-49, -49),
        (0, 0),
        (119, 119),
        (120, MAX_SAFE_CORE_OFFSET),
        (121, MAX_SAFE_CORE_OFFSET),
        (i32::MAX, MAX_SAFE_CORE_OFFSET),
        (i32::MIN, MIN_SAFE_CORE_OFFSET),
        (-100_000, MIN_SAFE_CORE_OFFSET),
        (500_000, MAX_SAFE_CORE_OFFSET),
    ];

    for (core_in, expected_core) in test_cases {
        let offsets = GpuOffsets {
            core_offset_mhz: core_in,
            mem_offset_mhz: 100,
            power_limit_pct: 100,
            fan_speed_pct: 50,
            voltage_mv: 0,
        };
        let clamped = offsets.clamp_and_validate().unwrap();
        assert_eq!(
            clamped.core_offset_mhz, expected_core,
            "Core offset {} failed: expected {}, got {}",
            core_in, expected_core, clamped.core_offset_mhz
        );
        assert_eq!(clamped.voltage_mv, 0);
    }
}

#[test]
fn test_adversarial_mem_offset_bounds_and_extremes() {
    let test_cases = vec![
        // (input_mem, expected_clamped)
        (-1, MIN_SAFE_MEM_OFFSET),
        (0, MIN_SAFE_MEM_OFFSET),
        (1, 1),
        (200, 200),
        (349, 349),
        (350, MAX_SAFE_MEM_OFFSET),
        (351, MAX_SAFE_MEM_OFFSET),
        (i32::MAX, MAX_SAFE_MEM_OFFSET),
        (i32::MIN, MIN_SAFE_MEM_OFFSET),
        (-999_999, MIN_SAFE_MEM_OFFSET),
        (1_000_000, MAX_SAFE_MEM_OFFSET),
    ];

    for (mem_in, expected_mem) in test_cases {
        let offsets = GpuOffsets {
            core_offset_mhz: 0,
            mem_offset_mhz: mem_in,
            power_limit_pct: 100,
            fan_speed_pct: 0,
            voltage_mv: 0,
        };
        let clamped = offsets.clamp_and_validate().unwrap();
        assert_eq!(
            clamped.mem_offset_mhz, expected_mem,
            "Memory offset {} failed: expected {}, got {}",
            mem_in, expected_mem, clamped.mem_offset_mhz
        );
        assert_eq!(clamped.voltage_mv, 0);
    }
}

#[test]
fn test_adversarial_power_limit_bounds_and_extremes() {
    let test_cases = vec![
        // (input_power, expected_clamped)
        (99, MIN_SAFE_POWER_LIMIT),
        (100, MIN_SAFE_POWER_LIMIT),
        (101, 101),
        (104, 104),
        (105, MAX_SAFE_POWER_LIMIT),
        (106, MAX_SAFE_POWER_LIMIT),
        (0, MIN_SAFE_POWER_LIMIT),
        (50, MIN_SAFE_POWER_LIMIT),
        (150, MAX_SAFE_POWER_LIMIT),
        (u32::MAX, MAX_SAFE_POWER_LIMIT),
    ];

    for (power_in, expected_power) in test_cases {
        let offsets = GpuOffsets {
            core_offset_mhz: 0,
            mem_offset_mhz: 0,
            power_limit_pct: power_in,
            fan_speed_pct: 0,
            voltage_mv: 0,
        };
        let clamped = offsets.clamp_and_validate().unwrap();
        assert_eq!(
            clamped.power_limit_pct, expected_power,
            "Power limit {} failed: expected {}, got {}",
            power_in, expected_power, clamped.power_limit_pct
        );
        assert_eq!(clamped.voltage_mv, 0);
    }
}

#[test]
fn test_adversarial_fan_speed_bounds() {
    let test_cases = vec![
        (0, 0),
        (50, 50),
        (100, 100),
        (101, 100),
        (250, 100),
        (u32::MAX, 100),
    ];

    for (fan_in, expected_fan) in test_cases {
        let offsets = GpuOffsets {
            core_offset_mhz: 0,
            mem_offset_mhz: 0,
            power_limit_pct: 100,
            fan_speed_pct: fan_in,
            voltage_mv: 0,
        };
        let clamped = offsets.clamp_and_validate().unwrap();
        assert_eq!(clamped.fan_speed_pct, expected_fan);
    }
}

// =========================================================================
// 2. STRICT ZERO OVERVOLTING FATAL ERROR VERIFICATION
// =========================================================================

#[test]
fn test_strict_zero_overvolting_fatal_error_all_non_zeros() {
    let non_zero_voltages = vec![
        1,
        -1,
        10,
        -10,
        50,
        -50,
        100,
        -100,
        950,
        -1200,
        i32::MAX,
        i32::MIN,
    ];

    const EXPECTED_ERR_MSG: &str = "VOLTAGE_TAMPERING_PROHIBITED: Voltage is strictly locked at stock (+0 mV) to guarantee zero silicon degradation.";

    for v in non_zero_voltages {
        let offsets = GpuOffsets {
            core_offset_mhz: 0,
            mem_offset_mhz: 0,
            power_limit_pct: 100,
            fan_speed_pct: 0,
            voltage_mv: v,
        };

        let err = offsets.clamp_and_validate().unwrap_err();
        assert_eq!(
            err,
            GpuError::VoltageTamperingProhibited,
            "Voltage {} did not trigger VoltageTamperingProhibited",
            v
        );

        let err_str = err.to_string();
        assert_eq!(
            err_str, EXPECTED_ERR_MSG,
            "Voltage {} error string mismatch: got '{}', expected '{}'",
            v, err_str, EXPECTED_ERR_MSG
        );
    }

    // Zero voltage MUST succeed
    let stock = GpuOffsets {
        voltage_mv: 0,
        ..Default::default()
    };
    assert!(stock.clamp_and_validate().is_ok());
}

// =========================================================================
// 3. 85°C WATCHDOG TRIPWIRES & EMERGENCY DOWNCLOCK HARNESS
// =========================================================================

#[test]
fn test_watchdog_exact_tripwire_boundary_gpu_core_85c() {
    // 84.9°C: boundary below tripwire (no revert)
    {
        let revert_called = Arc::new(AtomicBool::new(false));
        let rev_clone = revert_called.clone();
        let sampler: TempSampler = Arc::new(|| (Some(84.9), Some(70.0), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |_| {
            rev_clone.store(true, Ordering::SeqCst);
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            !revert_called.load(Ordering::SeqCst),
            "GPU at 84.9°C must NOT trigger tripwire"
        );
        assert!(!handle.state.tripwire_triggered.load(Ordering::SeqCst));
    }

    // 85.0°C: exact boundary tripwire (must revert)
    {
        let revert_reason = Arc::new(Mutex::new(None));
        let rev_clone = revert_reason.clone();
        let sampler: TempSampler = Arc::new(|| (Some(85.0), Some(70.0), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |r| {
            *rev_clone.lock().unwrap() = Some(r.to_string());
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            handle.state.tripwire_triggered.load(Ordering::SeqCst),
            "GPU at 85.0°C MUST trigger tripwire"
        );
        let reason = revert_reason.lock().unwrap().clone().expect("Revert reason missing");
        assert!(reason.contains("GPU thermal tripwire breached (85.0°C >= 85.0°C)"));
        assert_eq!(*handle.state.rollback_count.lock().unwrap(), 1);
    }

    // 85.1°C and 105.0°C: above tripwire
    for &temp in &[85.1, 105.0] {
        let revert_called = Arc::new(AtomicBool::new(false));
        let rev_clone = revert_called.clone();
        let sampler: TempSampler = Arc::new(move || (Some(temp), Some(70.0), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |_| {
            rev_clone.store(true, Ordering::SeqCst);
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            revert_called.load(Ordering::SeqCst),
            "GPU at {}°C MUST trigger tripwire",
            temp
        );
    }
}

#[test]
fn test_watchdog_exact_tripwire_boundary_hotspot_92c() {
    // 91.9°C: boundary below hotspot tripwire
    {
        let revert_called = Arc::new(AtomicBool::new(false));
        let rev_clone = revert_called.clone();
        let sampler: TempSampler = Arc::new(|| (Some(75.0), Some(91.9), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |_| {
            rev_clone.store(true, Ordering::SeqCst);
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            !revert_called.load(Ordering::SeqCst),
            "Hotspot at 91.9°C must NOT trigger tripwire"
        );
    }

    // 92.0°C: exact hotspot tripwire
    {
        let revert_reason = Arc::new(Mutex::new(None));
        let rev_clone = revert_reason.clone();
        let sampler: TempSampler = Arc::new(|| (Some(75.0), Some(92.0), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |r| {
            *rev_clone.lock().unwrap() = Some(r.to_string());
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            handle.state.tripwire_triggered.load(Ordering::SeqCst),
            "Hotspot at 92.0°C MUST trigger tripwire"
        );
        let reason = revert_reason.lock().unwrap().clone().expect("Revert reason missing");
        assert!(reason.contains("GPU hotspot thermal tripwire breached (92.0°C >= 92.0°C)"));
    }

    // 92.5°C and 110.0°C
    for &temp in &[92.5, 110.0] {
        let revert_called = Arc::new(AtomicBool::new(false));
        let rev_clone = revert_called.clone();
        let sampler: TempSampler = Arc::new(move || (Some(75.0), Some(temp), Some(60.0)));
        let on_revert: RevertCallback = Arc::new(move |_| {
            rev_clone.store(true, Ordering::SeqCst);
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(
            revert_called.load(Ordering::SeqCst),
            "Hotspot at {}°C MUST trigger tripwire",
            temp
        );
    }
}

#[test]
fn test_watchdog_exact_tripwire_boundary_cpu_85c() {
    // 84.9°C: safe
    {
        let revert_called = Arc::new(AtomicBool::new(false));
        let rev_clone = revert_called.clone();
        let sampler: TempSampler = Arc::new(|| (Some(60.0), Some(70.0), Some(84.9)));
        let on_revert: RevertCallback = Arc::new(move |_| {
            rev_clone.store(true, Ordering::SeqCst);
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(!revert_called.load(Ordering::SeqCst));
    }

    // 85.0°C: exact CPU tripwire
    {
        let revert_reason = Arc::new(Mutex::new(None));
        let rev_clone = revert_reason.clone();
        let sampler: TempSampler = Arc::new(|| (Some(60.0), Some(70.0), Some(85.0)));
        let on_revert: RevertCallback = Arc::new(move |r| {
            *rev_clone.lock().unwrap() = Some(r.to_string());
        });

        let mut handle = WatchdogHandle::spawn(10, sampler, on_revert);
        let start = Instant::now();
        while !handle.state.tripwire_triggered.load(Ordering::SeqCst) && start.elapsed() < Duration::from_millis(400) {
            std::thread::sleep(Duration::from_millis(5));
        }
        handle.stop();

        assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
        let reason = revert_reason.lock().unwrap().clone().unwrap();
        assert!(reason.contains("CPU package thermal tripwire breached (85.0°C >= 85.0°C)"));
    }
}

#[test]
fn test_watchdog_tdr_simulation_and_emergency_downclock_latency() {
    // 1. Setup adapter with applied overclocks
    let adapter = Arc::new(FallbackAdapter::new());
    let tuned = GpuOffsets {
        core_offset_mhz: 60,
        mem_offset_mhz: 200,
        power_limit_pct: 104,
        fan_speed_pct: 75,
        voltage_mv: 0,
    };
    adapter.apply_in_memory_offsets(&tuned).unwrap();

    let before_tel = adapter.get_telemetry().unwrap();
    assert_eq!(before_tel.applied_core_offset, 60);
    assert_eq!(before_tel.applied_mem_offset, 200);

    // 2. Spawn watchdog with emergency downclock callback
    let adapter_clone = adapter.clone();
    let downclock_timestamp = Arc::new(Mutex::new(None));
    let dc_revert = downclock_timestamp.clone();

    let on_revert: RevertCallback = Arc::new(move |_reason: &str| {
        *dc_revert.lock().unwrap() = Some(Instant::now());
        // Immediate hardware emergency revert
        adapter_clone.reset_to_stock().expect("Failed emergency downclock");
    });

    let sampler: TempSampler = Arc::new(|| (Some(50.0), Some(55.0), Some(50.0)));
    let handle = WatchdogHandle::spawn(20, sampler, on_revert.clone());

    // 3. Trigger TDR crash event and measure emergency downclock response
    let tdr_start = Instant::now();
    handle.report_tdr_event("Direct3D Device Removed / Hung (0x887A0005)", &on_revert);

    let downclock_time = downclock_timestamp.lock().unwrap().expect("Downclock callback was not called");
    let response_duration = downclock_time.duration_since(tdr_start);

    // Emergency response MUST be well under 100ms
    assert!(
        response_duration < Duration::from_millis(100),
        "Emergency downclock response too slow: {:?}",
        response_duration
    );

    // 4. Verify adapter was completely restored to stock
    let after_tel = adapter.get_telemetry().unwrap();
    assert_eq!(after_tel.applied_core_offset, 0, "Core offset not reset to 0");
    assert_eq!(after_tel.applied_mem_offset, 0, "Mem offset not reset to 0");
    assert_eq!(after_tel.power_limit_pct, 100, "Power limit not reset to 100%");
    assert_eq!(after_tel.fan_speed_pct, 0, "Fan speed not reset to stock 0%");

    assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
    assert_eq!(*handle.state.tdr_count.lock().unwrap(), 1);
    assert_eq!(*handle.state.rollback_count.lock().unwrap(), 1);
}

// =========================================================================
// 4. AUTO-OC SCANNER STRESS & THERMAL CEILINGS
// =========================================================================

#[test]
fn test_auto_oc_preflight_boundary_55c() {
    let scanner = AutoOcScanner::new();

    // 55°C: exact boundary -> MUST PASS preflight!
    let adapter_55 = FallbackAdapter::with_temp(55);
    let result_55 = scanner.run_scan(
        || adapter_55.get_telemetry(),
        |o| adapter_55.apply_in_memory_offsets(o),
        |_| {},
    );
    assert!(
        result_55.is_ok(),
        "55°C is the inclusive safe limit and must pass preflight"
    );

    // 56°C: 1°C over boundary -> MUST FAIL with PreflightTempTooWarm
    let adapter_56 = FallbackAdapter::with_temp(56);
    let result_56 = scanner.run_scan(
        || adapter_56.get_telemetry(),
        |o| adapter_56.apply_in_memory_offsets(o),
        |_| {},
    );
    assert!(result_56.is_err());
    match result_56.unwrap_err() {
        GpuError::PreflightTempTooWarm { current_temp, max_temp } => {
            assert_eq!(current_temp, 56);
            assert_eq!(max_temp, 55);
        }
        other => panic!("Unexpected error: {:?}", other),
    }

    // 70°C: hot GPU -> MUST FAIL
    let adapter_70 = FallbackAdapter::with_temp(70);
    let result_70 = scanner.run_scan(
        || adapter_70.get_telemetry(),
        |o| adapter_70.apply_in_memory_offsets(o),
        |_| {},
    );
    assert!(result_70.is_err());
}

#[test]
fn test_auto_oc_thermal_ceiling_memory_75c_halt() {
    let scanner = AutoOcScanner::new();

    // Dynamic temperature simulation:
    // Starts at 45°C.
    // When memory offset reaches 75 MHz, temp rises to 75°C (CEILING_MEM_TEMP_C).
    let applied_mem_offsets = Arc::new(Mutex::new(Vec::new()));
    let offsets_clone = applied_mem_offsets.clone();

    let cur_temp = Arc::new(Mutex::new(45u32));
    let temp_clone = cur_temp.clone();

    let result = scanner.run_scan(
        move || {
            let t = *temp_clone.lock().unwrap();
            let mut tel = FallbackAdapter::with_temp(t).get_telemetry().unwrap();
            tel.gpu_temp = t;
            Ok(tel)
        },
        move |offsets| {
            offsets_clone.lock().unwrap().push(offsets.mem_offset_mhz);
            if offsets.mem_offset_mhz >= 75 {
                *cur_temp.lock().unwrap() = CEILING_MEM_TEMP_C; // 75°C
            }
            Ok(())
        },
        |_| {},
    );

    let final_offsets = result.unwrap();
    // Memory scan steps: [25, 50, 75, 100, 150].
    // When 75 MHz is tested, temp reaches 75°C, so loop breaks BEFORE updating best_mem.
    // Therefore, best_mem should be 50 MHz!
    assert_eq!(
        final_offsets.mem_offset_mhz, 50,
        "Memory offset should have halted at 50 MHz due to 75°C ceiling, got {}",
        final_offsets.mem_offset_mhz
    );
    // Offsets 100 and 150 MHz should NEVER have been applied
    let applied = applied_mem_offsets.lock().unwrap().clone();
    assert!(!applied.contains(&100), "Should not test +100 MHz after ceiling breach");
    assert!(!applied.contains(&150), "Should not test +150 MHz after ceiling breach");
}

#[test]
fn test_auto_oc_thermal_ceiling_core_78c_halt() {
    let scanner = AutoOcScanner::new();

    // Dynamic temperature simulation:
    // Memory scan finishes cool (45°C).
    // During core scan [15, 30, 45, 60], when core reaches 45 MHz, temp hits 78°C.
    let applied_core_offsets = Arc::new(Mutex::new(Vec::new()));
    let offsets_clone = applied_core_offsets.clone();

    let cur_temp = Arc::new(Mutex::new(45u32));
    let temp_clone = cur_temp.clone();

    let result = scanner.run_scan(
        move || {
            let t = *temp_clone.lock().unwrap();
            let mut tel = FallbackAdapter::with_temp(t).get_telemetry().unwrap();
            tel.gpu_temp = t;
            Ok(tel)
        },
        move |offsets| {
            offsets_clone.lock().unwrap().push(offsets.core_offset_mhz);
            if offsets.core_offset_mhz >= 45 {
                *cur_temp.lock().unwrap() = CEILING_CORE_TEMP_C; // 78°C
            }
            Ok(())
        },
        |_| {},
    );

    let final_offsets = result.unwrap();
    // Core scan steps: [15, 30, 45, 60].
    // When 45 MHz is tested, temp hits 78°C, so best_core remains 30 MHz.
    assert_eq!(
        final_offsets.core_offset_mhz, 30,
        "Core offset should have halted at 30 MHz due to 78°C ceiling, got {}",
        final_offsets.core_offset_mhz
    );
    let applied = applied_core_offsets.lock().unwrap().clone();
    assert!(!applied.contains(&60), "Should not test +60 MHz after ceiling breach");
}

#[test]
fn test_auto_oc_abort_mid_scan() {
    let scanner = Arc::new(AutoOcScanner::new());
    let scanner_clone = scanner.clone();

    let adapter = FallbackAdapter::with_temp(40);
    let mut step_count = 0;

    let result = scanner.run_scan(
        || adapter.get_telemetry(),
        |_| Ok(()),
        move |_| {
            step_count += 1;
            if step_count == 3 {
                scanner_clone.abort();
            }
        },
    );

    assert!(result.is_err());
    match result.unwrap_err() {
        GpuError::ScanAborted(msg) => {
            assert!(msg.contains("User cancelled scan"));
        }
        other => panic!("Expected ScanAborted, got {:?}", other),
    }
}

// =========================================================================
// 5. ANTI-CHEAT RULE 6 PROCESS INTEGRITY & COMPETITIVE-SAFE VETO
// =========================================================================

#[test]
fn test_anti_cheat_rule_6_static_verification_all_workspace_crates() {
    let workspace_crates_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap();

    let forbidden_api_tokens: Vec<String> = [
        ("PROCESS", "_VM_WRITE"),
        ("PROCESS", "_VM_OPERATION"),
        ("PROCESS", "_CREATE_THREAD"),
        ("Write", "ProcessMemory"),
        ("Create", "RemoteThread"),
        ("NtCreate", "ThreadEx"),
        ("Virtual", "AllocEx"),
        ("SetWindows", "HookEx"),
        ("WH_", "KEYBOARD_LL"),
        ("NtLoad", "Driver"),
        ("ZwLoad", "Driver"),
        ("Read", "ProcessMemory"),
    ]
    .iter()
    .map(|(a, b)| format!("{}{}", a, b))
    .collect();

    let mut audited_files = 0;

    for entry in walk_dir(workspace_crates_dir) {
        let path_str = entry.to_string_lossy();
        // Ignore test files that intentionally enumerate forbidden tokens for testing
        if entry.extension().and_then(|e| e.to_str()) == Some("rs")
            && !path_str.ends_with("overclock_tests.rs")
            && !path_str.ends_with("adversarial_gpu_stress_tests.rs")
        {
            audited_files += 1;
            let code = std::fs::read_to_string(&entry).unwrap();
            for token in &forbidden_api_tokens {
                assert!(
                    !code.contains(token),
                    "SECURITY BREACH: Prohibited Anti-Cheat Rule 6 token '{}' detected in {:?}!",
                    token,
                    entry
                );
            }
        }
    }

    assert!(
        audited_files >= 15,
        "Sanity check: expected to audit at least 15 source files, but audited {}",
        audited_files
    );
}

fn walk_dir(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if !path.ends_with("target") {
                    files.extend(walk_dir(&path));
                }
            } else {
                files.push(path);
            }
        }
    }
    files
}

#[test]
fn test_anti_cheat_competitive_safe_veto_gate() {
    let competitive_gate = AntiCheatVetoGate::new(true);

    let blocked_tweaks = [
        "vbs_hvci_off",
        "vbs_memory_integrity_disable",
        "hypervisor_launch_off",
        "test_signing_on",
        "gaming_boot_entry",
        "bcdedit_custom_entry",
        "driver_signature_off",
        "spectre_meltdown_disable",
    ];

    for &tweak in &blocked_tweaks {
        assert_eq!(
            AntiCheatVetoGate::classify_tweak(tweak),
            TweakSafetyLevel::BlockedRisk
        );
        let res = competitive_gate.validate_tweak_execution(tweak);
        assert!(res.is_err(), "Tweak '{}' must be vetoed in competitive mode", tweak);
        match res.unwrap_err() {
            CoreError::AntiCheatVeto { tweak_id, anti_cheats } => {
                assert_eq!(tweak_id, tweak);
                assert!(anti_cheats.contains("Vanguard"));
                assert!(anti_cheats.contains("FACEIT"));
            }
            other => panic!("Unexpected error: {:?}", other),
        }
    }

    // Safe tweaks MUST be allowed
    let safe_tweaks = [
        "enable_game_mode",
        "disable_game_dvr",
        "mouse_disable_acceleration",
        "mouse_neutral_pointer_speed",
        "mouse_disable_trails_and_shadow",
        "mouse_data_queue_size",
        "keyboard_repeat_rate_max",
        "keyboard_disable_filter_keys",
        "keyboard_disable_sticky_toggle_keys",
        "timer_resolution_request",
        "timer_resolution_global",
    ];

    for &tweak in &safe_tweaks {
        assert_eq!(
            AntiCheatVetoGate::classify_tweak(tweak),
            TweakSafetyLevel::Safe
        );
        assert!(
            competitive_gate.validate_tweak_execution(tweak).is_ok(),
            "Safe tweak '{}' was erroneously vetoed",
            tweak
        );
    }

    // When competitive safe mode is turned OFF, blocked-risk tweaks are permitted
    let relaxed_gate = AntiCheatVetoGate::new(false);
    for &tweak in &blocked_tweaks {
        assert!(
            relaxed_gate.validate_tweak_execution(tweak).is_ok(),
            "Tweak '{}' should be allowed when competitive safe mode is inactive",
            tweak
        );
    }
}
