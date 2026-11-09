use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use crate::error::Win32Error;
use crate::registry::{RegHive, RegValue};
use crate::service::{is_critical_service, ServiceStartType, ServiceState};

pub trait RegistryBackend: Send + Sync {
    fn get_value(&self, hive: RegHive, subkey: &str, value_name: &str) -> Result<RegValue, Win32Error>;
    fn set_value(&self, hive: RegHive, subkey: &str, value_name: &str, value: &RegValue) -> Result<(), Win32Error>;
    fn delete_value(&self, hive: RegHive, subkey: &str, value_name: &str) -> Result<(), Win32Error>;
}

pub trait ServiceBackend: Send + Sync {
    fn get_status(&self, service_name: &str) -> Result<ServiceState, Win32Error>;
    fn configure_startup(&self, service_name: &str, start_type: ServiceStartType) -> Result<(), Win32Error>;
    fn stop_service(&self, service_name: &str) -> Result<(), Win32Error>;
    fn start_service(&self, service_name: &str) -> Result<(), Win32Error>;
}

#[derive(Default, Clone)]
pub struct MockRegistryStore {
    data: Arc<RwLock<HashMap<String, HashMap<String, RegValue>>>>,
}

impl MockRegistryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert_default(&self, hive: &str, subkey: &str, name: &str, val: RegValue) {
        let full = format!("{}\\{}", hive, subkey).to_ascii_lowercase();
        let mut lock = self.data.write().unwrap();
        lock.entry(full).or_default().insert(name.to_ascii_lowercase(), val);
    }
}

impl RegistryBackend for MockRegistryStore {
    fn get_value(&self, hive: RegHive, subkey: &str, value_name: &str) -> Result<RegValue, Win32Error> {
        let hive_str = match hive {
            RegHive::HkeyLocalMachine => "HKLM",
            RegHive::HkeyCurrentUser => "HKCU",
            RegHive::HkeyClassesRoot => "HKCR",
            RegHive::HkeyUsers => "HKU",
            RegHive::HkeyCurrentConfig => "HKCC",
        };
        let full = format!("{}\\{}", hive_str, subkey).to_ascii_lowercase();
        let lock = self.data.read().unwrap();
        if let Some(map) = lock.get(&full) {
            if let Some(val) = map.get(&value_name.to_ascii_lowercase()) {
                return Ok(val.clone());
            }
        }
        Err(Win32Error::NotFound {
            operation: "MockRegistry::get_value",
            target: format!("{}\\{}", full, value_name),
            code: 2,
        })
    }

    fn set_value(&self, hive: RegHive, subkey: &str, value_name: &str, value: &RegValue) -> Result<(), Win32Error> {
        let hive_str = match hive {
            RegHive::HkeyLocalMachine => "HKLM",
            RegHive::HkeyCurrentUser => "HKCU",
            RegHive::HkeyClassesRoot => "HKCR",
            RegHive::HkeyUsers => "HKU",
            RegHive::HkeyCurrentConfig => "HKCC",
        };
        let full = format!("{}\\{}", hive_str, subkey).to_ascii_lowercase();
        let mut lock = self.data.write().unwrap();
        lock.entry(full).or_default().insert(value_name.to_ascii_lowercase(), value.clone());
        Ok(())
    }

    fn delete_value(&self, hive: RegHive, subkey: &str, value_name: &str) -> Result<(), Win32Error> {
        let hive_str = match hive {
            RegHive::HkeyLocalMachine => "HKLM",
            RegHive::HkeyCurrentUser => "HKCU",
            RegHive::HkeyClassesRoot => "HKCR",
            RegHive::HkeyUsers => "HKU",
            RegHive::HkeyCurrentConfig => "HKCC",
        };
        let full = format!("{}\\{}", hive_str, subkey).to_ascii_lowercase();
        let mut lock = self.data.write().unwrap();
        if let Some(map) = lock.get_mut(&full) {
            map.remove(&value_name.to_ascii_lowercase());
        }
        Ok(())
    }
}

#[derive(Default, Clone)]
pub struct MockServiceStore {
    states: Arc<RwLock<HashMap<String, ServiceState>>>,
    start_types: Arc<RwLock<HashMap<String, ServiceStartType>>>,
}

impl MockServiceStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_service(&self, name: &str, state: ServiceState, start_type: ServiceStartType) {
        let key = name.trim().to_ascii_lowercase();
        self.states.write().unwrap().insert(key.clone(), state);
        self.start_types.write().unwrap().insert(key, start_type);
    }
}

impl ServiceBackend for MockServiceStore {
    fn get_status(&self, service_name: &str) -> Result<ServiceState, Win32Error> {
        let key = service_name.trim().to_ascii_lowercase();
        let lock = self.states.read().unwrap();
        if let Some(&state) = lock.get(&key) {
            Ok(state)
        } else {
            Err(Win32Error::NotFound {
                operation: "MockService::get_status",
                target: service_name.to_string(),
                code: 1060,
            })
        }
    }

    fn configure_startup(&self, service_name: &str, start_type: ServiceStartType) -> Result<(), Win32Error> {
        if is_critical_service(service_name) {
            return Err(Win32Error::CriticalServiceProtected {
                name: service_name.to_string(),
            });
        }
        let key = service_name.trim().to_ascii_lowercase();
        self.start_types.write().unwrap().insert(key, start_type);
        Ok(())
    }

    fn stop_service(&self, service_name: &str) -> Result<(), Win32Error> {
        if is_critical_service(service_name) {
            return Err(Win32Error::CriticalServiceProtected {
                name: service_name.to_string(),
            });
        }
        let key = service_name.trim().to_ascii_lowercase();
        self.states.write().unwrap().insert(key, ServiceState::Stopped);
        Ok(())
    }

    fn start_service(&self, service_name: &str) -> Result<(), Win32Error> {
        let key = service_name.trim().to_ascii_lowercase();
        self.states.write().unwrap().insert(key, ServiceState::Running);
        Ok(())
    }
}
