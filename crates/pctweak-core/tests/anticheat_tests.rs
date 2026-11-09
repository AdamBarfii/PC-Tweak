use pctweak_core::models::anticheat::{
    evaluate_anti_cheats, AntiCheatVetoGate, EvaluationStatus, SecurityLevel,
    SystemSecurityBaseline, TweakSafetyLevel, ANTICHEAT_PROFILES,
};

#[test]
fn test_anticheat_profiles_database() {
    assert_eq!(ANTICHEAT_PROFILES.len(), 7);

    let ids: Vec<&str> = ANTICHEAT_PROFILES.iter().map(|p| p.id).collect();
    assert!(ids.contains(&"vanguard"));
    assert!(ids.contains(&"faceit"));
    assert!(ids.contains(&"eac"));
    assert!(ids.contains(&"battleye"));
    assert!(ids.contains(&"ricochet"));
    assert!(ids.contains(&"eaac"));
    assert!(ids.contains(&"ace"));

    for p in ANTICHEAT_PROFILES {
        assert!(!p.name.is_empty());
        assert!(!p.games.is_empty());
        assert!(p.support_url.starts_with("https://"));
        assert!(!p.disallowed_boot_flags.is_empty());
    }

    // Vanguard & FACEIT require Secure Boot and TPM 2.0
    let vanguard = ANTICHEAT_PROFILES.iter().find(|p| p.id == "vanguard").unwrap();
    assert_eq!(vanguard.required_secure_boot, SecurityLevel::Required);
    assert_eq!(vanguard.required_tpm, "2.0");
}

#[test]
fn test_anticheat_baseline_evaluation() {
    let good_baseline = SystemSecurityBaseline {
        secure_boot_enabled: true,
        tpm_present: true,
        tpm_version: "2.0.1".to_string(),
        tpm_initialized: true,
        vbs_enabled: true,
        hvci_enabled: true,
        os_version: "10.0.22631".to_string(),
        test_signing_enabled: false,
    };

    let evals = evaluate_anti_cheats(&["vanguard", "faceit"], &good_baseline, ANTICHEAT_PROFILES);
    assert_eq!(evals.len(), 2);
    assert_eq!(evals[0].status, EvaluationStatus::Pass);
    assert_eq!(evals[1].status, EvaluationStatus::Pass);

    // Test with Secure Boot Disabled
    let bad_secure_boot = SystemSecurityBaseline {
        secure_boot_enabled: false,
        ..good_baseline.clone()
    };
    let evals_sb = evaluate_anti_cheats(&["vanguard"], &bad_secure_boot, ANTICHEAT_PROFILES);
    assert_eq!(evals_sb[0].status, EvaluationStatus::Warning);
    assert!(evals_sb[0].reasons[0].contains("Secure Boot is Disabled"));

    // Test with Windows Test Signing Enabled (Instant Fail)
    let bad_test_signing = SystemSecurityBaseline {
        test_signing_enabled: true,
        ..good_baseline
    };
    let evals_ts = evaluate_anti_cheats(&["vanguard", "eac"], &bad_test_signing, ANTICHEAT_PROFILES);
    assert_eq!(evals_ts[0].status, EvaluationStatus::Fail);
    assert_eq!(evals_ts[1].status, EvaluationStatus::Fail);
}

#[test]
fn test_anticheat_veto_gate() {
    assert_eq!(
        AntiCheatVetoGate::classify_tweak("vbs_hvci_off"),
        TweakSafetyLevel::BlockedRisk
    );
    assert_eq!(
        AntiCheatVetoGate::classify_tweak("test_signing_on"),
        TweakSafetyLevel::BlockedRisk
    );
    assert_eq!(
        AntiCheatVetoGate::classify_tweak("enable_game_mode"),
        TweakSafetyLevel::Safe
    );
    assert_eq!(
        AntiCheatVetoGate::classify_tweak("mouse_disable_acceleration"),
        TweakSafetyLevel::Safe
    );
    assert_eq!(
        AntiCheatVetoGate::classify_tweak("unknown_custom_tweak"),
        TweakSafetyLevel::Caution
    );

    // Competitive-Safe Mode Active: BlockedRisk tweaks throw error
    let active_gate = AntiCheatVetoGate::new(true);
    let veto_err = active_gate.validate_tweak_execution("vbs_hvci_off").unwrap_err();
    assert!(veto_err.to_string().contains("Tweak vetoed by Anti-Cheat safety guardrail"));

    // Safe tweaks pass
    assert!(active_gate.validate_tweak_execution("enable_game_mode").is_ok());

    // Competitive-Safe Mode Inactive: All tweaks permitted
    let inactive_gate = AntiCheatVetoGate::new(false);
    assert!(inactive_gate.validate_tweak_execution("vbs_hvci_off").is_ok());
}
