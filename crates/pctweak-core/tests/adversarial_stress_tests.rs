use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{json, Value};
use tempfile::tempdir;

use pctweak_core::engine::mouse_curve::{
    get_mouse_registry_settings, pointer_speed_to_mouse_sensitivity,
};
use pctweak_core::engine::transactional::{
    ActionExecutor, PlannedAction, TransactionalEngine,
};
use pctweak_core::error::CoreError;
use pctweak_core::models::backup::SnapshotActionType;
use pctweak_core::models::profile::TuningProfile;
use pctweak_core::models::settings::{AppSettings, Language};
use pctweak_core::stores::backup_store::BackupStore;
use pctweak_core::stores::profile_store::ProfileStore;
use pctweak_core::stores::settings_store::SettingsStore;

// ============================================================================
// SUITE 1: PROTOTYPE POLLUTION FUZZING
// ============================================================================

#[test]
fn test_stress_prototype_pollution_deep_nesting() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Deeply nested prototype pollution at depth 20
    let mut nested = json!({ "__proto__": { "polluted": true } });
    for i in 0..20 {
        nested = json!({ format!("level_{}", i): nested });
    }

    let payload = json!({
        "theme": "light",
        "nested_attack": nested
    });

    let result = store.update_settings(&payload);
    assert!(
        matches!(result, Err(CoreError::PrototypePollutionDetected)),
        "Deeply nested __proto__ must be rejected with PrototypePollutionDetected"
    );
}

#[test]
fn test_stress_prototype_pollution_array_nesting() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Pollution buried inside an array within an object within an array
    let payload = json!({
        "theme": "dark",
        "items": [
            1,
            2,
            {
                "subitems": [
                    { "constructor": "evil_ctor" }
                ]
            }
        ]
    });

    let result = store.update_settings(&payload);
    assert!(
        matches!(result, Err(CoreError::PrototypePollutionDetected)),
        "Array-nested constructor key must be rejected with PrototypePollutionDetected"
    );
}

#[test]
fn test_stress_prototype_pollution_explicit_prototype_key() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    let payload = json!({
        "language": "en",
        "prototype": { "hacked": true }
    });

    let result = store.update_settings(&payload);
    assert!(
        matches!(result, Err(CoreError::PrototypePollutionDetected)),
        "Key 'prototype' must be rejected with PrototypePollutionDetected"
    );
}

#[test]
fn test_stress_prototype_pollution_profile_store_import() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    // Hostile profile with constructor pollution in mouseSettings
    let hostile_json = r#"{
        "name": "Polluted Profile",
        "mouseSettings": {
            "pointerSpeed": 6,
            "__proto__": { "admin": true }
        }
    }"#;

    let result = store.import_profile_from_json(hostile_json);
    assert!(
        matches!(result, Err(CoreError::PrototypePollutionDetected)),
        "Profile import with __proto__ must be rejected with PrototypePollutionDetected"
    );
}

#[test]
fn test_stress_prototype_pollution_safe_payloads_accepted() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Normal payload with similar-looking words that are NOT prototype pollution
    let payload = json!({
        "language": "fa",
        "proto_type": "safe",
        "my_constructor_name": "safe",
        "prototype_test": "safe"
    });

    let result = store.update_settings(&payload);
    assert!(result.is_ok(), "Payload with safe substring keys should be accepted");
    assert_eq!(result.unwrap().language, Language::Fa);
}

// ============================================================================
// SUITE 2: CORRUPTED / TRUNCATED JSON RECOVERY
// ============================================================================

#[test]
fn test_stress_corrupted_json_random_byte_fuzzing() {
    let dir = tempdir().unwrap();
    let settings_file = dir.path().join("settings.json");
    let profiles_file = dir.path().join("profiles.json");
    let backups_file = dir.path().join("backups.json");

    let settings_store = SettingsStore::new(dir.path());
    let profile_store = ProfileStore::new(dir.path());
    let backup_store = BackupStore::new(dir.path());

    // Pseudo-random byte generator (deterministic LCG)
    let mut seed: u64 = 0xDEADBEEF_CAFEBABE;
    let mut next_byte = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        (seed >> 33) as u8
    };

    for iteration in 0..50 {
        let size = (iteration * 17) % 512 + 1;
        let garbage: Vec<u8> = (0..size).map(|_| next_byte()).collect();

        // 1. SettingsStore fuzz
        fs::write(&settings_file, &garbage).unwrap();
        let loaded_settings = settings_store.get_settings();
        assert_eq!(
            loaded_settings,
            AppSettings::default(),
            "Corrupted settings.json at iteration {} must fall back to defaults",
            iteration
        );

        // Self-healing test
        let heal_res = settings_store.update_settings(&json!({ "language": "fa" }));
        assert!(heal_res.is_ok(), "update_settings must heal corrupted settings.json");
        assert_eq!(settings_store.get_settings().language, Language::Fa);

        // 2. ProfileStore fuzz
        fs::write(&profiles_file, &garbage).unwrap();
        let profiles = profile_store.get_all_profiles();
        assert_eq!(
            profiles.len(),
            4,
            "Corrupted profiles.json at iteration {} must return 4 built-in presets",
            iteration
        );

        // 3. BackupStore fuzz
        fs::write(&backups_file, &garbage).unwrap();
        let backups = backup_store.list_backups();
        assert_eq!(
            backups.len(),
            0,
            "Corrupted backups.json at iteration {} must return empty list",
            iteration
        );
    }
}

#[test]
fn test_stress_truncated_json_recovery() {
    let dir = tempdir().unwrap();
    let settings_file = dir.path().join("settings.json");
    let store = SettingsStore::new(dir.path());

    let full_json = r#"{"theme": "light", "language": "fa", "hardwarePollingInterval": 2500, "closeToTray": false}"#;

    // Truncate at every single byte boundary from 1 to len - 1
    for cut_idx in 1..full_json.len() {
        let truncated = &full_json[..cut_idx];
        fs::write(&settings_file, truncated).unwrap();

        let settings = store.get_settings();
        assert_eq!(
            settings,
            AppSettings::default(),
            "Truncated JSON at cut_idx {} must return defaults without panicking",
            cut_idx
        );
    }
}

#[test]
fn test_stress_non_json_and_primitive_strings() {
    let dir = tempdir().unwrap();
    let settings_file = dir.path().join("settings.json");
    let store = SettingsStore::new(dir.path());

    let edge_cases = [
        "",                             // 0 bytes
        "   \r\n\t   ",                // whitespace only
        "\0\0\0\0",                     // null bytes
        "Not a JSON string at all",    // plain text
        "<xml><bad>true</bad></xml>",  // XML
        "12345",                        // JSON number primitive
        "\"raw string literal\"",       // JSON string primitive
        "true",                         // JSON boolean primitive
        "null",                         // JSON null primitive
        "[]",                           // JSON array (not object)
        "[1, 2, 3]",                    // JSON array with numbers
        "{'single_quoted': true}",      // invalid single quotes
        "{\"unclosed\": \"object\"",    // missing closing brace
        "{\"trailing\": \"comma\",}",   // trailing comma
    ];

    for edge in edge_cases {
        fs::write(&settings_file, edge).unwrap();
        let settings = store.get_settings();
        assert_eq!(
            settings,
            AppSettings::default(),
            "Non-object or malformed input {:?} must return defaults",
            edge
        );
    }
}

// ============================================================================
// SUITE 3: CONCURRENCY & RACE CONDITIONS
// ============================================================================

#[test]
fn test_stress_settings_store_multithreaded_updates() {
    let dir = tempdir().unwrap();
    let store_path = dir.path().join("settings.json");
    let store = SettingsStore::with_path(store_path.clone());

    let num_threads = 8;
    let iterations_per_thread = 25;
    let mut handles = Vec::new();

    let success_count = Arc::new(Mutex::new(0));
    let error_count = Arc::new(Mutex::new(0));

    for thread_idx in 0..num_threads {
        let store_clone = store.clone();
        let succ_clone = Arc::clone(&success_count);
        let err_clone = Arc::clone(&error_count);

        let handle = thread::spawn(move || {
            for i in 0..iterations_per_thread {
                let interval = 500 + ((thread_idx * 100 + i * 50) % 4500) as u64;
                let lang = if i % 2 == 0 { "fa" } else { "en" };
                let payload = json!({
                    "hardwarePollingInterval": interval,
                    "language": lang
                });

                match store_clone.update_settings(&payload) {
                    Ok(_) => {
                        let mut s = succ_clone.lock().unwrap();
                        *s += 1;
                    }
                    Err(_) => {
                        let mut e = err_clone.lock().unwrap();
                        *e += 1;
                    }
                }
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().unwrap();
    }

    // Verify post-condition: settings.json on disk MUST be valid and parseable
    let raw = fs::read_to_string(&store_path).unwrap();
    let parsed: Result<Value, _> = serde_json::from_str(&raw);
    assert!(
        parsed.is_ok(),
        "settings.json must remain strictly valid JSON after concurrent updates: {}",
        raw
    );

    let current = store.get_settings();
    assert!(
        current.hardware_polling_interval >= 500 && current.hardware_polling_interval <= 5000,
        "Interval must remain clamped: got {}",
        current.hardware_polling_interval
    );
}

#[test]
fn test_stress_profile_store_concurrent_crud() {
    let dir = tempdir().unwrap();
    let store_path = dir.path().join("profiles.json");
    let store = ProfileStore::with_path(store_path.clone());

    let num_threads = 4;
    let mut handles = Vec::new();

    for t_idx in 0..num_threads {
        let store_clone = store.clone();
        let handle = thread::spawn(move || {
            for i in 0..10 {
                let profile = TuningProfile {
                    id: format!("custom_thread_{}_{}", t_idx, i),
                    name: format!("Thread Profile {}-{}", t_idx, i),
                    category: pctweak_core::models::profile::TuningProfileCategory::Custom,
                    description: "Concurrent stress test".to_string(),
                    is_built_in: false,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    tweak_ids: vec!["mouse_accel".to_string()],
                    direct_x: Default::default(),
                    mouse_settings: Default::default(),
                    keyboard_tweaks: Vec::new(),
                    game_tag: None,
                };

                let _ = store_clone.save_profile(profile);
                let _ = store_clone.get_all_profiles();
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().unwrap();
    }

    // Disk integrity check
    let raw = fs::read_to_string(&store_path).unwrap();
    let parsed: Result<Value, _> = serde_json::from_str(&raw);
    assert!(
        parsed.is_ok(),
        "profiles.json must remain strictly valid JSON: {}",
        raw
    );

    // Built-ins must never be lost
    let all = store.get_all_profiles();
    let built_in_ids = ["esports_competitive", "streaming_content", "max_battery_quiet", "windows_default"];
    for b_id in built_in_ids {
        assert!(
            all.iter().any(|p| p.id == b_id && p.is_built_in),
            "Built-in preset {} must be preserved under concurrency",
            b_id
        );
    }
}

// ============================================================================
// SUITE 4: BOUNDARY VALUE ANALYSIS ON HARDWARE POLLING INTERVAL
// ============================================================================

#[test]
fn test_boundary_hardware_polling_interval_numeric() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Boundary 499 -> clamped to 500
    let res_499 = store.update_settings(&json!({ "hardwarePollingInterval": 499 })).unwrap();
    assert_eq!(res_499.hardware_polling_interval, 500, "499 must clamp to 500");

    // Boundary 500 -> exact 500
    let res_500 = store.update_settings(&json!({ "hardwarePollingInterval": 500 })).unwrap();
    assert_eq!(res_500.hardware_polling_interval, 500, "500 must stay 500");

    // Boundary 5000 -> exact 5000
    let res_5000 = store.update_settings(&json!({ "hardwarePollingInterval": 5000 })).unwrap();
    assert_eq!(res_5000.hardware_polling_interval, 5000, "5000 must stay 5000");

    // Boundary 5001 -> clamped to 5000
    let res_5001 = store.update_settings(&json!({ "hardwarePollingInterval": 5001 })).unwrap();
    assert_eq!(res_5001.hardware_polling_interval, 5000, "5001 must clamp to 5000");

    // Underflow / zero / negative
    let res_zero = store.update_settings(&json!({ "hardwarePollingInterval": 0 })).unwrap();
    assert_eq!(res_zero.hardware_polling_interval, 500, "0 must clamp to 500");

    let res_neg = store.update_settings(&json!({ "hardwarePollingInterval": -999999 })).unwrap();
    assert_eq!(res_neg.hardware_polling_interval, 500, "Negative must clamp to 500");

    // Overflow
    let res_large = store.update_settings(&json!({ "hardwarePollingInterval": 999999999 })).unwrap();
    assert_eq!(res_large.hardware_polling_interval, 5000, "Large number must clamp to 5000");
}

#[test]
fn test_boundary_hardware_polling_interval_floats() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // 499.4 rounds to 499 -> clamps to 500
    let r1 = store.update_settings(&json!({ "hardwarePollingInterval": 499.4 })).unwrap();
    assert_eq!(r1.hardware_polling_interval, 500);

    // 499.6 rounds to 500 -> 500
    let r2 = store.update_settings(&json!({ "hardwarePollingInterval": 499.6 })).unwrap();
    assert_eq!(r2.hardware_polling_interval, 500);

    // 5000.4 rounds to 5000 -> 5000
    let r3 = store.update_settings(&json!({ "hardwarePollingInterval": 5000.4 })).unwrap();
    assert_eq!(r3.hardware_polling_interval, 5000);

    // 5000.6 rounds to 5001 -> clamps to 5000
    let r4 = store.update_settings(&json!({ "hardwarePollingInterval": 5000.6 })).unwrap();
    assert_eq!(r4.hardware_polling_interval, 5000);
}

#[test]
fn test_boundary_hardware_polling_interval_string_parsing() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Numeric strings
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "499" })).unwrap().hardware_polling_interval,
        500
    );
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "500" })).unwrap().hardware_polling_interval,
        500
    );
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "5000" })).unwrap().hardware_polling_interval,
        5000
    );
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "5001" })).unwrap().hardware_polling_interval,
        5000
    );

    // Whitespace string -> coerces to 0 in JS -> clamps to 500
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "   " })).unwrap().hardware_polling_interval,
        500
    );

    // Non-numeric string -> falls back to default 1000
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "invalid" })).unwrap().hardware_polling_interval,
        1000
    );
    assert_eq!(
        store.update_settings(&json!({ "hardwarePollingInterval": "" })).unwrap().hardware_polling_interval,
        500 // empty string in sanitize_value trimmed.is_empty() -> 500
    );
}

#[test]
fn test_boundary_hardware_polling_interval_special_values() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // In JSON, NaN and Infinity can only be passed as strings: "NaN", "Infinity", "-Infinity"
    // Documenting current Rust implementation behavior vs JS specification:
    let r_nan = store.update_settings(&json!({ "hardwarePollingInterval": "NaN" })).unwrap();
    let r_inf = store.update_settings(&json!({ "hardwarePollingInterval": "Infinity" })).unwrap();
    let r_neginf = store.update_settings(&json!({ "hardwarePollingInterval": "-Infinity" })).unwrap();

    // Empirically observe what Rust parses "NaN" and "Infinity" to:
    println!(
        "Special strings evaluated: 'NaN' -> {}, 'Infinity' -> {}, '-Infinity' -> {}",
        r_nan.hardware_polling_interval,
        r_inf.hardware_polling_interval,
        r_neginf.hardware_polling_interval
    );

    // Both values stay clamped within [500, 5000] range
    assert!(r_nan.hardware_polling_interval >= 500 && r_nan.hardware_polling_interval <= 5000);
    assert!(r_inf.hardware_polling_interval >= 500 && r_inf.hardware_polling_interval <= 5000);
    assert!(r_neginf.hardware_polling_interval >= 500 && r_neginf.hardware_polling_interval <= 5000);
}

// ============================================================================
// SUITE 5: TRANSACTIONAL ROLLBACK STRESS
// ============================================================================

struct MockRigorousExecutor {
    pub db: HashMap<String, Value>,
    pub query_fail_on: Option<String>,
    pub apply_fail_on: Option<String>,
    pub restore_log: Vec<(String, bool, Value)>,
    pub apply_log: Vec<(String, Value)>,
}

impl MockRigorousExecutor {
    fn new() -> Self {
        Self {
            db: HashMap::new(),
            query_fail_on: None,
            apply_fail_on: None,
            restore_log: Vec::new(),
            apply_log: Vec::new(),
        }
    }
}

impl ActionExecutor for MockRigorousExecutor {
    fn query_original(
        &mut self,
        action_id: &str,
        _metadata: &Value,
    ) -> Result<(bool, Value), CoreError> {
        if let Some(ref fail_id) = self.query_fail_on {
            if fail_id == action_id {
                return Err(CoreError::InvalidPayload(format!("Query failed for {}", action_id)));
            }
        }
        match self.db.get(action_id) {
            Some(val) => Ok((true, val.clone())),
            None => Ok((false, Value::Null)),
        }
    }

    fn apply(
        &mut self,
        action_id: &str,
        _metadata: &Value,
        apply_val: &Value,
    ) -> Result<(), CoreError> {
        if let Some(ref fail_id) = self.apply_fail_on {
            if fail_id == action_id {
                return Err(CoreError::InvalidPayload(format!("Apply failed for {}", action_id)));
            }
        }
        self.apply_log.push((action_id.to_string(), apply_val.clone()));
        self.db.insert(action_id.to_string(), apply_val.clone());
        Ok(())
    }

    fn restore(
        &mut self,
        action_id: &str,
        _metadata: &Value,
        orig_exists: bool,
        orig_val: &Value,
    ) -> Result<(), CoreError> {
        self.restore_log.push((action_id.to_string(), orig_exists, orig_val.clone()));
        if orig_exists {
            self.db.insert(action_id.to_string(), orig_val.clone());
        } else {
            self.db.remove(action_id);
        }
        Ok(())
    }
}

#[test]
fn test_transactional_multi_step_failure_and_reverse_unwind() {
    let mut exec = MockRigorousExecutor::new();

    // Initial state: action_0 and action_1 have existing values; action_2 does not
    exec.db.insert("act_0".to_string(), json!(10));
    exec.db.insert("act_1".to_string(), json!("initial_1"));

    // Action 3 is rigged to fail on apply
    exec.apply_fail_on = Some("act_3".to_string());

    let actions = vec![
        PlannedAction {
            action_id: "act_0".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!(20),
            revert_default_value: json!(10),
        },
        PlannedAction {
            action_id: "act_1".to_string(),
            action_type: SnapshotActionType::Service,
            metadata: json!({}),
            apply_value: json!("modified_1"),
            revert_default_value: json!("initial_1"),
        },
        PlannedAction {
            action_id: "act_2".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!("brand_new"),
            revert_default_value: Value::Null,
        },
        PlannedAction {
            action_id: "act_3".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!("will_fail"),
            revert_default_value: Value::Null,
        },
    ];

    let mut engine = TransactionalEngine::new(exec);
    let result = engine.execute_transaction("multi_step_test", &actions);

    assert!(result.is_err(), "Transaction must fail when step 3 fails apply");

    match result.unwrap_err() {
        CoreError::TransactionFailed {
            failed_step,
            rolled_back_count,
            ..
        } => {
            assert_eq!(failed_step, 3, "Failed step must be index 3");
            assert_eq!(rolled_back_count, 3, "Must have rolled back 3 previous actions");
        }
        other => panic!("Unexpected error type: {:?}", other),
    }

    // Verify reverse unwind order: act_2, then act_1, then act_0
    let restored_ids: Vec<String> = engine.executor.restore_log.iter().map(|(id, _, _)| id.clone()).collect();
    assert_eq!(
        restored_ids,
        vec!["act_2", "act_1", "act_0"],
        "Restore must unwind in strict reverse order"
    );

    // Verify database values are restored to initial state
    assert_eq!(engine.executor.db.get("act_0"), Some(&json!(10)));
    assert_eq!(engine.executor.db.get("act_1"), Some(&json!("initial_1")));
    assert_eq!(engine.executor.db.get("act_2"), None); // was non-existent, so deleted
    assert_eq!(engine.executor.db.get("act_3"), None);
}

#[test]
fn test_transactional_query_failure_immediate_unwind() {
    let mut exec = MockRigorousExecutor::new();
    exec.db.insert("act_0".to_string(), json!("orig_0"));
    exec.query_fail_on = Some("act_1".to_string());

    let actions = vec![
        PlannedAction {
            action_id: "act_0".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!("new_0"),
            revert_default_value: json!("orig_0"),
        },
        PlannedAction {
            action_id: "act_1".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!("new_1"),
            revert_default_value: Value::Null,
        },
    ];

    let mut engine = TransactionalEngine::new(exec);
    let result = engine.execute_transaction("query_fail_test", &actions);

    assert!(result.is_err());
    match result.unwrap_err() {
        CoreError::TransactionFailed {
            failed_step,
            rolled_back_count,
            ..
        } => {
            assert_eq!(failed_step, 1);
            assert_eq!(rolled_back_count, 1);
        }
        other => panic!("Unexpected error: {:?}", other),
    }

    // act_0 must have been unwound
    assert_eq!(engine.executor.restore_log.len(), 1);
    assert_eq!(engine.executor.restore_log[0].0, "act_0");
    assert_eq!(engine.executor.db.get("act_0"), Some(&json!("orig_0")));
}

#[test]
fn test_transactional_empty_action_list() {
    let exec = MockRigorousExecutor::new();
    let mut engine = TransactionalEngine::new(exec);

    let result = engine.execute_transaction("empty_tweak", &[]);
    assert!(result.is_ok(), "Empty action list must succeed");

    let record = result.unwrap();
    assert_eq!(record.snapshots.len(), 0);

    // Rollback empty backup
    let rollback_res = engine.rollback_backup(&record);
    assert!(rollback_res.is_ok(), "Rollback of empty backup must succeed");
}

// ============================================================================
// SUITE 6: MOUSE SENSITIVITY CURVE VERIFICATION
// ============================================================================

#[test]
fn test_mouse_sensitivity_all_11_notches_adversarial_matrix() {
    let notch_matrix: [(f64, u32); 11] = [
        (1.0, 2),
        (2.0, 3),
        (3.0, 5),
        (4.0, 7),
        (5.0, 8),
        (6.0, 10), // Neutral
        (7.0, 12),
        (8.0, 13),
        (9.0, 15),
        (10.0, 17),
        (11.0, 18),
    ];

    for (notch, expected) in notch_matrix {
        let actual = pointer_speed_to_mouse_sensitivity(notch);
        assert_eq!(
            actual, expected,
            "Notch {} mismatch: expected {}, got {}",
            notch, expected, actual
        );
    }
}

#[test]
fn test_mouse_sensitivity_adversarial_out_of_bounds() {
    // Extreme sub-zero and negative
    assert_eq!(pointer_speed_to_mouse_sensitivity(-1000000.0), 1);
    assert_eq!(pointer_speed_to_mouse_sensitivity(-0.000001), 1);
    assert_eq!(pointer_speed_to_mouse_sensitivity(0.0), 1);
    assert_eq!(pointer_speed_to_mouse_sensitivity(0.5), 1);

    // Boundary above notch 11
    assert_eq!(pointer_speed_to_mouse_sensitivity(11.5), 19);
    assert_eq!(pointer_speed_to_mouse_sensitivity(12.0), 20);
    assert_eq!(pointer_speed_to_mouse_sensitivity(13.0), 20);
    assert_eq!(pointer_speed_to_mouse_sensitivity(9999999.0), 20);

    // Special IEEE 754 floats
    assert_eq!(pointer_speed_to_mouse_sensitivity(f64::NAN), 10, "NaN must fall back to neutral 10");
    assert_eq!(pointer_speed_to_mouse_sensitivity(f64::INFINITY), 20, "+Inf must clamp to 20");
    assert_eq!(pointer_speed_to_mouse_sensitivity(f64::NEG_INFINITY), 1, "-Inf must clamp to 1");
}

#[test]
fn test_mouse_registry_triplet_adversarial_modes() {
    // Notch 6 neutral raw
    let raw = get_mouse_registry_settings(6, false);
    assert_eq!(raw.mouse_sensitivity, 10);
    assert_eq!(raw.mouse_speed, "0");
    assert_eq!(raw.mouse_threshold1, "0");
    assert_eq!(raw.mouse_threshold2, "0");

    // Notch 6 accelerated
    let accel = get_mouse_registry_settings(6, true);
    assert_eq!(accel.mouse_sensitivity, 10);
    assert_eq!(accel.mouse_speed, "1");
    assert_eq!(accel.mouse_threshold1, "6");
    assert_eq!(accel.mouse_threshold2, "10");

    // Notch 1 accelerated
    let accel_1 = get_mouse_registry_settings(1, true);
    assert_eq!(accel_1.mouse_sensitivity, 2);
    assert_eq!(accel_1.mouse_speed, "1");

    // Notch 11 raw
    let raw_11 = get_mouse_registry_settings(11, false);
    assert_eq!(raw_11.mouse_sensitivity, 18);
    assert_eq!(raw_11.mouse_speed, "0");
}
