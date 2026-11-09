use pctweak_core::models::settings::{AppSettings, Language, Theme};
use pctweak_core::stores::settings_store::SettingsStore;
use pctweak_core::error::CoreError;
use tempfile::tempdir;
use serde_json::json;

#[test]
fn test_default_settings() {
    let defaults = AppSettings::default();
    assert_eq!(defaults.launch_on_startup, false);
    assert_eq!(defaults.minimize_to_tray, true);
    assert_eq!(defaults.close_to_tray, true);
    assert_eq!(defaults.language, Language::En);
    assert_eq!(defaults.hardware_polling_interval, 1000);
    assert_eq!(defaults.auto_update, true);
    assert_eq!(defaults.theme, Theme::Dark);
}

#[test]
fn test_missing_file_fallback() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());
    let settings = store.get_settings();
    assert_eq!(settings, AppSettings::default());
}

#[test]
fn test_corrupt_json_recovery() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());
    let file_path = dir.path().join("settings.json");

    // Case 1: Empty file
    std::fs::write(&file_path, "").unwrap();
    assert_eq!(store.get_settings(), AppSettings::default());

    // Case 2: Whitespace only
    std::fs::write(&file_path, "   \n\t  ").unwrap();
    assert_eq!(store.get_settings(), AppSettings::default());

    // Case 3: Malformed JSON syntax
    std::fs::write(&file_path, "{ broken json ...").unwrap();
    assert_eq!(store.get_settings(), AppSettings::default());

    // Case 4: Non-object JSON (array or primitive)
    std::fs::write(&file_path, "[1, 2, 3]").unwrap();
    assert_eq!(store.get_settings(), AppSettings::default());

    std::fs::write(&file_path, "42").unwrap();
    assert_eq!(store.get_settings(), AppSettings::default());
}

#[test]
fn test_partial_update_merging() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    let payload = json!({
        "language": "fa"
    });

    let updated = store.update_settings(&payload).unwrap();
    assert_eq!(updated.language, Language::Fa);
    assert_eq!(updated.hardware_polling_interval, 1000); // Preserved
    assert_eq!(updated.minimize_to_tray, true); // Preserved
    assert_eq!(updated.theme, Theme::Dark); // Preserved

    // Verify persisted to disk
    let reloaded = store.get_settings();
    assert_eq!(reloaded.language, Language::Fa);
    assert_eq!(reloaded.hardware_polling_interval, 1000);
}

#[test]
fn test_interval_clamping_lower() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    let payload = json!({
        "hardwarePollingInterval": 100
    });
    let updated = store.update_settings(&payload).unwrap();
    assert_eq!(updated.hardware_polling_interval, 500);

    let payload_zero = json!({
        "hardwarePollingInterval": 0
    });
    let updated_zero = store.update_settings(&payload_zero).unwrap();
    assert_eq!(updated_zero.hardware_polling_interval, 500);
}

#[test]
fn test_interval_clamping_upper() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    let payload = json!({
        "hardwarePollingInterval": 99999
    });
    let updated = store.update_settings(&payload).unwrap();
    assert_eq!(updated.hardware_polling_interval, 5000);
}

#[test]
fn test_interval_fallback_non_numeric() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // String "fast" -> fallback to 1000
    let payload_str = json!({
        "hardwarePollingInterval": "fast"
    });
    let updated = store.update_settings(&payload_str).unwrap();
    assert_eq!(updated.hardware_polling_interval, 1000);

    // null -> fallback to 1000
    let payload_null = json!({
        "hardwarePollingInterval": null
    });
    let updated_null = store.update_settings(&payload_null).unwrap();
    assert_eq!(updated_null.hardware_polling_interval, 1000);
}

#[test]
fn test_interval_string_parsing() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Valid string number with spaces
    let payload = json!({
        "hardwarePollingInterval": " 2500 "
    });
    let updated = store.update_settings(&payload).unwrap();
    assert_eq!(updated.hardware_polling_interval, 2500);

    // Float rounding
    let payload_float = json!({
        "hardwarePollingInterval": 1250.7
    });
    let updated_float = store.update_settings(&payload_float).unwrap();
    assert_eq!(updated_float.hardware_polling_interval, 1251);

    // Empty whitespace string coerces to 0 in JS -> clamps to 500
    let payload_empty = json!({
        "hardwarePollingInterval": "   "
    });
    let updated_empty = store.update_settings(&payload_empty).unwrap();
    assert_eq!(updated_empty.hardware_polling_interval, 500);
}

#[test]
fn test_prototype_pollution_rejection() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Top-level __proto__
    let payload1 = json!({
        "__proto__": { "polluted": true }
    });
    let err1 = store.update_settings(&payload1).unwrap_err();
    assert!(matches!(err1, CoreError::PrototypePollutionDetected));

    // Nested constructor
    let payload2 = json!({
        "theme": "dark",
        "nested": {
            "constructor": "malicious"
        }
    });
    let err2 = store.update_settings(&payload2).unwrap_err();
    assert!(matches!(err2, CoreError::PrototypePollutionDetected));

    // Array containing prototype
    let payload3 = json!({
        "tags": [
            { "prototype": "bad" }
        ]
    });
    let err3 = store.update_settings(&payload3).unwrap_err();
    assert!(matches!(err3, CoreError::PrototypePollutionDetected));
}

#[test]
fn test_factory_reset_app_data() {
    let dir = tempdir().unwrap();
    let store = SettingsStore::new(dir.path());

    // Setup dummy files
    let profiles_file = dir.path().join("profiles.json");
    let settings_file = dir.path().join("settings.json");
    let backups_file = dir.path().join("backups.json");
    let audit_file = dir.path().join("tweakAudit.json");
    let static_asset = dir.path().join("antiCheatRequirements.json");

    std::fs::write(&profiles_file, "[{\"id\":\"custom1\"}]").unwrap();
    std::fs::write(&settings_file, "{\"language\":\"fa\"}").unwrap();
    std::fs::write(&backups_file, "[{\"id\":\"b1\"}]").unwrap();
    std::fs::write(&audit_file, "{\"log\":[]}").unwrap();
    std::fs::write(&static_asset, "{\"static\":\"safe\"}").unwrap();

    let cleared = store.reset_app_data(dir.path()).unwrap();

    // Verify profiles.json is empty array "[]"
    let profiles_content = std::fs::read_to_string(&profiles_file).unwrap();
    assert_eq!(profiles_content, "[]");

    // Verify settings.json restored to defaults
    let reset_settings = store.get_settings();
    assert_eq!(reset_settings, AppSettings::default());

    // Verify backups and audit unlinked
    assert!(!backups_file.exists());
    assert!(!audit_file.exists());

    // CRITICAL: Verify static assets are preserved
    assert!(static_asset.exists());
    let static_content = std::fs::read_to_string(&static_asset).unwrap();
    assert_eq!(static_content, "{\"static\":\"safe\"}");

    assert!(cleared.contains(&"profiles.json".to_string()));
    assert!(cleared.contains(&"settings.json".to_string()));
    assert!(cleared.contains(&"backups.json".to_string()));
    assert!(cleared.contains(&"tweakAudit.json".to_string()));
}
