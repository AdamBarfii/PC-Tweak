use pctweak_core::engine::mouse_curve::{
    get_mouse_registry_settings, pointer_speed_to_mouse_sensitivity,
};

#[test]
fn test_mouse_sensitivity_all_11_notches() {
    // Exact calibration table:
    // Notch 1 -> 2
    // Notch 2 -> 3
    // Notch 3 -> 5
    // Notch 4 -> 7
    // Notch 5 -> 8
    // Notch 6 -> 10 (Neutral)
    // Notch 7 -> 12
    // Notch 8 -> 13
    // Notch 9 -> 15
    // Notch 10 -> 17
    // Notch 11 -> 18
    let expected = [
        (1.0, 2),
        (2.0, 3),
        (3.0, 5),
        (4.0, 7),
        (5.0, 8),
        (6.0, 10),
        (7.0, 12),
        (8.0, 13),
        (9.0, 15),
        (10.0, 17),
        (11.0, 18),
    ];

    for (notch, expected_sens) in expected {
        let actual = pointer_speed_to_mouse_sensitivity(notch);
        assert_eq!(
            actual, expected_sens,
            "Failed for notch {}: expected {}, got {}",
            notch, expected_sens, actual
        );
    }
}

#[test]
fn test_neutral_notch_strictly_10() {
    assert_eq!(pointer_speed_to_mouse_sensitivity(6.0), 10);
}

#[test]
fn test_out_of_bounds_clamping() {
    assert_eq!(pointer_speed_to_mouse_sensitivity(0.0), 1);
    assert_eq!(pointer_speed_to_mouse_sensitivity(-999.0), 1);
    assert_eq!(pointer_speed_to_mouse_sensitivity(12.0), 20);
    assert_eq!(pointer_speed_to_mouse_sensitivity(100.0), 20);
    assert_eq!(pointer_speed_to_mouse_sensitivity(f64::NAN), 10);
}

#[test]
fn test_mouse_registry_triplet() {
    // With enhanced pointer precision
    let reg_accel = get_mouse_registry_settings(6, true);
    assert_eq!(reg_accel.mouse_sensitivity, 10);
    assert_eq!(reg_accel.mouse_speed, "1");
    assert_eq!(reg_accel.mouse_threshold1, "6");
    assert_eq!(reg_accel.mouse_threshold2, "10");

    // Without enhanced pointer precision (raw 1:1)
    let reg_raw = get_mouse_registry_settings(6, false);
    assert_eq!(reg_raw.mouse_sensitivity, 10);
    assert_eq!(reg_raw.mouse_speed, "0");
    assert_eq!(reg_raw.mouse_threshold1, "0");
    assert_eq!(reg_raw.mouse_threshold2, "0");
}
