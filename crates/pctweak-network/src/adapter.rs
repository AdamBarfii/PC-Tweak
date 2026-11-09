use crate::error::NetworkError;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsAdapterConfig {
    pub is_dhcp: bool,
    pub primary: String,
    pub secondary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnsRollbackSnapshot {
    pub adapter_name: String,
    pub was_dhcp: bool,
    pub primary_dns: String,
    pub secondary_dns: String,
    pub applied_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LatencyStats {
    pub min: u32,
    pub median: u32,
    pub p95: u32,
    pub max: u32,
}

pub fn parse_netsh_dns_output(output: &str) -> DnsAdapterConfig {
    let lower = output.to_lowercase();
    let is_dhcp = lower.contains("configured through dhcp") 
        || lower.contains("dhcp configured:                         yes")
        || lower.contains("dhcp configured: yes");

    let mut ips = Vec::new();
    for token in output.split_whitespace() {
        if let Ok(ip) = token.parse::<IpAddr>() {
            let s = ip.to_string();
            if !s.starts_with("255.") && !s.starts_with("0.") {
                ips.push(s);
            }
        }
    }

    let primary = ips.get(0).cloned().unwrap_or_default();
    let secondary = ips.get(1).cloned().unwrap_or_default();

    DnsAdapterConfig {
        is_dhcp,
        primary,
        secondary,
    }
}

pub fn calculate_latency_stats(samples: &[u32]) -> LatencyStats {
    if samples.is_empty() {
        return LatencyStats {
            min: 0,
            median: 0,
            p95: 0,
            max: 0,
        };
    }

    let mut sorted = samples.to_vec();
    sorted.sort_unstable();

    let min = sorted[0];
    let max = sorted[sorted.len() - 1];

    let mid = sorted.len() / 2;
    let median = if sorted.len() % 2 == 0 {
        ((sorted[mid - 1] as f64 + sorted[mid] as f64) / 2.0).round() as u32
    } else {
        sorted[mid]
    };

    let p95_idx = ((sorted.len() as f64 * 0.95).floor() as usize).min(sorted.len() - 1);
    let p95 = sorted[p95_idx];

    LatencyStats { min, median, p95, max }
}

pub fn is_valid_ip(ip: &str) -> bool {
    let trimmed = ip.trim();
    if trimmed.is_empty() || trimmed.contains(';') || trimmed.contains('&') || trimmed.contains('|') {
        return false;
    }
    trimmed.parse::<IpAddr>().is_ok()
}

pub fn is_valid_doh_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return false;
    }
    if !trimmed.starts_with("https://") {
        return false;
    }
    // Simple URL sanity check
    let rest = &trimmed[8..];
    !rest.is_empty() && rest.contains('/') && !rest.contains(' ')
}

pub fn create_dns_snapshot(adapter_name: &str, current_config: &DnsAdapterConfig) -> DnsRollbackSnapshot {
    DnsRollbackSnapshot {
        adapter_name: adapter_name.to_string(),
        was_dhcp: current_config.is_dhcp,
        primary_dns: current_config.primary.clone(),
        secondary_dns: current_config.secondary.clone(),
        applied_at: chrono::Utc::now().to_rfc3339(),
    }
}

pub fn set_adapter_dns_static(adapter_name: &str, primary: &str, secondary: Option<&str>) -> Result<(), NetworkError> {
    if !is_valid_ip(primary) {
        return Err(NetworkError::InvalidIp(primary.to_string()));
    }
    if let Some(sec) = secondary {
        if !sec.is_empty() && !is_valid_ip(sec) {
            return Err(NetworkError::InvalidIp(sec.to_string()));
        }
    }

    #[cfg(windows)]
    {
        // Execute netsh commands cleanly
        use std::process::Command;
        let set_primary = Command::new("netsh")
            .args(&["interface", "ipv4", "set", "dnsservers", adapter_name, "static", primary, "primary"])
            .output()?;

        if !set_primary.status.success() {
            let err = String::from_utf8_lossy(&set_primary.stderr);
            return Err(NetworkError::AdapterConfig(format!("Failed to set primary DNS: {}", err)));
        }

        if let Some(sec) = secondary {
            if !sec.is_empty() {
                let _ = Command::new("netsh")
                    .args(&["interface", "ipv4", "add", "dnsservers", adapter_name, sec, "index=2"])
                    .output();
            }
        }
    }

    Ok(())
}

pub fn reset_adapter_dns_dhcp(adapter_name: &str) -> Result<(), NetworkError> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let res = Command::new("netsh")
            .args(&["interface", "ipv4", "set", "dnsservers", adapter_name, "dhcp"])
            .output()?;

        if !res.status.success() {
            let err = String::from_utf8_lossy(&res.stderr);
            return Err(NetworkError::AdapterConfig(format!("Failed to reset DNS to DHCP: {}", err)));
        }
    }

    Ok(())
}
