use std::fs;
use std::path::{Path, PathBuf};
use chrono::Utc;
use crate::error::CoreError;
use crate::models::watchdog::{PendingRevertRecord, WatchdogReason};

#[derive(Debug, Clone)]
pub struct AutoRevertWatchdog {
    storage_path: PathBuf,
}

impl AutoRevertWatchdog {
    pub fn new(storage_dir: &Path) -> Self {
        Self {
            storage_path: storage_dir.join("pendingRevert.json"),
        }
    }

    pub fn with_path(custom_path: PathBuf) -> Self {
        Self {
            storage_path: custom_path,
        }
    }

    pub fn arm(
        &self,
        tweak_name: &str,
        adapter_name: &str,
        duration_seconds: u64,
    ) -> Result<PendingRevertRecord, CoreError> {
        let now = Utc::now().timestamp_millis();
        let record = PendingRevertRecord {
            tweak_name: tweak_name.to_string(),
            adapter_name: adapter_name.to_string(),
            tweak_id: None,
            category: "network".to_string(),
            started_at: now,
            duration_seconds,
            expires_at: now + (duration_seconds as i64 * 1000),
            status: "pending".to_string(),
        };

        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(&record)?;
        fs::write(&self.storage_path, serialized)?;

        Ok(record)
    }

    pub fn confirm(&self) -> Result<Option<String>, CoreError> {
        let record = self.read_record();
        if self.storage_path.exists() {
            fs::remove_file(&self.storage_path)?;
        }
        Ok(record.map(|r| r.tweak_name))
    }

    pub fn trigger_revert<F>(
        &self,
        _reason: WatchdogReason,
        mut revert_fn: F,
    ) -> Result<bool, CoreError>
    where
        F: FnMut(&PendingRevertRecord) -> Result<(), CoreError>,
    {
        let record = match self.read_record() {
            Some(r) => r,
            None => return Ok(false),
        };

        if self.storage_path.exists() {
            fs::remove_file(&self.storage_path)?;
        }

        revert_fn(&record)?;
        Ok(true)
    }

    pub fn check_startup_crash_recovery<F>(
        &self,
        mut revert_fn: F,
    ) -> Result<Option<String>, CoreError>
    where
        F: FnMut(&PendingRevertRecord) -> Result<(), CoreError>,
    {
        let record = match self.read_record() {
            Some(r) if r.status == "pending" => r,
            _ => return Ok(None),
        };

        revert_fn(&record)?;

        if self.storage_path.exists() {
            let _ = fs::remove_file(&self.storage_path);
        }

        Ok(Some(record.tweak_name))
    }

    pub fn read_record(&self) -> Option<PendingRevertRecord> {
        if !self.storage_path.exists() {
            return None;
        }
        fs::read_to_string(&self.storage_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
    }
}
