#[cfg(windows)]
use windows_sys::Win32::System::Registry::*;
use crate::error::Win32Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegHive {
    HkeyLocalMachine,
    HkeyCurrentUser,
    HkeyClassesRoot,
    HkeyUsers,
    HkeyCurrentConfig,
}

#[cfg(windows)]
impl RegHive {
    pub fn raw_hkey(self) -> HKEY {
        match self {
            RegHive::HkeyLocalMachine => HKEY_LOCAL_MACHINE,
            RegHive::HkeyCurrentUser => HKEY_CURRENT_USER,
            RegHive::HkeyClassesRoot => HKEY_CLASSES_ROOT,
            RegHive::HkeyUsers => HKEY_USERS,
            RegHive::HkeyCurrentConfig => HKEY_CURRENT_CONFIG,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum RegValue {
    Dword(u32),
    Qword(u64),
    Sz(String),
    ExpandSz(String),
    MultiSz(Vec<String>),
    Binary(Vec<u8>),
}

pub struct RegKey {
    #[cfg(windows)]
    raw: HKEY,
}

#[cfg(windows)]
impl Drop for RegKey {
    fn drop(&mut self) {
        if !self.raw.is_null() && (self.raw as isize) != -1 {
            unsafe { RegCloseKey(self.raw) };
        }
    }
}

pub fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

impl RegKey {
    pub fn open(hive: RegHive, subkey: &str, write_access: bool) -> Result<Self, Win32Error> {
        #[cfg(windows)]
        {
            let h_root = hive.raw_hkey();
            let subkey_w = to_wide_null(subkey);
            let mut access = KEY_READ | KEY_WOW64_64KEY;
            if write_access {
                access |= KEY_WRITE;
            }

            let mut raw_key: HKEY = std::ptr::null_mut();
            let status = unsafe {
                RegOpenKeyExW(
                    h_root,
                    subkey_w.as_ptr(),
                    0,
                    access,
                    &mut raw_key,
                )
            };

            if status == 0 {
                Ok(RegKey { raw: raw_key })
            } else {
                Err(Win32Error::from_win32(status as u32, "RegOpenKeyExW", subkey))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (hive, subkey, write_access);
            Err(Win32Error::Raw {
                operation: "RegOpenKeyExW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn create(hive: RegHive, subkey: &str) -> Result<Self, Win32Error> {
        #[cfg(windows)]
        {
            let h_root = hive.raw_hkey();
            let subkey_w = to_wide_null(subkey);
            let access = KEY_READ | KEY_WRITE | KEY_WOW64_64KEY;
            let mut raw_key: HKEY = std::ptr::null_mut();
            let mut disposition = 0u32;

            let status = unsafe {
                RegCreateKeyExW(
                    h_root,
                    subkey_w.as_ptr(),
                    0,
                    std::ptr::null(),
                    REG_OPTION_NON_VOLATILE,
                    access,
                    std::ptr::null(),
                    &mut raw_key,
                    &mut disposition,
                )
            };

            if status == 0 {
                Ok(RegKey { raw: raw_key })
            } else {
                Err(Win32Error::from_win32(status as u32, "RegCreateKeyExW", subkey))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (hive, subkey);
            Err(Win32Error::Raw {
                operation: "RegCreateKeyExW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn get_value(&self, value_name: &str) -> Result<RegValue, Win32Error> {
        #[cfg(windows)]
        {
            let val_w = to_wide_null(value_name);
            let mut val_type = 0u32;
            let mut cb_data = 0u32;

            let status = unsafe {
                RegQueryValueExW(
                    self.raw,
                    val_w.as_ptr(),
                    std::ptr::null_mut(),
                    &mut val_type,
                    std::ptr::null_mut(),
                    &mut cb_data,
                )
            };

            if status != 0 {
                return Err(Win32Error::from_win32(status as u32, "RegQueryValueExW", value_name));
            }

            let mut buffer = vec![0u8; cb_data as usize];
            let status = unsafe {
                RegQueryValueExW(
                    self.raw,
                    val_w.as_ptr(),
                    std::ptr::null_mut(),
                    &mut val_type,
                    buffer.as_mut_ptr(),
                    &mut cb_data,
                )
            };

            if status != 0 {
                return Err(Win32Error::from_win32(status as u32, "RegQueryValueExW", value_name));
            }

            match val_type {
                REG_DWORD => {
                    if buffer.len() < 4 {
                        return Err(Win32Error::InvalidData {
                            context: "RegQueryValueExW",
                            details: "Buffer smaller than 4 bytes for REG_DWORD".into(),
                        });
                    }
                    let val = u32::from_le_bytes(buffer[0..4].try_into().unwrap());
                    Ok(RegValue::Dword(val))
                }
                REG_QWORD => {
                    if buffer.len() < 8 {
                        return Err(Win32Error::InvalidData {
                            context: "RegQueryValueExW",
                            details: "Buffer smaller than 8 bytes for REG_QWORD".into(),
                        });
                    }
                    let val = u64::from_le_bytes(buffer[0..8].try_into().unwrap());
                    Ok(RegValue::Qword(val))
                }
                REG_SZ | REG_EXPAND_SZ => {
                    let u16_slice = unsafe {
                        std::slice::from_raw_parts(
                            buffer.as_ptr() as *const u16,
                            buffer.len() / 2,
                        )
                    };
                    let null_pos = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
                    let s = String::from_utf16_lossy(&u16_slice[..null_pos]);
                    if val_type == REG_SZ {
                        Ok(RegValue::Sz(s))
                    } else {
                        Ok(RegValue::ExpandSz(s))
                    }
                }
                REG_MULTI_SZ => {
                    let u16_slice = unsafe {
                        std::slice::from_raw_parts(
                            buffer.as_ptr() as *const u16,
                            buffer.len() / 2,
                        )
                    };
                    let mut strings = Vec::new();
                    let mut current = Vec::new();
                    for &c in u16_slice {
                        if c == 0 {
                            if !current.is_empty() {
                                strings.push(String::from_utf16_lossy(&current));
                                current.clear();
                            }
                        } else {
                            current.push(c);
                        }
                    }
                    Ok(RegValue::MultiSz(strings))
                }
                REG_BINARY => Ok(RegValue::Binary(buffer)),
                _ => Ok(RegValue::Binary(buffer)),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = value_name;
            Err(Win32Error::Raw {
                operation: "RegQueryValueExW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn set_value(&self, value_name: &str, value: &RegValue) -> Result<(), Win32Error> {
        #[cfg(windows)]
        {
            let val_w = to_wide_null(value_name);
            let (val_type, bytes) = match value {
                RegValue::Dword(v) => (REG_DWORD, v.to_le_bytes().to_vec()),
                RegValue::Qword(v) => (REG_QWORD, v.to_le_bytes().to_vec()),
                RegValue::Sz(s) => {
                    let wide = to_wide_null(s);
                    let bytes = unsafe {
                        std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2)
                    }.to_vec();
                    (REG_SZ, bytes)
                }
                RegValue::ExpandSz(s) => {
                    let wide = to_wide_null(s);
                    let bytes = unsafe {
                        std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2)
                    }.to_vec();
                    (REG_EXPAND_SZ, bytes)
                }
                RegValue::Binary(b) => (REG_BINARY, b.clone()),
                RegValue::MultiSz(list) => {
                    let mut wide: Vec<u16> = Vec::new();
                    for s in list {
                        wide.extend(s.encode_utf16());
                        wide.push(0);
                    }
                    wide.push(0);
                    let bytes = unsafe {
                        std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2)
                    }.to_vec();
                    (REG_MULTI_SZ, bytes)
                }
            };

            let status = unsafe {
                RegSetValueExW(
                    self.raw,
                    val_w.as_ptr(),
                    0,
                    val_type,
                    bytes.as_ptr(),
                    bytes.len() as u32,
                )
            };

            if status == 0 {
                Ok(())
            } else {
                Err(Win32Error::from_win32(status as u32, "RegSetValueExW", value_name))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (value_name, value);
            Err(Win32Error::Raw {
                operation: "RegSetValueExW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }

    pub fn delete_value(&self, value_name: &str) -> Result<(), Win32Error> {
        #[cfg(windows)]
        {
            let val_w = to_wide_null(value_name);
            let status = unsafe { RegDeleteValueW(self.raw, val_w.as_ptr()) };
            if status == 0 || status == 2 {
                // Success or already absent (ERROR_FILE_NOT_FOUND)
                Ok(())
            } else {
                Err(Win32Error::from_win32(status as u32, "RegDeleteValueW", value_name))
            }
        }
        #[cfg(not(windows))]
        {
            let _ = value_name;
            Err(Win32Error::Raw {
                operation: "RegDeleteValueW",
                code: 0,
                message: "Non-windows platform".into(),
            })
        }
    }
}

pub fn get_reg_value(hive: RegHive, path: &str, name: &str) -> Result<RegValue, Win32Error> {
    let key = RegKey::open(hive, path, false)?;
    key.get_value(name)
}

pub fn set_reg_value(hive: RegHive, path: &str, name: &str, val: &RegValue) -> Result<(), Win32Error> {
    let key = RegKey::create(hive, path)?;
    key.set_value(name, val)
}

pub fn delete_reg_value(hive: RegHive, path: &str, name: &str) -> Result<(), Win32Error> {
    let key = RegKey::open(hive, path, true)?;
    key.delete_value(name)
}
