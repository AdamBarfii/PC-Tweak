use pctweak_win32::registry::{set_reg_value, RegHive, RegValue};
use crate::error::DiagnosticsError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GpuInterruptDevice {
    pub pnp_device_id: String,
    pub name: String,
    pub vendor: GpuVendor,
    pub is_discrete: bool,
    pub msi_supported: bool,
    pub device_priority: u32,
    pub priority_label: String,
}

pub fn sanitize_pnp_device_id(pnp_id: &str) -> String {
    pnp_id
        .chars()
        .filter(|&c| c != ';' && c != '&' && c != '|' && c != '`' && c != '$' && c != '<' && c != '>')
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn detect_gpu_vendor(pnp_id: &str, name: &str) -> GpuVendor {
    let pnp_upper = pnp_id.to_uppercase();
    let name_upper = name.to_uppercase();

    if pnp_upper.contains("VEN_10DE") || name_upper.contains("NVIDIA") {
        GpuVendor::Nvidia
    } else if pnp_upper.contains("VEN_1002") || name_upper.contains("AMD") || name_upper.contains("RADEON") {
        GpuVendor::Amd
    } else if pnp_upper.contains("VEN_8086") || name_upper.contains("INTEL") {
        GpuVendor::Intel
    } else {
        GpuVendor::Unknown
    }
}

pub fn is_gpu_discrete(vendor: GpuVendor, name: &str) -> bool {
    let lower = name.to_lowercase();
    match vendor {
        GpuVendor::Nvidia => true,
        GpuVendor::Amd => {
            !lower.contains("integrated")
                && !lower.contains("radeon(tm) graphics")
                && !lower.contains("apu")
        }
        GpuVendor::Intel => lower.contains("arc") || lower.contains("xe"),
        GpuVendor::Unknown => false,
    }
}

pub fn parse_msi_status(reg_output: &str) -> bool {
    for line in reg_output.lines() {
        if line.contains("MSISupported") {
            for token in line.split_whitespace() {
                if token.starts_with("0x") {
                    if let Ok(val) = u32::from_str_radix(&token[2..], 16) {
                        return val == 1;
                    }
                }
            }
        }
    }
    false
}

pub fn parse_device_priority(reg_output: &str) -> (u32, &'static str) {
    for line in reg_output.lines() {
        if line.contains("DevicePriority") {
            for token in line.split_whitespace() {
                if token.starts_with("0x") {
                    if let Ok(prio) = u32::from_str_radix(&token[2..], 16) {
                        let text = match prio {
                            3 => "High",
                            2 => "Normal",
                            1 => "Low",
                            _ => "Default",
                        };
                        return (prio, text);
                    }
                }
            }
        }
    }
    (0, "Default")
}

pub fn set_gpu_msi_mode(pnp_id: &str, enable: bool, priority: u32) -> Result<(), DiagnosticsError> {
    let sanitized = sanitize_pnp_device_id(pnp_id);
    let key_path = format!(
        r"SYSTEM\CurrentControlSet\Enum\{}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties",
        sanitized
    );

    let msi_val = RegValue::Dword(if enable { 1 } else { 0 });
    let prio_val = RegValue::Dword(priority);

    set_reg_value(RegHive::HkeyLocalMachine, &key_path, "MSISupported", &msi_val)?;

    let prio_path = format!(
        r"SYSTEM\CurrentControlSet\Enum\{}\Device Parameters\Interrupt Management\Affinity Policy",
        sanitized
    );
    let _ = set_reg_value(RegHive::HkeyLocalMachine, &prio_path, "DevicePriority", &prio_val);

    Ok(())
}
