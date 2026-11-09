use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pctweak_rawinput::{
    enumerate_devices, get_mouse_spi, get_timer_resolution, set_mouse_spi, JitterTracker,
    RawSample,
};

// ---------------------------------------------------------
// Win32 Data Structures for OS Message Loop
// ---------------------------------------------------------
#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RAWINPUTDEVICE {
    us_usage_page: u16,
    us_usage: u16,
    dw_flags: u32,
    hwnd_target: isize,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RAWINPUTHEADER {
    dw_type: u32,
    dw_size: u32,
    h_device: isize,
    w_param: usize,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RAWMOUSE {
    us_flags: u16,
    us_button_flags: u16,
    us_button_data: u16,
    _padding: u16,
    ul_raw_buttons: u32,
    l_last_x: i32,
    l_last_y: i32,
    ul_extra_information: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
union RAWDATA {
    mouse: RAWMOUSE,
    dummy: [u8; 48],
}

#[repr(C)]
#[derive(Copy, Clone)]
struct RAWINPUT {
    header: RAWINPUTHEADER,
    data: RAWDATA,
}

#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[repr(C)]
struct MSG {
    hwnd: isize,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt: POINT,
    l_private: u32,
}

#[repr(C)]
struct WNDCLASSEXW {
    cb_size: u32,
    style: u32,
    lpfn_wnd_proc: unsafe extern "system" fn(isize, u32, usize, isize) -> isize,
    cb_cls_extra: i32,
    cb_wnd_extra: i32,
    h_instance: isize,
    h_icon: isize,
    h_cursor: isize,
    h_br_background: isize,
    lpsz_menu_name: *const u16,
    lpsz_class_name: *const u16,
    h_icon_sm: isize,
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
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn QueryPerformanceCounter(lp_performance_count: *mut i64) -> i32;
    fn QueryPerformanceFrequency(lp_frequency: *mut i64) -> i32;
    fn GetCurrentThread() -> isize;
    fn SetThreadPriority(h_thread: isize, n_priority: i32) -> i32;
    fn Sleep(dw_milliseconds: u32);
}

const RIDEV_INPUTSINK: u32 = 0x00000100;
const RID_INPUT: u32 = 0x10000003;
const RIM_TYPEMOUSE: u32 = 0;
const WM_INPUT: u32 = 0x00FF;
const PM_REMOVE: u32 = 0x0001;
const THREAD_PRIORITY_HIGHEST: i32 = 2;

unsafe extern "system" fn window_proc(
    hwnd: isize,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if msg == 0x0002 {
        unsafe {
            PostQuitMessage(0);
        }
        return 0;
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

fn run_stream_loop() {
    let mut qpc_freq: i64 = 0;
    unsafe {
        QueryPerformanceFrequency(&mut qpc_freq);
    }
    if qpc_freq == 0 {
        qpc_freq = 10_000_000;
    }

    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
    }

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

    let rid = RAWINPUTDEVICE {
        us_usage_page: 0x01,
        us_usage: 0x02,
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
                Sleep(1);
            }
        }
        if hwnd != 0 {
            unsafe {
                DestroyWindow(hwnd);
            }
        }
    });

    let freq_f64 = qpc_freq as f64;
    let mut tracker = JitterTracker::new(freq_f64, 0.5);

    loop {
        std::thread::sleep(Duration::from_millis(16));

        let mut now_qpc: i64 = 0;
        unsafe {
            QueryPerformanceCounter(&mut now_qpc);
        }

        let new_samples = {
            if let Ok(mut lock) = samples.lock() {
                let drained = std::mem::take(&mut *lock);
                drained
            } else {
                Vec::new()
            }
        };

        for s in new_samples {
            tracker.push_sample(s);
        }

        let (_min_timer, _max_timer, cur_timer_ms) = get_timer_resolution();
        let metrics = tracker.compute_metrics(now_qpc, cur_timer_ms);

        if let Ok(json) = serde_json::to_string(&metrics) {
            println!("{json}");
        }
    }
}

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
                    accel_disabled =
                        args[i + 1] == "0" || args[i + 1].to_lowercase() == "disabled";
                    i += 2;
                } else {
                    i += 1;
                }
            }

            let (prev_speed, prev_params) = set_mouse_spi(speed, accel_disabled);
            let prev_accel_disabled =
                prev_params[0] == 0 && prev_params[1] == 0 && prev_params[2] == 0;

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
        "list-devices" => match enumerate_devices() {
            Ok(devices) => {
                if let Ok(json) = serde_json::to_string(&devices) {
                    println!("{json}");
                }
            }
            Err(e) => {
                eprintln!(r#"{{"error":"{}"}}"#, e);
                std::process::exit(1);
            }
        },
        _ => {
            eprintln!(
                "Usage: pctweak-rawinput <stream|get-timer|get-mouse|set-mouse|list-devices>"
            );
            std::process::exit(1);
        }
    }
}
