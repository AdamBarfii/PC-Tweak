use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatchdogReason {
    Timeout,
    CrashRecovery,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRevertRecord {
    pub tweak_name: String,
    pub adapter_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tweak_id: Option<String>,
    pub category: String, // "dns" | "adapter" | "network" | "advanced"
    pub started_at: i64,  // epoch ms
    pub duration_seconds: u64, // default 20s
    pub expires_at: i64,  // epoch ms
    pub status: String,   // "pending" | "confirmed" | "reverted"
}
