use pctweak_optimizer::ai::{
    calculate_performance_scores, classify_hardware_persona, generate_ai_optimization_plan,
    AiPersonaType,
};

#[test]
fn test_esports_high_end_persona_classification() {
    let res = classify_hardware_persona(
        "AMD Ryzen 7 7800X3D 8-Core Processor",
        32,
        40,
        true,
        true,
        8,
    );
    assert_eq!(res.persona, AiPersonaType::EsportsHighEnd);
    assert_eq!(res.title, "Esports Competitive Rig");
}

#[test]
fn test_budget_memory_constrained_persona_classification() {
    let res = classify_hardware_persona(
        "Intel Core i5-10400F",
        16,
        82,
        true,
        false,
        6,
    );
    assert_eq!(res.persona, AiPersonaType::BudgetMemoryConstrained);
    assert_eq!(res.title, "Memory-Constrained Rig");
}

#[test]
fn test_thermal_sensitive_laptop_persona_classification() {
    let res = classify_hardware_persona(
        "AMD Ryzen 7 5800H with Radeon Graphics",
        16,
        45,
        true,
        false,
        8,
    );
    assert_eq!(res.persona, AiPersonaType::ThermalSensitiveLaptop);
    assert_eq!(res.title, "Thermal-Sensitive Laptop");

    let intel_laptop = classify_hardware_persona(
        "12th Gen Intel(R) Core(TM) i7-12700H",
        32,
        30,
        true,
        false,
        14,
    );
    assert_eq!(intel_laptop.persona, AiPersonaType::ThermalSensitiveLaptop);
}

#[test]
fn test_balanced_gaming_fallback() {
    let res = classify_hardware_persona(
        "Intel Core i5-8400",
        32,
        35,
        false,
        false,
        4,
    );
    assert_eq!(res.persona, AiPersonaType::BalancedGaming);
    assert_eq!(res.title, "Balanced Gaming PC");
}

#[test]
fn test_performance_scoring_and_potential_gain() {
    let score = calculate_performance_scores(3, 80, 600);
    // 100 - (3 * 6) - 8 (ram >= 75) - 5 (disk >= 500) = 100 - 18 - 8 - 5 = 69
    assert_eq!(score.current_score, 69);
    // projected: min(98, 69 + (3 * 5) + 6) = 69 + 15 + 6 = 90
    assert_eq!(score.projected_score, 90);
    assert!(score.estimated_gain_pct >= 25);
}

#[test]
fn test_ai_optimization_plan_anti_cheat_guardrails() {
    let persona = classify_hardware_persona(
        "AMD Ryzen 7 7800X3D 8-Core Processor",
        32,
        40,
        true,
        true,
        8,
    );
    let (_score, actions) = generate_ai_optimization_plan(&persona, 4, 50, 200);

    assert!(!actions.is_empty());
    for action in &actions {
        assert!(action.anti_cheat_safe, "All AI actions MUST be anti-cheat safe");
    }
}
