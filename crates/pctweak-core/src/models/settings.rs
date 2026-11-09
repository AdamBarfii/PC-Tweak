use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    Fa,
}

impl Default for Language {
    fn default() -> Self {
        Language::En
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::Dark
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub launch_on_startup: bool,
    pub minimize_to_tray: bool,
    pub close_to_tray: bool,
    pub language: Language,
    pub hardware_polling_interval: u64, // Clamped strictly to [500, 5000] ms
    pub auto_update: bool,
    pub theme: Theme,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            launch_on_startup: false,
            minimize_to_tray: true,
            close_to_tray: true,
            language: Language::En,
            hardware_polling_interval: DEFAULT_HARDWARE_POLLING_INTERVAL,
            auto_update: true,
            theme: Theme::Dark,
        }
    }
}

pub const MIN_HARDWARE_POLLING_INTERVAL: u64 = 500;
pub const MAX_HARDWARE_POLLING_INTERVAL: u64 = 5000;
pub const DEFAULT_HARDWARE_POLLING_INTERVAL: u64 = 1000;
