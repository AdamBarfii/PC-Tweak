use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use pctweak_core::engine::auto_revert::AutoRevertWatchdog;
use pctweak_core::models::watchdog::WatchdogReason;
use tempfile::tempdir;

#[test]
fn test_watchdog_arm_and_confirm() {
    let dir = tempdir().unwrap();
    let watchdog = AutoRevertWatchdog::new(dir.path());
    let pending_file = dir.path().join("pendingRevert.json");

    assert!(!pending_file.exists());

    // Arm 20-second watchdog
    let record = watchdog.arm("Smart DNS Cloudflare", "Ethernet 1", 20).unwrap();
    assert_eq!(record.tweak_name, "Smart DNS Cloudflare");
    assert_eq!(record.duration_seconds, 20);
    assert_eq!(record.status, "pending");
    assert!(pending_file.exists());

    // User confirms within 20s window
    let confirmed_tweak = watchdog.confirm().unwrap();
    assert_eq!(confirmed_tweak.as_deref(), Some("Smart DNS Cloudflare"));
    assert!(!pending_file.exists());
}

#[test]
fn test_watchdog_crash_recovery() {
    let dir = tempdir().unwrap();
    let watchdog = AutoRevertWatchdog::new(dir.path());
    let pending_file = dir.path().join("pendingRevert.json");

    // Simulate prior session crashing while a tweak was pending revert
    watchdog.arm("DNS Flush", "Wi-Fi", 20).unwrap();
    assert!(pending_file.exists());

    let reverted = Arc::new(AtomicBool::new(false));
    let reverted_clone = reverted.clone();

    // On app startup, detect and recover
    let recovered_tweak = watchdog
        .check_startup_crash_recovery(|rec| {
            assert_eq!(rec.tweak_name, "DNS Flush");
            reverted_clone.store(true, Ordering::SeqCst);
            Ok(())
        })
        .unwrap();

    assert_eq!(recovered_tweak.as_deref(), Some("DNS Flush"));
    assert!(reverted.load(Ordering::SeqCst));
    assert!(!pending_file.exists());
}

#[test]
fn test_watchdog_trigger_revert() {
    let dir = tempdir().unwrap();
    let watchdog = AutoRevertWatchdog::new(dir.path());
    let pending_file = dir.path().join("pendingRevert.json");

    watchdog.arm("MTU Tweak", "Ethernet", 20).unwrap();
    assert!(pending_file.exists());

    let rolled_back = Arc::new(AtomicBool::new(false));
    let rolled_back_clone = rolled_back.clone();

    let handled = watchdog
        .trigger_revert(WatchdogReason::Timeout, |rec| {
            assert_eq!(rec.tweak_name, "MTU Tweak");
            rolled_back_clone.store(true, Ordering::SeqCst);
            Ok(())
        })
        .unwrap();

    assert!(handled);
    assert!(rolled_back.load(Ordering::SeqCst));
    assert!(!pending_file.exists());
}
