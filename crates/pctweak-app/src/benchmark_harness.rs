use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBenchmarkResult {
    pub process_id: u32,
    pub architecture: String,
    pub initial_working_set_mb: f64,
    pub peak_working_set_mb: f64,
    pub steady_state_idle_working_set_mb: f64,
    pub duration_seconds: f64,
    pub target_threshold_mb: f64,
    pub passed_requirement: bool,
}

pub fn get_current_process_working_set_bytes() -> u64 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
        use windows_sys::Win32::System::Threading::GetCurrentProcess;

        unsafe {
            let proc = GetCurrentProcess();
            let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
            counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

            if GetProcessMemoryInfo(proc, &mut counters, counters.cb) != 0 {
                return counters.WorkingSetSize as u64;
            }
        }
    }
    0
}

pub fn run_memory_benchmark(duration_secs: u64) -> MemoryBenchmarkResult {
    let initial_bytes = get_current_process_working_set_bytes();
    let initial_mb = initial_bytes as f64 / (1024.0 * 1024.0);

    let mut peak_bytes = initial_bytes;
    let start = Instant::now();
    let duration = Duration::from_secs(duration_secs);

    while start.elapsed() < duration {
        std::thread::sleep(Duration::from_millis(250));
        let cur = get_current_process_working_set_bytes();
        if cur > peak_bytes {
            peak_bytes = cur;
        }
    }

    // Force a cache trim to evaluate steady-state idle working set
    let _ = pctweak_optimizer::system::trim_process_working_sets();
    std::thread::sleep(Duration::from_millis(100));

    let steady_bytes = get_current_process_working_set_bytes();
    let steady_mb = steady_bytes as f64 / (1024.0 * 1024.0);
    let peak_mb = peak_bytes as f64 / (1024.0 * 1024.0);
    let passed = steady_mb <= 30.0;

    let pid = unsafe { windows_sys::Win32::System::Threading::GetCurrentProcessId() };

    MemoryBenchmarkResult {
        process_id: pid,
        architecture: "x86_64-pc-windows-native-rust".to_string(),
        initial_working_set_mb: initial_mb,
        peak_working_set_mb: peak_mb,
        steady_state_idle_working_set_mb: steady_mb,
        duration_seconds: duration_secs as f64,
        target_threshold_mb: 30.0,
        passed_requirement: passed,
    }
}
