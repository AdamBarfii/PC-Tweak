use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;
use crate::error::CoreError;
use crate::models::backup::{
    BackupRecord, BackupStatus, BackupType, SnapshotActionType, SnapshotState,
};

pub trait ActionExecutor {
    fn query_original(&mut self, action_id: &str, metadata: &Value) -> Result<(bool, Value), CoreError>;
    fn apply(&mut self, action_id: &str, metadata: &Value, apply_val: &Value) -> Result<(), CoreError>;
    fn restore(&mut self, action_id: &str, metadata: &Value, orig_exists: bool, orig_val: &Value) -> Result<(), CoreError>;
}

#[derive(Debug, Clone)]
pub struct PlannedAction {
    pub action_id: String,
    pub action_type: SnapshotActionType,
    pub metadata: Value,
    pub apply_value: Value,
    pub revert_default_value: Value,
}

pub struct TransactionalEngine<E: ActionExecutor> {
    pub executor: E,
}

impl<E: ActionExecutor> TransactionalEngine<E> {
    pub fn new(executor: E) -> Self {
        Self { executor }
    }

    pub fn execute_transaction(
        &mut self,
        tweak_id: &str,
        actions: &[PlannedAction],
    ) -> Result<BackupRecord, CoreError> {
        let mut snapshots = Vec::new();
        let mut applied: Vec<(&PlannedAction, SnapshotState)> = Vec::new();

        for (idx, action) in actions.iter().enumerate() {
            let (exists, orig_val) = match self.executor.query_original(&action.action_id, &action.metadata) {
                Ok(res) => res,
                Err(err) => {
                    self.unwind(&applied);
                    return Err(CoreError::TransactionFailed {
                        failed_step: idx,
                        message: err.to_string(),
                        rolled_back_count: applied.len(),
                    });
                }
            };

            let snapshot = SnapshotState {
                action_id: action.action_id.clone(),
                action_type: action.action_type,
                original_value: serde_json::json!({
                    "exists": exists,
                    "value": orig_val
                }),
                applied_value: action.apply_value.clone(),
                target_identifier: action.action_id.clone(),
                metadata: action.metadata.clone(),
            };

            if let Err(err) = self.executor.apply(&action.action_id, &action.metadata, &action.apply_value) {
                self.unwind(&applied);
                return Err(CoreError::TransactionFailed {
                    failed_step: idx,
                    message: err.to_string(),
                    rolled_back_count: applied.len(),
                });
            }

            applied.push((action, snapshot.clone()));
            snapshots.push(snapshot);
        }

        Ok(BackupRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now().to_rfc3339(),
            title: format!("Applied tweak: {}", tweak_id),
            backup_type: BackupType::SingleTweak,
            tweak_ids: vec![tweak_id.to_string()],
            system_restore_point_id: None,
            snapshots,
            status: BackupStatus::Active,
        })
    }

    pub fn rollback_backup(&mut self, backup: &BackupRecord) -> Result<(), CoreError> {
        for snapshot in backup.snapshots.iter().rev() {
            let exists = snapshot
                .original_value
                .get("exists")
                .and_then(|e| e.as_bool())
                .unwrap_or(false);
            let val = snapshot
                .original_value
                .get("value")
                .cloned()
                .unwrap_or(Value::Null);

            self.executor
                .restore(&snapshot.action_id, &snapshot.metadata, exists, &val)?;
        }
        Ok(())
    }

    fn unwind(&mut self, applied: &[(&PlannedAction, SnapshotState)]) {
        for (action, snapshot) in applied.iter().rev() {
            let exists = snapshot
                .original_value
                .get("exists")
                .and_then(|e| e.as_bool())
                .unwrap_or(false);
            let val = snapshot
                .original_value
                .get("value")
                .cloned()
                .unwrap_or(Value::Null);
            let _ = self
                .executor
                .restore(&action.action_id, &action.metadata, exists, &val);
        }
    }
}
