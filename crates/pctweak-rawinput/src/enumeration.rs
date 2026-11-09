use std::ffi::c_void;
use crate::error::RawInputError;
use crate::types::{DeviceType, RawDeviceInfo};

const RIM_TYPEMOUSE: u32 = 0;
const RIM_TYPEKEYBOARD: u32 = 1;
const RIM_TYPEHID: u32 = 2;

const RIDI_DEVICENAME: u32 = 0x20000007;
const RIDI_DEVICEINFO: u32 = 0x2000000b;

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RAWINPUTDEVICELIST {
    h_device: isize,
    dw_type: u32,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RID_DEVICE_INFO_MOUSE {
    dw_id: u32,
    dw_number_of_buttons: u32,
    dw_sample_rate: u32,
    f_has_horizontal_wheel: i32,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RID_DEVICE_INFO_KEYBOARD {
    dw_type: u32,
    dw_sub_type: u32,
    dw_keyboard_mode: u32,
    dw_number_of_function_keys: u32,
    dw_number_of_indicators: u32,
    dw_number_of_keys_total: u32,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct RID_DEVICE_INFO_HID {
    dw_vendor_id: u32,
    dw_product_id: u32,
    dw_version_number: u32,
    us_usage_page: u16,
    us_usage: u16,
}

#[repr(C)]
#[derive(Copy, Clone)]
union RID_DEVICE_INFO_UNION {
    mouse: RID_DEVICE_INFO_MOUSE,
    keyboard: RID_DEVICE_INFO_KEYBOARD,
    hid: RID_DEVICE_INFO_HID,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct RID_DEVICE_INFO {
    cb_size: u32,
    dw_type: u32,
    u: RID_DEVICE_INFO_UNION,
}

#[link(name = "user32")]
unsafe extern "system" {
    fn GetRawInputDeviceList(
        p_raw_input_device_list: *mut RAWINPUTDEVICELIST,
        pui_num_devices: *mut u32,
        cb_size: u32,
    ) -> u32;

    fn GetRawInputDeviceInfoW(
        h_device: isize,
        ui_command: u32,
        p_data: *mut c_void,
        p_cb_size: *mut u32,
    ) -> u32;
}

/// Enumerate all connected raw input devices (mice, keyboards, HID devices)
pub fn enumerate_devices() -> Result<Vec<RawDeviceInfo>, RawInputError> {
    let mut num_devices = 0u32;
    let list_entry_size = std::mem::size_of::<RAWINPUTDEVICELIST>() as u32;

    // 1. Query device count
    unsafe {
        GetRawInputDeviceList(std::ptr::null_mut(), &mut num_devices, list_entry_size);
    }
    if num_devices == 0 {
        return Ok(Vec::new());
    }

    let mut device_list = vec![
        RAWINPUTDEVICELIST {
            h_device: 0,
            dw_type: 0,
        };
        num_devices as usize
    ];

    let count = unsafe {
        GetRawInputDeviceList(device_list.as_mut_ptr(), &mut num_devices, list_entry_size)
    };
    if count == u32::MAX {
        return Err(RawInputError::EnumerationFailed);
    }

    let mut results = Vec::new();
    for dev in &device_list[..count as usize] {
        let dev_type = match dev.dw_type {
            RIM_TYPEMOUSE => DeviceType::Mouse,
            RIM_TYPEKEYBOARD => DeviceType::Keyboard,
            _ => DeviceType::Hid,
        };

        // Query device name path length
        let mut name_len = 0u32;
        unsafe {
            GetRawInputDeviceInfoW(
                dev.h_device,
                RIDI_DEVICENAME,
                std::ptr::null_mut(),
                &mut name_len,
            );
        }

        let mut path_str = String::new();
        if name_len > 0 {
            let mut name_buf = vec![0u16; name_len as usize];
            let written = unsafe {
                GetRawInputDeviceInfoW(
                    dev.h_device,
                    RIDI_DEVICENAME,
                    name_buf.as_mut_ptr() as *mut c_void,
                    &mut name_len,
                )
            };
            if written != u32::MAX {
                let null_pos = name_buf.iter().position(|&c| c == 0).unwrap_or(name_buf.len());
                path_str = String::from_utf16_lossy(&name_buf[..null_pos]);
            }
        }

        // Query detailed device info
        let mut info_size = std::mem::size_of::<RID_DEVICE_INFO>() as u32;
        let mut info: RID_DEVICE_INFO = unsafe { std::mem::zeroed() };
        info.cb_size = info_size;
        let info_res = unsafe {
            GetRawInputDeviceInfoW(
                dev.h_device,
                RIDI_DEVICEINFO,
                &mut info as *mut _ as *mut c_void,
                &mut info_size,
            )
        };

        let mut vendor_id = None;
        let mut product_id = None;
        let mut mouse_buttons = None;
        let mut sample_rate = None;

        if info_res != u32::MAX {
            match dev.dw_type {
                RIM_TYPEMOUSE => {
                    let m = unsafe { info.u.mouse };
                    mouse_buttons = Some(m.dw_number_of_buttons);
                    sample_rate = Some(m.dw_sample_rate);
                }
                RIM_TYPEHID => {
                    let h = unsafe { info.u.hid };
                    vendor_id = Some(h.dw_vendor_id as u16);
                    product_id = Some(h.dw_product_id as u16);
                }
                _ => {}
            }
        }

        results.push(RawDeviceInfo {
            handle: dev.h_device as usize,
            device_type: dev_type,
            device_path: path_str,
            vendor_id,
            product_id,
            mouse_buttons,
            sample_rate,
        });
    }

    Ok(results)
}
