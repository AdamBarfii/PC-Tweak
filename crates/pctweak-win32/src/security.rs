#[cfg(windows)]
use windows_sys::Win32::Foundation::*;
#[cfg(windows)]
use windows_sys::Win32::Security::*;
#[cfg(windows)]
use windows_sys::Win32::System::Threading::*;

pub fn is_process_elevated() -> bool {
    #[cfg(windows)]
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        let current_proc = GetCurrentProcess();

        let success = OpenProcessToken(current_proc, TOKEN_QUERY, &mut token);
        if success == 0 || token.is_null() {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut return_length = 0u32;
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );

        CloseHandle(token);
        result != 0 && elevation.TokenIsElevated != 0
    }

    #[cfg(not(windows))]
    {
        false
    }
}
