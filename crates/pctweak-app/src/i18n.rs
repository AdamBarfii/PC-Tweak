#[allow(dead_code)]
pub enum Language {
    English,
    Persian,
}

#[allow(dead_code)]
pub struct TranslationCatalog {
    pub title: &'static str,
    pub dashboard: &'static str,
    pub optimizer: &'static str,
    pub overclock: &'static str,
    pub input_lab: &'static str,
    pub gaming: &'static str,
    pub network: &'static str,
    pub backup: &'static str,
    pub privacy: &'static str,
    pub profiles: &'static str,
    pub settings: &'static str,
    pub anticheat_safe: &'static str,
    pub thermal_tripwire: &'static str,
    pub ram_usage: &'static str,
    pub cpu_usage: &'static str,
    pub run_benchmark: &'static str,
    pub apply_tweaks: &'static str,
    pub rollback: &'static str,
}

pub static EN: TranslationCatalog = TranslationCatalog {
    title: "PC Tweak - Native Rust Performance Cockpit",
    dashboard: "Dashboard",
    optimizer: "AI Optimizer",
    overclock: "GPU Overclock",
    input_lab: "Input Lab",
    gaming: "Gaming Mode",
    network: "DNS & Network",
    backup: "Backup & Restore",
    privacy: "Privacy Guard",
    profiles: "Profiles",
    settings: "Settings",
    anticheat_safe: "Competitive Safe",
    thermal_tripwire: "85°C Tripwire Active",
    ram_usage: "RAM Usage",
    cpu_usage: "CPU Usage",
    run_benchmark: "Benchmark DNS",
    apply_tweaks: "Apply All Safe Tweaks",
    rollback: "Emergency Rollback",
};

pub static FA: TranslationCatalog = TranslationCatalog {
    title: "پی‌سی توویک - سیستم بهینه‌ساز پیشرفته",
    dashboard: "داشبورد",
    optimizer: "بهینه‌ساز هوشمند",
    overclock: "اورکلاک ایمن گرافیک",
    input_lab: "آزمایشگاه ورودی",
    gaming: "حالت بازی",
    network: "تغییر DNS و شبکه",
    backup: "پشتیبان‌گیری و بازگردانی",
    privacy: "حریم خصوصی",
    profiles: "پروفایل‌ها",
    settings: "تنظیمات",
    anticheat_safe: "سازگار با آنتی‌چیت",
    thermal_tripwire: "حفاظت حرارتی ۸۵ درجه",
    ram_usage: "مصرف حافظه",
    cpu_usage: "بار پردازنده",
    run_benchmark: "تست سرعت سرورها",
    apply_tweaks: "اعمال تنظیمات ایمن",
    rollback: "بازگردانی اضطراری",
};

pub fn get_translations(lang: &Language) -> &'static TranslationCatalog {
    match lang {
        Language::English => &EN,
        Language::Persian => &FA,
    }
}
