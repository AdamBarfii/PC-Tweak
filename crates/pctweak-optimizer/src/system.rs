use crate::error::OptimizerError;
use std::collections::HashSet;
use std::path::Path;
use std::time::{Duration, SystemTime};

pub fn get_critical_process_whitelist() -> HashSet<&'static str> {
    let mut set = HashSet::new();
    set.insert("smss.exe");
    set.insert("csrss.exe");
    set.insert("wininit.exe");
    set.insert("services.exe");
    set.insert("lsass.exe");
    set.insert("svchost.exe");
    set.insert("winlogon.exe");
    set.insert("explorer.exe");
    set.insert("dwm.exe");
    set.insert("spoolsv.exe");
    set.insert("fontdrvhost.exe");
    set.insert("sihost.exe");
    set.insert("taskhostw.exe");
    set.insert("RuntimeBroker.exe");
    set.insert("ShellExperienceHost.exe");
    set.insert("SearchHost.exe");
    set.insert("StartMenuExperienceHost.exe");
    set.insert("SecurityHealthService.exe");
    set.insert("MsMpEng.exe");
    set.insert("NisSrv.exe");
    set.insert("audiodg.exe");
    set.insert("System");
    set.insert("Registry");
    set.insert("pctweak.exe");
    set
}

pub fn is_critical_process(process_name: &str) -> bool {
    let whitelist = get_critical_process_whitelist();
    let lower = process_name.to_lowercase();
    whitelist.iter().any(|&item| item.to_lowercase() == lower)
}

pub fn is_file_older_than_24h(path: &Path) -> bool {
    if let Ok(metadata) = std::fs::metadata(path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                return elapsed >= Duration::from_secs(24 * 3600);
            }
        }
    }
    false
}

pub fn clean_temp_directory_safe(temp_dir: &Path) -> Result<u64, OptimizerError> {
    let mut bytes_freed = 0u64;

    if !temp_dir.exists() || !temp_dir.is_dir() {
        return Ok(0);
    }

    if let Ok(entries) = std::fs::read_dir(temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_file_older_than_24h(&path) {
                if path.is_file() {
                    if let Ok(meta) = std::fs::metadata(&path) {
                        let len = meta.len();
                        if std::fs::remove_file(&path).is_ok() {
                            bytes_freed += len;
                        }
                    }
                }
            }
        }
    }

    Ok(bytes_freed)
}

pub fn trim_process_working_sets() -> Result<(), OptimizerError> {
    #[cfg(windows)]
    {
        // Use Win32 EmptyWorkingSet on current process
        unsafe {
            let cur_proc = windows_sys::Win32::System::Threading::GetCurrentProcess();
            windows_sys::Win32::System::ProcessStatus::EmptyWorkingSet(cur_proc);
        }
    }
    Ok(())
}
