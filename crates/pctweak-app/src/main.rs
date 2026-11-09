mod state;
mod i18n;
mod ui;
mod benchmark_harness;

use state::{ActiveView, AppState};
use std::sync::Mutex;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

static APP_STATE: Mutex<Option<AppState>> = Mutex::new(None);

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // 1. Memory Benchmark CLI mode
    if args.iter().any(|arg| arg == "--benchmark-memory" || arg == "-b") {
        println!("Running PC Tweak Native Rust Idle Memory Benchmark (<30MB target)...");
        let result = benchmark_harness::run_memory_benchmark(5);
        let json = serde_json::to_string_pretty(&result).unwrap_or_default();
        println!("{}", json);

        if result.passed_requirement {
            println!("\n[PASS] Steady-state idle memory: {:.2} MB (<= 30.0 MB threshold)", result.steady_state_idle_working_set_mb);
            std::process::exit(0);
        } else {
            eprintln!("\n[FAIL] Steady-state idle memory: {:.2} MB exceeded 30.0 MB threshold", result.steady_state_idle_working_set_mb);
            std::process::exit(1);
        }
    }

    if args.iter().any(|arg| arg == "--version" || arg == "-v") {
        println!("PC Tweak v1.0.0 (Native Rust Edition, x86_64-pc-windows)");
        return;
    }

    println!("Starting PC Tweak Native Rust Desktop App...");
    {
        let mut state = APP_STATE.lock().unwrap();
        *state = Some(AppState::new());
    }

    #[cfg(windows)]
    run_win32_app();
}

#[cfg(windows)]
fn run_win32_app() {
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let class_name = to_wide("PCTweak_Native_Class\0");

        let mut wnd_class: WNDCLASSEXW = std::mem::zeroed();
        wnd_class.cbSize = std::mem::size_of::<WNDCLASSEXW>() as u32;
        wnd_class.style = CS_HREDRAW | CS_VREDRAW;
        wnd_class.lpfnWndProc = Some(wnd_proc);
        wnd_class.hInstance = instance;
        wnd_class.hCursor = LoadCursorW(std::ptr::null_mut(), IDC_ARROW);
        wnd_class.lpszClassName = class_name.as_ptr();

        RegisterClassExW(&wnd_class);

        let title = to_wide("PC Tweak - Native Rust High-Performance Cockpit\0");
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            1100,
            720,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null_mut(),
        );

        if hwnd.is_null() {
            eprintln!("Failed to create Win32 window.");
            return;
        }

        // Set 1000ms timer for telemetry updates
        SetTimer(hwnd, 1, 1000, None);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

#[cfg(windows)]
unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_TIMER => {
            if let Ok(mut lock) = APP_STATE.lock() {
                if let Some(ref mut state) = *lock {
                    state.refresh_telemetry();
                }
            }
            unsafe { InvalidateRect(hwnd, std::ptr::null(), 0) };
            0
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i32;

            // Check if click was in sidebar tab region (x: 10..170, y: 70..490)
            if (10..170).contains(&x) && y >= 70 {
                let tab_idx = (y - 70) / 42;
                let views = [
                    ActiveView::Dashboard,
                    ActiveView::Optimizer,
                    ActiveView::Overclock,
                    ActiveView::InputLab,
                    ActiveView::Gaming,
                    ActiveView::Network,
                    ActiveView::Backup,
                    ActiveView::Privacy,
                    ActiveView::Profiles,
                    ActiveView::Settings,
                ];

                if let Some(&view) = views.get(tab_idx as usize) {
                    if let Ok(mut lock) = APP_STATE.lock() {
                        if let Some(ref mut state) = *lock {
                            state.active_view = view;
                        }
                    }
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0) };
                }
            }
            0
        }
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = unsafe { std::mem::zeroed() };
            let hdc = unsafe { BeginPaint(hwnd, &mut ps) };
            let mut rect: RECT = unsafe { std::mem::zeroed() };
            unsafe { GetClientRect(hwnd, &mut rect) };

            if let Ok(lock) = APP_STATE.lock() {
                if let Some(ref state) = *lock {
                    ui::render_ui(hdc, &rect, state);
                }
            }

            unsafe { EndPaint(hwnd, &ps) };
            0
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            0
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
