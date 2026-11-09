use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum RawInputError {
    #[error("Failed to enumerate RawInput devices")]
    EnumerationFailed,
    #[error("Failed to query device info for handle {0}")]
    QueryDeviceInfoFailed(usize),
    #[error("Failed to register RawInput devices")]
    DeviceRegistrationFailed,
    #[error("Win32 error code: {0}")]
    Win32(u32),
}
