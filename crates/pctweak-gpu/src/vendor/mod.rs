pub mod fallback;
pub mod nvml;
pub mod adl;

use std::sync::Arc;
use crate::error::GpuError;
use crate::types::{GpuCapabilities, GpuOffsets, GpuTelemetry, GpuVendor};

pub use fallback::FallbackAdapter;
pub use nvml::NvmlAdapter;
pub use adl::AdlAdapter;

pub trait GpuVendorAdapter: Send + Sync {
    fn vendor(&self) -> GpuVendor;
    fn capabilities(&self) -> GpuCapabilities;
    fn get_telemetry(&self) -> Result<GpuTelemetry, GpuError>;
    fn apply_in_memory_offsets(&self, offsets: &GpuOffsets) -> Result<(), GpuError>;
    fn reset_to_stock(&self) -> Result<(), GpuError>;
}

pub fn create_adapter() -> Arc<dyn GpuVendorAdapter> {
    // 1. Try NVIDIA NVML
    if let Ok(nvml) = NvmlAdapter::try_init() {
        tracing::info!("Initialized NVIDIA NVML GPU adapter");
        return Arc::new(nvml);
    }

    // 2. Try AMD ADL
    if let Ok(adl) = AdlAdapter::try_init() {
        tracing::info!("Initialized AMD ADL GPU adapter");
        return Arc::new(adl);
    }

    // 3. Fallback Adapter (ambient baseline 42°C)
    tracing::info!("No discrete NVIDIA/AMD GPU API found. Activating FallbackAdapter");
    Arc::new(FallbackAdapter::new())
}
