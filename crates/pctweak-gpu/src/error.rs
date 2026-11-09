use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum GpuError {
    #[error("VOLTAGE_TAMPERING_PROHIBITED: Voltage is strictly locked at stock (+0 mV) to guarantee zero silicon degradation.")]
    VoltageTamperingProhibited,

    #[error("GPU temp too warm ({current_temp}°C > {max_temp}°C). Please idle fans to cool down before scanning.")]
    PreflightTempTooWarm {
        current_temp: u32,
        max_temp: u32,
    },

    #[error("Thermal tripwire breached: {reason}")]
    ThermalTripwireBreached {
        reason: String,
    },

    #[error("TDR Driver Reset event detected: {details}")]
    TdrEventDetected {
        details: String,
    },

    #[error("Hardware offset clamped: {parameter} ({value}) clamped to range [{min}, {max}]")]
    ClampedNotice {
        parameter: &'static str,
        value: i32,
        min: i32,
        max: i32,
    },

    #[error("GPU driver API failure: {0}")]
    DriverApiError(String),

    #[error("Dynamic vendor library not loaded or unsupported: {0}")]
    LibraryLoadError(String),

    #[error("Auto-OC scan aborted: {0}")]
    ScanAborted(String),

    #[error("Tweak vetoed by Anti-Cheat safety guardrail: {tweak_id} blocked for [{anti_cheats}]")]
    AntiCheatVeto {
        tweak_id: String,
        anti_cheats: String,
    },
}
