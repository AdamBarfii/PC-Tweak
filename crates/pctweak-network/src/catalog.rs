use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsServerPreset {
    pub id: String,
    pub name: String,
    pub primary: String,
    pub secondary: String,
    pub doh_url: Option<String>,
    pub category: String, // "iran" | "global" | "custom"
    pub description: String,
}

pub fn get_default_dns_presets() -> Vec<DnsServerPreset> {
    vec![
        // Iranian Presets
        DnsServerPreset {
            id: "radar".to_string(),
            name: "Radar Game".to_string(),
            primary: "10.202.10.10".to_string(),
            secondary: "10.202.10.11".to_string(),
            doh_url: None,
            category: "iran".to_string(),
            description: "Iranian Gaming & Anti-Sanction DNS with low packet loss for gaming servers.".to_string(),
        },
        DnsServerPreset {
            id: "electro".to_string(),
            name: "Electro".to_string(),
            primary: "78.157.42.101".to_string(),
            secondary: "78.157.42.100".to_string(),
            doh_url: None,
            category: "iran".to_string(),
            description: "High-speed Iranian DNS unlocking developer & gaming services.".to_string(),
        },
        DnsServerPreset {
            id: "shecan".to_string(),
            name: "Shecan".to_string(),
            primary: "178.22.122.100".to_string(),
            secondary: "185.51.200.2".to_string(),
            doh_url: None,
            category: "iran".to_string(),
            description: "Free Iranian anti-sanction DNS service for developers and gamers.".to_string(),
        },
        DnsServerPreset {
            id: "403online".to_string(),
            name: "403.online".to_string(),
            primary: "10.202.10.202".to_string(),
            secondary: "10.202.10.102".to_string(),
            doh_url: None,
            category: "iran".to_string(),
            description: "Sanction-bypass DNS focused on dev tools, GitHub, and cloud platforms.".to_string(),
        },
        DnsServerPreset {
            id: "begzar".to_string(),
            name: "Begzar".to_string(),
            primary: "185.55.226.26".to_string(),
            secondary: "185.55.225.25".to_string(),
            doh_url: None,
            category: "iran".to_string(),
            description: "Fast, reliable Iranian circumvention DNS resolver.".to_string(),
        },
        // Global Anycast Presets
        DnsServerPreset {
            id: "cloudflare".to_string(),
            name: "Cloudflare".to_string(),
            primary: "1.1.1.1".to_string(),
            secondary: "1.0.0.1".to_string(),
            doh_url: Some("https://cloudflare-dns.com/dns-query".to_string()),
            category: "global".to_string(),
            description: "Ultra-fast anycast resolver with privacy focus.".to_string(),
        },
        DnsServerPreset {
            id: "google".to_string(),
            name: "Google Public DNS".to_string(),
            primary: "8.8.8.8".to_string(),
            secondary: "8.8.4.4".to_string(),
            doh_url: Some("https://dns.google/dns-query".to_string()),
            category: "global".to_string(),
            description: "Global standard anycast DNS by Google.".to_string(),
        },
        DnsServerPreset {
            id: "quad9".to_string(),
            name: "Quad9".to_string(),
            primary: "9.9.9.9".to_string(),
            secondary: "149.112.112.112".to_string(),
            doh_url: Some("https://dns.quad9.net/dns-query".to_string()),
            category: "global".to_string(),
            description: "Security-focused DNS blocking malware and phishing domains.".to_string(),
        },
        DnsServerPreset {
            id: "opendns".to_string(),
            name: "OpenDNS".to_string(),
            primary: "208.67.222.222".to_string(),
            secondary: "208.67.220.220".to_string(),
            doh_url: None,
            category: "global".to_string(),
            description: "Cisco-backed reliable high-capacity DNS resolver.".to_string(),
        },
        DnsServerPreset {
            id: "adguard".to_string(),
            name: "AdGuard DNS".to_string(),
            primary: "94.140.14.14".to_string(),
            secondary: "94.140.15.15".to_string(),
            doh_url: None,
            category: "global".to_string(),
            description: "Default ad and tracker blocking public DNS resolver.".to_string(),
        },
        DnsServerPreset {
            id: "controld".to_string(),
            name: "Control D".to_string(),
            primary: "76.76.2.0".to_string(),
            secondary: "76.76.10.0".to_string(),
            doh_url: None,
            category: "global".to_string(),
            description: "Modern high-speed anycast DNS with malicious filter.".to_string(),
        },
    ]
}
