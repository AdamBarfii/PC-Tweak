use pctweak_rawinput::{
    enumerate_devices, get_mouse_spi, set_mouse_spi, JitterTracker, RawSample,
};

#[test]
fn test_synthetic_1000hz_pacing_metrics() {
    let qpc_freq = 10_000_000.0; // 10 MHz QPC clock (1 tick = 100ns)
    let mut tracker = JitterTracker::new(qpc_freq, 0.5); // 500ms window

    // 1000Hz = 1ms per event = 10,000 QPC ticks per event
    let start_qpc = 100_000_000i64;
    for i in 0..100 {
        let qpc = start_qpc + (i * 10_000);
        tracker.push_sample(RawSample {
            qpc_time: qpc,
            dx: 5,
            dy: 5,
            buttons: 0,
        });
    }

    let end_qpc = start_qpc + (99 * 10_000);
    let metrics = tracker.compute_metrics(end_qpc, 0.5);

    assert!(metrics.sufficient_movement);
    assert_eq!(metrics.sample_count, 100);
    assert_eq!(metrics.movement_counts, 990); // 99 steps * 10 movement per step
    assert_eq!(metrics.polling_hz, Some(1000));
    assert_eq!(metrics.dropped_events, 0);

    // Median interval should be exactly 1.0 ms
    let median = metrics.median_interval_ms.unwrap();
    assert!((median - 1.0).abs() < 0.001);

    // Jitter should be 0.0 ms for perfect synthetic pacing
    let jitter = metrics.jitter_p99_ms.unwrap();
    assert!(jitter < 0.001);
}

#[test]
fn test_stationary_threshold_filters_idle() {
    let qpc_freq = 10_000_000.0;
    let mut tracker = JitterTracker::new(qpc_freq, 0.5);

    let start_qpc = 50_000_000i64;
    // Samples with zero movement (dx=0, dy=0)
    for i in 0..50 {
        let qpc = start_qpc + (i * 10_000);
        tracker.push_sample(RawSample {
            qpc_time: qpc,
            dx: 0,
            dy: 0,
            buttons: 0,
        });
    }

    let end_qpc = start_qpc + (49 * 10_000);
    let metrics = tracker.compute_metrics(end_qpc, 0.5);

    assert!(!metrics.sufficient_movement);
    assert_eq!(metrics.polling_hz, None);
    assert_eq!(metrics.jitter_p99_ms, None);
    assert_eq!(metrics.movement_counts, 0);
}

#[test]
fn test_insufficient_sample_count_filters_spurious_input() {
    let qpc_freq = 10_000_000.0;
    let mut tracker = JitterTracker::new(qpc_freq, 0.5);

    // Only 5 samples (less than 10 samples threshold)
    let start_qpc = 10_000_000i64;
    for i in 0..5 {
        let qpc = start_qpc + (i * 10_000);
        tracker.push_sample(RawSample {
            qpc_time: qpc,
            dx: 10,
            dy: 10,
            buttons: 0,
        });
    }

    let end_qpc = start_qpc + (4 * 10_000);
    let metrics = tracker.compute_metrics(end_qpc, 0.5);

    assert!(!metrics.sufficient_movement);
    assert_eq!(metrics.polling_hz, None);
}

#[test]
fn test_outlier_and_dropped_event_detection() {
    let qpc_freq = 10_000_000.0;
    let mut tracker = JitterTracker::new(qpc_freq, 0.5);

    let start_qpc = 100_000_000i64;
    let mut current_qpc = start_qpc;

    // 40 normal 1ms samples
    for _ in 0..40 {
        tracker.push_sample(RawSample {
            qpc_time: current_qpc,
            dx: 2,
            dy: 2,
            buttons: 0,
        });
        current_qpc += 10_000;
    }

    // Insert an abnormal delay: 5ms gap (50_000 ticks) simulating a dropped USB report packet
    current_qpc += 50_000;
    tracker.push_sample(RawSample {
        qpc_time: current_qpc,
        dx: 2,
        dy: 2,
        buttons: 0,
    });

    // Another 20 normal samples
    for _ in 0..20 {
        current_qpc += 10_000;
        tracker.push_sample(RawSample {
            qpc_time: current_qpc,
            dx: 2,
            dy: 2,
            buttons: 0,
        });
    }

    let metrics = tracker.compute_metrics(current_qpc, 0.5);
    assert!(metrics.sufficient_movement);
    assert!(
        metrics.dropped_events >= 1,
        "Expected at least 1 dropped/irregular event, got {}",
        metrics.dropped_events
    );
    assert!(metrics.max_interval_ms.unwrap() >= 5.0);
}

#[test]
fn test_sliding_window_pruning() {
    let qpc_freq = 10_000_000.0;
    let mut tracker = JitterTracker::new(qpc_freq, 0.5); // 500ms = 5,000,000 ticks

    // Push samples at t = 0..100ms
    for i in 0..20 {
        tracker.push_sample(RawSample {
            qpc_time: i * 50_000, // 5ms steps
            dx: 1,
            dy: 1,
            buttons: 0,
        });
    }
    assert_eq!(tracker.sample_count(), 20);

    // Compute metrics at t = 1000ms (1 second later): cutoff is 500ms
    // All samples from 0..100ms should be pruned!
    let now_qpc = 10_000_000i64;
    let metrics = tracker.compute_metrics(now_qpc, 0.5);
    assert_eq!(metrics.sample_count, 0);
    assert!(!metrics.sufficient_movement);
}

#[test]
fn test_mouse_spi_pointer_speed_clamping() {
    // Read initial speed
    let (initial_speed, initial_params) = get_mouse_spi();
    assert!(initial_speed >= 1 && initial_speed <= 20);

    // Test clamped to upper bound 20
    let prev = set_mouse_spi(25, true);
    let (speed_clamped_high, _) = get_mouse_spi();
    assert_eq!(speed_clamped_high, 20);

    // Test clamped to lower bound 1
    set_mouse_spi(0, true);
    let (speed_clamped_low, _) = get_mouse_spi();
    assert_eq!(speed_clamped_low, 1);

    // Test neutral notch 10
    set_mouse_spi(10, true);
    let (neutral_speed, _) = get_mouse_spi();
    assert_eq!(neutral_speed, 10);

    // Restore original state
    let accel_was_disabled =
        initial_params[0] == 0 && initial_params[1] == 0 && initial_params[2] == 0;
    set_mouse_spi(prev.0, accel_was_disabled);
}

#[test]
fn test_device_enumeration_non_empty() {
    // On any real Windows machine (or VM/CI), RawInput enumeration should succeed
    let result = enumerate_devices();
    assert!(result.is_ok(), "enumerate_devices failed: {:?}", result.err());

    let devices = result.unwrap();
    // Verify each enumerated device has valid metadata
    for dev in &devices {
        assert!(dev.handle > 0);
        // Device path should not contain uninitialized garbage
        assert!(!dev.device_path.contains('\0'));
    }
}
