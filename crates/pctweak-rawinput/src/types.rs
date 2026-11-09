use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeviceType {
    Mouse,
    Keyboard,
    Hid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawDeviceInfo {
    pub handle: usize,
    pub device_type: DeviceType,
    pub device_path: String,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub mouse_buttons: Option<u32>,
    pub sample_rate: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RawSample {
    pub qpc_time: i64,
    pub dx: i32,
    pub dy: i32,
    pub buttons: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawInputMetrics {
    pub polling_hz: Option<u32>,
    pub jitter_p99_ms: Option<f64>,
    pub jitter_median_ms: Option<f64>,
    pub min_interval_ms: Option<f64>,
    pub max_interval_ms: Option<f64>,
    pub median_interval_ms: Option<f64>,
    pub p99_interval_ms: Option<f64>,
    pub timer_resolution_ms: f64,
    pub sufficient_movement: bool,
    pub sample_count: usize,
    pub movement_counts: i64,
    pub dropped_events: usize,
}
