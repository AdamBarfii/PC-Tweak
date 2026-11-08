export interface TweakGuidance {
  whenToEnable: string;
  whenToEnableFa: string;
  impactMagnitude: 'Subtle' | 'Noticeable' | 'Significant' | 'System-Wide';
  impactMagnitudeFa: 'ظریف' | 'محسوس' | 'چشمگیر' | 'سیستمی';
  whatItAffects: string;
  whatItAffectsFa: string;
  sideEffects: string;
  sideEffectsFa: string;
  benchmarkMetric?: string;
  benchmarkMetricFa?: string;
}

export const TWEAK_GUIDANCE_CATALOG: Record<string, TweakGuidance> = {
  // ==========================================
  // INPUT LAB: GROUP 1 - MOUSE & KEYBOARD
  // ==========================================
  mouse_disable_acceleration: {
    whenToEnable: 'Recommended for all competitive FPS/TPS gaming (CS2, Valorant, Apex, Fortnite) and precision aiming.',
    whenToEnableFa: 'توصیه اکید برای تمام بازی‌های رقابتی شوتر اول‌شخص و سوم‌شخص (CS2، ولورانت، ایپکس) و نشانه‌گیری دقیق.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets 1:1 linear cursor travel distance regardless of hand swipe velocity. Modifies Windows registry ballistics curve (MouseSpeed=0, Threshold1/2=0). Does NOT touch hardware mouse DPI or in-game sensitivity sliders.',
    whatItAffectsFa: 'نسبت حرکت مکان‌نما را ۱:۱ و خطی می‌کند (حذف اثر سرعت دست). منحنی شتاب رجیستری ویندوز را صفر می‌کند. به DPI سخت‌افزاری ماوس یا سنسیویتی داخل بازی کاری ندارد.',
    sideEffects: 'None. May initially feel slower if your muscle memory was adapted to Windows acceleration.',
    sideEffectsFa: 'بدون عوارض. اگر دستتان به شتاب عادت کرده باشد، ممکن است در روزهای اول کمی کندتر به نظر برسد.',
    benchmarkMetric: '1:1 muscle memory linearity; identical cursor travel at all hand velocities',
    benchmarkMetricFa: 'خطی بودن حافظه عضلانی ۱:۱؛ جابجایی یکسان مکان‌نما در تمام سرعت‌های حرکت دست',
  },

  pointer_speed_neutral: {
    whenToEnable: 'Always recommended. 6/11 is the only true native 1:1 hardware-to-pixel ratio in Windows.',
    whenToEnableFa: 'همیشه توصیه می‌شود. سرعت ۶ از ۱۱ تنها حالت ۱:۱ واقعی و خنثی در ویندوز است.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets pointer speed to exact multiplier of 1.0 (SPI_SETMOUSESPEED = 10). Speeds below 6 drop counts (sub-sampling); speeds above 6 interpolate counts, causing pixel skipping.',
    whatItAffectsFa: 'ضریب سرعت مکان‌نما را دقیقا روی ۱.۰ قرار می‌دهد. سرعت‌های زیر ۶ پالس‌های ماوس را حذف کرده و سرعت‌های بالای ۶ با ضرب مصنوعی باعث رد شدن از روی پیکسل‌ها می‌شوند.',
    sideEffects: 'None. Always adjust cursor speed using your mouse hardware DPI button or in-game sensitivity.',
    sideEffectsFa: 'بدون عوارض. سرعت ماوس را به جای ویندوز، با دکمه DPI ماوس یا تنظیمات بازی کم و زیاد کنید.',
  },

  keyboard_repeat_fastest: {
    whenToEnable: 'When playing fast-paced titles requiring rapid strafe tapping (A/D counter-strafing), rhythm games, or rapid key cycling.',
    whenToEnableFa: 'برای بازی‌های سرعتی نیازمند تغییر جهت سریع (A/D استریف در کانتر و ولورانت)، بازی‌های ریتمیک یا فشردن سریع کلیدها.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Reduces initial key hold delay to 250ms and maximizes character repetition frequency (~31 repeats/second). Does NOT affect mechanical switch actuation point or USB polling.',
    whatItAffectsFa: 'تاخیر اولیه نگه‌داشتن کلید را به ۲۵۰ میلی‌ثانیه کاهش داده و سرعت تکرار را به حدود ۳۱ حرف در ثانیه می‌رساند. تغییری در سوییچ مکانیکی کیبورد یا پولینگ‌ریت ایجاد نمی‌کند.',
    sideEffects: 'Holding Backspace or arrow keys moves/deletes text much faster in word processors and code editors.',
    sideEffectsFa: 'نگه‌داشتن دکمه Backspace یا جهت‌نما در تایپ و برنامه‌نویسی متن را سریع‌تر پاک یا جابجا می‌کند.',
  },

  keyboard_turn_off_filterkeys: {
    whenToEnable: 'Recommended for all gamers and fast typists to prevent brief or rapid keypresses from being ignored.',
    whenToEnableFa: 'توصیه شده برای تمام گیمرها و تایپیست‌های سریع تا فشردن‌های سریع یا کوتاه کلیدها نادیده گرفته نشود.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Disables Windows accessibility FilterKeys hold threshold (Flags=122). Guarantees instantaneous key registration.',
    whatItAffectsFa: 'قابلیت دسترسی‌پذیری FilterKeys را خاموش می‌کند تا هیچ فشردنی معطل تایید نماند و کلیدها در لحظه ثبت شوند.',
    sideEffects: 'Accidental micro-taps on keys are no longer filtered out by Windows.',
    sideEffectsFa: 'فشردن‌های خیلی گذرا یا تصادفی کلید دیگر توسط ویندوز فیلتر نمی‌شود.',
  },

  keyboard_turn_off_sticky_toggle: {
    whenToEnable: 'Crucial before playing action or shooter games where Shift, Ctrl, or Alt are pressed repeatedly (sprinting, crouching).',
    whenToEnableFa: 'بسیار حیاتی برای بازی‌های اکشن و شوتر که کلید Shift یا Ctrl در آن‌ها مدام فشرده می‌شود (دویدن، نشستن).',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Suppresses the intrusive "Do you want to turn on Sticky Keys?" accessibility popup when Shift is tapped 5 times rapidly.',
    whatItAffectsFa: 'از نمایش پنجره مزاحم و بیرون پریدن از بازی تمام‌صفحه با ۵ بار فشردن متوالی کلید Shift جلوگیری می‌کند.',
    sideEffects: 'None for gamers. Disabled Sticky/Toggle keys accessibility shortcuts.',
    sideEffectsFa: 'بدون عوارض برای گیمرها. میانبرهای تسهیل دسترسی کلیدهای چسبنده غیرفعال می‌شوند.',
  },

  keyboard_turn_off_alt_shift: {
    whenToEnable: 'If you have multiple keyboard languages installed and accidentally switch language while strafing (holding Alt to walk + Shift to sprint).',
    whenToEnableFa: 'اگر چند زبان کیبورد دارید و حین حرکت و راه رفتن در بازی (ترکیب Alt و Shift) ناخواسته زبان کیبورد عوض می‌شود.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Disables the legacy Alt+Shift layout toggle hotkey (Hotkey=3). You can still switch languages using Win + Space.',
    whatItAffectsFa: 'کلید میانبر قدیمی Alt+Shift را غیرفعال می‌کند. همچنان می‌توانید با ترکیب کلیدهای Win + Space زبان را عوض کنید.',
    sideEffects: 'Alt+Shift will no longer cycle keyboard languages.',
    sideEffectsFa: 'دیگر ترکیب Alt+Shift زبان کیبورد را تغییر نخواهد داد.',
  },

  // ==========================================
  // INPUT LAB: GROUP 2 - SYSTEM LATENCY
  // ==========================================
  usb_selective_suspend_off: {
    whenToEnable: 'Recommended for desktop gaming PCs and plugged-in laptops to prevent USB controller wake lag.',
    whenToEnableFa: 'توصیه شده برای سیستم‌های دسکتاپ و لپ‌تاپ‌های متصل به شارژر برای جلوگیری از تاخیر بیدار شدن پورت USB.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Forces USB hub ports to remain in active D0 high-power state. Eliminates micro-stutter when moving the mouse after a momentary pause.',
    whatItAffectsFa: 'پورت‌های هاب USB را در حالت فعال و آماده‌باش دائم نگه می‌دارد و لگ لحظه‌ای حرکت ماوس بعد از مکث کوتاه را حذف می‌کند.',
    sideEffects: 'Increases idle system power draw by ~0.2W to 0.5W. Not recommended when running on laptop battery.',
    sideEffectsFa: 'مصرف برق در حالت بی‌کاری را بین ۰.۲ تا ۰.۵ وات افزایش می‌دهد. در حالت باتری لپ‌تاپ توصیه نمی‌شود.',
  },

  power_plan_ultimate: {
    whenToEnable: 'On desktop PCs or plugged-in laptops to minimize CPU clock scaling latency during intensive gameplay.',
    whenToEnableFa: 'روی سیستم‌های دسکتاپ یا لپ‌تاپ‌های متصل به برق برای به حداقل رساندن تاخیر تغییر فرکانس پردازنده در بازی.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Activates Windows Ultimate Performance power scheme. Eliminates CPU core sleeping states and sets CPU clock frequency floor to 100%.',
    whatItAffectsFa: 'طرح مصرف برق Ultimate Performance را فعال می‌کند. حالت خواب هسته‌ها را حذف کرده و کف فرکانس پردازنده را روی ۱۰۰٪ نگه می‌دارد.',
    sideEffects: 'Increases idle CPU temperature by 2-5°C and consumes significantly more battery power on laptops.',
    sideEffectsFa: 'دمای پردازنده در حالت بی‌کاری را بین ۲ تا ۵ درجه افزایش می‌دهد و مصرف باتری لپ‌تاپ را بیشتر می‌کند.',
  },

  pcie_link_state_off: {
    whenToEnable: 'On dedicated gaming systems with high-end GPUs or NVMe SSDs to prevent PCIe bus low-power transitions.',
    whenToEnableFa: 'روی سیستم‌های مجهز به کارت گرافیک مجزا یا حافظه‌های NVMe برای جلوگیری از به خواب رفتن گذرگاه PCIe.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Disables PCIe Active State Power Management (ASPM). Prevents the bus from switching between L0 and L1 sleep states.',
    whatItAffectsFa: 'مدیریت توان حالت فعال (ASPM) در درگاه PCIe را خاموش می‌کند و تاخیر انتقال داده بین کارت گرافیک و پردازنده را کاهش می‌دهد.',
    sideEffects: 'Minor increase in motherboard chipset and GPU idle power consumption (~1W).',
    sideEffectsFa: 'افزایش جزئی در مصرف برق حالت بی‌کاری چیپست مادربورد و کارت گرافیک (حدود ۱ وات).',
  },

  processor_state_100_core_unpark: {
    whenToEnable: 'When experiencing frame drops or micro-stutters in CPU-heavy games (Warzone, Battlefield, CS2, Rust).',
    whenToEnableFa: 'هنگام مواجهه با افت فریم یا لگ‌های لحظه‌ای در بازی‌های وابسته به پردازنده (وارزون، بتلفیلد، کانتر، راست).',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Unparks all physical CPU cores, preventing the Windows kernel scheduler from putting dormant cores to sleep during light frames.',
    whatItAffectsFa: 'پارک شدن هسته‌های فیزیکی پردازنده را غیرفعال کرده و مانع از به خواب رفتن هسته‌ها بین فریم‌های سبک بازی می‌شود.',
    sideEffects: 'All cores remain at base clock frequencies constantly, increasing idle thermal output.',
    sideEffectsFa: 'تمام هسته‌های پردازنده به طور مداوم فعال و بیدار می‌مانند و دمای بی‌کاری سیستم کمی بالا می‌رود.',
  },

  game_mode_on_dvr_off: {
    whenToEnable: 'Universally recommended for all gaming systems on Windows 10 and 11.',
    whenToEnableFa: 'به طور همگانی برای تمام سیستم‌های گیمینگ در ویندوز ۱۰ و ۱۱ توصیه می‌شود.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Prioritizes game process CPU/GPU resources over background Windows tasks. Completely disables Game DVR continuous background screen recording.',
    whatItAffectsFa: 'منابع پردازنده و کارت گرافیک را برای بازی اولویت داده و ضبط مداوم و پرمصرف پس‌زمینه Game DVR را خاموش می‌کند.',
    sideEffects: 'Xbox Game Bar background "Record that last 30 seconds" clip feature will be disabled.',
    sideEffectsFa: 'قابلیت ضبط خودکار ۳۰ ثانیه گذشته در Xbox Game Bar غیرفعال می‌شود.',
  },

  windowed_optimizations_win11: {
    whenToEnable: 'On Windows 11 (Build 22000+) when playing games in Borderless Windowed mode for multi-monitor setups.',
    whenToEnableFa: 'روی ویندوز ۱۱ (بیلد ۲۲۰۰۰ به بالا) هنگام اجرای بازی‌ها در حالت پنجره‌ای بدون حاشیه (Borderless Windowed).',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Upgrades legacy BitBlt window presentation to modern DXGI Flip Model, matching true Fullscreen input latency and unlocking Auto HDR / VRR.',
    whatItAffectsFa: 'سیستم رندر پنجره‌ای ویندوز را به DXGI Flip ارتقا داده و تاخیر حالت پنجره‌ای را دقیقا برابر حالت فول‌اسکرین می‌کند.',
    sideEffects: 'Requires Windows 11. Legacy DirectX 9 and older titles remain on legacy presentation.',
    sideEffectsFa: 'نیازمند ویندوز ۱۱ است. بازی‌های خیلی قدیمی دایرکت‌ایکس ۹ از این قابلیت پشتیبانی نمی‌کنند.',
  },

  global_timer_resolution_requests: {
    whenToEnable: 'For competitive esports matches to tighten game loop dispatch intervals and input polling precision.',
    whenToEnableFa: 'برای مسابقات رقابتی و بازی‌های حرفه‌ای به منظور افزایش دقت زمان‌بندی رشته‌ها و پولینگ ورودی.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Enables global 0.5ms kernel timer request policy (GlobalTimerResolutionRequests=1). Reduces thread dispatch jitter.',
    whatItAffectsFa: 'تفکیک‌پذیری تایمر کرنل ویندوز را روی ۰.۵ میلی‌ثانیه تنظیم می‌کند تا زمان‌بندی حلقه‌های بازی دقیق‌تر شود.',
    sideEffects: 'Slightly higher CPU interrupt load. Causes caution in tournament environments requiring verified stock kernel clock.',
    sideEffectsFa: 'سربار وقفه پردازنده کمی بیشتر می‌شود. در مسابقات بین‌المللی با قوانین سخت‌گیرانه آنتی‌چیت نیاز به توجه دارد.',
  },

  monitor_refresh_rate_info: {
    whenToEnable: 'Informational check: verify that your primary high-refresh monitor is running at its maximum rated Hz.',
    whenToEnableFa: 'بررسی اطلاعاتی: اطمینان حاصل کنید که مانیتور گیمینگ شما روی بالاترین هرتز نامی تنظیم شده است.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Reads active refresh rate from Windows display subsystem. Often monitors default to 60Hz upon initial Windows install or GPU driver updates.',
    whatItAffectsFa: 'نرخ نوسازی زنده مانیتور را بررسی می‌کند. مانیتورهای ۱۴۴ یا ۲۴۰ هرتز پس از نصب ویندوز غالباً به طور پیش‌فرض روی ۶۰ هرتز می‌مانند.',
    sideEffects: 'None. Provides direct shortcut to Windows Display Settings.',
    sideEffectsFa: 'بدون عوارض. دکمه دسترسی مستقیم به تنظیمات نمایشگر ویندوز را فراهم می‌کند.',
  },

  // ==========================================
  // INPUT LAB: GROUP 3 - ADVANCED (REBOOT)
  // ==========================================
  msi_mode_gpu_usb: {
    whenToEnable: 'On modern graphics cards and USB 3.0 controllers to resolve shared IRQ interrupt conflicts and lower DPC latency.',
    whenToEnableFa: 'روی کارت‌های گرافیک مدرن و کنترلرهای USB 3.0 برای حذف تداخل وقفه‌های اشتراکی (IRQ) و کاهش تاخیر DPC.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Switches device from legacy line-based interrupts to Message Signaled Interrupts (MSI) via hardware memory writes.',
    whatItAffectsFa: 'ارتباط سخت‌افزار با پردازنده را از وقفه‌های خطی قدیمی به وقفه‌های مبتنی بر پیام (MSI) تبدیل می‌کند.',
    sideEffects: 'Requires system reboot. Automatically hidden if your hardware controller does not support MSI.',
    sideEffectsFa: 'نیازمند راه‌اندازی مجدد سیستم است. در صورتی که قطعه از MSI پشتیبانی نکند به صورت خودکار مخفی می‌شود.',
  },

  vbs_memory_integrity_off: {
    whenToEnable: 'Only on dedicated competitive gaming PCs seeking maximum CPU-bound FPS and minimum DPC latency.',
    whenToEnableFa: 'فقط روی سیستم‌های اختصاصی گیمینگ که به دنبال بیشترین فریم‌ریت و کمترین تاخیر پردازنده هستند.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Disables Virtualization-Based Security (VBS) and Hypervisor-Protected Code Integrity (HVCI). Recovers 5-10% CPU performance on mid-range CPUs.',
    whatItAffectsFa: 'امنیت مبتنی بر مجازی‌سازی (VBS) و یکپارچگی کد حافظه (HVCI) را خاموش کرده و ۵ تا ۱۰ درصد توان پردازشی را آزاد می‌کند.',
    sideEffects: 'Lowers Windows kernel defense against rogue drivers. Incompatible with Riot Vanguard (Valorant) and FACEIT on Windows 11 unless Competitive-Safe Mode is turned on.',
    sideEffectsFa: 'امنیت کرنل ویندوز در برابر درایورهای مخرب را کاهش می‌دهد. در ویندوز ۱۱ بازی‌های ولورانت (Vanguard) و فیس‌ایت برای اجرا به فعال بودن این گزینه نیاز دارند.',
  },

  hyperv_launch_off: {
    whenToEnable: 'On dedicated gaming systems not using WSL2 (Windows Subsystem for Linux), Docker, or Android emulation.',
    whenToEnableFa: 'روی سیستم‌های گیمینگ که از لینوکس ویندوز (WSL2)، داکر یا شبیه‌سازهای اندروید استفاده نمی‌کنند.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Sets BCD `hypervisorlaunchtype off`. Completely unloads the Windows hypervisor layer from underneath the NT kernel.',
    whatItAffectsFa: 'تنظیم hypervisorlaunchtype را در بوت لودر خاموش کرده و لایه مجازی‌سازی هایپروایزر را از زیر کرنل ویندوز برمی‌دارد.',
    sideEffects: 'Docker Desktop, WSL2, and Windows Sandbox will NOT launch until re-enabled. Requires system reboot.',
    sideEffectsFa: 'داکر، لینوکس WSL2 و شبیه‌سازها تا زمان فعال‌سازی مجدد اجرا نخواهند شد. نیازمند ریستارت سیستم است.',
  },

  // ==========================================
  // GAMING & POWER MODULE - STANDARD
  // ==========================================
  enable_game_mode: {
    whenToEnable: 'Always for gaming. Prioritizes CPU/GPU threads for the foreground game.',
    whenToEnableFa: 'همیشه برای بازی کردن توصیه می‌شود. منابع پردازنده و کارت گرافیک را به بازی اختصاص می‌دهد.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Windows thread scheduling priority for games vs background update tasks.',
    whatItAffectsFa: 'اولویت‌بندی زمان‌بندی رشته‌های پردازنده بین بازی و برنامه‌های پس‌زمینه.',
    sideEffects: 'None. Core Windows 11 feature.',
    sideEffectsFa: 'بدون عوارض. از قابلیت‌های رسمی و استاندارد ویندوز.',
  },

  disable_game_dvr: {
    whenToEnable: 'Always if you do not use Xbox Game Bar background recording to eliminate micro-stutters.',
    whenToEnableFa: 'همیشه اگر از ضبط خودکار گیم‌بار استفاده نمی‌کنید، برای حذف لگ‌های لحظه‌ای فریم.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Stops Windows from continuously encoding game video to RAM and disk in the background.',
    whatItAffectsFa: 'ضبط مداوم و فشرده‌سازی ویدیو در حافظه رم و دیسک را متوقف می‌کند.',
    sideEffects: 'Disables background clip capture in Xbox Game Bar.',
    sideEffectsFa: 'قابلیت ضبط ویدیوهای ۳۰ ثانیه گذشته در Xbox Game Bar غیرفعال می‌شود.',
  },

  hardware_accelerated_gpu_scheduling_hags: {
    whenToEnable: 'On modern NVIDIA (GTX 1000+) or AMD (RX 5000+) GPUs supporting HAGS for lower frame render latency.',
    whenToEnableFa: 'روی کارت‌های گرافیک مدرن انویدیا یا ای‌ام‌دی برای کاهش تاخیر پردازش فریم و بازدهی بهتر حافظه گرافیکی.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Offloads high-frequency VRAM management and frame scheduling directly to a dedicated GPU scheduling processor.',
    whatItAffectsFa: 'مدیریت حافظه VRAM و زمان‌بندی فریم‌ها را مستقیما به پردازشگر اختصاصی کارت گرافیک می‌سپارد.',
    sideEffects: 'Requires system reboot. Rarely, very old driver revisions may exhibit instability.',
    sideEffectsFa: 'نیازمند راه‌اندازی مجدد سیستم است. در درایورهای خیلی قدیمی کارت گرافیک ممکن است ناسازگار باشد.',
  },

  game_dvr_background_recording_off: {
    whenToEnable: 'When playing demanding games to eliminate continuous background MP4 video encoding by Windows Broadcast DVR.',
    whenToEnableFa: 'هنگام اجرای بازی‌های سنگین برای متوقف کردن ضبط و فشرده‌سازی خودکار ویدیو در پس‌زمینه توسط ویندوز.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Sets AppCaptureEnabled=0 and HistoricalCaptureEnabled=0. Eliminates GPU video encoder (NVENC/VCE) and RAM allocation for rolling 30-second clips.',
    whatItAffectsFa: 'قابلیت‌های AppCaptureEnabled و HistoricalCaptureEnabled را صفر می‌کند. استفاده از انکودر کارت گرافیک و رم برای کلیپ‌های پس‌زمینه را قطع می‌کند.',
    sideEffects: 'Prevents automatic retroactive 30-second video saving via Xbox Game Bar.',
    sideEffectsFa: 'امکان ذخیره خودکار ۳۰ ثانیه گذشته بازی در Xbox Game Bar غیرفعال می‌شود.',
  },

  variable_refresh_rate_vrr: {
    whenToEnable: 'When using G-Sync or FreeSync monitors and playing games in borderless windowed mode.',
    whenToEnableFa: 'هنگام استفاده از مانیتورهای G-Sync یا FreeSync و اجرای بازی‌ها در حالت پنجره‌ای بدون حاشیه.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Enables VRR support for DX11/DX12 games that do not natively declare variable refresh support.',
    whatItAffectsFa: 'پشتیبانی از رفرش‌ریت متغیر را برای بازی‌هایی که به طور پیش‌فرض این قابلیت را ندارند فعال می‌کند.',
    sideEffects: 'Requires compatible Adaptive-Sync / G-Sync display and driver.',
    sideEffectsFa: 'نیازمند مانیتور سازگار با G-Sync یا FreeSync و کارت گرافیک پشتیبانی‌کننده است.',
  },

  power_throttling_off: {
    whenToEnable: 'On desktop gaming rigs to prevent Windows from placing background game launcher services, anti-cheat, or Discord into EcoQoS power-throttled states.',
    whenToEnableFa: 'روی سیستم‌های دسکتاپ برای جلوگیری از محدود شدن نرم‌افزارهای لانچر بازی، آنتی‌چیت یا دیسکورد در حالت کم‌مصرف EcoQoS.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets PowerThrottlingOff=1 in HKLM Power policies. Stops Windows scheduler from applying EcoQoS quality-of-service throttling.',
    whatItAffectsFa: 'سیاست PowerThrottlingOff را فعال کرده و مانع از اختصاص هسته‌های کم‌مصرف و کاهش اولویت پردازش برنامه‌ها توسط ویندوز می‌شود.',
    sideEffects: 'Slightly higher CPU power usage for background helper apps.',
    sideEffectsFa: 'افزایش جزئی در مصرف پردازنده برای برنامه‌های پس‌زمینه.',
  },

  xbox_game_bar_off: {
    whenToEnable: 'When you do not use Xbox Game Bar overlay features (Win+G) and want to free up background processes.',
    whenToEnableFa: 'اگر از منوی همپوشان Xbox Game Bar (کلید Win+G) استفاده نمی‌کنید و مایلید پردازش‌های پس‌زمینه آن را ببندید.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Disables GameBarPresenceWriter and suppresses Game Bar overlay hooks in games.',
    whatItAffectsFa: 'سرویس GameBarPresenceWriter را متوقف کرده و هوک‌های گرافیکی گیم‌بار روی بازی‌ها را غیرفعال می‌کند.',
    sideEffects: 'Pressing Win+G will no longer bring up the Xbox Game Bar.',
    sideEffectsFa: 'با فشردن کلید Win+G منوی گیم‌بار باز نخواهد شد.',
  },

  auto_hdr: {
    whenToEnable: 'When connected to a certified HDR monitor (DisplayHDR 600+) to automatically upgrade SDR DirectX 11/12 games to wide color gamut.',
    whenToEnableFa: 'هنگام اتصال به مانیتور دارای استاندارد واقعی HDR برای ارتقای خودکار گستره رنگ بازی‌های معمولی SDR به HDR.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Enables Windows Auto HDR machine-learning color mapping on DirectX 11/12 swapchains.',
    whatItAffectsFa: 'سیستم هوشمند Auto HDR ویندوز را برای گسترش طیف روشنایی و رنگ در بازی‌های دایرکت‌ایکس فعال می‌کند.',
    sideEffects: 'Requires an active HDR-capable monitor. Incompatible with standard SDR displays.',
    sideEffectsFa: 'نیازمند مانیتور سازگار با HDR و فعال بودن گزینه HDR در ویندوز است.',
  },

  // ==========================================
  // GAMING & POWER MODULE - ADVANCED
  // ==========================================
  processor_idle_disable: {
    whenToEnable: 'Strictly for dedicated competitive benchmarking or esports tournament systems chasing single-digit microsecond latency.',
    whenToEnableFa: 'صرفاً برای بنچمارک‌های رقابتی و سیستم‌های تورنمنت حرفه‌ای جهت دستیابی به کمترین تاخیر در مقیاس میکروثانیه.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Disables CPU C-states (powercfg /setacvalueindex ... IDLEDISABLE 1). Forces all processor cores to never enter idle C1/C2/C3 power states.',
    whatItAffectsFa: 'حالت‌های استراحت پردازنده (C-States) را کاملاً غیرفعال می‌کند و پردازنده را همیشه در حالت C0 آماده به کار نگه می‌دارد.',
    sideEffects: 'Substantial increase in idle temperatures (+10°C to +20°C) and constant high idle power draw (~30-60W). Never use on laptops.',
    sideEffectsFa: 'افزایش چشمگیر دمای پردازنده در حالت بی‌کاری (۱۰ الی ۲۰ درجه) و مصرف برق مداوم. هرگز روی لپ‌تاپ استفاده نشود.',
  },

  heterogeneous_thread_scheduling_policy: {
    whenToEnable: 'Recommended for systems with Intel 12th-14th Gen / Arrow Lake hybrid CPUs or AMD 3D V-Cache dual-CCD processors experiencing 1% low frame stutter.',
    whenToEnableFa: 'برای سیستم‌های دارای پردازنده‌های هیبریدی اینتل نسل ۱۲ تا ۱۴ یا پردازنده‌های AMD دارای کش سه‌بعدی دو کاناله که با افت فریم ۱٪ پایین مواجهند توصیه می‌شود.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets Windows power scheme Heterogeneous Thread Scheduling Policy (93b8b6dc-0698-4d1c-9ee4-0644e900c85d) to 2 (Prefer Performant Processors).',
    whatItAffectsFa: 'سیاست زمان‌بندی رشته‌های ناهمگن ویندوز را روی مقدار ۲ (اولویت هسته‌های با کارایی بالا) تنظیم می‌کند تا بازی‌ها روی هسته‌های ضعیف E-Core اجرا نشوند.',
    sideEffects: 'Slightly higher power draw on hybrid desktop CPUs (~2-5W) during light background multitasking. Fully safe and reversible.',
    sideEffectsFa: 'افزایش اندک مصرف برق در پردازنده‌های هیبریدی هنگام چندوظیفگی سبک (حدود ۲ تا ۵ وات). کاملاً امن و قابل بازگشت.',
  },

  mpo_multiplane_overlay_disable: {
    whenToEnable: 'When experiencing desktop flickering, black screens, or stuttering in Discord/Chrome on modern NVIDIA RTX or AMD Radeon GPUs.',
    whenToEnableFa: 'هنگام مشاهده پرش تصویر، صفحه سیاه موقت یا لگ در دیسکورد و مرورگر هنگام کار با کارت‌های گرافیک مدرن.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets OverlayTestMode=0x00000005 in DWM registry. Disables Multiplane Overlay hardware compositing, falling back to standard desktop window compositing.',
    whatItAffectsFa: 'قابلیت Multiplane Overlay سخت‌افزاری در DWM را خاموش کرده و کامپوزیت تصاویر را به حالت پایدار و استاندارد برمی‌گرداند.',
    sideEffects: 'Very minor increase in DWM GPU compositing overhead (~1%).',
    sideEffectsFa: 'افزایش بسیار جزئی در مصرف پردازش کارت گرافیک توسط سرویس DWM ویندوز (حدود ۱ درصد).',
  },

  spectre_meltdown_mitigations_toggle: {
    whenToEnable: 'Only on isolated, offline or dedicated gaming rigs with older 6th-9th Gen Intel CPUs seeking to recover 5-15% CPU IPC performance.',
    whenToEnableFa: 'فقط روی سیستم‌های اختصاصی گیمینگ با پردازنده‌های نسل ۶ تا ۹ اینتل برای بازیابی ۵ تا ۱۵ درصد توان از دست رفته پردازنده.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Sets FeatureSettingsOverride = 3 in Session Manager Memory Management, disabling speculative execution side-channel hardware mitigations.',
    whatItAffectsFa: 'تدابیر امنیتی سخت‌افزاری حملات حدسی پردازنده (اسپکتر و ملت‌داون) را در حافظه کرنل غیرفعال می‌کند.',
    sideEffects: 'SECURITY RISK: Disables hardware defenses against browser-based and memory speculative execution vulnerabilities. Requires explicit confirmation.',
    sideEffectsFa: 'ریسک امنیتی: تدابیر دفاعی پردازنده در برابر نفوذهای امنیتی حافظه را غیرفعال می‌کند. نیازمند تایید آگاهانه کاربر است.',
  },

  memory_compression_off: {
    whenToEnable: 'When your PC has 32GB+ of high-speed RAM and you want to prevent CPU compression cycles during gaming sessions.',
    whenToEnableFa: 'وقتی سیستم دارای ۳۲ گیگابایت رم یا بیشتر است و مایلید از درگیر شدن پردازنده برای فشرده‌سازی حافظه جلوگیری کنید.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Disables Windows Memory Compression (MMAgent -MemoryCompression $false). Pages are stored uncompressed in physical RAM.',
    whatItAffectsFa: 'سرویس فشرده‌سازی رم ویندوز را غیرفعال کرده و داده‌ها را به شکل خام و فشرده‌نشده در حافظه رم نگه می‌دارد.',
    sideEffects: 'Increases physical RAM footprint. Not recommended on systems with 16GB or less RAM.',
    sideEffectsFa: 'میزان اشغال حافظه فیزیکی رم بیشتر می‌شود. روی سیستم‌های با ۱۶ گیگ رم یا کمتر توصیه نمی‌شود.',
  },

  // ==========================================
  // GAMING & POWER MODULE - EXPERIMENTAL
  // ==========================================
  win32_priority_separation: {
    whenToEnable: 'To give foreground gaming threads longer or shorter quantum scheduling slices relative to background OS threads.',
    whenToEnableFa: 'جهت اختصاص سهم زمان‌بندی طولانی‌تر یا کوتاه‌تر پردازنده به پنجره فعال بازی در مقایسه با سرویس‌های پس‌زمینه.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Adjusts Win32PrioritySeparation (0x26 = fixed short quantums for lowest latency, or 0x28 = variable long quantums for high throughput).',
    whatItAffectsFa: 'تنظیم کوانتوم زمانی اختصاص رشته‌ها در کرنل ویندوز را برای اولویت‌بخشی قطعی به برنامه فعال تغییر می‌دهد.',
    sideEffects: 'Extreme values can cause background audio (Discord, Spotify) to stutter during heavy game loading screens.',
    sideEffectsFa: 'مقادیر افراطی ممکن است باعث ایجاد تپق در صدای دیسکورد یا اسپاتیفای هنگام لودینگ سنگین بازی شود.',
  },

  mmcss_system_responsiveness: {
    whenToEnable: 'When gaming while using voice chat or streaming to ensure CPU scheduler does not reserve 20% of CPU time exclusively for non-multimedia tasks.',
    whenToEnableFa: 'هنگام بازی همزمان با ضبط یا دیسکورد تا از رزرو ۲۰ درصدی پردازنده برای برنامه‌های غیرچندرسانه‌ای جلوگیری شود.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Sets SystemResponsiveness = 0 in Multimedia Class Scheduler Service (MMCSS).',
    whatItAffectsFa: 'سهم رزرو شده پردازنده در سرویس چندرسانه‌ای ویندوز را از ۲۰ درصد پیش‌فرض به ۰ تغییر می‌دهد.',
    sideEffects: 'None on modern quad-core and higher processors.',
    sideEffectsFa: 'بدون عوارض روی پردازنده‌های ۴ هسته‌ای و بالاتر امروزی.',
  },

  hpet_cleanup: {
    whenToEnable: 'To clean up legacy High Precision Event Timer forced bcdedit flags on modern systems that natively use TSC invariant timers.',
    whenToEnableFa: 'برای پاک‌سازی دستورات قدیمی فعال‌سازی اجباری HPET در بوت ویندوز تا پردازنده از تایمر فوق‌سریع TSC استفاده کند.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Removes useplatformclock and useplatformtick BCD overrides, allowing modern Windows to use low-overhead hardware invariant TSC.',
    whatItAffectsFa: 'دستورات متغیر BCD را حذف کرده و به کرنل اجازه می‌دهد از تایمر سخت‌افزاری استاندارد و پرسرعت خود پردازنده استفاده نماید.',
    sideEffects: 'Requires system reboot to take effect.',
    sideEffectsFa: 'برای اعمال نیازمند ریستارت سیستم است.',
  },

  // ==========================================
  // NETWORK & ADAPTER MODULE
  // ==========================================
  adapter_power_saving_off: {
    whenToEnable: 'Recommended for all desktop PCs and plugged-in laptops to prevent network adapter wake latency and packet dropouts.',
    whenToEnableFa: 'توصیه شده برای تمام سیستم‌ها تا درگاه شبکه به حالت ذخیره انرژی نرود و پکت‌های بازی گم نشوند.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets PnPCapabilities to disable Windows device power management (Allow the computer to turn off this device to save power).',
    whatItAffectsFa: 'گزینه خاموش کردن کارت شبکه توسط ویندوز برای صرفه‌جویی در مصرف برق را غیرفعال می‌کند.',
    sideEffects: 'Consumes slightly more battery on unplugged laptops (~0.2W).',
    sideEffectsFa: 'مصرف باتری لپ‌تاپ را در حالت جدا از شارژر کمی افزایش می‌دهد (حدود ۰.۲ وات).',
  },

  adapter_eee_off: {
    whenToEnable: 'When playing online multiplayer games over Gigabit or 2.5G Ethernet cables to stop physical link power-state transitions.',
    whenToEnableFa: 'هنگام بازی‌های آنلاین تحت کابل اترنت برای حذف تاخیر ورود و خروج سوکت شبکه از حالت کم‌مصرف.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Disables IEEE 802.3az Energy-Efficient Ethernet in the NIC driver hardware properties.',
    whatItAffectsFa: 'استاندارد صرفه‌جویی انرژی ۸۰۲.۳az را در درایور اختصاصی کارت شبکه خاموش می‌کند.',
    sideEffects: 'Network adapter uses ~0.5W more electricity at idle.',
    sideEffectsFa: 'کارت شبکه در حالت بی‌کاری حدود ۰.۵ وات انرژی بیشتری مصرف می‌کند.',
  },

  adapter_green_ethernet_off: {
    whenToEnable: 'When experiencing intermittent ping spikes or packet drops over long or budget Ethernet cable runs.',
    whenToEnableFa: 'هنگام مشاهده پکت‌لاس یا نوسان پینگ در کابل‌های طولانی یا با کیفیت معمولی.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Forces the physical Ethernet PHY transceiver to operate at full signal voltage regardless of cable length detection.',
    whatItAffectsFa: 'ولتاژ سیگنال پورت فیزیکی شبکه را روی حداکثر نگه می‌دارد تا از تضعیف بسته در کابل‌های طویل جلوگیری شود.',
    sideEffects: 'Slightly higher PHY temperature (negligible).',
    sideEffectsFa: 'دمای چیپ شبکه بسیار ناچیز افزایش می‌یابد.',
  },

  adapter_prefer_ethernet: {
    whenToEnable: 'When your PC is connected to both Ethernet and Wi-Fi simultaneously and you want all gaming traffic routed exclusively through the cable.',
    whenToEnableFa: 'هنگامی که سیستم هم به کابل شبکه و هم وای‌فای وصل است و می‌خواهید تمام ترافیک اینترنت قطعا از کابل عبور کند.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Sets Windows TCP/IP interface routing metric to 10 on the Ethernet adapter, ensuring priority over Wi-Fi metrics (typically 25-50).',
    whatItAffectsFa: 'متریک مسیریابی شبکه اترنت را روی ۱۰ می‌گذارد تا ویندوز تمام ارتباطات را نسبت به وای‌فای با اولویت مطلق از کابل عبور دهد.',
    sideEffects: 'None. If Ethernet is unplugged, traffic automatically rolls back to Wi-Fi.',
    sideEffectsFa: 'بدون عوارض. در صورت قطع شدن کابل، اینترنت به طور خودکار به وای‌فای سوییچ می‌کند.',
  },

  network_delivery_optimization_off: {
    whenToEnable: 'Always for gamers and metered internet connections to prevent Windows Update from stealthily uploading to internet peers.',
    whenToEnableFa: 'همیشه برای گیمرها و اینترنت‌های حجمی جهت متوقف کردن ارسال و آپلود مخفیانه فایل‌های آپدیت ویندوز به کاربران دیگر.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Sets DODownloadMode = 0 (Bypass/HTTP only). Completely stops peer-to-peer (P2P) background torrent-style uploading from your PC.',
    whatItAffectsFa: 'سیستم ارسال همتا‌به‌همتا (P2P) آپدیت‌های ویندوز را خاموش کرده و مانع از درگیر شدن پهنای باند آپلود می‌شود.',
    sideEffects: 'Windows updates download directly from Microsoft CDN servers instead of local network peers.',
    sideEffectsFa: 'آپدیت‌ها مستقیماً از سرورهای اصلی مایکروسافت دانلود می‌شوند و از سیستم‌های دیگر شبکه دریافت نمی‌شوند.',
  },

  interrupt_moderation: {
    whenToEnable: 'Leave Adaptive for standard low-latency networking; disable only on high-end multicore CPUs for esports.',
    whenToEnableFa: 'حالت Adaptive برای اکثر سیستم‌ها ایده‌آل است؛ خاموش کردن آن فقط روی پردازنده‌های قوی برای کمترین تاخیر توصیه می‌شود.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Controls how often the network adapter generates CPU hardware interrupts per packet batch.',
    whatItAffectsFa: 'تعداد وقفه‌های سخت‌افزاری ارسالی توسط کارت شبکه به پردازنده را به ازای هر بسته کنترل می‌کند.',
    sideEffects: 'Disabling increases CPU interrupt load by ~2-4% during heavy downloads.',
    sideEffectsFa: 'غیرفعال‌سازی آن مصرف پردازنده را حین دانلودهای سنگین بین ۲ تا ۴ درصد بالا می‌برد.',
  },

  receive_side_scaling: {
    whenToEnable: 'Always recommended on multicore processors to prevent Core 0 networking bottleneck.',
    whenToEnableFa: 'همیشه روی پردازنده‌های چند هسته‌ای توصیه می‌شود تا بار پردازش شبکه روی یک هسته نیفتد.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Distributes incoming network packet interrupt handling across multiple CPU cores in parallel.',
    whatItAffectsFa: 'پردازش بسته‌های ورودی شبکه را به صورت موازی بین چندین هسته پردازنده تقسیم می‌کند.',
    sideEffects: 'None on modern hardware.',
    sideEffectsFa: 'بدون عوارض روی سخت‌افزارهای مدرن.',
  },

  energy_efficient_ethernet: {
    whenToEnable: 'Disable for gaming to eliminate Ethernet PHY low-power wake latency.',
    whenToEnableFa: 'برای بازی غیرفعال شود تا تاخیر بیدار شدن درگاه شبکه از حالت کم‌مصرف حذف گردد.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'IEEE 802.3az sleep state on the physical network port between packet bursts.',
    whatItAffectsFa: 'حالت کم‌مصرف درگاه فیزیکی اترنت (IEEE 802.3az) بین ارسال بسته‌ها را غیرفعال می‌کند.',
    sideEffects: 'Ethernet controller consumes ~0.5W more electricity.',
    sideEffectsFa: 'کارت شبکه حدود ۰.۵ وات برق بیشتری در حالت بی‌کاری مصرف می‌کند.',
  },

  network_throttling_index: {
    whenToEnable: 'When gaming and streaming or voice chatting concurrently to prevent Windows multimedia packet limiting.',
    whenToEnableFa: 'هنگام بازی همزمان با تماس صوتی دیسکورد یا استریم برای جلوگیری از محدود شدن بسته‌های شبکه توسط ویندوز.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets NetworkThrottlingIndex = 0xFFFFFFFF in MMCSS, removing the 10,000 packet/second multimedia cap.',
    whatItAffectsFa: 'محدودیت پیش‌فرض ۱۰ هزار بسته بر ثانیه در سرویس MMCSS ویندوز را برمی‌دارد.',
    sideEffects: 'None on modern gigabit network connections.',
    sideEffectsFa: 'بدون عوارض روی اتصالات پرسرعت امروزی.',
  },

  disable_nagle: {
    whenToEnable: 'For real-time online gaming (MMORPGs, FPS, MOBA) where instant packet delivery takes priority over bandwidth bundling.',
    whenToEnableFa: 'برای بازی‌های آنلاین بی‌درنگ که ارسال فوری هر بسته بر بسته‌بندی حجمی اولویت دارد.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets TcpAckFrequency = 1 and TCPNoDelay = 1. Disables Nagle buffering algorithm, sending packets immediately without waiting for ACK.',
    whatItAffectsFa: 'الگوریتم Nagle را غیرفعال کرده و بسته‌های کوچک داده را بدون انتظار برای بسته‌های بعدی فوراً ارسال می‌کند.',
    sideEffects: 'Increases small packet network overhead by 1-2%.',
    sideEffectsFa: 'تعداد بسته‌های کوچک در شبکه را کمی افزایش می‌دهد.',
  },

  tcp_nagle_algorithm_off: {
    whenToEnable: 'For real-time online gaming (MMORPGs, FPS, MOBA) where instant packet delivery takes priority over bandwidth bundling.',
    whenToEnableFa: 'برای بازی‌های آنلاین بی‌درنگ که ارسال فوری هر بسته بر بسته‌بندی حجمی اولویت دارد.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets TcpAckFrequency = 1 and TCPNoDelay = 1. Disables Nagle buffering algorithm, sending packets immediately without waiting for ACK.',
    whatItAffectsFa: 'الگوریتم Nagle را غیرفعال کرده و بسته‌های کوچک داده را بدون انتظار برای بسته‌های بعدی فوراً ارسال می‌کند.',
    sideEffects: 'Increases small packet network overhead by 1-2%.',
    sideEffectsFa: 'تعداد بسته‌های کوچک در شبکه را کمی افزایش می‌دهد.',
  },

  adapter_interrupt_moderation_off: {
    whenToEnable: 'Leave Adaptive for standard low-latency networking; disable only on high-end multicore CPUs for esports.',
    whenToEnableFa: 'حالت Adaptive برای اکثر سیستم‌ها ایده‌آل است؛ خاموش کردن آن فقط روی پردازنده‌های قوی برای کمترین تاخیر توصیه می‌شود.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Controls how often the network adapter generates CPU hardware interrupts per packet batch.',
    whatItAffectsFa: 'تعداد وقفه‌های سخت‌افزاری ارسالی توسط کارت شبکه به پردازنده را به ازای هر بسته کنترل می‌کند.',
    sideEffects: 'Disabling increases CPU interrupt load by ~2-4% during heavy downloads.',
    sideEffectsFa: 'غیرفعال‌سازی آن مصرف پردازنده را حین دانلودهای سنگین بین ۲ تا ۴ درصد بالا می‌برد.',
  },

  adapter_flow_control_off: {
    whenToEnable: 'When gaming on a dedicated Gigabit/2.5G home network to prevent PAUSE frames from halting packet transmission during burst loads.',
    whenToEnableFa: 'هنگام بازی در شبکه خانگی پرسرعت تا فریم‌های PAUSE باعث توقف موقت ارسال بسته‌ها در بار ناگهانی نشوند.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Disables IEEE 802.3x Flow Control in NIC driver. Stops the network adapter from sending or honoring PAUSE flow control packets.',
    whatItAffectsFa: 'کنترل جریان داده ۸۰۲.۳x را در کارت شبکه خاموش کرده و از ارسال پکت‌های توقف موقت جلوگیری می‌کند.',
    sideEffects: 'Under severe network switch congestion, dropped packets may occur instead of flow pausing.',
    sideEffectsFa: 'در صورت شلوغی بیش از حد سوییچ شبکه به جای توقف، ممکن است پکت دور ریخته شود.',
  },

  adapter_lso_off: {
    whenToEnable: 'When experiencing packet drops, high DPC spikes, or VPN routing errors associated with buggy network card firmware.',
    whenToEnableFa: 'هنگام مشاهده پکت‌لاس، اسپایک تاخیر DPC یا خطاهای شبکه ناشی از باگ‌های فرم‌ور کارت شبکه.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Disables Large Send Offload (LSO v2) on IPv4/IPv6. CPU splits packets into standard MTU slices before sending to NIC.',
    whatItAffectsFa: 'قابلیت تکه‌تکه کردن بسته‌های حجیم توسط کارت شبکه (LSO) را غیرفعال کرده و تقسیم را به پردازنده می‌سپارد.',
    sideEffects: 'Marginally higher CPU usage (~1%) during maximum-speed 2.5G+ multi-gigabit downloads.',
    sideEffectsFa: 'مصرف پردازنده در دانلودهای چند گیگابیتی بسیار بالا حدود ۱ درصد بیشتر می‌شود.',
  },

  adapter_rsc_off: {
    whenToEnable: 'When playing fast-paced multiplayer FPS games or using virtual machines to eliminate packet coalescing delay.',
    whenToEnableFa: 'در بازی‌های شوتر آنلاین یا ماشین‌های مجازی برای حذف تاخیر تجمیع بسته‌های ورودی.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Disables Receive Segment Coalescing (RSC). Incoming network packets are processed individually without waiting to form larger segments.',
    whatItAffectsFa: 'ادغام بسته‌های ورودی (RSC) را خاموش کرده تا هر بسته بلافاصله و جداگانه پردازش شود.',
    sideEffects: 'Increases CPU interrupt rate during heavy file transfers.',
    sideEffectsFa: 'تعداد وقفه‌های پردازنده حین انتقال فایل‌های حجیم افزایش می‌یابد.',
  },

  tcp_autotuning_normal: {
    whenToEnable: 'Recommended for all connections. Keeps Windows TCP Receive Window Auto-Tuning at the optimal Normal setting.',
    whenToEnableFa: 'توصیه شده برای تمام سیستم‌ها. پنجره دریافت TCP ویندوز را روی حالت خودکار و بهینه نرمال نگه می‌دارد.',
    impactMagnitude: 'Significant',
    impactMagnitudeFa: 'چشمگیر',
    whatItAffects: 'Configures netsh interface tcp set global autotuninglevel=normal. Prevents artificially restricted download throughput.',
    whatItAffectsFa: 'تنظیم پنجره دریافت TCP را به حالت نرمال برمی‌گرداند و مانع از افت شدید سرعت دانلود می‌شود.',
    sideEffects: 'None. Factory default and recommended Microsoft configuration.',
    sideEffectsFa: 'بدون عوارض. حالت پیش‌فرض و استاندارد مایکروسافت.',
  },

  tcp_ecn_toggle: {
    whenToEnable: 'Enable if your ISP and home router support Explicit Congestion Notification to reduce packet drops without retransmission.',
    whenToEnableFa: 'اگر مودم و ارائه‌دهنده اینترنت شما از اعلان صریح ازدحام (ECN) پشتیبانی می‌کنند برای جلوگیری از دور ریختن پکت‌ها.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Sets netsh interface tcp set global ecncapability=enabled (or disabled). Flags congestion without dropping packets.',
    whatItAffectsFa: 'قابلیت ECN را در پروتکل TCP فعال یا غیرفعال می‌کند تا ازدحام مسیر بدون دور انداختن پکت مشخص شود.',
    sideEffects: 'Some legacy firewalls and websites block ECN SYN packets. Disable if specific web servers fail to connect.',
    sideEffectsFa: 'برخی فایروال‌های قدیمی یا سایت‌ها بسته‌های ECN را مسدود می‌کنند. در صورت مشکل در اتصال غیرفعال شود.',
  },

  mmcss_network_throttling_off: {
    whenToEnable: 'When gaming and streaming or voice chatting concurrently to prevent Windows multimedia packet limiting.',
    whenToEnableFa: 'هنگام بازی همزمان با تماس صوتی دیسکورد یا استریم برای جلوگیری از محدود شدن بسته‌های شبکه توسط ویندوز.',
    impactMagnitude: 'Noticeable',
    impactMagnitudeFa: 'محسوس',
    whatItAffects: 'Sets NetworkThrottlingIndex = 0xFFFFFFFF in MMCSS, removing the 10,000 packet/second multimedia cap.',
    whatItAffectsFa: 'محدودیت پیش‌فرض ۱۰ هزار بسته بر ثانیه در سرویس MMCSS ویندوز را برمی‌دارد.',
    sideEffects: 'None on modern gigabit network connections.',
    sideEffectsFa: 'بدون عوارض روی اتصالات پرسرعت امروزی.',
  },

  mmcss_system_responsiveness_zero: {
    whenToEnable: 'When gaming while using voice chat or streaming to ensure CPU scheduler does not reserve 20% of CPU time exclusively for non-multimedia tasks.',
    whenToEnableFa: 'هنگام بازی همزمان با ضبط یا دیسکورد تا از رزرو ۲۰ درصدی پردازنده برای برنامه‌های غیرچندرسانه‌ای جلوگیری شود.',
    impactMagnitude: 'Subtle',
    impactMagnitudeFa: 'ظریف',
    whatItAffects: 'Sets SystemResponsiveness = 0 in Multimedia Class Scheduler Service (MMCSS).',
    whatItAffectsFa: 'سهم رزرو شده پردازنده در سرویس چندرسانه‌ای ویندوز را از ۲۰ درصد پیش‌فرض به ۰ تغییر می‌دهد.',
    sideEffects: 'None on modern quad-core and higher processors.',
    sideEffectsFa: 'بدون عوارض روی پردازنده‌های ۴ هسته‌ای و بالاتر امروزی.',
  },
};

/**
 * Returns guidance for any given tweak ID, or a sensible fallback
 */
export function getTweakGuidance(tweakId: string): TweakGuidance | null {
  return TWEAK_GUIDANCE_CATALOG[tweakId] || null;
}
