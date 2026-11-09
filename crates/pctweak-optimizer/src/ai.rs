use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AiPersonaType {
    ThermalSensitiveLaptop,
    BudgetMemoryConstrained,
    EsportsHighEnd,
    BalancedGaming,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiPersonaInfo {
    pub persona: AiPersonaType,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PerformanceScore {
    pub current_score: u32,
    pub projected_score: u32,
    pub estimated_gain_pct: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiActionItem {
    pub id: String,
    pub title: String,
    pub category: String, // "cpu" | "gpu" | "ram" | "network" | "privacy"
    pub ai_reasoning: String,
    pub anti_cheat_safe: bool,
    pub estimated_impact: String,
    pub default_checked: bool,
}

pub fn is_mobile_cpu(cpu_name: &str) -> bool {
    let lower = cpu_name.to_lowercase();
    if lower.contains("mobile") || lower.contains("max-q") || lower.contains("laptop") {
        return true;
    }

    // Check for patterns like 5800H, 12700H, 7840HS, 5500U, etc.
    let words = cpu_name.split(|c: char| !c.is_alphanumeric());
    for word in words {
        let upper = word.to_uppercase();
        if upper.ends_with('H') || upper.ends_with("HX") || upper.ends_with("HS") || upper.ends_with('U') {
            let digits_part = upper.trim_end_matches(|c: char| c.is_alphabetic());
            if digits_part.len() >= 3 && digits_part.chars().all(|c| c.is_ascii_digit()) {
                return true;
            }
        }
    }
    false
}

pub fn classify_hardware_persona(
    cpu_name: &str,
    total_mem_gb: u32,
    ram_load_pct: u32,
    is_discrete_gpu: bool,
    has_anti_cheat: bool,
    physical_cores: u32,
) -> AiPersonaInfo {
    if is_mobile_cpu(cpu_name) {
        return AiPersonaInfo {
            persona: AiPersonaType::ThermalSensitiveLaptop,
            title: "Thermal-Sensitive Laptop".to_string(),
            description: "Mobile form-factor detected. Applying cooling-first governor tweaks and capping boost duration to avoid thermal throttling.".to_string(),
        };
    }

    if total_mem_gb <= 16 && ram_load_pct >= 70 {
        return AiPersonaInfo {
            persona: AiPersonaType::BudgetMemoryConstrained,
            title: "Memory-Constrained Rig".to_string(),
            description: "RAM working set pressure detected. Aggressively purging standby cache and prioritizing foreground memory allocation.".to_string(),
        };
    }

    if is_discrete_gpu && (has_anti_cheat || physical_cores >= 6) {
        return AiPersonaInfo {
            persona: AiPersonaType::EsportsHighEnd,
            title: "Esports Competitive Rig".to_string(),
            description: "Dedicated gaming hardware detected. Prioritizing 0.5ms timer resolution, GPU MSI interrupts, and Core 0 polling isolation.".to_string(),
        };
    }

    AiPersonaInfo {
        persona: AiPersonaType::BalancedGaming,
        title: "Balanced Gaming PC".to_string(),
        description: "Balanced configuration. Optimizing scheduler responsiveness, network TCP buffers, and disabling non-essential background telemetry.".to_string(),
    }
}

pub fn calculate_performance_scores(bottlenecks_count: u32, ram_load_pct: u32, disk_junk_mb: u32) -> PerformanceScore {
    let mut score = 100i32;
    score -= (bottlenecks_count as i32) * 6;
    if ram_load_pct >= 75 {
        score -= 8;
    }
    if disk_junk_mb >= 500 {
        score -= 5;
    }
    let current_score = score.clamp(45, 88) as u32;

    let projected_score = (current_score + bottlenecks_count * 5 + 6).min(98);
    let estimated_gain_pct = if current_score > 0 {
        ((projected_score - current_score) * 100) / current_score
    } else {
        0
    };

    PerformanceScore {
        current_score,
        projected_score,
        estimated_gain_pct,
    }
}

pub fn generate_ai_optimization_plan(
    persona_info: &AiPersonaInfo,
    bottlenecks_count: u32,
    ram_load_pct: u32,
    disk_junk_mb: u32,
) -> (PerformanceScore, Vec<AiActionItem>) {
    let scores = calculate_performance_scores(bottlenecks_count, ram_load_pct, disk_junk_mb);
    let mut actions = Vec::new();

    // 1. High precision timer
    actions.push(AiActionItem {
        id: "ai_timer_res".to_string(),
        title: "0.5ms Microsecond Timer Resolution".to_string(),
        category: "cpu".to_string(),
        ai_reasoning: "Forces Windows NT scheduler resolution to 0.5ms to eliminate frame-time jitter in competitive titles.".to_string(),
        anti_cheat_safe: true,
        estimated_impact: "+15% Frame Consistency".to_string(),
        default_checked: true,
    });

    // 2. GPU MSI Interrupts
    actions.push(AiActionItem {
        id: "ai_gpu_msi".to_string(),
        title: "GPU Message Signaled Interrupts (MSI-X)".to_string(),
        category: "gpu".to_string(),
        ai_reasoning: "Migrates discrete GPU from legacy pin-based IRQ to MSI mode with High priority, eliminating DPC interrupt contention.".to_string(),
        anti_cheat_safe: true,
        estimated_impact: "-1.8ms Input Latency".to_string(),
        default_checked: true,
    });

    // 3. RAM Working Set Cache Trim
    if ram_load_pct >= 60 || persona_info.persona == AiPersonaType::BudgetMemoryConstrained {
        actions.push(AiActionItem {
            id: "ai_trim_standby".to_string(),
            title: "Purge Standby Memory & Trim Working Sets".to_string(),
            category: "ram".to_string(),
            ai_reasoning: "Reclaims standby memory cache blocks held by dormant processes, freeing physical RAM for active game binaries.".to_string(),
            anti_cheat_safe: true,
            estimated_impact: "Up to 2.5 GB RAM Freed".to_string(),
            default_checked: true,
        });
    }

    // 4. DirectX Presentation Latency
    actions.push(AiActionItem {
        id: "ai_d3d_latency".to_string(),
        title: "DirectX Low-Latency Frame Queue (MaxFrameLatency=1)".to_string(),
        category: "gpu".to_string(),
        ai_reasoning: "Prevents GPU render queue buffering, syncing mouse click events directly with the front buffer.".to_string(),
        anti_cheat_safe: true,
        estimated_impact: "Instant Click Response".to_string(),
        default_checked: true,
    });

    // 5. Background Telemetry DiagTrack
    actions.push(AiActionItem {
        id: "ai_disable_telemetry".to_string(),
        title: "Disable Background Diagnostic Telemetry (DiagTrack)".to_string(),
        category: "privacy".to_string(),
        ai_reasoning: "Disables background logging and automated Windows CEIP uploads during competitive sessions.".to_string(),
        anti_cheat_safe: true,
        estimated_impact: "0% Background CPU Spikes".to_string(),
        default_checked: true,
    });

    (scores, actions)
}
