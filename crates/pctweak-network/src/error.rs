use thiserror::Error;

#[derive(Error, Debug)]
pub enum NetworkError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("DNS packet error: {0}")]
    Packet(String),

    #[error("Invalid IP address: '{0}'")]
    InvalidIp(String),

    #[error("Invalid DoH URL: '{0}'")]
    InvalidDohUrl(String),

    #[error("Adapter configuration failed: {0}")]
    AdapterConfig(String),

    #[error("Win32 error: {0}")]
    Win32(#[from] pctweak_win32::Win32Error),

    #[error("Core error: {0}")]
    Core(#[from] pctweak_core::CoreError),
}
