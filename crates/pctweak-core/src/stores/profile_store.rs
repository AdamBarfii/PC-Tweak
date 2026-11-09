use std::fs;
use std::path::{Path, PathBuf};
use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;
use crate::error::CoreError;
use crate::models::profile::{
    get_built_in_profiles, ProfileExportEnvelope, TuningProfile, TuningProfileCategory,
    TuningProfileDirectXSettings, TuningProfileMouseSettings,
};
use crate::stores::settings_store::SettingsStore;

#[derive(Debug, Clone)]
pub struct ProfileStore {
    storage_path: PathBuf,
}

impl ProfileStore {
    pub fn new(storage_dir: &Path) -> Self {
        Self {
            storage_path: storage_dir.join("profiles.json"),
        }
    }

    pub fn with_path(custom_path: PathBuf) -> Self {
        Self {
            storage_path: custom_path,
        }
    }

    pub fn get_all_profiles(&self) -> Vec<TuningProfile> {
        let mut profiles = get_built_in_profiles();
        if !self.storage_path.exists() {
            let _ = self.save_custom_profiles(&[]);
            return profiles;
        }

        if let Ok(raw) = fs::read_to_string(&self.storage_path) {
            if let Ok(custom_list) = serde_json::from_str::<Vec<TuningProfile>>(&raw) {
                for mut custom in custom_list {
                    custom.is_built_in = false; // Strictly enforce false for user profiles
                    profiles.push(custom);
                }
            }
        }
        profiles
    }

    pub fn get_profile_by_id(&self, id: &str) -> Option<TuningProfile> {
        self.get_all_profiles().into_iter().find(|p| p.id == id)
    }

    pub fn save_profile(&self, mut profile: TuningProfile) -> Result<String, CoreError> {
        let built_ins = get_built_in_profiles();
        if built_ins.iter().any(|b| b.id == profile.id) || profile.is_built_in {
            return Err(CoreError::BuiltInPresetProtected(profile.id));
        }

        if profile.name.trim().is_empty() {
            return Err(CoreError::InvalidProfile("Profile name is required.".to_string()));
        }

        let id = if profile.id.is_empty() {
            format!(
                "custom_{}_{}",
                Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            )
        } else {
            profile.id
        };

        profile.id = id.clone();
        profile.name = profile.name.trim().to_string();
        profile.is_built_in = false;
        if profile.created_at.is_empty() {
            profile.created_at = Utc::now().to_rfc3339();
        }

        let mut custom_list: Vec<TuningProfile> = self
            .get_all_profiles()
            .into_iter()
            .filter(|p| !p.is_built_in)
            .collect();

        if let Some(pos) = custom_list.iter().position(|p| p.id == id) {
            custom_list[pos] = profile;
        } else {
            custom_list.push(profile);
        }

        self.save_custom_profiles(&custom_list)?;
        Ok(id)
    }

    pub fn delete_profile(&self, profile_id: &str) -> Result<(), CoreError> {
        let built_ins = get_built_in_profiles();
        if built_ins.iter().any(|b| b.id == profile_id) {
            return Err(CoreError::BuiltInPresetProtected(profile_id.to_string()));
        }

        let mut custom_list: Vec<TuningProfile> = self
            .get_all_profiles()
            .into_iter()
            .filter(|p| !p.is_built_in)
            .collect();

        let initial_len = custom_list.len();
        custom_list.retain(|p| p.id != profile_id);
        if custom_list.len() == initial_len {
            return Err(CoreError::ProfileNotFound(profile_id.to_string()));
        }

        self.save_custom_profiles(&custom_list)?;
        Ok(())
    }

    pub fn export_profile_to_json(&self, profile: &TuningProfile) -> Result<String, CoreError> {
        let mut cloned = profile.clone();
        cloned.is_built_in = false;
        let envelope = ProfileExportEnvelope {
            format: "pctweak-profile".to_string(),
            schema_version: 1,
            format_version: 1,
            app: "PC Tweak".to_string(),
            exported_at: Utc::now().to_rfc3339(),
            profile: cloned,
        };
        Ok(serde_json::to_string_pretty(&envelope)?)
    }

    pub fn import_profile_from_json(&self, json_content: &str) -> Result<TuningProfile, CoreError> {
        let val: Value = serde_json::from_str(json_content)?;
        let validated = self.validate_profile_payload(&val)?;
        self.save_profile(validated.clone())?;
        Ok(validated)
    }

    pub fn validate_profile_payload(&self, data: &Value) -> Result<TuningProfile, CoreError> {
        if !data.is_object() {
            return Err(CoreError::InvalidPayload(
                "Profile data must be a JSON object".to_string(),
            ));
        }

        // Prototype pollution check
        let settings_store = SettingsStore::with_path(PathBuf::new());
        if settings_store.has_prototype_pollution(data) {
            return Err(CoreError::PrototypePollutionDetected);
        }

        // Handle both bare profile and envelope
        let target = if data.get("format").and_then(|f| f.as_str()) == Some("pctweak-profile") {
            data.get("profile").unwrap_or(data)
        } else if let Some(p) = data.get("profile") {
            if p.is_object() {
                p
            } else {
                data
            }
        } else {
            data
        };

        let name = target
            .get("name")
            .and_then(|n| n.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| CoreError::InvalidProfile("Profile name is required.".to_string()))?;

        let mouse_val = target
            .get("mouseSettings")
            .ok_or_else(|| CoreError::InvalidProfile("Profile mouseSettings object is required.".to_string()))?;

        let mut speed = mouse_val
            .get("pointerSpeed")
            .and_then(|s| s.as_u64())
            .unwrap_or(6) as u32;
        speed = speed.clamp(1, 11);

        // ID Collision Defense
        let all_ids: Vec<String> = self.get_all_profiles().into_iter().map(|p| p.id).collect();
        let raw_id = target.get("id").and_then(|i| i.as_str()).unwrap_or("");
        let random_suffix = &Uuid::new_v4().to_string()[..8];
        let final_id = if raw_id.is_empty() {
            format!("custom_{}_{}", Utc::now().timestamp_millis(), random_suffix)
        } else if all_ids.contains(&raw_id.to_string()) {
            format!("{}_imported_{}", raw_id, random_suffix)
        } else {
            raw_id.to_string()
        };

        // Filter valid tweak IDs: ^[a-z0-9_]+$
        let safe_tweak_ids: Vec<String> = target
            .get("tweakIds")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str())
                    .filter(|s| {
                        !s.is_empty()
                            && s.chars()
                                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
                    })
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();

        let category = match target.get("category").and_then(|c| c.as_str()) {
            Some("esports") => TuningProfileCategory::Esports,
            Some("streaming") => TuningProfileCategory::Streaming,
            Some("battery") => TuningProfileCategory::Battery,
            Some("default") => TuningProfileCategory::Default,
            _ => TuningProfileCategory::Custom,
        };

        let mouse_settings = TuningProfileMouseSettings {
            pointer_speed: speed,
            enhance_pointer_accuracy: mouse_val
                .get("enhancePointerAccuracy")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
            disable_acceleration: mouse_val
                .get("disableAcceleration")
                .and_then(|b| b.as_bool())
                .unwrap_or(true),
            disable_trails: mouse_val
                .get("disableTrails")
                .and_then(|b| b.as_bool())
                .unwrap_or(true),
            raw_input_mode: mouse_val
                .get("rawInputMode")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
            scroll_speed: mouse_val
                .get("scrollSpeed")
                .and_then(|s| s.as_u64())
                .unwrap_or(3) as u32,
            double_click_speed: mouse_val
                .get("doubleClickSpeed")
                .and_then(|s| s.as_u64())
                .unwrap_or(550) as u32,
            pointer_precision: mouse_val
                .get("pointerPrecision")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
            improve_scroll_smoothness: mouse_val
                .get("improveScrollSmoothness")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
            smart_sensitivity: mouse_val
                .get("smartSensitivity")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
        };

        let direct_x = target
            .get("directX")
            .map(|dx| TuningProfileDirectXSettings {
                flip_model: dx.get("flipModel").and_then(|b| b.as_bool()).unwrap_or(false),
                max_frame_latency: dx
                    .get("maxFrameLatency")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false),
                shader_cache_boost: dx
                    .get("shaderCacheBoost")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false),
                tdr_delay: dx.get("tdrDelay").and_then(|b| b.as_bool()).unwrap_or(false),
            })
            .unwrap_or_default();

        let keyboard_tweaks = target
            .get("keyboardTweaks")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str())
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();

        Ok(TuningProfile {
            id: final_id,
            name: name.to_string(),
            category,
            description: target
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("Imported user profile")
                .to_string(),
            is_built_in: false,
            created_at: Utc::now().to_rfc3339(),
            tweak_ids: safe_tweak_ids,
            direct_x,
            mouse_settings,
            keyboard_tweaks,
            game_tag: target
                .get("gameTag")
                .and_then(|g| g.as_str())
                .map(|s| s.to_string()),
        })
    }

    fn save_custom_profiles(&self, profiles: &[TuningProfile]) -> Result<(), CoreError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(profiles)?;
        fs::write(&self.storage_path, serialized)?;
        Ok(())
    }
}
