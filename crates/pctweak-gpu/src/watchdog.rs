use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use crate::types::{TRIPWIRE_CPU_TEMP_C, TRIPWIRE_GPU_TEMP_C, TRIPWIRE_HOTSPOT_TEMP_C};

pub type RevertCallback = Arc<dyn Fn(&str) + Send + Sync + 'static>;
pub type TempSampler = Arc<dyn Fn() -> (Option<f32>, Option<f32>, Option<f32>) + Send + Sync + 'static>;

pub struct WatchdogState {
    pub is_running: AtomicBool,
    pub tripwire_triggered: AtomicBool,
    pub last_gpu_temp: Mutex<Option<f32>>,
    pub last_hotspot_temp: Mutex<Option<f32>>,
    pub last_cpu_temp: Mutex<Option<f32>>,
    pub last_tripwire_reason: Mutex<Option<String>>,
    pub rollback_count: Mutex<u32>,
    pub tdr_count: Mutex<u32>,
}

pub struct WatchdogHandle {
    pub state: Arc<WatchdogState>,
    thread_handle: Option<JoinHandle<()>>,
    stop_signal: Arc<AtomicBool>,
}

impl WatchdogHandle {
    pub fn spawn(
        poll_interval_ms: u64, // 100ms default
        sampler: TempSampler,
        on_revert: RevertCallback,
    ) -> Self {
        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();

        let state = Arc::new(WatchdogState {
            is_running: AtomicBool::new(true),
            tripwire_triggered: AtomicBool::new(false),
            last_gpu_temp: Mutex::new(None),
            last_hotspot_temp: Mutex::new(None),
            last_cpu_temp: Mutex::new(None),
            last_tripwire_reason: Mutex::new(None),
            rollback_count: Mutex::new(0),
            tdr_count: Mutex::new(0),
        });
        let state_clone = state.clone();

        let thread_handle = thread::Builder::new()
            .name("pctweak-gpu-watchdog".into())
            .spawn(move || {
                #[cfg(windows)]
                unsafe {
                    use windows_sys::Win32::System::Threading::{
                        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_HIGHEST,
                    };
                    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
                }

                while !stop_signal_clone.load(Ordering::Relaxed) {
                    let start = Instant::now();

                    // Query sensors
                    let (gpu_temp, hotspot_temp, cpu_temp) = sampler();

                    if let Some(gpu) = gpu_temp {
                        *state_clone.last_gpu_temp.lock().unwrap() = Some(gpu);
                        if gpu >= TRIPWIRE_GPU_TEMP_C {
                            let reason = format!(
                                "GPU thermal tripwire breached ({:.1}°C >= {:.1}°C)",
                                gpu, TRIPWIRE_GPU_TEMP_C
                            );
                            Self::trigger_emergency_revert(&state_clone, &on_revert, reason);
                            break;
                        }
                    }

                    if let Some(hotspot) = hotspot_temp {
                        *state_clone.last_hotspot_temp.lock().unwrap() = Some(hotspot);
                        if hotspot >= TRIPWIRE_HOTSPOT_TEMP_C {
                            let reason = format!(
                                "GPU hotspot thermal tripwire breached ({:.1}°C >= {:.1}°C)",
                                hotspot, TRIPWIRE_HOTSPOT_TEMP_C
                            );
                            Self::trigger_emergency_revert(&state_clone, &on_revert, reason);
                            break;
                        }
                    }

                    if let Some(cpu) = cpu_temp {
                        *state_clone.last_cpu_temp.lock().unwrap() = Some(cpu);
                        if cpu >= TRIPWIRE_CPU_TEMP_C {
                            let reason = format!(
                                "CPU package thermal tripwire breached ({:.1}°C >= {:.1}°C)",
                                cpu, TRIPWIRE_CPU_TEMP_C
                            );
                            Self::trigger_emergency_revert(&state_clone, &on_revert, reason);
                            break;
                        }
                    }

                    // Sleep for remaining poll interval
                    let elapsed = start.elapsed();
                    let target_interval = Duration::from_millis(poll_interval_ms);
                    if elapsed < target_interval {
                        thread::sleep(target_interval - elapsed);
                    }
                }

                state_clone.is_running.store(false, Ordering::SeqCst);
            })
            .expect("Failed to spawn watchdog thread");

        Self {
            state,
            thread_handle: Some(thread_handle),
            stop_signal,
        }
    }

    fn trigger_emergency_revert(
        state: &Arc<WatchdogState>,
        on_revert: &RevertCallback,
        reason: String,
    ) {
        state.tripwire_triggered.store(true, Ordering::SeqCst);
        *state.last_tripwire_reason.lock().unwrap() = Some(reason.clone());
        *state.rollback_count.lock().unwrap() += 1;

        tracing::warn!(reason = %reason, "EMERGENCY HARDWARE DOWNCLOCK TRIGGERED");
        on_revert(&reason);
    }

    pub fn report_tdr_event(&self, details: &str, on_revert: &RevertCallback) {
        *self.state.tdr_count.lock().unwrap() += 1;
        let reason = format!("TDR Driver Recovery: {details}");
        Self::trigger_emergency_revert(&self.state, on_revert, reason);
    }

    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for WatchdogHandle {
    fn drop(&mut self) {
        self.stop();
    }
}
