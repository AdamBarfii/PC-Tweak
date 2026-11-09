use pctweak_network::packet::{DnsPacket, DnsQueryType, DnsRecordData};
use std::net::Ipv4Addr;

#[test]
fn test_encode_and_parse_query() {
    let query = DnsPacket::new_query(0xABCD, "google.com", DnsQueryType::A);
    let bytes = query.to_bytes();

    assert!(bytes.len() >= 12);
    assert_eq!(bytes[0], 0xAB);
    assert_eq!(bytes[1], 0xCD);

    let parsed = DnsPacket::parse(&bytes).expect("Failed to parse encoded query");
    assert_eq!(parsed.header.id, 0xABCD);
    assert_eq!(parsed.header.qd_count, 1);
    assert_eq!(parsed.questions.len(), 1);
    assert_eq!(parsed.questions[0].name, "google.com");
    assert_eq!(parsed.questions[0].qtype, DnsQueryType::A);
}

#[test]
fn test_parse_mock_dns_response_with_pointer_compression() {
    // Construct a synthetic DNS response for "example.com" resolving to 93.184.216.34
    // Header (12 bytes)
    let mut packet = vec![
        0x12, 0x34, // ID
        0x81, 0x80, // Standard response, No error (QR=1, RD=1, RA=1)
        0x00, 0x01, // QDCOUNT = 1
        0x00, 0x01, // ANCOUNT = 1
        0x00, 0x00, // NSCOUNT = 0
        0x00, 0x00, // ARCOUNT = 0
    ];

    // Question: "example.com", Type A, Class IN
    // Offset 12: 7 'example' 3 'com' 0
    packet.extend_from_slice(&[7, b'e', b'x', b'a', b'm', b'p', b'l', b'e', 3, b'c', b'o', b'm', 0]);
    packet.extend_from_slice(&[0x00, 0x01, 0x00, 0x01]); // Type A, Class IN

    // Answer: Name using pointer 0xC00C (pointing to offset 12 "example.com")
    packet.extend_from_slice(&[0xC0, 0x0C]); // Pointer to offset 12
    packet.extend_from_slice(&[0x00, 0x01, 0x00, 0x01]); // Type A, Class IN
    packet.extend_from_slice(&[0x00, 0x00, 0x01, 0x2C]); // TTL = 300
    packet.extend_from_slice(&[0x00, 0x04]); // RDLENGTH = 4
    packet.extend_from_slice(&[93, 184, 216, 34]); // 93.184.216.34

    let parsed = DnsPacket::parse(&packet).expect("Failed to parse response");
    assert_eq!(parsed.header.id, 0x1234);
    assert!(parsed.header.qr);
    assert_eq!(parsed.questions.len(), 1);
    assert_eq!(parsed.questions[0].name, "example.com");

    assert_eq!(parsed.answers.len(), 1);
    assert_eq!(parsed.answers[0].name, "example.com");
    assert_eq!(parsed.answers[0].rtype, 1);
    assert_eq!(parsed.answers[0].ttl, 300);
    assert_eq!(parsed.answers[0].data, DnsRecordData::A(Ipv4Addr::new(93, 184, 216, 34)));
}
