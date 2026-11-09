use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TuningProfileCategory {
    Esports,
    Streaming,
    Battery,
    Default,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TuningProfileMouseSettings {
    pub pointer_speed: u32, // 1 to 11 (6 is neutral 1:1, 10 in Windows registry)
    pub enhance_pointer_accuracy: bool,
    pub disable_acceleration: bool,
    #[serde(default = "default_true")]
    pub disable_trails: bool,
    #[serde(default)]
    pub raw_input_mode: bool,
    #[serde(default = "default_scroll_speed")]
    pub scroll_speed: u32,
    #[serde(default = "default_double_click_speed")]
    pub double_click_speed: u32,
    #[serde(default)]
    pub pointer_precision: bool,
    #[serde(default = "default_true")]
    pub improve_scroll_smoothness: bool,
    #[serde(default)]
    pub smart_sensitivity: bool,
}

fn default_true() -> bool {
    true
}

fn default_scroll_speed() -> u32 {
    3
}

fn default_double_click_speed() -> u32 {
    550
}

impl Default for TuningProfileMouseSettings {
    fn default() -> Self {
        Self {
            pointer_speed: 6,
            enhance_pointer_accuracy: false,
            disable_acceleration: true,
            disable_trails: true,
            raw_input_mode: true,
            scroll_speed: 3,
            double_click_speed: 550,
            pointer_precision: false,
            improve_scroll_smoothness: true,
            smart_sensitivity: false,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TuningProfileDirectXSettings {
    #[serde(default)]
    pub flip_model: bool,
    #[serde(default)]
    pub max_frame_latency: bool,
    #[serde(default)]
    pub shader_cache_boost: bool,
    #[serde(default)]
    pub tdr_delay: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TuningProfile {
    pub id: String,
    pub name: String,
    pub category: TuningProfileCategory,
    pub description: String,
    pub is_built_in: bool,
    pub created_at: String,
    pub tweak_ids: Vec<String>,
    #[serde(default)]
    pub direct_x: TuningProfileDirectXSettings,
    pub mouse_settings: TuningProfileMouseSettings,
    #[serde(default)]
    pub keyboard_tweaks: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileExportEnvelope {
    pub format: String, // "pctweak-profile"
    pub schema_version: u32, // 1
    #[serde(default = "default_schema_version")]
    pub format_version: u32,
    pub app: String, // "PC Tweak"
    pub exported_at: String,
    pub profile: TuningProfile,
}

fn default_schema_version() -> u32 {
    1
}

pub fn get_built_in_profiles() -> Vec<TuningProfile> {
    vec![
        TuningProfile {
            id: "esports_competitive".to_string(),
            name: "Esports Competitive".to_string(),
            category: TuningProfileCategory::Esports,
            description: "Ultra-low input latency preset engineered for tournament shooter play: 1:1 raw unaccelerated mouse tracking, maximum keyboard repeat rate, timer resolution optimization, and Game Mode prioritized.".to_string(),
            is_built_in: true,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            tweak_ids: vec![
                "enable_game_mode".to_string(),
                "disable_game_dvr".to_string(),
                "windowed_optimizations_win11".to_string(),
                "mouse_disable_acceleration".to_string(),
                "mouse_neutral_pointer_speed".to_string(),
                "mouse_disable_trails_and_shadow".to_string(),
                "keyboard_repeat_rate_max".to_string(),
                "keyboard_disable_filter_keys".to_string(),
                "keyboard_disable_sticky_toggle_keys".to_string(),
                "timer_resolution_global".to_string(),
            ],
            direct_x: TuningProfileDirectXSettings {
                flip_model: true,
                max_frame_latency: true,
                shader_cache_boost: true,
                tdr_delay: false,
            },
            mouse_settings: TuningProfileMouseSettings {
                pointer_speed: 6, // 1:1 neutral Windows center (10 in registry)
                enhance_pointer_accuracy: false,
                disable_acceleration: true,
                disable_trails: true,
                raw_input_mode: true,
                scroll_speed: 3,
                double_click_speed: 550,
                pointer_precision: false,
                improve_scroll_smoothness: true,
                smart_sensitivity: false,
            },
            keyboard_tweaks: vec![
                "keyboard_repeat_rate_max".to_string(),
                "keyboard_disable_filter_keys".to_string(),
                "keyboard_disable_sticky_toggle_keys".to_string(),
            ],
            game_tag: None,
        },
        TuningProfile {
            id: "streaming_content".to_string(),
            name: "Streaming & Content Creation".to_string(),
            category: TuningProfileCategory::Streaming,
            description: "Optimized for high-bitrate OBS broadcasting, NVENC encoding, and multi-monitor capture without frame drops while preserving input precision.".to_string(),
            is_built_in: true,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            tweak_ids: vec![
                "enable_game_mode".to_string(),
                "windowed_optimizations_win11".to_string(),
                "mouse_disable_acceleration".to_string(),
                "mouse_neutral_pointer_speed".to_string(),
                "keyboard_repeat_rate_max".to_string(),
                "keyboard_disable_sticky_toggle_keys".to_string(),
            ],
            direct_x: TuningProfileDirectXSettings {
                flip_model: true,
                max_frame_latency: false,
                shader_cache_boost: true,
                tdr_delay: false,
            },
            mouse_settings: TuningProfileMouseSettings {
                pointer_speed: 6,
                enhance_pointer_accuracy: false,
                disable_acceleration: true,
                disable_trails: true,
                raw_input_mode: true,
                scroll_speed: 3,
                double_click_speed: 550,
                pointer_precision: false,
                improve_scroll_smoothness: true,
                smart_sensitivity: false,
            },
            keyboard_tweaks: vec![
                "keyboard_repeat_rate_max".to_string(),
                "keyboard_disable_sticky_toggle_keys".to_string(),
            ],
            game_tag: None,
        },
        TuningProfile {
            id: "max_battery_quiet".to_string(),
            name: "Maximum Battery / Quiet".to_string(),
            category: TuningProfileCategory::Battery,
            description: "Energy efficiency and acoustic profile: suspends telemetry background daemons, enables USB selective suspend, and eliminates unwanted OS wakeups.".to_string(),
            is_built_in: true,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            tweak_ids: vec![
                "disable_telemetry".to_string(),
                "disable_wer".to_string(),
                "disable_activity_history".to_string(),
                "usb_disable_selective_suspend".to_string(),
            ],
            direct_x: TuningProfileDirectXSettings {
                flip_model: false,
                max_frame_latency: false,
                shader_cache_boost: false,
                tdr_delay: false,
            },
            mouse_settings: TuningProfileMouseSettings {
                pointer_speed: 6,
                enhance_pointer_accuracy: true,
                disable_acceleration: false,
                disable_trails: false,
                raw_input_mode: false,
                scroll_speed: 3,
                double_click_speed: 550,
                pointer_precision: true,
                improve_scroll_smoothness: false,
                smart_sensitivity: false,
            },
            keyboard_tweaks: vec![],
            game_tag: None,
        },
        TuningProfile {
            id: "windows_default".to_string(),
            name: "Windows Default / Revert All".to_string(),
            category: TuningProfileCategory::Default,
            description: "Restores official Microsoft Windows defaults: re-enables standard mouse curves, resets pointer sensitivity, and re-enables default background subsystems.".to_string(),
            is_built_in: true,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            tweak_ids: vec![],
            direct_x: TuningProfileDirectXSettings {
                flip_model: false,
                max_frame_latency: false,
                shader_cache_boost: false,
                tdr_delay: false,
            },
            mouse_settings: TuningProfileMouseSettings {
                pointer_speed: 6,
                enhance_pointer_accuracy: true,
                disable_acceleration: false,
                disable_trails: false,
                raw_input_mode: false,
                scroll_speed: 3,
                double_click_speed: 550,
                pointer_precision: true,
                improve_scroll_smoothness: false,
                smart_sensitivity: false,
            },
            keyboard_tweaks: vec![],
            game_tag: None,
        },
    ]
}
