use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum Win32Error {
    #[error("Access denied ({operation} on '{target}'). Administrator privileges required (Error 5).")]
    AccessDenied {
        operation: &'static str,
        target: String,
    },

    #[error("Item not found ({operation} on '{target}'): Error {code}")]
    NotFound {
        operation: &'static str,
        target: String,
        code: u32,
    },

    #[error("Service '{name}' is system-critical and protected against alteration.")]
    CriticalServiceProtected {
        name: String,
    },

    #[error("Service '{name}' failed to transition to {desired_state} within {timeout_ms}ms.")]
    ServiceTimeout {
        name: String,
        desired_state: &'static str,
        timeout_ms: u64,
    },

    #[error("Win32 API error during {operation}: code {code} ({message})")]
    Raw {
        operation: &'static str,
        code: u32,
        message: String,
    },

    #[error("NTSTATUS error during {operation}: status 0x{status:08X}")]
    NtStatus {
        operation: &'static str,
        status: i32,
    },

    #[error("Invalid data or conversion error in {context}: {details}")]
    InvalidData {
        context: &'static str,
        details: String,
    },
}

impl Win32Error {
    pub fn from_win32(code: u32, operation: &'static str, target: impl Into<String>) -> Self {
        let target = target.into();
        match code {
            5 => Win32Error::AccessDenied { operation, target },
            2 | 3 => Win32Error::NotFound {
                operation,
                target,
                code,
            },
            1060 => Win32Error::NotFound {
                operation,
                target,
                code,
            }, // ERROR_SERVICE_DOES_NOT_EXIST
            _ => Win32Error::Raw {
                operation,
                code,
                message: format_win32_message(code),
            },
        }
    }
}

pub fn format_win32_message(code: u32) -> String {
    format!("0x{:08X}", code)
}
