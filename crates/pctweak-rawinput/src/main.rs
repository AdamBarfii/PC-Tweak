use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

// ---------------------------------------------------------
// Win32 Data Structures
// ---------------------------------------------------------
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct RAWINPUTDEVICE {
    pub us_usage_page: u16,
    pub us_usage: u16,
    pub dw_flags: u32,
    pub hwnd_target: isize,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct RAWINPUTHEADER {
    pub dw_type: u32,
    pub dw_size: u32,
    pub h_device: isize,
    pub w_param: usize,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct RAWMOUSE {
    pub us_flags: u16,
    pub us_button_flags: u16,
    pub us_button_data: u16,
    pub _padding: u16,
    pub ul_raw_buttons: u32,
    pub l_last_x: i32,
    pub l_last_y: i32,
    pub ul_extra_information: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub union RAWDATA {
    pub mouse: RAWMOUSE,
    pub dummy: [u8; 48],
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct RAWINPUT {
    pub header: RAWINPUTHEADER,
    pub data: RAWDATA,
}

#[repr(C)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[repr(C)]
pub struct MSG {
    pub hwnd: isize,
    pub message: u32,
    pub w_param: usize,
    pub l_param: isize,
    pub time: u32,
    pub pt: POINT,
    pub l_private: u32,
}

#[repr(C)]
pub struct WNDCLASSEXW {
    pub cb_size: u32,
    pub style: u32,
    pub lpfn_wnd_proc: unsafe extern "system" fn(isize, u32, usize, isize) -> isize,
    pub cb_cls_extra: i32,
    pub cb_wnd_extra: i32,
    pub h_instance: isize,
    pub h_icon: isize,
    pub h_cursor: isize,
    pub h_br_background: isize,
    pub lpsz_menu_name: *const u16,
    pub lpsz_class_name: *const u16,
    pub h_icon_sm: isize,
}

// ---------------------------------------------------------
// Win32 External Functions
// ---------------------------------------------------------
#[link(name = "user32")]
unsafe extern "system" {
    fn RegisterRawInputDevices(
        p_raw_input_devices: *const RAWINPUTDEVICE,
        ui_num_devices: u32,
        cb_size: u32,
    ) -> i32;

    fn GetRawInputBuffer(
        p_data: *mut RAWINPUT,
        p_cb_size: *mut u32,
        cb_size_header: u32,
    ) -> u32;

    fn GetRawInputData(
        h_raw_input: isize,
        ui_command: u32,
        p_data: *mut c_void,
        p_cb_size: *mut u32,
        cb_size_header: u32,
    ) -> u32;

    fn DefWindowProcW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
    fn RegisterClassExW(lp_wnd_class: *const WNDCLASSEXW) -> u16;
    fn CreateWindowExW(
        dw_ex_style: u32,
        lp_class_name: *const u16,
        lp_window_name: *const u16,
        dw_style: u32,
        x: i32,
        y: i32,
        n_width: i32,
        n_height: i32,
        h_wnd_parent: isize,
        h_menu: isize,
        h_instance: isize,
        lp_param: *mut c_void,
    ) -> isize;
    fn DestroyWindow(hwnd: isize) -> i32;
    fn PeekMessageW(
        lp_msg: *mut MSG,
        hwnd: isize,
        w_msg_filter_min: u32,
        w_msg_filter_max: u32,
        w_remove_msg: u32,
    ) -> i32;
    fn TranslateMessage(lp_msg: *const MSG) -> i32;
    fn DispatchMessageW(lp_msg: *const MSG) -> isize;
    fn PostQuitMessage(n_exit_code: i32);

    fn SystemParametersInfoW(
        ui_action: u32,
        ui_param: u32,
        pv_param: *mut c_void,
        f_win_ini: u32,
    ) -> i32;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn QueryPerformanceCounter(lp_performance_count: *mut i64) -> i32;
    fn QueryPerformanceFrequency(lp_frequency: *mut i64) -> i32;
    fn GetCurrentThread() -> isize;
    fn SetThreadPriority(h_thread: isize, n_priority: i32) -> i32;
    fn Sleep(dw_milliseconds: u32);
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryTimerResolution(
        minimum_resolution: *mut u32,
        maximum_resolution: *mut u32,
        actual_resolution: *mut u32,
    ) -> i32;
}

// ---------------------------------------------------------
// Constants
// ---------------------------------------------------------
const RIDEV_INPUTSINK: u32 = 0x00000100;
const RID_INPUT: u32 = 0x10000003;
const RIM_TYPEMOUSE: u32 = 0;
const WM_INPUT: u32 = 0x00FF;
const PM_REMOVE: u32 = 0x0001;
const THREAD_PRIORITY_HIGHEST: i32 = 2;

const SPI_GETMOUSE: u32 = 0x0003;
const SPI_SETMOUSE: u32 = 0x0004;
const SPI_GETMOUSESPEED: u32 = 0x0070;
const SPI_SETMOUSESPEED: u32 = 0x0071;
const SPIF_UPDATEINIFILE: u32 = 0x0001;
const SPIF_SENDCHANGE: u32 = 0x0002;

// ---------------------------------------------------------
// Window Procedure
// ---------------------------------------------------------
unsafe extern "system" fn window_proc(
    hwnd: isize,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if msg == 0x0002 {
        // WM_DESTROY
        unsafe {
            PostQuitMessage(0);
        }
        return 0;
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

// ---------------------------------------------------------
// Mouse Event Structure for sliding window
// ---------------------------------------------------------
#[derive(Clone, Copy)]
struct RawSample {
    qpc_time: i64,
    dx: i32,
    dy: i32,
    buttons: u16,
}

// ---------------------------------------------------------
// Timer Resolution Query
// ---------------------------------------------------------
fn get_timer_resolution() -> (f64, f64, f64) {
    let mut min_res: u32 = 0;
    let mut max_res: u32 = 0;
    let mut cur_res: u32 = 0;

    unsafe {
        let status = NtQueryTimerResolution(&mut min_res, &mut max_res, &mut cur_res);
        if status == 0 {
            // 1 unit = 100 ns = 0.0001 ms
            let min_ms = (min_res as f64) / 10000.0;
            let max_ms = (max_res as f64) / 10000.0;
            let cur_ms = (cur_res as f64) / 10000.0;
            return (min_ms, max_ms, cur_ms);
        }
    }
    (15.625, 0.5, 1.0)
}

// ---------------------------------------------------------
// SystemParametersInfo Mouse Helpers
// ---------------------------------------------------------
fn get_mouse_spi() -> (i32, [i32; 3]) {
    let mut speed: i32 = 10;
    let mut mouse_params: [i32; 3] = [0, 0, 0];

    unsafe {
        SystemParametersInfoW(
            SPI_GETMOUSESPEED,
            0,
            &mut speed as *mut i32 as *mut c_void,
            0,
        );
        SystemParametersInfoW(
            SPI_GETMOUSE,
            0,
            mouse_params.as_mut_ptr() as *mut c_void,
            0,
        );
    }

    (speed, mouse_params)
}

fn set_mouse_spi(speed: i32, accel_disabled: bool) -> (i32, [i32; 3]) {
    // 1. Read previous state for Undo
    let prev = get_mouse_spi();

    unsafe {
        // 2. Set Pointer Speed (1..20, neutral 10)
        let clamped_speed = speed.clamp(1, 20) as u32;
        SystemParametersInfoW(
            SPI_SETMOUSESPEED,
            0,
            clamped_speed as usize as *mut c_void,
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        );

        // 3. Set Mouse Acceleration
        let mut mouse_params: [i32; 3] = if accel_disabled {
            // Acceleration disabled: thresholds and accel set to 0
            [0, 0, 0]
        } else {
            // Standard Windows default acceleration curve
            [6, 10, 1]
        };

        SystemParametersInfoW(
            SPI_SETMOUSE,
            0,
            mouse_params.as_mut_ptr() as *mut c_void,
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        );
    }

    prev
}

// ---------------------------------------------------------
// Main Stream Loop
// ---------------------------------------------------------
fn run_stream_loop() {
    let mut qpc_freq: i64 = 0;
    unsafe {
        QueryPerformanceFrequency(&mut qpc_freq);
    }
    if qpc_freq == 0 {
        qpc_freq = 10_000_000;
    }

    // Set thread priority to highest for low-latency sampling
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
    }

    // Register a message-only window class
    let class_name: Vec<u16> = "PCTweakRawInputSink\0".encode_utf16().collect();
    let wc = WNDCLASSEXW {
        cb_size: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: 0,
        lpfn_wnd_proc: window_proc,
        cb_cls_extra: 0,
        cb_wnd_extra: 0,
        h_instance: 0,
        h_icon: 0,
        h_cursor: 0,
        h_br_background: 0,
        lpsz_menu_name: std::ptr::null(),
        lpsz_class_name: class_name.as_ptr(),
        h_icon_sm: 0,
    };

    let hwnd = unsafe {
        RegisterClassExW(&wc);
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            -3, // HWND_MESSAGE
            0,
            0,
            std::ptr::null_mut(),
        )
    };

    // Register Raw Input device for mouse with RIDEV_INPUTSINK
    let rid = RAWINPUTDEVICE {
        us_usage_page: 0x01, // Generic Desktop
        us_usage: 0x02,      // Mouse
        dw_flags: RIDEV_INPUTSINK,
        hwnd_target: hwnd,
    };

    let reg_result = unsafe {
        RegisterRawInputDevices(
            &rid,
            1,
            std::mem::size_of::<RAWINPUTDEVICE>() as u32,
        )
    };

    if reg_result == 0 {
        eprintln!(r#"{{"error":"Failed to register RawInput device with RIDEV_INPUTSINK"}}"#);
        return;
    }

    let samples: Arc<Mutex<Vec<RawSample>>> = Arc::new(Mutex::new(Vec::with_capacity(4096)));
    let samples_collector = Arc::clone(&samples);
    let running = Arc::new(AtomicBool::new(true));
    let running_collector = Arc::clone(&running);

    // Spawn message pump thread
    let _pump_handle = std::thread::spawn(move || {
        let mut msg: MSG = unsafe { std::mem::zeroed() };
        let mut raw_buffer = [0u8; 1024];

        while running_collector.load(Ordering::Relaxed) {
            unsafe {
                while PeekMessageW(&mut msg, hwnd, 0, 0, PM_REMOVE) != 0 {
                    if msg.message == WM_INPUT {
                        let mut now_qpc: i64 = 0;
                        QueryPerformanceCounter(&mut now_qpc);

                        let mut size: u32 = raw_buffer.len() as u32;
                        let bytes_read = GetRawInputData(
                            msg.l_param,
                            RID_INPUT,
                            raw_buffer.as_mut_ptr() as *mut c_void,
                            &mut size,
                            std::mem::size_of::<RAWINPUTHEADER>() as u32,
                        );

                        if bytes_read != u32::MAX && bytes_read > 0 {
                            let raw_ptr = raw_buffer.as_ptr() as *const RAWINPUT;
                            let raw = &*raw_ptr;
                            if raw.header.dw_type == RIM_TYPEMOUSE {
                                let mouse = raw.data.mouse;
                                if let Ok(mut lock) = samples_collector.lock() {
                                    lock.push(RawSample {
                                        qpc_time: now_qpc,
                                        dx: mouse.l_last_x,
                                        dy: mouse.l_last_y,
                                        buttons: mouse.us_button_flags,
                                    });
                                }
                            }
                        }
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                Sleep(1); // minimal sleep to prevent 100% core burn while maintaining ~1000Hz polling responsiveness
            }
        }
        if hwnd != 0 {
            unsafe {
                DestroyWindow(hwnd);
            }
        }
    });

    // Main 60Hz calculation and output loop (~16ms)
    let freq_f64 = qpc_freq as f64;
    let window_duration_qpc = (0.5 * freq_f64) as i64; // 500ms sliding window

    loop {
        std::thread::sleep(Duration::from_millis(16));

        let mut now_qpc: i64 = 0;
        unsafe {
            QueryPerformanceCounter(&mut now_qpc);
        }

        let cutoff_qpc = now_qpc - window_duration_qpc;

        // Drain or prune samples
        let recent_samples: Vec<RawSample> = {
            if let Ok(mut lock) = samples.lock() {
                // Retain only samples inside the window
                lock.retain(|s| s.qpc_time >= cutoff_qpc);
                lock.clone()
            } else {
                Vec::new()
            }
        };

        let sample_count = recent_samples.len();
        let mut total_dx = 0i64;
        let mut total_dy = 0i64;
        let mut intervals_ms = Vec::with_capacity(sample_count);

        if sample_count >= 2 {
            for i in 1..sample_count {
                let dt_qpc = recent_samples[i].qpc_time - recent_samples[i - 1].qpc_time;
                if dt_qpc > 0 {
                    let dt_ms = (dt_qpc as f64 * 1000.0) / freq_f64;
                    intervals_ms.push(dt_ms);
                }
                total_dx += recent_samples[i].dx.abs() as i64;
                total_dy += recent_samples[i].dy.abs() as i64;
            }
        }

        let total_movement = total_dx + total_dy;
        // Sufficient movement requirement: at least 10 reports and at least 10 counts of movement
        let sufficient_movement = sample_count >= 10 && total_movement >= 10;

        let (_min_timer, _max_timer, cur_timer_ms) = get_timer_resolution();

        if !sufficient_movement || intervals_ms.is_empty() {
            // Idle or stationary state: do not compute fake polling or jitter
            println!(
                r#"{{"type":"raw_input_stats","polling_hz":null,"jitter_p99_ms":null,"jitter_median_ms":null,"min_interval_ms":null,"max_interval_ms":null,"timer_resolution_ms":{:.3},"sufficient_movement":false,"sample_count":{},"movement_counts":{}}}"#,
                cur_timer_ms, sample_count, total_movement
            );
            continue;
        }

        // Calculate Polling Rate over the window
        let first_t = recent_samples.first().unwrap().qpc_time;
        let last_t = recent_samples.last().unwrap().qpc_time;
        let span_sec = (last_t - first_t) as f64 / freq_f64;

        let polling_hz = if span_sec > 0.05 {
            ((sample_count - 1) as f64 / span_sec).round() as u32
        } else {
            0
        };

        // Sort intervals for percentiles
        intervals_ms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let min_interval = intervals_ms.first().copied().unwrap_or(0.0);
        let max_interval = intervals_ms.last().copied().unwrap_or(0.0);
        let median_interval = intervals_ms[intervals_ms.len() / 2];

        // p99 interval
        let p99_idx = ((intervals_ms.len() as f64 * 0.99).floor() as usize).min(intervals_ms.len() - 1);
        let p99_interval = intervals_ms[p99_idx];

        // Jitter p99: 99th percentile of deviation from expected/median interval
        let mut deviations: Vec<f64> = intervals_ms
            .iter()
            .map(|&val| (val - median_interval).abs())
            .collect();
        deviations.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let dev_p99_idx = ((deviations.len() as f64 * 0.99).floor() as usize).min(deviations.len() - 1);
        let jitter_p99_ms = deviations[dev_p99_idx];
        let jitter_median_ms = deviations[deviations.len() / 2];

        // Dropped / irregular events
        let dropped = intervals_ms
            .iter()
            .filter(|&&val| val > (2.0 * median_interval) || val < (0.2 * median_interval))
            .count();

        println!(
            r#"{{"type":"raw_input_stats","polling_hz":{},"jitter_p99_ms":{:.3},"jitter_median_ms":{:.3},"min_interval_ms":{:.3},"max_interval_ms":{:.3},"median_interval_ms":{:.3},"p99_interval_ms":{:.3},"timer_resolution_ms":{:.3},"sufficient_movement":true,"sample_count":{},"movement_counts":{},"dropped_events":{}}}"#,
            polling_hz,
            jitter_p99_ms,
            jitter_median_ms,
            min_interval,
            max_interval,
            median_interval,
            p99_interval,
            cur_timer_ms,
            sample_count,
            total_movement,
            dropped
        );
    }
}

// ---------------------------------------------------------
// Entrypoint & Command Dispatcher
// ---------------------------------------------------------
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).map(|s| s.as_str()).unwrap_or("stream");

    match command {
        "stream" => {
            run_stream_loop();
        }
        "get-timer" => {
            let (min_ms, max_ms, cur_ms) = get_timer_resolution();
            println!(
                r#"{{"min_ms":{:.3},"max_ms":{:.3},"current_ms":{:.3}}}"#,
                min_ms, max_ms, cur_ms
            );
        }
        "get-mouse" => {
            let (speed, params) = get_mouse_spi();
            // params: [threshold1, threshold2, acceleration]
            let accel_disabled = params[0] == 0 && params[1] == 0 && params[2] == 0;
            println!(
                r#"{{"speed":{},"threshold1":{},"threshold2":{},"accel":{},"accel_disabled":{}}}"#,
                speed, params[0], params[1], params[2], accel_disabled
            );
        }
        "set-mouse" => {
            let mut speed = 10;
            let mut accel_disabled = true;

            let mut i = 2;
            while i < args.len() {
                if args[i] == "--speed" && i + 1 < args.len() {
                    if let Ok(val) = args[i + 1].parse::<i32>() {
                        speed = val;
                    }
                    i += 2;
                } else if args[i] == "--accel" && i + 1 < args.len() {
                    accel_disabled = args[i + 1] == "0" || args[i + 1].to_lowercase() == "disabled";
                    i += 2;
                } else {
                    i += 1;
                }
            }

            let (prev_speed, prev_params) = set_mouse_spi(speed, accel_disabled);
            let prev_accel_disabled = prev_params[0] == 0 && prev_params[1] == 0 && prev_params[2] == 0;

            println!(
                r#"{{"success":true,"speed":{},"accel_disabled":{},"previous_state":{{"speed":{},"threshold1":{},"threshold2":{},"accel":{},"accel_disabled":{}}}}}"#,
                speed,
                accel_disabled,
                prev_speed,
                prev_params[0],
                prev_params[1],
                prev_params[2],
                prev_accel_disabled
            );
        }
        _ => {
            eprintln!(
                "Usage: pctweak-rawinput <stream|get-timer|get-mouse|set-mouse [--speed <1-20>] [--accel <0|1>]>"
            );
            std::process::exit(1);
        }
    }
}
