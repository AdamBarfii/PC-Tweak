use thiserror::Error;

#[derive(Error, Debug)]
pub enum OptimizerError {
    #[error("Win32 error: {0}")]
    Win32(#[from] pctweak_win32::Win32Error),

    #[error("Core error: {0}")]
    Core(#[from] pctweak_core::CoreError),

    #[error("Diagnostics error: {0}")]
    Diagnostics(#[from] pctweak_diagnostics::DiagnosticsError),

    #[error("Optimization violation: {0}")]
    Violation(String),
}
