use pctweak_optimizer::privacy::get_privacy_catalog;
use pctweak_optimizer::system::{get_critical_process_whitelist, is_critical_process, is_file_older_than_24h};

#[test]
fn test_critical_process_whitelist() {
    let whitelist = get_critical_process_whitelist();
    assert!(whitelist.contains("csrss.exe"));
    assert!(whitelist.contains("lsass.exe"));
    assert!(whitelist.contains("explorer.exe"));
    assert!(whitelist.contains("services.exe"));

    assert!(is_critical_process("CSRSS.EXE"));
    assert!(is_critical_process("explorer.exe"));
    assert!(!is_critical_process("random_miner.exe"));
}

#[test]
fn test_privacy_catalog_items() {
    let catalog = get_privacy_catalog();
    assert_eq!(catalog.len(), 6);

    let ids: Vec<_> = catalog.iter().map(|item| item.id.as_str()).collect();
    assert!(ids.contains(&"diagtrack"));
    assert!(ids.contains(&"wersvc"));
    assert!(ids.contains(&"advertising_id"));
    assert!(ids.contains(&"cortana_copilot"));
    assert!(ids.contains(&"activity_history"));
    assert!(ids.contains(&"location_tracking"));
}

#[test]
fn test_file_age_gate_filters_recent_files() {
    let tmp = tempfile::NamedTempFile::new().expect("Failed to create temp file");
    // Newly created file is NOT older than 24h
    assert!(!is_file_older_than_24h(tmp.path()));
}
