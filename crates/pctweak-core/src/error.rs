use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Invalid settings payload: {0}")]
    InvalidPayload(String),

    #[error("Malicious payload rejected (prototype pollution detected)")]
    PrototypePollutionDetected,

    #[error("Built-in presets cannot be deleted or overwritten: {0}")]
    BuiltInPresetProtected(String),

    #[error("Profile not found: {0}")]
    ProfileNotFound(String),

    #[error("Profile validation failed: {0}")]
    InvalidProfile(String),

    #[error("Transactional apply failed at step {failed_step}: {message}. Rolled back {rolled_back_count} actions.")]
    TransactionFailed {
        failed_step: usize,
        message: String,
        rolled_back_count: usize,
    },

    #[error("Backup record not found: {0}")]
    BackupNotFound(String),

    #[error("Watchdog operation failed: {0}")]
    WatchdogError(String),

    #[error("Tweak vetoed by Anti-Cheat safety guardrail: {tweak_id} blocked for [{anti_cheats}]")]
    AntiCheatVeto {
        tweak_id: String,
        anti_cheats: String,
    },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialization/deserialization error: {0}")]
    Json(#[from] serde_json::Error),
}
