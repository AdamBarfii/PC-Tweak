use crate::types::{RawInputMetrics, RawSample};

pub struct JitterTracker {
    window_duration_qpc: i64,
    qpc_frequency: f64,
    samples: Vec<RawSample>,
}

impl JitterTracker {
    pub fn new(qpc_frequency: f64, window_seconds: f64) -> Self {
        Self {
            qpc_frequency,
            window_duration_qpc: (window_seconds * qpc_frequency) as i64,
            samples: Vec::with_capacity(4096),
        }
    }

    pub fn push_sample(&mut self, sample: RawSample) {
        self.samples.push(sample);
    }

    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }

    pub fn clear(&mut self) {
        self.samples.clear();
    }

    pub fn compute_metrics(&mut self, now_qpc: i64, timer_res_ms: f64) -> RawInputMetrics {
        let cutoff = now_qpc - self.window_duration_qpc;
        self.samples.retain(|s| s.qpc_time >= cutoff);

        let sample_count = self.samples.len();
        let mut total_dx = 0i64;
        let mut total_dy = 0i64;
        let mut intervals_ms = Vec::with_capacity(sample_count);

        if sample_count >= 2 {
            for i in 1..sample_count {
                let dt_qpc = self.samples[i].qpc_time - self.samples[i - 1].qpc_time;
                if dt_qpc > 0 {
                    let dt_ms = (dt_qpc as f64 * 1000.0) / self.qpc_frequency;
                    intervals_ms.push(dt_ms);
                }
                total_dx += self.samples[i].dx.abs() as i64;
                total_dy += self.samples[i].dy.abs() as i64;
            }
        }

        let total_movement = total_dx + total_dy;
        let sufficient_movement = sample_count >= 10 && total_movement >= 10;

        if !sufficient_movement || intervals_ms.is_empty() {
            return RawInputMetrics {
                polling_hz: None,
                jitter_p99_ms: None,
                jitter_median_ms: None,
                min_interval_ms: None,
                max_interval_ms: None,
                median_interval_ms: None,
                p99_interval_ms: None,
                timer_resolution_ms: timer_res_ms,
                sufficient_movement: false,
                sample_count,
                movement_counts: total_movement,
                dropped_events: 0,
            };
        }

        let first_t = self.samples.first().unwrap().qpc_time;
        let last_t = self.samples.last().unwrap().qpc_time;
        let span_sec = (last_t - first_t) as f64 / self.qpc_frequency;

        let polling_hz = if span_sec > 0.05 {
            ((sample_count - 1) as f64 / span_sec).round() as u32
        } else {
            0
        };

        intervals_ms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let min_interval = intervals_ms.first().copied().unwrap_or(0.0);
        let max_interval = intervals_ms.last().copied().unwrap_or(0.0);
        let median_interval = intervals_ms[intervals_ms.len() / 2];

        let p99_idx = ((intervals_ms.len() as f64 * 0.99).floor() as usize).min(intervals_ms.len() - 1);
        let p99_interval = intervals_ms[p99_idx];

        let mut deviations: Vec<f64> = intervals_ms
            .iter()
            .map(|&val| (val - median_interval).abs())
            .collect();
        deviations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let dev_p99_idx = ((deviations.len() as f64 * 0.99).floor() as usize).min(deviations.len() - 1);
        let jitter_p99_ms = deviations[dev_p99_idx];
        let jitter_median_ms = deviations[deviations.len() / 2];

        let dropped = intervals_ms
            .iter()
            .filter(|&&val| val > (2.0 * median_interval) || val < (0.2 * median_interval))
            .count();

        RawInputMetrics {
            polling_hz: Some(polling_hz),
            jitter_p99_ms: Some(jitter_p99_ms),
            jitter_median_ms: Some(jitter_median_ms),
            min_interval_ms: Some(min_interval),
            max_interval_ms: Some(max_interval),
            median_interval_ms: Some(median_interval),
            p99_interval_ms: Some(p99_interval),
            timer_resolution_ms: timer_res_ms,
            sufficient_movement: true,
            sample_count,
            movement_counts: total_movement,
            dropped_events: dropped,
        }
    }
}
