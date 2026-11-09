use pctweak_win32::registry::{set_reg_value, RegHive, RegValue};
use pctweak_win32::service::{ServiceManager, ServiceStartType};
use std::time::Duration;
use crate::error::OptimizerError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrivacyTweakItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrivacySnapshot {
    pub tweak_id: String,
    pub hive: String,
    pub path: String,
    pub value_name: String,
    pub previous_value: Option<String>,
    pub previous_service_state: Option<String>,
}

pub fn get_privacy_catalog() -> Vec<PrivacyTweakItem> {
    vec![
        PrivacyTweakItem {
            id: "diagtrack".to_string(),
            name: "Disable Diagnostic Tracking (Connected User Experiences)".to_string(),
            description: "Stops DiagTrack service and disables telemetry data submission to Microsoft CEIP.".to_string(),
            is_enabled: false,
        },
        PrivacyTweakItem {
            id: "wersvc".to_string(),
            name: "Disable Windows Error Reporting (WerSvc)".to_string(),
            description: "Disables automatic crash report uploading and background crash dump analysis.".to_string(),
            is_enabled: false,
        },
        PrivacyTweakItem {
            id: "advertising_id".to_string(),
            name: "Disable Personalized Advertising ID".to_string(),
            description: "Blocks apps from using your advertising identifier for cross-app tracking.".to_string(),
            is_enabled: false,
        },
        PrivacyTweakItem {
            id: "cortana_copilot".to_string(),
            name: "Disable Cortana & Windows Copilot".to_string(),
            description: "Disables Cortana voice search and AI side panel telemetry in Windows shell.".to_string(),
            is_enabled: false,
        },
        PrivacyTweakItem {
            id: "activity_history".to_string(),
            name: "Disable Windows Activity History & Timeline".to_string(),
            description: "Prevents Windows from recording user app usage history and syncing to cloud.".to_string(),
            is_enabled: false,
        },
        PrivacyTweakItem {
            id: "location_tracking".to_string(),
            name: "Disable Windows Location Tracking".to_string(),
            description: "Blocks background geo-location sensors and location history recording.".to_string(),
            is_enabled: false,
        },
    ]
}

pub fn apply_privacy_tweak(tweak_id: &str) -> Result<PrivacySnapshot, OptimizerError> {
    match tweak_id {
        "diagtrack" => {
            // Service DiagTrack -> Disabled
            let _ = ServiceManager::stop_service("DiagTrack", Duration::from_secs(3));
            let _ = ServiceManager::configure_startup("DiagTrack", ServiceStartType::Disabled);

            // Registry AllowTelemetry -> 0
            let path = r"SOFTWARE\Policies\Microsoft\Windows\DataCollection";
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "AllowTelemetry", &RegValue::Dword(0));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKLM".to_string(),
                path: path.to_string(),
                value_name: "AllowTelemetry".to_string(),
                previous_value: Some("1".to_string()),
                previous_service_state: Some("Automatic".to_string()),
            })
        }
        "wersvc" => {
            let _ = ServiceManager::stop_service("WerSvc", Duration::from_secs(3));
            let _ = ServiceManager::configure_startup("WerSvc", ServiceStartType::Disabled);

            let path = r"SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting";
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "Disabled", &RegValue::Dword(1));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKLM".to_string(),
                path: path.to_string(),
                value_name: "Disabled".to_string(),
                previous_value: Some("0".to_string()),
                previous_service_state: Some("Manual".to_string()),
            })
        }
        "advertising_id" => {
            let path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo";
            let _ = set_reg_value(RegHive::HkeyCurrentUser, path, "Enabled", &RegValue::Dword(0));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKCU".to_string(),
                path: path.to_string(),
                value_name: "Enabled".to_string(),
                previous_value: Some("1".to_string()),
                previous_service_state: None,
            })
        }
        "cortana_copilot" => {
            let path = r"SOFTWARE\Policies\Microsoft\Windows\Windows Search";
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "AllowCortana", &RegValue::Dword(0));

            let copilot_path = r"SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot";
            let _ = set_reg_value(RegHive::HkeyCurrentUser, copilot_path, "TurnOffWindowsCopilot", &RegValue::Dword(1));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKLM".to_string(),
                path: path.to_string(),
                value_name: "AllowCortana".to_string(),
                previous_value: Some("1".to_string()),
                previous_service_state: None,
            })
        }
        "activity_history" => {
            let path = r"SOFTWARE\Policies\Microsoft\Windows\System";
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "EnableActivityFeed", &RegValue::Dword(0));
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "PublishUserActivities", &RegValue::Dword(0));
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "UploadUserActivities", &RegValue::Dword(0));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKLM".to_string(),
                path: path.to_string(),
                value_name: "EnableActivityFeed".to_string(),
                previous_value: Some("1".to_string()),
                previous_service_state: None,
            })
        }
        "location_tracking" => {
            let path = r"SOFTWARE\Policies\Microsoft\Windows\LocationAndSensors";
            let _ = set_reg_value(RegHive::HkeyLocalMachine, path, "DisableLocation", &RegValue::Dword(1));

            Ok(PrivacySnapshot {
                tweak_id: tweak_id.to_string(),
                hive: "HKLM".to_string(),
                path: path.to_string(),
                value_name: "DisableLocation".to_string(),
                previous_value: Some("0".to_string()),
                previous_service_state: None,
            })
        }
        _ => Err(OptimizerError::Violation(format!("Unknown privacy tweak: {}", tweak_id))),
    }
}

pub fn revert_privacy_tweak(snapshot: &PrivacySnapshot) -> Result<(), OptimizerError> {
    if let Some(ref prev_val) = snapshot.previous_value {
        let hive = if snapshot.hive == "HKCU" {
            RegHive::HkeyCurrentUser
        } else {
            RegHive::HkeyLocalMachine
        };

        if let Ok(num) = prev_val.parse::<u32>() {
            let _ = set_reg_value(hive, &snapshot.path, &snapshot.value_name, &RegValue::Dword(num));
        }
    }

    if let Some(ref svc_state) = snapshot.previous_service_state {
        let start_type = if svc_state == "Automatic" {
            ServiceStartType::Auto
        } else {
            ServiceStartType::Demand
        };
        let _ = ServiceManager::configure_startup(&snapshot.tweak_id, start_type);
    }

    Ok(())
}
