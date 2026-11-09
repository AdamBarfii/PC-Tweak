use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;
use crate::error::CoreError;
use crate::models::settings::{
    AppSettings, Language, Theme, DEFAULT_HARDWARE_POLLING_INTERVAL,
    MAX_HARDWARE_POLLING_INTERVAL, MIN_HARDWARE_POLLING_INTERVAL,
};

#[derive(Debug, Clone)]
pub struct SettingsStore {
    storage_path: PathBuf,
}

impl SettingsStore {
    pub fn new(storage_dir: &Path) -> Self {
        Self {
            storage_path: storage_dir.join("settings.json"),
        }
    }

    pub fn with_path(custom_path: PathBuf) -> Self {
        Self {
            storage_path: custom_path,
        }
    }

    pub fn get_settings(&self) -> AppSettings {
        if !self.storage_path.exists() {
            return AppSettings::default();
        }
        let raw = match fs::read_to_string(&self.storage_path) {
            Ok(content) => content,
            Err(_) => return AppSettings::default(),
        };
        let parsed: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => return AppSettings::default(),
        };
        if !parsed.is_object() {
            return AppSettings::default();
        }
        self.sanitize_value(&parsed)
    }

    pub fn update_settings(&self, partial: &Value) -> Result<AppSettings, CoreError> {
        if !partial.is_object() {
            return Err(CoreError::InvalidPayload("Payload must be a JSON object".to_string()));
        }

        // Prototype pollution check
        if self.has_prototype_pollution(partial) {
            return Err(CoreError::PrototypePollutionDetected);
        }

        let current = self.get_settings();
        let mut merged = serde_json::to_value(&current)?;
        if let (Some(target), Some(source)) = (merged.as_object_mut(), partial.as_object()) {
            for (k, v) in source {
                target.insert(k.clone(), v.clone());
            }
        }

        let sanitized = self.sanitize_value(&merged);
        self.save_settings(&sanitized)?;
        Ok(sanitized)
    }

    pub fn reset_to_defaults(&self) -> Result<AppSettings, CoreError> {
        let defaults = AppSettings::default();
        self.save_settings(&defaults)?;
        Ok(defaults)
    }

    pub fn reset_app_data(&self, storage_dir: &Path) -> Result<Vec<String>, CoreError> {
        let mut cleared = Vec::new();
        let target_files = ["profiles.json", "settings.json", "backups.json", "tweakAudit.json"];

        for file in target_files {
            let p = storage_dir.join(file);
            if p.exists() {
                if file == "settings.json" {
                    let _ = fs::write(&p, serde_json::to_string_pretty(&AppSettings::default())?);
                } else if file == "profiles.json" {
                    let _ = fs::write(&p, "[]");
                } else {
                    let _ = fs::remove_file(&p);
                }
                cleared.push(file.to_string());
            }
        }

        self.reset_to_defaults()?;
        if !cleared.contains(&"settings.json".to_string()) {
            cleared.push("settings.json".to_string());
        }

        Ok(cleared)
    }

    fn save_settings(&self, settings: &AppSettings) -> Result<(), CoreError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(settings)?;
        fs::write(&self.storage_path, serialized)?;
        Ok(())
    }

    pub fn has_prototype_pollution(&self, val: &Value) -> bool {
        match val {
            Value::Object(map) => {
                if map.contains_key("__proto__")
                    || map.contains_key("constructor")
                    || map.contains_key("prototype")
                {
                    return true;
                }
                map.values().any(|v| self.has_prototype_pollution(v))
            }
            Value::Array(arr) => arr.iter().any(|v| self.has_prototype_pollution(v)),
            _ => false,
        }
    }

    pub fn sanitize_value(&self, val: &Value) -> AppSettings {
        let default = AppSettings::default();
        let obj = match val.as_object() {
            Some(o) => o,
            None => return default,
        };

        let launch_on_startup = obj
            .get("launchOnStartup")
            .map(|v| match v {
                Value::Bool(b) => *b,
                Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
                _ => false,
            })
            .unwrap_or(default.launch_on_startup);

        let minimize_to_tray = obj
            .get("minimizeToTray")
            .and_then(|v| v.as_bool())
            .unwrap_or(default.minimize_to_tray);

        let close_to_tray = obj
            .get("closeToTray")
            .and_then(|v| v.as_bool())
            .unwrap_or(default.close_to_tray);

        let auto_update = obj
            .get("autoUpdate")
            .and_then(|v| v.as_bool())
            .unwrap_or(default.auto_update);

        let language = match obj.get("language") {
            Some(Value::String(s)) => {
                let trimmed = s.trim().to_lowercase();
                if trimmed == "fa" {
                    Language::Fa
                } else {
                    Language::En
                }
            }
            _ => Language::En,
        };

        let theme = match obj.get("theme") {
            Some(Value::String(s)) => match s.trim().to_lowercase().as_str() {
                "light" => Theme::Light,
                "system" => Theme::System,
                _ => Theme::Dark,
            },
            _ => Theme::Dark,
        };

        let hardware_polling_interval = match obj.get("hardwarePollingInterval") {
            Some(Value::Number(n)) => {
                if let Some(f) = n.as_f64() {
                    let rounded = f.round() as i64;
                    rounded.clamp(
                        MIN_HARDWARE_POLLING_INTERVAL as i64,
                        MAX_HARDWARE_POLLING_INTERVAL as i64,
                    ) as u64
                } else {
                    DEFAULT_HARDWARE_POLLING_INTERVAL
                }
            }
            Some(Value::String(s)) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    // Empty/whitespace string in JS coerces to 0, which clamps to MIN (500)
                    MIN_HARDWARE_POLLING_INTERVAL
                } else if let Ok(parsed) = trimmed.parse::<f64>() {
                    let rounded = parsed.round() as i64;
                    rounded.clamp(
                        MIN_HARDWARE_POLLING_INTERVAL as i64,
                        MAX_HARDWARE_POLLING_INTERVAL as i64,
                    ) as u64
                } else {
                    DEFAULT_HARDWARE_POLLING_INTERVAL
                }
            }
            _ => DEFAULT_HARDWARE_POLLING_INTERVAL,
        };

        AppSettings {
            launch_on_startup,
            minimize_to_tray,
            close_to_tray,
            language,
            hardware_polling_interval,
            auto_update,
            theme,
        }
    }
}
