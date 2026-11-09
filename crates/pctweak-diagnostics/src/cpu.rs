use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CpuTopology {
    pub cpu_name: String,
    pub physical_cores: u32,
    pub logical_processors: u32,
    pub architecture: String,
    pub has_ecores: bool,
    pub p_core_count: u32,
    pub e_core_count: u32,
    pub recommended_mode: String,
    pub recommended_mask_hex: String,
    pub recommended_mask_dec: String,
    pub description: String,
}

pub fn format_mask_hex(mask: u64) -> String {
    format!("0x{:08X}", mask)
}

pub fn calculate_topology(cpu_name: &str, physical_cores: u32, logical_processors: u32) -> CpuTopology {
    let name_upper = cpu_name.to_uppercase();
    let is_amd_vcache_dual_ccd = name_upper.contains("AMD")
        && (name_upper.contains("7900X3D")
            || name_upper.contains("7950X3D")
            || name_upper.contains("9900X3D")
            || name_upper.contains("9950X3D"));

    let mut is_intel_hybrid = false;
    let mut p_cores = physical_cores;
    let mut e_cores = 0;

    if name_upper.contains("INTEL") {
        if logical_processors > physical_cores && physical_cores * 2 != logical_processors {
            let calculated_p = logical_processors - physical_cores;
            let calculated_e = physical_cores.saturating_sub(calculated_p);
            if calculated_p > 0 && calculated_e > 0 {
                is_intel_hybrid = true;
                p_cores = calculated_p;
                e_cores = calculated_e;
            }
        } else if name_upper.contains("ULTRA") && physical_cores >= 14 {
            is_intel_hybrid = true;
            p_cores = if physical_cores >= 20 { 8 } else { 6 };
            e_cores = physical_cores.saturating_sub(p_cores);
        }
    }

    let architecture: String;
    let recommended_mode: String;
    let mask: u64;
    let description: String;

    if is_intel_hybrid && e_cores > 0 {
        architecture = "intel-hybrid".to_string();
        recommended_mode = "pcores-only".to_string();
        let p_threads = if p_cores * 2 <= logical_processors {
            p_cores * 2
        } else {
            p_cores
        };
        mask = (1u64 << p_threads).wrapping_sub(1);
        description = format!(
            "Intel Hybrid detected ({} P-Cores, {} E-Cores). Masks out low-power E-cores to prevent thread migration micro-stutter.",
            p_cores, e_cores
        );
    } else if is_amd_vcache_dual_ccd {
        architecture = "amd-dual-ccd-vcache".to_string();
        recommended_mode = "vcache-ccd-only".to_string();
        let ccd0_threads = logical_processors / 2;
        mask = (1u64 << ccd0_threads).wrapping_sub(1);
        description = "AMD 3D V-Cache Dual-CCD detected. Pins game to CCD0 (3D V-Cache) to prevent cross-CCD latency penalties.".to_string();
    } else {
        architecture = "uniform".to_string();
        if logical_processors >= 6 {
            recommended_mode = "isolate-core0".to_string();
            let is_smt = logical_processors > physical_cores;
            let mask_exclusion: u64 = if is_smt { 3 } else { 1 };
            let all_mask = (1u64 << logical_processors).wrapping_sub(1);
            mask = all_mask ^ mask_exclusion;
            description = format!(
                "Uniform architecture ({} Cores, {} Threads). Dedicates Core 0 to Windows DPC and mouse polling, freeing remaining cores for game execution.",
                physical_cores, logical_processors
            );
        } else {
            recommended_mode = "all-cores".to_string();
            mask = (1u64 << logical_processors).wrapping_sub(1);
            description = format!(
                "Uniform architecture ({} Cores). All cores allocated to maintain adequate compute throughput.",
                physical_cores
            );
        }
    }

    CpuTopology {
        cpu_name: cpu_name.to_string(),
        physical_cores,
        logical_processors,
        architecture,
        has_ecores: e_cores > 0,
        p_core_count: p_cores,
        e_core_count: e_cores,
        recommended_mode,
        recommended_mask_hex: format_mask_hex(mask),
        recommended_mask_dec: mask.to_string(),
        description,
    }
}
