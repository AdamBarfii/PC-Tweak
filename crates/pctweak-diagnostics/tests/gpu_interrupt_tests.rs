use pctweak_diagnostics::gpu_interrupt::{
    detect_gpu_vendor, is_gpu_discrete, parse_device_priority, parse_msi_status,
    sanitize_pnp_device_id, GpuVendor,
};

#[test]
fn test_sanitize_pnp_device_id_metacharacters() {
    let malicious = "PCI\\VEN_10DE&DEV_21C4; calc.exe & rm -rf /";
    let cleaned = sanitize_pnp_device_id(malicious);
    assert!(!cleaned.contains(';'));
    assert!(!cleaned.contains('&'));
    assert!(!cleaned.contains('|'));
}

#[test]
fn test_detect_gpu_vendor() {
    assert_eq!(detect_gpu_vendor("PCI\\VEN_10DE&DEV_21C4", "GeForce GTX 1660 SUPER"), GpuVendor::Nvidia);
    assert_eq!(detect_gpu_vendor("PCI\\VEN_1002&DEV_73DF", "AMD Radeon RX 6700 XT"), GpuVendor::Amd);
    assert_eq!(detect_gpu_vendor("PCI\\VEN_8086&DEV_5690", "Intel(R) Arc(TM) A770 Graphics"), GpuVendor::Intel);
    assert_eq!(detect_gpu_vendor("PCI\\VEN_1234&DEV_0000", "Generic Display Adapter"), GpuVendor::Unknown);
}

#[test]
fn test_is_gpu_discrete() {
    assert_eq!(is_gpu_discrete(GpuVendor::Nvidia, "NVIDIA GeForce RTX 4070 Ti SUPER"), true);
    assert_eq!(is_gpu_discrete(GpuVendor::Amd, "AMD Radeon RX 7900 XTX"), true);
    assert_eq!(is_gpu_discrete(GpuVendor::Amd, "AMD Radeon(TM) Graphics (integrated)"), false);
    assert_eq!(is_gpu_discrete(GpuVendor::Intel, "Intel(R) Arc(TM) A750 Graphics"), true);
    assert_eq!(is_gpu_discrete(GpuVendor::Intel, "Intel(R) UHD Graphics 770"), false);
}

#[test]
fn test_parse_msi_status() {
    let active_out = "    MSISupported    REG_DWORD    0x1";
    assert_eq!(parse_msi_status(active_out), true);

    let inactive_out = "    MSISupported    REG_DWORD    0x0";
    assert_eq!(parse_msi_status(inactive_out), false);

    let missing_out = "ERROR: The system was unable to find the specified registry key or value.";
    assert_eq!(parse_msi_status(missing_out), false);
}

#[test]
fn test_parse_device_priority() {
    assert_eq!(parse_device_priority("    DevicePriority    REG_DWORD    0x3"), (3, "High"));
    assert_eq!(parse_device_priority("    DevicePriority    REG_DWORD    0x2"), (2, "Normal"));
    assert_eq!(parse_device_priority("    DevicePriority    REG_DWORD    0x1"), (1, "Low"));
    assert_eq!(parse_device_priority("ERROR: The system was unable to find..."), (0, "Default"));
}
