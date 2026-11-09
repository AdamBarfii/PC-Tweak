use pctweak_diagnostics::cpu::calculate_topology;

#[test]
fn test_intel_13700k_hybrid_topology() {
    let topo = calculate_topology("13th Gen Intel(R) Core(TM) i7-13700K", 16, 24);
    assert_eq!(topo.architecture, "intel-hybrid");
    assert_eq!(topo.has_ecores, true);
    assert_eq!(topo.p_core_count, 8);
    assert_eq!(topo.e_core_count, 8);
    assert_eq!(topo.recommended_mode, "pcores-only");
    assert_eq!(topo.recommended_mask_hex, "0x0000FFFF");
}

#[test]
fn test_intel_13600k_hybrid_topology() {
    let topo = calculate_topology("13th Gen Intel(R) Core(TM) i5-13600K", 14, 20);
    assert_eq!(topo.architecture, "intel-hybrid");
    assert_eq!(topo.has_ecores, true);
    assert_eq!(topo.p_core_count, 6);
    assert_eq!(topo.e_core_count, 8);
    assert_eq!(topo.recommended_mode, "pcores-only");
    assert_eq!(topo.recommended_mask_hex, "0x00000FFF");
}

#[test]
fn test_amd_dual_ccd_3d_vcache_topology() {
    let topo = calculate_topology("AMD Ryzen 9 7950X3D 16-Core Processor", 16, 32);
    assert_eq!(topo.architecture, "amd-dual-ccd-vcache");
    assert_eq!(topo.has_ecores, false);
    assert_eq!(topo.recommended_mode, "vcache-ccd-only");
    assert_eq!(topo.recommended_mask_hex, "0x0000FFFF");
}

#[test]
fn test_uniform_6_core_isolates_core0() {
    let topo = calculate_topology("AMD Ryzen 5 5600X 6-Core Processor", 6, 12);
    assert_eq!(topo.architecture, "uniform");
    assert_eq!(topo.recommended_mode, "isolate-core0");
    // 12 threads: all mask = 0xFFF (4095), SMT mask exclusion = 3. 4095 ^ 3 = 4092 = 0xFFC
    assert_eq!(topo.recommended_mask_hex, "0x00000FFC");
}

#[test]
fn test_uniform_4_core_uses_all_cores() {
    let topo = calculate_topology("Intel(R) Core(TM) i3-10100", 4, 4);
    assert_eq!(topo.architecture, "uniform");
    assert_eq!(topo.recommended_mode, "all-cores");
    assert_eq!(topo.recommended_mask_hex, "0x0000000F");
}
