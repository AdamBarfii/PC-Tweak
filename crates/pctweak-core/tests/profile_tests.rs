use pctweak_core::error::CoreError;
use pctweak_core::models::profile::{
    get_built_in_profiles, TuningProfile, TuningProfileCategory, TuningProfileDirectXSettings,
    TuningProfileMouseSettings,
};
use pctweak_core::stores::profile_store::ProfileStore;
use serde_json::json;
use tempfile::tempdir;

#[test]
fn test_built_in_presets_count_and_ids() {
    let built_ins = get_built_in_profiles();
    assert_eq!(built_ins.len(), 4);

    let ids: Vec<&str> = built_ins.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"esports_competitive"));
    assert!(ids.contains(&"streaming_content"));
    assert!(ids.contains(&"max_battery_quiet"));
    assert!(ids.contains(&"windows_default"));

    for b in &built_ins {
        assert!(b.is_built_in);
        assert!(!b.name.is_empty());
        assert!(!b.description.is_empty());
    }

    // Verify Esports Competitive specific settings
    let esports = built_ins.iter().find(|p| p.id == "esports_competitive").unwrap();
    assert_eq!(esports.category, TuningProfileCategory::Esports);
    assert_eq!(esports.mouse_settings.pointer_speed, 6);
    assert_eq!(esports.mouse_settings.raw_input_mode, true);
    assert_eq!(esports.mouse_settings.disable_acceleration, true);
    assert_eq!(esports.direct_x.flip_model, true);
    assert_eq!(esports.direct_x.max_frame_latency, true);
}

#[test]
fn test_built_in_delete_blocked() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    let err = store.delete_profile("esports_competitive").unwrap_err();
    assert!(matches!(err, CoreError::BuiltInPresetProtected(_)));

    let err2 = store.delete_profile("windows_default").unwrap_err();
    assert!(matches!(err2, CoreError::BuiltInPresetProtected(_)));
}

#[test]
fn test_built_in_overwrite_blocked() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    let mut profile = store.get_profile_by_id("esports_competitive").unwrap();
    profile.name = "Tampered Esports".to_string();

    let err = store.save_profile(profile).unwrap_err();
    assert!(matches!(err, CoreError::BuiltInPresetProtected(_)));
}

#[test]
fn test_custom_profile_crud() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    let new_profile = TuningProfile {
        id: "".to_string(),
        name: "My Apex Preset".to_string(),
        category: TuningProfileCategory::Custom,
        description: "Optimized for Apex Legends".to_string(),
        is_built_in: false,
        created_at: "".to_string(),
        tweak_ids: vec!["enable_game_mode".to_string()],
        direct_x: TuningProfileDirectXSettings::default(),
        mouse_settings: TuningProfileMouseSettings::default(),
        keyboard_tweaks: vec![],
        game_tag: Some("Apex Legends".to_string()),
    };

    // Create
    let saved_id = store.save_profile(new_profile).unwrap();
    assert!(!saved_id.is_empty());

    // Read
    let loaded = store.get_profile_by_id(&saved_id).unwrap();
    assert_eq!(loaded.name, "My Apex Preset");
    assert_eq!(loaded.is_built_in, false);
    assert_eq!(loaded.game_tag.as_deref(), Some("Apex Legends"));

    // Total profiles should be 4 built-ins + 1 custom = 5
    assert_eq!(store.get_all_profiles().len(), 5);

    // Update
    let mut updated = loaded.clone();
    updated.name = "My Apex Preset v2".to_string();
    store.save_profile(updated).unwrap();
    let reloaded = store.get_profile_by_id(&saved_id).unwrap();
    assert_eq!(reloaded.name, "My Apex Preset v2");

    // Delete
    store.delete_profile(&saved_id).unwrap();
    assert!(store.get_profile_by_id(&saved_id).is_none());
    assert_eq!(store.get_all_profiles().len(), 4);
}

#[test]
fn test_import_id_collision_defense() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    // Import a payload that attempts to reuse "esports_competitive" id
    let collision_payload = json!({
        "id": "esports_competitive",
        "name": "Cloned Esports",
        "mouseSettings": {
            "pointerSpeed": 6
        }
    });

    let validated = store.validate_profile_payload(&collision_payload).unwrap();
    assert_ne!(validated.id, "esports_competitive");
    assert!(validated.id.starts_with("esports_competitive_imported_"));
    assert_eq!(validated.is_built_in, false);
}

#[test]
fn test_export_and_import_json_envelope() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    let custom = TuningProfile {
        id: "custom_cs2".to_string(),
        name: "CS2 Pro Profile".to_string(),
        category: TuningProfileCategory::Custom,
        description: "Zero latency CS2".to_string(),
        is_built_in: false,
        created_at: "2026-02-01T00:00:00.000Z".to_string(),
        tweak_ids: vec!["mouse_disable_acceleration".to_string()],
        direct_x: TuningProfileDirectXSettings::default(),
        mouse_settings: TuningProfileMouseSettings {
            pointer_speed: 6,
            ..Default::default()
        },
        keyboard_tweaks: vec![],
        game_tag: Some("CS2".to_string()),
    };

    store.save_profile(custom.clone()).unwrap();

    let json_export = store.export_profile_to_json(&custom).unwrap();
    assert!(json_export.contains("\"format\": \"pctweak-profile\""));
    assert!(json_export.contains("\"schemaVersion\": 1"));
    assert!(json_export.contains("\"app\": \"PC Tweak\""));

    // Import into fresh store
    let dir2 = tempdir().unwrap();
    let store2 = ProfileStore::new(dir2.path());
    let imported = store2.import_profile_from_json(&json_export).unwrap();

    assert_eq!(imported.name, "CS2 Pro Profile");
    assert_eq!(imported.is_built_in, false);
    assert_eq!(imported.tweak_ids, vec!["mouse_disable_acceleration"]);
}

#[test]
fn test_tweak_id_injection_filter() {
    let dir = tempdir().unwrap();
    let store = ProfileStore::new(dir.path());

    let payload = json!({
        "name": "Injection Test",
        "mouseSettings": { "pointerSpeed": 6 },
        "tweakIds": [
            "valid_tweak_1",
            "DROP TABLE tweaks;--",
            "../system32/calc.exe",
            "valid_tweak_2"
        ]
    });

    let validated = store.validate_profile_payload(&payload).unwrap();
    assert_eq!(validated.tweak_ids, vec!["valid_tweak_1", "valid_tweak_2"]);
}
