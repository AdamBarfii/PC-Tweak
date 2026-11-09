use pctweak_network::adapter::{
    calculate_latency_stats, create_dns_snapshot, is_valid_doh_url, is_valid_ip,
    parse_netsh_dns_output, DnsAdapterConfig,
};
use pctweak_network::benchmark::calculate_rfc3550_jitter;
use pctweak_network::catalog::get_default_dns_presets;

#[test]
fn test_parse_netsh_dhcp_output() {
    let sample = r#"
Configuration for interface "Ethernet"
    DHCP configured:                         Yes
    Statically Configured DNS Servers:       None
    DNS servers configured through DHCP:     192.168.100.1
    Register with which suffix:              Primary only
    "#;
    let res = parse_netsh_dns_output(sample);
    assert_eq!(res.is_dhcp, true);
    assert_eq!(res.primary, "192.168.100.1");
    assert_eq!(res.secondary, "");
}

#[test]
fn test_parse_netsh_static_output() {
    let sample = r#"
Configuration for interface "Ethernet"
    Statically Configured DNS Servers:   1.1.1.1
                                         1.0.0.1
    Register with which suffix:          Primary only
    "#;
    let res = parse_netsh_dns_output(sample);
    assert_eq!(res.is_dhcp, false);
    assert_eq!(res.primary, "1.1.1.1");
    assert_eq!(res.secondary, "1.0.0.1");
}

#[test]
fn test_parse_netsh_empty_output() {
    let res = parse_netsh_dns_output("There are no DNS servers configured on this interface.");
    assert_eq!(res.is_dhcp, false);
    assert_eq!(res.primary, "");
    assert_eq!(res.secondary, "");
}

#[test]
fn test_latency_and_p95_stats() {
    let samples = vec![10, 12, 14, 15, 16, 18, 20, 22, 25, 100];
    let stats = calculate_latency_stats(&samples);

    assert_eq!(stats.min, 10);
    assert_eq!(stats.max, 100);
    assert_eq!(stats.median, 17);
    assert!(stats.p95 >= 25);
}

#[test]
fn test_latency_single_and_empty_sample() {
    let single = calculate_latency_stats(&[42]);
    assert_eq!(single.min, 42);
    assert_eq!(single.max, 42);
    assert_eq!(single.median, 42);
    assert_eq!(single.p95, 42);

    let empty = calculate_latency_stats(&[]);
    assert_eq!(empty.median, 0);
    assert_eq!(empty.p95, 0);
}

#[test]
fn test_rfc3550_jitter_calculation() {
    let latencies = vec![20.0, 25.0, 22.0, 30.0, 28.0];
    let jitter = calculate_rfc3550_jitter(&latencies);
    assert!(jitter > 0.0 && jitter < 15.0);

    let single = calculate_rfc3550_jitter(&[20.0]);
    assert_eq!(single, 0.0);
}

#[test]
fn test_ip_and_doh_validator_guardrails() {
    assert_eq!(is_valid_ip("1.1.1.1"), true);
    assert_eq!(is_valid_ip("8.8.8.8"), true);
    assert_eq!(is_valid_ip("9.9.9.9"), true);
    assert_eq!(is_valid_ip("192.168.1.1"), true);
    assert_eq!(is_valid_ip("178.22.122.100"), true); // Shecan

    // Rejection of malicious or malformed inputs
    assert_eq!(is_valid_ip("1.1.1.1; rm -rf /"), false);
    assert_eq!(is_valid_ip("8.8.8.8 & net user hacker"), false);
    assert_eq!(is_valid_ip("999.999.999.999"), false);
    assert_eq!(is_valid_ip("abc.def.ghi.jkl"), false);
    assert_eq!(is_valid_ip(""), false);

    // DoH URLs
    assert_eq!(is_valid_doh_url("https://cloudflare-dns.com/dns-query"), true);
    assert_eq!(is_valid_doh_url("https://dns.google/dns-query"), true);
    assert_eq!(is_valid_doh_url("https://dns.quad9.net/dns-query"), true);
    assert_eq!(is_valid_doh_url("http://insecure-dns.com"), false);
    assert_eq!(is_valid_doh_url("ftp://ftp.example.com"), false);
    assert_eq!(is_valid_doh_url("javascript:alert(1)"), false);
    assert_eq!(is_valid_doh_url(""), false);
}

#[test]
fn test_dns_snapshot_contract() {
    let config = DnsAdapterConfig {
        is_dhcp: true,
        primary: "192.168.100.1".to_string(),
        secondary: "".to_string(),
    };
    let snap = create_dns_snapshot("Ethernet", &config);
    assert_eq!(snap.adapter_name, "Ethernet");
    assert_eq!(snap.was_dhcp, true);
    assert_eq!(snap.primary_dns, "192.168.100.1");
    assert!(!snap.applied_at.is_empty());
}

#[test]
fn test_iranian_and_global_presets_catalog() {
    let presets = get_default_dns_presets();
    let iranian_presets: Vec<_> = presets.iter().filter(|p| p.category == "iran").collect();

    assert_eq!(iranian_presets.len(), 5);
    for preset in &iranian_presets {
        assert!(is_valid_ip(&preset.primary), "{} primary IP must be valid", preset.name);
        assert!(is_valid_ip(&preset.secondary), "{} secondary IP must be valid", preset.name);
    }

    let radar = iranian_presets.iter().find(|p| p.id == "radar").expect("Radar preset missing");
    let four_oh_three = iranian_presets.iter().find(|p| p.id == "403online").expect("403online preset missing");
    assert!(radar.primary.starts_with("10.202.10."));
    assert!(four_oh_three.primary.starts_with("10.202.10."));
}
