use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotActionType {
    Registry,
    Service,
    ScheduledTask,
    Command,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotState {
    pub action_id: String,
    pub action_type: SnapshotActionType,
    pub original_value: serde_json::Value,
    pub applied_value: serde_json::Value,
    pub target_identifier: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupType {
    SingleTweak,
    Batch,
    ProfileApply,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupStatus {
    Active,
    Reverted,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: String,
    pub timestamp: String,
    pub title: String,
    #[serde(rename = "type")]
    pub backup_type: BackupType,
    pub tweak_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_restore_point_id: Option<u32>,
    pub snapshots: Vec<SnapshotState>,
    pub status: BackupStatus,
}
