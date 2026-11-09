use std::fs;
use std::path::{Path, PathBuf};
use crate::error::CoreError;
use crate::models::backup::{BackupRecord, BackupStatus};

#[derive(Debug, Clone)]
pub struct BackupStore {
    storage_path: PathBuf,
}

impl BackupStore {
    pub fn new(storage_dir: &Path) -> Self {
        Self {
            storage_path: storage_dir.join("backups.json"),
        }
    }

    pub fn with_path(custom_path: PathBuf) -> Self {
        Self {
            storage_path: custom_path,
        }
    }

    pub fn list_backups(&self) -> Vec<BackupRecord> {
        let mut list = self.read_all();
        list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        list
    }

    pub fn save_backup(&self, backup: BackupRecord) -> Result<(), CoreError> {
        let mut all = self.read_all();
        all.insert(0, backup);
        self.write_all(&all)
    }

    pub fn get_backup(&self, id: &str) -> Option<BackupRecord> {
        self.read_all().into_iter().find(|b| b.id == id)
    }

    pub fn update_status(&self, id: &str, status: BackupStatus) -> Result<(), CoreError> {
        let mut all = self.read_all();
        if let Some(b) = all.iter_mut().find(|b| b.id == id) {
            b.status = status;
            self.write_all(&all)?;
            Ok(())
        } else {
            Err(CoreError::BackupNotFound(id.to_string()))
        }
    }

    pub fn delete_backup(&self, id: &str) -> Result<bool, CoreError> {
        let mut all = self.read_all();
        let initial_len = all.len();
        all.retain(|b| b.id != id);
        if all.len() != initial_len {
            self.write_all(&all)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn find_active_backup_for_tweak(&self, tweak_id: &str) -> Option<BackupRecord> {
        self.read_all()
            .into_iter()
            .find(|b| b.status == BackupStatus::Active && b.tweak_ids.iter().any(|t| t == tweak_id))
    }

    fn read_all(&self) -> Vec<BackupRecord> {
        if !self.storage_path.exists() {
            return Vec::new();
        }
        fs::read_to_string(&self.storage_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn write_all(&self, records: &[BackupRecord]) -> Result<(), CoreError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(records)?;
        fs::write(&self.storage_path, serialized)?;
        Ok(())
    }
}
