use std::ffi::c_void;

const SPI_GETMOUSE: u32 = 0x0003;
const SPI_SETMOUSE: u32 = 0x0004;
const SPI_GETMOUSESPEED: u32 = 0x0070;
const SPI_SETMOUSESPEED: u32 = 0x0071;
const SPIF_UPDATEINIFILE: u32 = 0x0001;
const SPIF_SENDCHANGE: u32 = 0x0002;

#[link(name = "user32")]
unsafe extern "system" {
    fn SystemParametersInfoW(
        ui_action: u32,
        ui_param: u32,
        pv_param: *mut c_void,
        f_win_ini: u32,
    ) -> i32;
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryTimerResolution(
        minimum_resolution: *mut u32,
        maximum_resolution: *mut u32,
        actual_resolution: *mut u32,
    ) -> i32;
}

/// Query system timer resolution (min_ms, max_ms, cur_ms)
pub fn get_timer_resolution() -> (f64, f64, f64) {
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

/// Query Windows mouse pointer speed (1..20) and acceleration thresholds
pub fn get_mouse_spi() -> (i32, [i32; 3]) {
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

/// Set mouse speed (1..20) and acceleration toggle, returning previous state for rollback
pub fn set_mouse_spi(speed: i32, accel_disabled: bool) -> (i32, [i32; 3]) {
    let prev = get_mouse_spi();

    unsafe {
        let clamped_speed = speed.clamp(1, 20) as u32;
        SystemParametersInfoW(
            SPI_SETMOUSESPEED,
            0,
            clamped_speed as usize as *mut c_void,
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        );

        let mut mouse_params: [i32; 3] = if accel_disabled {
            [0, 0, 0]
        } else {
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
