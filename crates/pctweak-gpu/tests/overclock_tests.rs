use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use pctweak_gpu::analytics::SiliconAnalytics;
use pctweak_gpu::auto_oc::AutoOcScanner;
use pctweak_gpu::error::GpuError;
use pctweak_gpu::types::{
    GpuOffsets, MAX_SAFE_CORE_OFFSET, MAX_SAFE_MEM_OFFSET, MAX_SAFE_POWER_LIMIT,
    MIN_SAFE_CORE_OFFSET, MIN_SAFE_MEM_OFFSET, MIN_SAFE_POWER_LIMIT,
};
use pctweak_gpu::vendor::{create_adapter, FallbackAdapter, GpuVendorAdapter};
use pctweak_gpu::watchdog::WatchdogHandle;

#[test]
fn test_core_offset_clamping_limits() {
    // Upper clamping: +250 MHz -> +120 MHz
    let offsets_high = GpuOffsets {
        core_offset_mhz: 250,
        mem_offset_mhz: 100,
        ..Default::default()
    };
    let clamped_high = offsets_high.clamp_and_validate().unwrap();
    assert_eq!(clamped_high.core_offset_mhz, MAX_SAFE_CORE_OFFSET);

    // Lower clamping: -100 MHz -> -50 MHz
    let offsets_low = GpuOffsets {
        core_offset_mhz: -100,
        mem_offset_mhz: 100,
        ..Default::default()
    };
    let clamped_low = offsets_low.clamp_and_validate().unwrap();
    assert_eq!(clamped_low.core_offset_mhz, MIN_SAFE_CORE_OFFSET);

    // Valid within range: +45 MHz -> +45 MHz
    let offsets_valid = GpuOffsets {
        core_offset_mhz: 45,
        mem_offset_mhz: 100,
        ..Default::default()
    };
    let clamped_valid = offsets_valid.clamp_and_validate().unwrap();
    assert_eq!(clamped_valid.core_offset_mhz, 45);
}

#[test]
fn test_memory_offset_clamping_limits() {
    // Upper clamping: +800 MHz -> +350 MHz
    let offsets_high = GpuOffsets {
        core_offset_mhz: 30,
        mem_offset_mhz: 800,
        ..Default::default()
    };
    let clamped_high = offsets_high.clamp_and_validate().unwrap();
    assert_eq!(clamped_high.mem_offset_mhz, MAX_SAFE_MEM_OFFSET);

    // Lower clamping: -100 MHz -> 0 MHz
    let offsets_low = GpuOffsets {
        core_offset_mhz: 30,
        mem_offset_mhz: -100,
        ..Default::default()
    };
    let clamped_low = offsets_low.clamp_and_validate().unwrap();
    assert_eq!(clamped_low.mem_offset_mhz, MIN_SAFE_MEM_OFFSET);

    // Valid within range: +200 MHz -> +200 MHz
    let offsets_valid = GpuOffsets {
        core_offset_mhz: 30,
        mem_offset_mhz: 200,
        ..Default::default()
    };
    let clamped_valid = offsets_valid.clamp_and_validate().unwrap();
    assert_eq!(clamped_valid.mem_offset_mhz, 200);
}

#[test]
fn test_power_limit_clamping_limits() {
    // Upper clamping: 130% -> 105%
    let offsets_high = GpuOffsets {
        power_limit_pct: 130,
        ..Default::default()
    };
    let clamped_high = offsets_high.clamp_and_validate().unwrap();
    assert_eq!(clamped_high.power_limit_pct, MAX_SAFE_POWER_LIMIT);

    // Lower clamping: 80% -> 100%
    let offsets_low = GpuOffsets {
        power_limit_pct: 80,
        ..Default::default()
    };
    let clamped_low = offsets_low.clamp_and_validate().unwrap();
    assert_eq!(clamped_low.power_limit_pct, MIN_SAFE_POWER_LIMIT);

    // Valid: 102% -> 102%
    let offsets_valid = GpuOffsets {
        power_limit_pct: 102,
        ..Default::default()
    };
    let clamped_valid = offsets_valid.clamp_and_validate().unwrap();
    assert_eq!(clamped_valid.power_limit_pct, 102);
}

#[test]
fn test_strict_zero_overvolting_fatal_error() {
    let offsets_positive = GpuOffsets {
        voltage_mv: 50,
        ..Default::default()
    };
    let err_pos = offsets_positive.clamp_and_validate().unwrap_err();
    assert_eq!(err_pos, GpuError::VoltageTamperingProhibited);
    assert!(err_pos.to_string().contains("VOLTAGE_TAMPERING_PROHIBITED: Voltage is strictly locked at stock (+0 mV) to guarantee zero silicon degradation."));

    let offsets_negative = GpuOffsets {
        voltage_mv: -20,
        ..Default::default()
    };
    let err_neg = offsets_negative.clamp_and_validate().unwrap_err();
    assert_eq!(err_neg, GpuError::VoltageTamperingProhibited);
}

#[test]
fn test_revert_to_stock_zeroes_all_offsets() {
    let adapter = FallbackAdapter::new();
    let tuned = GpuOffsets {
        core_offset_mhz: 60,
        mem_offset_mhz: 200,
        power_limit_pct: 104,
        fan_speed_pct: 70,
        voltage_mv: 0,
    };
    adapter.apply_in_memory_offsets(&tuned).unwrap();

    let tel_tuned = adapter.get_telemetry().unwrap();
    assert_eq!(tel_tuned.applied_core_offset, 60);
    assert_eq!(tel_tuned.applied_mem_offset, 200);

    // Reset to stock
    adapter.reset_to_stock().unwrap();
    let tel_stock = adapter.get_telemetry().unwrap();
    assert_eq!(tel_stock.applied_core_offset, 0);
    assert_eq!(tel_stock.applied_mem_offset, 0);
    assert_eq!(tel_stock.power_limit_pct, 100);
    assert_eq!(tel_stock.fan_speed_pct, 0);
}

#[test]
fn test_preflight_thermal_inspection_gate() {
    let scanner = AutoOcScanner::new();

    // Hot GPU: 62°C (>55°C gate)
    let hot_adapter = FallbackAdapter::with_temp(62);
    let result = scanner.run_scan(
        || hot_adapter.get_telemetry(),
        |o| hot_adapter.apply_in_memory_offsets(o),
        |_| {},
    );

    assert!(result.is_err());
    match result.unwrap_err() {
        GpuError::PreflightTempTooWarm {
            current_temp,
            max_temp,
        } => {
            assert_eq!(current_temp, 62);
            assert_eq!(max_temp, 55);
        }
        other => panic!("Unexpected error: {:?}", other),
    }

    // Cool GPU: 42°C (<= 55°C gate) -> succeeds through all stages
    let cool_adapter = FallbackAdapter::with_temp(42);
    let final_offsets = scanner
        .run_scan(
            || cool_adapter.get_telemetry(),
            |o| cool_adapter.apply_in_memory_offsets(o),
            |_| {},
        )
        .unwrap();

    assert_eq!(final_offsets.voltage_mv, 0);
    assert_eq!(final_offsets.core_offset_mhz, 60);
    assert_eq!(final_offsets.mem_offset_mhz, 150);
}

#[test]
fn test_silicon_analytics_formulas() {
    // Headroom: 42°C -> 43.0; 87°C -> 0.0
    assert_eq!(SiliconAnalytics::calculate_headroom(42), 43.0);
    assert_eq!(SiliconAnalytics::calculate_headroom(87), 0.0);

    // Stability: 0 TDR, 0 rollback -> 100
    assert_eq!(SiliconAnalytics::calculate_stability_index(0, 0), 100);
    // 1 TDR -> 85
    assert_eq!(SiliconAnalytics::calculate_stability_index(1, 0), 85);
    // 1 TDR + 2 rollbacks -> 100 - 15 - 10 = 75
    assert_eq!(SiliconAnalytics::calculate_stability_index(1, 2), 75);

    // FPS Gain estimation: core 60, mem 200
    let gain = SiliconAnalytics::calculate_estimated_fps_gain(60, 200);
    assert!(
        gain > 2.5 && gain < 5.0,
        "FPS gain {}% outside expected range",
        gain
    );

    // Memory Bandwidth Delta: 200 MHz on 192-bit bus
    let bw = SiliconAnalytics::calculate_memory_bandwidth_delta(200);
    assert!(bw > 9.0 && bw < 10.0);

    // GFLOPS delta: 60 MHz core
    let gflops = SiliconAnalytics::calculate_gflops_delta(60);
    assert_eq!(gflops, 307);
}

#[test]
fn test_watchdog_safe_temperatures_no_rollback() {
    let revert_called = Arc::new(AtomicBool::new(false));
    let revert_clone = revert_called.clone();

    let sampler = Arc::new(|| (Some(55.0), Some(62.0), Some(58.0)));
    let on_revert = Arc::new(move |_: &str| {
        revert_clone.store(true, Ordering::SeqCst);
    });

    let mut handle = WatchdogHandle::spawn(20, sampler, on_revert);
    std::thread::sleep(Duration::from_millis(100));
    handle.stop();

    assert!(!revert_called.load(Ordering::SeqCst));
    assert!(!handle.state.tripwire_triggered.load(Ordering::SeqCst));
}

#[test]
fn test_watchdog_gpu_core_tripwire_at_85c() {
    let revert_reason = Arc::new(Mutex::new(None));
    let revert_clone = revert_reason.clone();

    // Hot GPU: 86.5°C >= 85.0°C
    let sampler = Arc::new(|| (Some(86.5), Some(90.0), Some(65.0)));
    let on_revert = Arc::new(move |reason: &str| {
        *revert_clone.lock().unwrap() = Some(reason.to_string());
    });

    let mut handle = WatchdogHandle::spawn(20, sampler, on_revert);
    std::thread::sleep(Duration::from_millis(100));
    handle.stop();

    assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
    let reason = revert_reason.lock().unwrap().clone().unwrap();
    assert!(reason.contains("GPU thermal tripwire breached"));
    assert_eq!(*handle.state.rollback_count.lock().unwrap(), 1);
}

#[test]
fn test_watchdog_hotspot_tripwire_at_92c() {
    let revert_reason = Arc::new(Mutex::new(None));
    let revert_clone = revert_reason.clone();

    // Hotspot breached: 93.0°C >= 92.0°C (GPU core safe at 78°C)
    let sampler = Arc::new(|| (Some(78.0), Some(93.0), Some(60.0)));
    let on_revert = Arc::new(move |reason: &str| {
        *revert_clone.lock().unwrap() = Some(reason.to_string());
    });

    let mut handle = WatchdogHandle::spawn(20, sampler, on_revert);
    std::thread::sleep(Duration::from_millis(100));
    handle.stop();

    assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
    let reason = revert_reason.lock().unwrap().clone().unwrap();
    assert!(reason.contains("GPU hotspot thermal tripwire breached"));
}

#[test]
fn test_watchdog_cpu_package_tripwire_at_85c() {
    let revert_reason = Arc::new(Mutex::new(None));
    let revert_clone = revert_reason.clone();

    // CPU breached: 87.0°C >= 85.0°C (GPU core and hotspot safe)
    let sampler = Arc::new(|| (Some(60.0), Some(70.0), Some(87.0)));
    let on_revert = Arc::new(move |reason: &str| {
        *revert_clone.lock().unwrap() = Some(reason.to_string());
    });

    let mut handle = WatchdogHandle::spawn(20, sampler, on_revert);
    std::thread::sleep(Duration::from_millis(100));
    handle.stop();

    assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
    let reason = revert_reason.lock().unwrap().clone().unwrap();
    assert!(reason.contains("CPU package thermal tripwire breached"));
}

#[test]
fn test_watchdog_tdr_driver_reset_instant_rollback() {
    let revert_reason = Arc::new(Mutex::new(None));
    let revert_clone = revert_reason.clone();

    let sampler = Arc::new(|| (Some(50.0), Some(55.0), Some(50.0)));
    let on_revert: pctweak_gpu::watchdog::RevertCallback = Arc::new(move |reason: &str| {
        *revert_clone.lock().unwrap() = Some(reason.to_string());
    });

    let mut handle = WatchdogHandle::spawn(20, sampler, on_revert.clone());
    handle.report_tdr_event("Direct3D Device Removed / Hung (0x887A0005)", &on_revert);
    handle.stop();

    assert!(handle.state.tripwire_triggered.load(Ordering::SeqCst));
    assert_eq!(*handle.state.tdr_count.lock().unwrap(), 1);
    let reason = revert_reason.lock().unwrap().clone().unwrap();
    assert!(reason.contains("TDR Driver Recovery"));
}

#[test]
fn test_dynamic_library_loading_graceful_fallback() {
    // Tests that create_adapter() never crashes or panics on any machine
    let adapter = create_adapter();
    let capabilities = adapter.capabilities();
    assert!(capabilities.is_supported);
    assert!(capabilities.voltage_locked);

    let telemetry = adapter.get_telemetry().unwrap();
    assert!(telemetry.gpu_temp > 0);
}

#[test]
fn test_process_integrity_rule_6() {
    // Anti-Cheat Rule 6 Process Integrity:
    // Ensures strictly zero memory tampering, zero process hooking, zero driver loading in crates
    let crates_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap();

    let forbidden_tokens = [
        "PROCESS_VM_WRITE",
        "PROCESS_VM_OPERATION",
        "PROCESS_CREATE_THREAD",
        "WriteProcessMemory",
        "CreateRemoteThread",
        "NtCreateThreadEx",
        "VirtualAllocEx",
        "SetWindowsHookEx",
        "WH_KEYBOARD_LL",
        "NtLoadDriver",
        "ZwLoadDriver",
        "ReadProcessMemory",
    ];

    for entry in walkdir(crates_dir) {
        let path_str = entry.to_string_lossy();
        if entry.extension().and_then(|e| e.to_str()) == Some("rs") && !path_str.ends_with("overclock_tests.rs") {
            let content = std::fs::read_to_string(&entry).unwrap();
            for &token in &forbidden_tokens {
                assert!(
                    !content.contains(token),
                    "Security violation: Forbidden token '{}' found in {:?}",
                    token,
                    entry
                );
            }
        }
    }
}

fn walkdir(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if !path.ends_with("target") {
                    files.extend(walkdir(&path));
                }
            } else {
                files.push(path);
            }
        }
    }
    files
}
