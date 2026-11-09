use pctweak_win32::timer::TimerResolutionGuard;
use crate::error::DiagnosticsError;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq)]
pub struct DpcLatencySample {
    pub min_latency_us: f64,
    pub avg_latency_us: f64,
    pub max_latency_us: f64,
}

pub fn sample_timer_resolution() -> Result<DpcLatencySample, DiagnosticsError> {
    let _guard = TimerResolutionGuard::request_half_millisecond()?;
    let mut latencies = Vec::with_capacity(50);

    for _ in 0..50 {
        let t0 = Instant::now();
        std::thread::sleep(std::time::Duration::from_millis(1));
        let elapsed_us = t0.elapsed().as_secs_f64() * 1_000_000.0;
        latencies.push(elapsed_us);
    }

    let min_latency_us = latencies.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_latency_us = latencies.iter().cloned().fold(0.0, f64::max);
    let avg_latency_us = latencies.iter().sum::<f64>() / latencies.len() as f64;

    Ok(DpcLatencySample {
        min_latency_us,
        avg_latency_us,
        max_latency_us,
    })
}
