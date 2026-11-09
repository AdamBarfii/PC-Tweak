use crate::catalog::DnsServerPreset;
use crate::error::NetworkError;
use crate::packet::{DnsPacket, DnsQueryType};
use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DnsBenchmarkMetric {
    pub server_id: String,
    pub server_name: String,
    pub primary_ip: String,
    pub secondary_ip: String,
    pub category: String,
    pub min_ms: f64,
    pub median_ms: f64,
    pub p95_ms: f64,
    pub max_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss_pct: f64,
    pub is_fastest: bool,
}

pub fn query_dns_udp(server_ip: &str, domain: &str, timeout_dur: Duration) -> Result<Duration, NetworkError> {
    let socket_addr = format!("{}:53", server_ip);
    let target: SocketAddr = socket_addr.parse()
        .map_err(|_| NetworkError::InvalidIp(server_ip.to_string()))?;

    let local_bind = if target.is_ipv4() { "0.0.0.0:0" } else { "[::]:0" };
    let socket = UdpSocket::bind(local_bind)?;
    socket.set_read_timeout(Some(timeout_dur))?;
    socket.set_write_timeout(Some(timeout_dur))?;
    socket.connect(target)?;

    let packet = DnsPacket::new_query(0x1234, domain, DnsQueryType::A);
    let bytes = packet.to_bytes();

    let start = Instant::now();
    socket.send(&bytes)?;

    let mut buf = [0u8; 512];
    match socket.recv(&mut buf) {
        Ok(n) => {
            let elapsed = start.elapsed();
            let _ = DnsPacket::parse(&buf[..n])?;
            Ok(elapsed)
        }
        Err(e) if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock => {
            Err(NetworkError::Packet("DNS query timed out".into()))
        }
        Err(e) => Err(NetworkError::Io(e)),
    }
}

pub fn calculate_rfc3550_jitter(latencies: &[f64]) -> f64 {
    if latencies.len() < 2 {
        return 0.0;
    }

    let mut jitter = 0.0;
    for i in 1..latencies.len() {
        let diff = (latencies[i] - latencies[i - 1]).abs();
        jitter += (diff - jitter) / 16.0;
    }
    jitter
}

pub fn benchmark_server(preset: &DnsServerPreset, domains: &[&str], sample_count: usize) -> DnsBenchmarkMetric {
    let mut latencies: Vec<f64> = Vec::new();
    let mut failures = 0;
    let timeout = Duration::from_millis(800);

    for &domain in domains {
        for _ in 0..sample_count {
            match query_dns_udp(&preset.primary, domain, timeout) {
                Ok(dur) => latencies.push(dur.as_secs_f64() * 1000.0),
                Err(_) => failures += 1,
            }
        }
    }

    let total_attempts = (domains.len() * sample_count).max(1);
    let packet_loss_pct = (failures as f64 / total_attempts as f64) * 100.0;

    if latencies.is_empty() {
        return DnsBenchmarkMetric {
            server_id: preset.id.clone(),
            server_name: preset.name.clone(),
            primary_ip: preset.primary.clone(),
            secondary_ip: preset.secondary.clone(),
            category: preset.category.clone(),
            min_ms: 999.0,
            median_ms: 999.0,
            p95_ms: 999.0,
            max_ms: 999.0,
            jitter_ms: 0.0,
            packet_loss_pct,
            is_fastest: false,
        };
    }

    let mut sorted = latencies.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let min_ms = sorted[0];
    let max_ms = sorted[sorted.len() - 1];

    let mid = sorted.len() / 2;
    let median_ms = if sorted.len() % 2 == 0 {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    };

    let p95_idx = ((sorted.len() as f64 * 0.95).floor() as usize).min(sorted.len() - 1);
    let p95_ms = sorted[p95_idx];
    let jitter_ms = calculate_rfc3550_jitter(&latencies);

    DnsBenchmarkMetric {
        server_id: preset.id.clone(),
        server_name: preset.name.clone(),
        primary_ip: preset.primary.clone(),
        secondary_ip: preset.secondary.clone(),
        category: preset.category.clone(),
        min_ms,
        median_ms,
        p95_ms,
        max_ms,
        jitter_ms,
        packet_loss_pct,
        is_fastest: false,
    }
}

pub fn benchmark_all_presets(presets: &[DnsServerPreset]) -> Vec<DnsBenchmarkMetric> {
    let domains = ["google.com", "cloudflare.com", "microsoft.com"];
    let mut handles = Vec::new();

    for preset in presets {
        let p = preset.clone();
        handles.push(std::thread::spawn(move || {
            benchmark_server(&p, &domains, 2)
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        if let Ok(res) = handle.join() {
            results.push(res);
        }
    }

    // Flag the lowest median latency as fastest
    if let Some(fastest) = results.iter_mut()
        .filter(|r| r.packet_loss_pct < 100.0)
        .min_by(|a, b| a.median_ms.partial_cmp(&b.median_ms).unwrap_or(std::cmp::Ordering::Equal)) {
        fastest.is_fastest = true;
    }

    results
}
