pub struct SiliconAnalytics;

impl SiliconAnalytics {
    /// Thermal headroom in °C until the 85°C tripwire ceiling
    pub fn calculate_headroom(current_temp: u32) -> f32 {
        (85.0 - current_temp as f32).max(0.0)
    }

    /// Silicon Stability Index [70, 100]
    pub fn calculate_stability_index(tdr_count: u32, rollback_count: u32) -> u32 {
        let mut score: i32 = 100;
        if tdr_count > 0 {
            score -= (tdr_count as i32) * 15;
        }
        if rollback_count > 0 {
            score -= (rollback_count as i32) * 5;
        }
        score.clamp(70, 100) as u32
    }

    /// Estimated FPS improvement percentage (rounded to 1 decimal place)
    /// ~0.65% FPS per 1% core clock increase + ~0.35% per 1% memory clock
    pub fn calculate_estimated_fps_gain(core_offset_mhz: i32, mem_offset_mhz: i32) -> f32 {
        let base_core = 1750.0f32;
        let base_mem = 7000.0f32;
        let core_delta_pct = (core_offset_mhz as f32 / base_core) * 100.0;
        let mem_delta_pct = (mem_offset_mhz as f32 / base_mem) * 100.0;
        let gain = (core_delta_pct * 0.65) + (mem_delta_pct * 0.35);
        let rounded = (gain * 10.0).round() / 10.0;
        rounded.max(0.0)
    }

    /// Memory Bandwidth Delta in GB/s for a 192-bit bus (rounded to 1 decimal place)
    pub fn calculate_memory_bandwidth_delta(mem_offset_mhz: i32) -> f32 {
        if mem_offset_mhz <= 0 {
            return 0.0;
        }
        let delta = (mem_offset_mhz as f32 * 192.0 * 2.0) / 8000.0;
        ((delta * 10.0).round() / 10.0).max(0.0)
    }

    /// GFLOPS compute throughput delta: 2 * shaders (approx 2560) * core_offset / 1000
    pub fn calculate_gflops_delta(core_offset_mhz: i32) -> i32 {
        ((2.0 * 2560.0 * core_offset_mhz as f32) / 1000.0).round() as i32
    }
}
