use thiserror::Error;

#[derive(Error, Debug)]
pub enum DiagnosticsError {
    #[error("Win32 error: {0}")]
    Win32(#[from] pctweak_win32::Win32Error),

    #[error("Core error: {0}")]
    Core(#[from] pctweak_core::CoreError),

    #[error("Topology error: {0}")]
    Topology(String),

    #[error("GPU interrupt error: {0}")]
    GpuInterrupt(String),
}
