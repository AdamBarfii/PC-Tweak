pub fn pointer_speed_to_mouse_sensitivity(pointer_speed: f64) -> u32 {
    if pointer_speed.is_nan() {
        return 10; // Fallback neutral
    }
    let calculated = (pointer_speed / 6.0 * 10.0).round() as i32;
    calculated.clamp(1, 20) as u32
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MouseRegistrySettings {
    pub mouse_sensitivity: u32,
    pub mouse_speed: &'static str,
    pub mouse_threshold1: &'static str,
    pub mouse_threshold2: &'static str,
}

pub fn get_mouse_registry_settings(
    pointer_speed: u32,
    enhance_accuracy: bool,
) -> MouseRegistrySettings {
    let sensitivity = pointer_speed_to_mouse_sensitivity(pointer_speed as f64);
    if enhance_accuracy {
        MouseRegistrySettings {
            mouse_sensitivity: sensitivity,
            mouse_speed: "1",
            mouse_threshold1: "6",
            mouse_threshold2: "10",
        }
    } else {
        MouseRegistrySettings {
            mouse_sensitivity: sensitivity,
            mouse_speed: "0",
            mouse_threshold1: "0",
            mouse_threshold2: "0",
        }
    }
}
