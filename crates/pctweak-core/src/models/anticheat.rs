use serde::{Deserialize, Serialize};
use crate::error::CoreError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecurityLevel {
    Required,
    Recommended,
    Optional,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AntiCheatRequirement {
    pub id: &'static str,
    pub name: &'static str,
    pub service_names: &'static [&'static str],
    pub driver_names: &'static [&'static str],
    pub games: &'static [&'static str],
    pub required_secure_boot: SecurityLevel,
    pub required_tpm: &'static str,
    pub required_vbs: SecurityLevel,
    pub required_hypervisor: SecurityLevel,
    pub disallowed_boot_flags: &'static [&'static str],
    pub blocked_tweaks: &'static [&'static str],
    pub support_url: &'static str,
    pub last_verified: &'static str,
    pub note: &'static str,
}

pub const ANTICHEAT_PROFILES: &[AntiCheatRequirement] = &[
    AntiCheatRequirement {
        id: "vanguard",
        name: "Riot Vanguard",
        service_names: &["vgc"],
        driver_names: &["vgk.sys", "vgk"],
        games: &["Valorant", "League of Legends"],
        required_secure_boot: SecurityLevel::Required,
        required_tpm: "2.0",
        required_vbs: SecurityLevel::Recommended,
        required_hypervisor: SecurityLevel::Required,
        disallowed_boot_flags: &["testsigning", "nointegritychecks", "hypervisorlaunchtype off", "debug"],
        blocked_tweaks: &[
            "vbs_hvci_off",
            "hypervisor_launch_off",
            "test_signing_on",
            "gaming_boot_entry",
            "bcdedit_custom_entry",
            "driver_signature_off",
        ],
        support_url: "https://support-valorant.riotgames.com/hc/en-us/articles/16941644084883-Vanguard-Restrictions",
        last_verified: "2026-03-20",
        note: "Windows 11 strictly enforces UEFI Secure Boot, TPM 2.0, and Hypervisor for Riot Vanguard.",
    },
    AntiCheatRequirement {
        id: "faceit",
        name: "FACEIT Anti-Cheat",
        service_names: &["FACEIT", "FACEITService"],
        driver_names: &["faceit.sys", "faceit"],
        games: &["Counter-Strike 2 (FACEIT)"],
        required_secure_boot: SecurityLevel::Required,
        required_tpm: "2.0",
        required_vbs: SecurityLevel::Recommended,
        required_hypervisor: SecurityLevel::Required,
        disallowed_boot_flags: &["testsigning", "nointegritychecks", "hypervisorlaunchtype off", "debug"],
        blocked_tweaks: &[
            "vbs_hvci_off",
            "hypervisor_launch_off",
            "test_signing_on",
            "gaming_boot_entry",
            "bcdedit_custom_entry",
            "driver_signature_off",
        ],
        support_url: "https://support.faceit.com/hc/en-us/articles/360014237399-Common-Issues-Fixes",
        last_verified: "2026-03-15",
        note: "Secure Boot and TPM 2.0 are mandatory on Windows 11. Hypervisor launch cannot be disabled.",
    },
    AntiCheatRequirement {
        id: "eac",
        name: "Easy Anti-Cheat / EOS",
        service_names: &["EasyAntiCheat", "EasyAntiCheat_EOS"],
        driver_names: &["easyanticheat.sys", "easyanticheat_eos.sys"],
        games: &["Fortnite", "Apex Legends", "Rust", "The Finals"],
        required_secure_boot: SecurityLevel::Recommended,
        required_tpm: "optional",
        required_vbs: SecurityLevel::Optional,
        required_hypervisor: SecurityLevel::Optional,
        disallowed_boot_flags: &["testsigning", "nointegritychecks", "debug"],
        blocked_tweaks: &["test_signing_on", "driver_signature_off", "gaming_boot_entry"],
        support_url: "https://www.easy.ac/en-us/support/game/issues/guide/",
        last_verified: "2026-03-10",
        note: "Kernel driver blocks test signing and kernel debugging. Driver signature enforcement must remain enabled.",
    },
    AntiCheatRequirement {
        id: "battleye",
        name: "BattlEye",
        service_names: &["BEService"],
        driver_names: &["bedaisy.sys", "bedaisy"],
        games: &["Rainbow Six Siege", "Destiny 2", "PUBG", "DayZ"],
        required_secure_boot: SecurityLevel::Recommended,
        required_tpm: "optional",
        required_vbs: SecurityLevel::Optional,
        required_hypervisor: SecurityLevel::Optional,
        disallowed_boot_flags: &["testsigning", "nointegritychecks", "debug"],
        blocked_tweaks: &["test_signing_on", "driver_signature_off", "gaming_boot_entry"],
        support_url: "https://www.battleye.com/support/faq/",
        last_verified: "2026-03-01",
        note: "Blocks execution if Windows Test Signing or kernel debugging is active.",
    },
    AntiCheatRequirement {
        id: "ricochet",
        name: "Ricochet Anti-Cheat",
        service_names: &[],
        driver_names: &["randgrid.sys", "randgrid"],
        games: &["Call of Duty: Warzone", "Call of Duty: Modern Warfare III"],
        required_secure_boot: SecurityLevel::Required,
        required_tpm: "2.0",
        required_vbs: SecurityLevel::Optional,
        required_hypervisor: SecurityLevel::Optional,
        disallowed_boot_flags: &["testsigning", "nointegritychecks", "debug"],
        blocked_tweaks: &["test_signing_on", "driver_signature_off", "gaming_boot_entry"],
        support_url: "https://support.activision.com/warzone-2/articles/ricochet-anti-cheat-pc",
        last_verified: "2026-02-25",
        note: "Secure Boot and TPM 2.0 required on Windows 11. Kernel driver verifies code signatures.",
    },
    AntiCheatRequirement {
        id: "eaac",
        name: "EA AntiCheat (EAAC)",
        service_names: &["EAAntiCheatService"],
        driver_names: &["eaanticheat.sys"],
        games: &["EA SPORTS FC 24/25", "Battlefield 2042"],
        required_secure_boot: SecurityLevel::Required,
        required_tpm: "optional",
        required_vbs: SecurityLevel::Optional,
        required_hypervisor: SecurityLevel::Optional,
        disallowed_boot_flags: &["testsigning", "nointegritychecks"],
        blocked_tweaks: &["test_signing_on", "driver_signature_off", "gaming_boot_entry"],
        support_url: "https://help.ea.com/en/help/pc/ea-anticheat/",
        last_verified: "2026-03-05",
        note: "Secure Boot is strictly required for FIFA / EA Sports FC on Windows 11.",
    },
    AntiCheatRequirement {
        id: "ace",
        name: "Anti-Cheat Expert (ACE)",
        service_names: &["AntiCheatExpert", "ACE-BASE"],
        driver_names: &["ace-base.sys", "anticheatexpert.sys"],
        games: &["PUBG Mobile (PC)", "Arena Breakout: Infinite"],
        required_secure_boot: SecurityLevel::Recommended,
        required_tpm: "optional",
        required_vbs: SecurityLevel::Optional,
        required_hypervisor: SecurityLevel::Optional,
        disallowed_boot_flags: &["testsigning", "nointegritychecks"],
        blocked_tweaks: &["test_signing_on", "driver_signature_off", "gaming_boot_entry"],
        support_url: "https://anti-cheat.qq.com/",
        last_verified: "2026-02-18",
        note: "Monitors kernel code integrity and active system boot parameters.",
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSecurityBaseline {
    pub secure_boot_enabled: bool,
    pub tpm_present: bool,
    pub tpm_version: String,
    pub tpm_initialized: bool,
    pub vbs_enabled: bool,
    pub hvci_enabled: bool,
    pub os_version: String,
    pub test_signing_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiCheatEvaluation {
    pub anti_cheat_id: String,
    pub name: String,
    pub status: EvaluationStatus,
    pub reasons: Vec<String>,
    pub support_url: String,
    pub last_verified: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvaluationStatus {
    Pass,
    Warning,
    Fail,
}

pub fn evaluate_anti_cheats(
    detected_ids: &[&str],
    baseline: &SystemSecurityBaseline,
    profiles: &[AntiCheatRequirement],
) -> Vec<AntiCheatEvaluation> {
    let mut evaluations = Vec::new();

    for &id in detected_ids {
        if let Some(req) = profiles.iter().find(|p| p.id == id) {
            let mut status = EvaluationStatus::Pass;
            let mut reasons = Vec::new();

            if req.required_secure_boot == SecurityLevel::Required && !baseline.secure_boot_enabled {
                status = EvaluationStatus::Warning;
                reasons.push("Secure Boot is Disabled (Required on Windows 11).".into());
            }

            if req.required_tpm == "2.0" && (!baseline.tpm_present || !baseline.tpm_version.contains("2.0")) {
                status = EvaluationStatus::Warning;
                reasons.push("TPM 2.0 is Missing or Inactive (Required for launch on Win 11).".into());
            }

            if baseline.test_signing_enabled {
                status = EvaluationStatus::Fail;
                reasons.push("Windows Test Signing is Enabled (Anti-cheat will block game launch).".into());
            }

            evaluations.push(AntiCheatEvaluation {
                anti_cheat_id: req.id.into(),
                name: req.name.into(),
                status,
                reasons,
                support_url: req.support_url.into(),
                last_verified: req.last_verified.into(),
            });
        }
    }

    evaluations
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TweakSafetyLevel {
    Safe,
    Caution,
    BlockedRisk,
}

pub struct AntiCheatVetoGate {
    pub is_competitive_safe_active: bool,
}

impl AntiCheatVetoGate {
    pub fn new(is_competitive_safe_active: bool) -> Self {
        Self {
            is_competitive_safe_active,
        }
    }

    pub fn classify_tweak(tweak_id: &str) -> TweakSafetyLevel {
        match tweak_id {
            // Blocked-Risk Tweaks
            "vbs_hvci_off"
            | "vbs_memory_integrity_disable"
            | "hypervisor_launch_off"
            | "test_signing_on"
            | "gaming_boot_entry"
            | "bcdedit_custom_entry"
            | "driver_signature_off"
            | "spectre_meltdown_disable" => TweakSafetyLevel::BlockedRisk,

            // Safe Tweaks
            "enable_game_mode"
            | "disable_game_dvr"
            | "mouse_disable_acceleration"
            | "mouse_neutral_pointer_speed"
            | "mouse_disable_trails_and_shadow"
            | "mouse_data_queue_size"
            | "keyboard_repeat_rate_max"
            | "keyboard_disable_filter_keys"
            | "keyboard_disable_sticky_toggle_keys"
            | "timer_resolution_request"
            | "timer_resolution_global" => TweakSafetyLevel::Safe,

            // Default fallback
            _ => TweakSafetyLevel::Caution,
        }
    }

    pub fn validate_tweak_execution(&self, tweak_id: &str) -> Result<(), CoreError> {
        let level = Self::classify_tweak(tweak_id);
        if self.is_competitive_safe_active && level == TweakSafetyLevel::BlockedRisk {
            return Err(CoreError::AntiCheatVeto {
                tweak_id: tweak_id.to_string(),
                anti_cheats: "Vanguard, FACEIT, EAC, BattlEye, Ricochet, EAAC, ACE".into(),
            });
        }
        Ok(())
    }
}
