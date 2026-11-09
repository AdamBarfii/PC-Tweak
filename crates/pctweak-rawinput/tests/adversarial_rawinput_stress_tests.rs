use pctweak_rawinput::tracker::JitterTracker;
use pctweak_rawinput::types::RawSample;

const QPC_FREQ_10MHZ: f64 = 10_000_000.0; // 10 MHz timer frequency = 1 tick = 100 ns

// =========================================================================
// 1. STATIONARY & THRESHOLD FILTERING HARNESS
// =========================================================================

#[test]
fn test_adversarial_stationary_filtering_zero_movement() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // 100 samples with zero movement (dx=0, dy=0)
    for i in 0..100 {
        tracker.push_sample(RawSample {
            qpc_time: (i * 10_000) as i64,
            dx: 0,
            dy: 0,
            buttons: 0,
        });
    }

    let metrics = tracker.compute_metrics(1_000_000, 0.5);
    assert!(!metrics.sufficient_movement, "Stationary mouse must not be marked sufficient");
    assert_eq!(metrics.polling_hz, None, "Stationary mouse must emit None polling rate");
    assert_eq!(metrics.jitter_p99_ms, None);
    assert_eq!(metrics.movement_counts, 0);
    assert_eq!(metrics.sample_count, 100);
}

#[test]
fn test_adversarial_stationary_filtering_exact_movement_boundaries() {
    // Boundary 1: 9 samples with movement >= 10 -> FAIL (requires >= 10 samples)
    {
        let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);
        for i in 0..9 {
            tracker.push_sample(RawSample {
                qpc_time: (i * 10_000) as i64,
                dx: 5,
                dy: 5,
                buttons: 0,
            });
        }
        let metrics = tracker.compute_metrics(90_000, 0.5);
        assert!(!metrics.sufficient_movement);
        assert_eq!(metrics.polling_hz, None);
    }

    // Boundary 2: 10 samples with total movement = 9 -> FAIL (requires total_movement >= 10)
    {
        let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);
        for i in 0..10 {
            // Note: tracker calculates movement across transitions from index 1 to 9 (9 transitions)
            let dx = if i == 0 { 0 } else { 1 }; // sum of transitions = 9
            tracker.push_sample(RawSample {
                qpc_time: (i * 10_000) as i64,
                dx,
                dy: 0,
                buttons: 0,
            });
        }
        let metrics = tracker.compute_metrics(100_000, 0.5);
        assert!(!metrics.sufficient_movement);
        assert_eq!(metrics.movement_counts, 9);
        assert_eq!(metrics.polling_hz, None);
    }

    // Boundary 3: 10 samples with total movement = 10 spanning > 50ms -> SUCCEED!
    {
        let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);
        // 10 samples spaced by 6ms (60,000 QPC ticks) = 54ms total span (> 50ms requirement)
        // 9 transitions with dx=1, plus 1 transition with dx=2 -> total movement = 10
        for i in 0..10 {
            let dx = if i == 1 { 2 } else if i > 1 { 1 } else { 0 };
            tracker.push_sample(RawSample {
                qpc_time: (i * 60_000) as i64,
                dx,
                dy: 0,
                buttons: 0,
            });
        }
        let metrics = tracker.compute_metrics(600_000, 0.5);
        assert!(metrics.sufficient_movement);
        assert_eq!(metrics.movement_counts, 10);
        assert!(metrics.polling_hz.is_some());
    }
}

// =========================================================================
// 2. HIGH-FREQUENCY PACING & JITTER ORACLES (1000Hz, 4000Hz, 8000Hz)
// =========================================================================

#[test]
fn test_adversarial_high_frequency_pacing_1000hz() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // 1000 Hz = 1.0 ms between samples = 10,000 QPC ticks per event
    let count = 400; // 400ms of data
    for i in 0..count {
        tracker.push_sample(RawSample {
            qpc_time: (i * 10_000) as i64,
            dx: 2,
            dy: -2,
            buttons: 0,
        });
    }

    let now_qpc = (count * 10_000) as i64;
    let metrics = tracker.compute_metrics(now_qpc, 0.5);

    assert!(metrics.sufficient_movement);
    let hz = metrics.polling_hz.unwrap();
    assert!(
        hz >= 995 && hz <= 1005,
        "1000Hz pacing test failed: got {} Hz",
        hz
    );
    assert!(
        (metrics.median_interval_ms.unwrap() - 1.0).abs() < 0.001,
        "Median interval not 1.0ms"
    );
    assert_eq!(metrics.dropped_events, 0);
}

#[test]
fn test_adversarial_high_frequency_pacing_4000hz() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // 4000 Hz = 0.25 ms between samples = 2,500 QPC ticks
    let count = 1600; // 400ms of data
    for i in 0..count {
        tracker.push_sample(RawSample {
            qpc_time: (i * 2_500) as i64,
            dx: 1,
            dy: 1,
            buttons: 0,
        });
    }

    let now_qpc = (count * 2_500) as i64;
    let metrics = tracker.compute_metrics(now_qpc, 0.5);

    assert!(metrics.sufficient_movement);
    let hz = metrics.polling_hz.unwrap();
    assert!(
        hz >= 3980 && hz <= 4020,
        "4000Hz pacing test failed: got {} Hz",
        hz
    );
    assert!(
        (metrics.median_interval_ms.unwrap() - 0.25).abs() < 0.001,
        "Median interval not 0.25ms"
    );
    assert_eq!(metrics.dropped_events, 0);
}

#[test]
fn test_adversarial_high_frequency_pacing_8000hz() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // 8000 Hz = 0.125 ms between samples = 1,250 QPC ticks
    let count = 3200; // 400ms of data
    for i in 0..count {
        tracker.push_sample(RawSample {
            qpc_time: (i * 1_250) as i64,
            dx: 1,
            dy: 0,
            buttons: 0,
        });
    }

    let now_qpc = (count * 1_250) as i64;
    let metrics = tracker.compute_metrics(now_qpc, 0.5);

    assert!(metrics.sufficient_movement);
    let hz = metrics.polling_hz.unwrap();
    assert!(
        hz >= 7960 && hz <= 8040,
        "8000Hz pacing test failed: got {} Hz",
        hz
    );
    assert!(
        (metrics.median_interval_ms.unwrap() - 0.125).abs() < 0.001,
        "Median interval not 0.125ms"
    );
    assert_eq!(metrics.dropped_events, 0);
}

// =========================================================================
// 3. ADVERSARIAL JITTER & DROPPED EVENT TRACKING
// =========================================================================

#[test]
fn test_adversarial_rapid_jitter_and_dropped_packets() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // Generate 100 samples with 1.0ms base pacing (10,000 ticks)
    // Inject 5 severe packet drop anomalies:
    // - 3 drops with 3.5ms delay (35,000 ticks) > 2x median
    // - 2 micro-burst bursts with 0.1ms delay (1,000 ticks) < 0.2x median
    let mut current_qpc: i64 = 0;
    for i in 0..100 {
        let delta = if i == 20 || i == 40 || i == 60 {
            35_000 // 3.5ms delay (>2.0x of 1.0ms)
        } else if i == 21 || i == 41 {
            1_000 // 0.1ms micro-burst (<0.2x of 1.0ms)
        } else {
            10_000 // normal 1.0ms
        };
        current_qpc += delta;

        tracker.push_sample(RawSample {
            qpc_time: current_qpc,
            dx: 3,
            dy: 2,
            buttons: 0,
        });
    }

    let metrics = tracker.compute_metrics(current_qpc, 0.5);
    assert!(metrics.sufficient_movement);
    // 3 long intervals (>2.0x median) + 2 short intervals (<0.2x median) = 5 dropped events
    assert_eq!(
        metrics.dropped_events, 5,
        "Expected exactly 5 dropped/irregular events, got {}",
        metrics.dropped_events
    );
    // P99 jitter deviation should be elevated due to the 3.5ms spikes
    let p99_jitter = metrics.jitter_p99_ms.unwrap();
    assert!(
        p99_jitter >= 2.0,
        "Jitter P99 must reflect the severe 3.5ms spikes, got {:.3}ms",
        p99_jitter
    );
}

#[test]
fn test_adversarial_outlier_duplicate_and_negative_timestamps() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5);

    // Inject duplicate timestamps (dt=0) and reversed timestamps (dt < 0)
    tracker.push_sample(RawSample { qpc_time: 10_000, dx: 1, dy: 1, buttons: 0 });
    tracker.push_sample(RawSample { qpc_time: 10_000, dx: 1, dy: 1, buttons: 0 }); // duplicate
    tracker.push_sample(RawSample { qpc_time: 9_000, dx: 1, dy: 1, buttons: 0 });  // out of order
    tracker.push_sample(RawSample { qpc_time: 20_000, dx: 1, dy: 1, buttons: 0 });

    // Fill with remaining valid samples to pass count threshold
    for i in 3..25 {
        tracker.push_sample(RawSample {
            qpc_time: 20_000 + (i * 10_000) as i64,
            dx: 1,
            dy: 1,
            buttons: 0,
        });
    }

    // Must NOT panic or produce NaN
    let metrics = tracker.compute_metrics(300_000, 0.5);
    assert!(metrics.median_interval_ms.is_some());
    assert!(!metrics.median_interval_ms.unwrap().is_nan());
    assert!(!metrics.jitter_p99_ms.unwrap().is_nan());
}

// =========================================================================
// 4. SLIDING WINDOW PRUNING STRESS
// =========================================================================

#[test]
fn test_adversarial_sliding_window_pruning_stress() {
    let mut tracker = JitterTracker::new(QPC_FREQ_10MHZ, 0.5); // 500ms window = 5,000,000 QPC ticks

    // Inject 5,000 samples over 5 seconds (50,000,000 ticks)
    for i in 0..5000 {
        tracker.push_sample(RawSample {
            qpc_time: (i * 10_000) as i64,
            dx: 2,
            dy: 2,
            buttons: 0,
        });
    }
    assert_eq!(tracker.sample_count(), 5000);

    // Compute metrics at t = 50,000,000 (5.0 seconds).
    // Cutoff is 50,000,000 - 5,000,000 = 45,000,000.
    // Samples with qpc_time < 45,000,000 MUST be pruned away.
    // 45,000,000 / 10,000 = index 4500. So indices 4500..4999 (500 samples) remain!
    let metrics = tracker.compute_metrics(50_000_000, 0.5);
    assert_eq!(metrics.sample_count, 500);
    assert_eq!(tracker.sample_count(), 500);

    // Test clear
    tracker.clear();
    assert_eq!(tracker.sample_count(), 0);
}
