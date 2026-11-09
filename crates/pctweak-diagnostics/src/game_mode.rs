use pctweak_win32::registry::{set_reg_value, RegHive, RegValue};
use crate::error::DiagnosticsError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameModeConfig {
    pub max_frame_latency: u32,
    pub swap_effect_upgrade: bool,
    pub tdr_delay: u32,
    pub system_responsiveness: u32,
}

impl Default for GameModeConfig {
    fn default() -> Self {
        Self {
            max_frame_latency: 1,
            swap_effect_upgrade: true,
            tdr_delay: 8,
            system_responsiveness: 0,
        }
    }
}

pub fn apply_game_mode_tuning(config: &GameModeConfig) -> Result<(), DiagnosticsError> {
    // 1. DirectX Presentation & Max Frame Latency
    let d3d_path = r"SOFTWARE\Microsoft\Direct3D";
    let _ = set_reg_value(
        RegHive::HkeyLocalMachine,
        d3d_path,
        "MaxFrameLatency",
        &RegValue::Dword(config.max_frame_latency),
    );

    // 2. TdrDelay (increase to at least 8 seconds to prevent driver crash false-positives under load)
    let graphics_path = r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers";
    let _ = set_reg_value(
        RegHive::HkeyLocalMachine,
        graphics_path,
        "TdrDelay",
        &RegValue::Dword(config.tdr_delay),
    );

    // 3. System Responsiveness (0 = 100% CPU to foreground game)
    let mmtask_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
    let _ = set_reg_value(
        RegHive::HkeyLocalMachine,
        mmtask_path,
        "SystemResponsiveness",
        &RegValue::Dword(config.system_responsiveness),
    );

    // 4. Games Tasks Network & GPU priority
    let games_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";
    let _ = set_reg_value(RegHive::HkeyLocalMachine, games_path, "GPU Priority", &RegValue::Dword(8));
    let _ = set_reg_value(RegHive::HkeyLocalMachine, games_path, "Priority", &RegValue::Dword(6));
    let _ = set_reg_value(RegHive::HkeyLocalMachine, games_path, "Scheduling Category", &RegValue::Sz("High".to_string()));

    Ok(())
}
