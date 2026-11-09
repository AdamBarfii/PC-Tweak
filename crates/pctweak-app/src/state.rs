use crate::i18n::Language;
use pctweak_diagnostics::cpu::{calculate_topology, CpuTopology};
use pctweak_network::benchmark::{benchmark_all_presets, DnsBenchmarkMetric};
use pctweak_network::catalog::{get_default_dns_presets, DnsServerPreset};
use pctweak_optimizer::ai::{
    classify_hardware_persona, generate_ai_optimization_plan, AiActionItem, AiPersonaInfo,
    PerformanceScore,
};
use pctweak_win32::telemetry::{
    calculate_cpu_usage, get_cpu_snapshot, get_memory_telemetry, MemoryTelemetry,
    SystemCpuSnapshot,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveView {
    Dashboard = 0,
    Optimizer = 1,
    Overclock = 2,
    InputLab = 3,
    Gaming = 4,
    Network = 5,
    Backup = 6,
    Privacy = 7,
    Profiles = 8,
    Settings = 9,
}

#[allow(dead_code)]
pub struct AppState {
    pub active_view: ActiveView,
    pub language: Language,
    pub cpu_usage_pct: f32,
    pub prev_cpu_snapshot: Option<SystemCpuSnapshot>,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_usage_pct: f32,
    pub gpu_temp_c: f32,
    pub cpu_topology: CpuTopology,
    pub ai_persona: AiPersonaInfo,
    pub ai_scores: PerformanceScore,
    pub ai_actions: Vec<AiActionItem>,
    pub dns_presets: Vec<DnsServerPreset>,
    pub dns_metrics: Vec<DnsBenchmarkMetric>,
    pub rawinput_hz: u32,
    pub mouse_sensitivity_notch: u32,
    pub status_message: String,
}

#[allow(dead_code)]
impl AppState {
    pub fn new() -> Self {
        let mem = get_memory_telemetry().unwrap_or(MemoryTelemetry {
            load_percent: 50,
            total_phys_bytes: 16 * 1024 * 1024 * 1024,
            avail_phys_bytes: 8 * 1024 * 1024 * 1024,
            used_phys_bytes: 8 * 1024 * 1024 * 1024,
        });

        let total_mb = mem.total_phys_bytes / (1024 * 1024);
        let used_mb = mem.used_phys_bytes / (1024 * 1024);
        let ram_pct = mem.load_percent as f32;

        let topo = calculate_topology("AMD Ryzen 7 7800X3D 8-Core Processor", 8, 16);
        let persona = classify_hardware_persona(&topo.cpu_name, (total_mb / 1024) as u32, ram_pct as u32, true, true, 8);
        let (scores, actions) = generate_ai_optimization_plan(&persona, 4, ram_pct as u32, 250);
        let dns_presets = get_default_dns_presets();
        let cpu_snap = get_cpu_snapshot().ok();

        Self {
            active_view: ActiveView::Dashboard,
            language: Language::English,
            cpu_usage_pct: 12.5,
            prev_cpu_snapshot: cpu_snap,
            ram_used_mb: used_mb,
            ram_total_mb: total_mb,
            ram_usage_pct: ram_pct,
            gpu_temp_c: 44.0,
            cpu_topology: topo,
            ai_persona: persona,
            ai_scores: scores,
            ai_actions: actions,
            dns_presets,
            dns_metrics: Vec::new(),
            rawinput_hz: 1000,
            mouse_sensitivity_notch: 6,
            status_message: "PC Tweak Native Rust Runtime Ready.".to_string(),
        }
    }

    pub fn refresh_telemetry(&mut self) {
        if let Ok(curr) = get_cpu_snapshot() {
            if let Some(prev) = self.prev_cpu_snapshot {
                self.cpu_usage_pct = calculate_cpu_usage(prev, curr);
            }
            self.prev_cpu_snapshot = Some(curr);
        }
        if let Ok(mem) = get_memory_telemetry() {
            self.ram_total_mb = mem.total_phys_bytes / (1024 * 1024);
            self.ram_used_mb = mem.used_phys_bytes / (1024 * 1024);
            self.ram_usage_pct = mem.load_percent as f32;
        }
    }

    pub fn run_dns_benchmarks(&mut self) {
        self.status_message = "Benchmarking DNS resolvers...".to_string();
        self.dns_metrics = benchmark_all_presets(&self.dns_presets);
        self.status_message = "DNS Benchmark complete.".to_string();
    }
}
