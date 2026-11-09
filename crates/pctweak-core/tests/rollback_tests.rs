use std::collections::HashMap;
use pctweak_core::error::CoreError;
use pctweak_core::engine::transactional::{ActionExecutor, PlannedAction, TransactionalEngine};
use pctweak_core::models::backup::{
    BackupRecord, BackupStatus, BackupType, SnapshotActionType, SnapshotState,
};
use pctweak_core::stores::backup_store::BackupStore;
use serde_json::{json, Value};
use tempfile::tempdir;

struct MockExecutor {
    store: HashMap<String, Value>,
    fail_on_action: Option<String>,
}

impl ActionExecutor for MockExecutor {
    fn query_original(
        &mut self,
        action_id: &str,
        _metadata: &Value,
    ) -> Result<(bool, Value), CoreError> {
        if let Some(val) = self.store.get(action_id) {
            Ok((true, val.clone()))
        } else {
            Ok((false, Value::Null))
        }
    }

    fn apply(
        &mut self,
        action_id: &str,
        _metadata: &Value,
        apply_val: &Value,
    ) -> Result<(), CoreError> {
        if self.fail_on_action.as_deref() == Some(action_id) {
            return Err(CoreError::InvalidPayload(format!(
                "Simulated failure on {}",
                action_id
            )));
        }
        self.store.insert(action_id.to_string(), apply_val.clone());
        Ok(())
    }

    fn restore(
        &mut self,
        action_id: &str,
        _metadata: &Value,
        orig_exists: bool,
        orig_val: &Value,
    ) -> Result<(), CoreError> {
        if orig_exists {
            self.store.insert(action_id.to_string(), orig_val.clone());
        } else {
            self.store.remove(action_id);
        }
        Ok(())
    }
}

#[test]
fn test_transactional_inverse_unwind() {
    let mut initial_store = HashMap::new();
    initial_store.insert("reg_key_1".to_string(), json!(10));
    initial_store.insert("reg_key_2".to_string(), json!(20));

    let executor = MockExecutor {
        store: initial_store,
        fail_on_action: Some("reg_key_2".to_string()), // Action 2 fails!
    };

    let actions = vec![
        PlannedAction {
            action_id: "reg_key_1".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!(99),
            revert_default_value: json!(0),
        },
        PlannedAction {
            action_id: "reg_key_2".to_string(),
            action_type: SnapshotActionType::Registry,
            metadata: json!({}),
            apply_value: json!(999),
            revert_default_value: json!(0),
        },
    ];

    let mut engine = TransactionalEngine::new(executor);
    let result = engine.execute_transaction("multi_step_tweak", &actions);

    assert!(result.is_err());
    match result.unwrap_err() {
        CoreError::TransactionFailed {
            failed_step,
            rolled_back_count,
            ..
        } => {
            assert_eq!(failed_step, 1);
            assert_eq!(rolled_back_count, 1);
        }
        other => panic!("Unexpected error type: {:?}", other),
    }

    // Verify reg_key_1 was cleanly rolled back to its original value 10
    assert_eq!(engine.executor.store.get("reg_key_1"), Some(&json!(10)));
    assert_eq!(engine.executor.store.get("reg_key_2"), Some(&json!(20)));
}

#[test]
fn test_pre_tweak_custom_snapshot_restore() {
    let mut initial_store = HashMap::new();
    // User had custom value 42
    initial_store.insert("custom_buffer_size".to_string(), json!(42));

    let executor = MockExecutor {
        store: initial_store,
        fail_on_action: None,
    };

    let actions = vec![PlannedAction {
        action_id: "custom_buffer_size".to_string(),
        action_type: SnapshotActionType::Registry,
        metadata: json!({}),
        apply_value: json!(100),
        revert_default_value: json!(10), // Factory default is 10, but user had 42!
    }];

    let mut engine = TransactionalEngine::new(executor);
    let backup = engine
        .execute_transaction("optimize_buffer", &actions)
        .unwrap();

    // Verify applied
    assert_eq!(
        engine.executor.store.get("custom_buffer_size"),
        Some(&json!(100))
    );

    // Rollback backup
    engine.rollback_backup(&backup).unwrap();

    // Verify user's original value (42) restored, NOT default (10)
    assert_eq!(
        engine.executor.store.get("custom_buffer_size"),
        Some(&json!(42))
    );
}

#[test]
fn test_backup_store_crud() {
    let dir = tempdir().unwrap();
    let store = BackupStore::new(dir.path());

    let record = BackupRecord {
        id: "b_test_1".to_string(),
        timestamp: "2026-03-01T12:00:00Z".to_string(),
        title: "Test Backup".to_string(),
        backup_type: BackupType::SingleTweak,
        tweak_ids: vec!["game_mode".to_string()],
        system_restore_point_id: None,
        snapshots: vec![SnapshotState {
            action_id: "act1".to_string(),
            action_type: SnapshotActionType::Registry,
            original_value: json!({ "exists": true, "value": 0 }),
            applied_value: json!(1),
            target_identifier: "act1".to_string(),
            metadata: json!({}),
        }],
        status: BackupStatus::Active,
    };

    store.save_backup(record.clone()).unwrap();

    let list = store.list_backups();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "b_test_1");

    store
        .update_status("b_test_1", BackupStatus::Reverted)
        .unwrap();
    let updated = store.get_backup("b_test_1").unwrap();
    assert_eq!(updated.status, BackupStatus::Reverted);

    let deleted = store.delete_backup("b_test_1").unwrap();
    assert!(deleted);
    assert_eq!(store.list_backups().len(), 0);
}
