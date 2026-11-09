use crate::error::NetworkError;
use std::net::{Ipv4Addr, Ipv6Addr};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DnsQueryType {
    A = 1,
    AAAA = 28,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DnsHeader {
    pub id: u16,
    pub qr: bool,
    pub opcode: u8,
    pub aa: bool,
    pub tc: bool,
    pub rd: bool,
    pub ra: bool,
    pub rcode: u8,
    pub qd_count: u16,
    pub an_count: u16,
    pub ns_count: u16,
    pub ar_count: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DnsQuestion {
    pub name: String,
    pub qtype: DnsQueryType,
    pub qclass: u16, // IN = 1
}

#[derive(Debug, Clone, PartialEq)]
pub enum DnsRecordData {
    A(Ipv4Addr),
    AAAA(Ipv6Addr),
    Raw(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct DnsAnswer {
    pub name: String,
    pub rtype: u16,
    pub rclass: u16,
    pub ttl: u32,
    pub data: DnsRecordData,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DnsPacket {
    pub header: DnsHeader,
    pub questions: Vec<DnsQuestion>,
    pub answers: Vec<DnsAnswer>,
}

impl DnsPacket {
    pub fn new_query(id: u16, domain: &str, qtype: DnsQueryType) -> Self {
        Self {
            header: DnsHeader {
                id,
                qr: false, // Query
                opcode: 0, // Standard query
                aa: false,
                tc: false,
                rd: true,  // Recursion Desired
                ra: false,
                rcode: 0,
                qd_count: 1,
                an_count: 0,
                ns_count: 0,
                ar_count: 0,
            },
            questions: vec![DnsQuestion {
                name: domain.to_string(),
                qtype,
                qclass: 1, // IN
            }],
            answers: Vec::new(),
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(512);

        // Header: 12 bytes
        buf.extend_from_slice(&self.header.id.to_be_bytes());

        let mut flags: u16 = 0;
        if self.header.qr { flags |= 1 << 15; }
        flags |= ((self.header.opcode & 0x0F) as u16) << 11;
        if self.header.aa { flags |= 1 << 10; }
        if self.header.tc { flags |= 1 << 9; }
        if self.header.rd { flags |= 1 << 8; }
        if self.header.ra { flags |= 1 << 7; }
        flags |= (self.header.rcode & 0x0F) as u16;

        buf.extend_from_slice(&flags.to_be_bytes());
        buf.extend_from_slice(&(self.questions.len() as u16).to_be_bytes());
        buf.extend_from_slice(&(self.answers.len() as u16).to_be_bytes());
        buf.extend_from_slice(&self.header.ns_count.to_be_bytes());
        buf.extend_from_slice(&self.header.ar_count.to_be_bytes());

        // Questions
        for q in &self.questions {
            encode_domain_name(&q.name, &mut buf);
            buf.extend_from_slice(&(q.qtype as u16).to_be_bytes());
            buf.extend_from_slice(&q.qclass.to_be_bytes());
        }

        buf
    }

    pub fn parse(bytes: &[u8]) -> Result<Self, NetworkError> {
        if bytes.len() < 12 {
            return Err(NetworkError::Packet("Packet too short for DNS header".into()));
        }

        let id = u16::from_be_bytes([bytes[0], bytes[1]]);
        let flags = u16::from_be_bytes([bytes[2], bytes[3]]);
        let qd_count = u16::from_be_bytes([bytes[4], bytes[5]]);
        let an_count = u16::from_be_bytes([bytes[6], bytes[7]]);
        let ns_count = u16::from_be_bytes([bytes[8], bytes[9]]);
        let ar_count = u16::from_be_bytes([bytes[10], bytes[11]]);

        let header = DnsHeader {
            id,
            qr: (flags & (1 << 15)) != 0,
            opcode: ((flags >> 11) & 0x0F) as u8,
            aa: (flags & (1 << 10)) != 0,
            tc: (flags & (1 << 9)) != 0,
            rd: (flags & (1 << 8)) != 0,
            ra: (flags & (1 << 7)) != 0,
            rcode: (flags & 0x0F) as u8,
            qd_count,
            an_count,
            ns_count,
            ar_count,
        };

        let mut offset = 12;
        let mut questions = Vec::with_capacity(qd_count as usize);

        for _ in 0..qd_count {
            let (name, next_offset) = decode_domain_name(bytes, offset)?;
            offset = next_offset;
            if offset + 4 > bytes.len() {
                return Err(NetworkError::Packet("Truncated DNS question".into()));
            }
            let qtype_num = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
            let qclass = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]);
            offset += 4;

            let qtype = match qtype_num {
                1 => DnsQueryType::A,
                28 => DnsQueryType::AAAA,
                _ => DnsQueryType::A,
            };
            questions.push(DnsQuestion { name, qtype, qclass });
        }

        let mut answers = Vec::with_capacity(an_count as usize);
        for _ in 0..an_count {
            if offset >= bytes.len() { break; }
            let (name, next_offset) = decode_domain_name(bytes, offset)?;
            offset = next_offset;
            if offset + 10 > bytes.len() {
                return Err(NetworkError::Packet("Truncated DNS answer header".into()));
            }
            let rtype = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
            let rclass = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]);
            let ttl = u32::from_be_bytes([bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]]);
            let rd_length = u16::from_be_bytes([bytes[offset + 8], bytes[offset + 9]]) as usize;
            offset += 10;

            if offset + rd_length > bytes.len() {
                return Err(NetworkError::Packet("Truncated DNS answer data".into()));
            }

            let rdata_bytes = &bytes[offset..offset + rd_length];
            offset += rd_length;

            let data = match rtype {
                1 if rd_length == 4 => {
                    DnsRecordData::A(Ipv4Addr::new(rdata_bytes[0], rdata_bytes[1], rdata_bytes[2], rdata_bytes[3]))
                }
                28 if rd_length == 16 => {
                    let mut octets = [0u8; 16];
                    octets.copy_from_slice(rdata_bytes);
                    DnsRecordData::AAAA(Ipv6Addr::from(octets))
                }
                _ => DnsRecordData::Raw(rdata_bytes.to_vec()),
            };

            answers.push(DnsAnswer { name, rtype, rclass, ttl, data });
        }

        Ok(Self { header, questions, answers })
    }
}

fn encode_domain_name(domain: &str, buf: &mut Vec<u8>) {
    for label in domain.trim_end_matches('.').split('.') {
        let len = label.len();
        if len > 63 {
            buf.push(63);
            buf.extend_from_slice(&label.as_bytes()[..63]);
        } else {
            buf.push(len as u8);
            buf.extend_from_slice(label.as_bytes());
        }
    }
    buf.push(0); // Root label null terminator
}

fn decode_domain_name(bytes: &[u8], mut offset: usize) -> Result<(String, usize), NetworkError> {
    let mut labels = Vec::new();
    let mut jumped = false;
    let mut return_offset = offset;
    let mut jumps_performed = 0;

    loop {
        if offset >= bytes.len() {
            return Err(NetworkError::Packet("Unexpected EOF in domain name".into()));
        }

        let len = bytes[offset];
        if len == 0 {
            if !jumped {
                return_offset = offset + 1;
            }
            break;
        }

        // Pointer compression: 0xC0
        if (len & 0xC0) == 0xC0 {
            if offset + 1 >= bytes.len() {
                return Err(NetworkError::Packet("Truncated compression pointer".into()));
            }
            let ptr_offset = (((len & 0x3F) as usize) << 8) | (bytes[offset + 1] as usize);
            if !jumped {
                return_offset = offset + 2;
                jumped = true;
            }
            offset = ptr_offset;
            jumps_performed += 1;
            if jumps_performed > 10 {
                return Err(NetworkError::Packet("DNS compression pointer loop detected".into()));
            }
            continue;
        }

        offset += 1;
        let label_len = len as usize;
        if offset + label_len > bytes.len() {
            return Err(NetworkError::Packet("Truncated domain label".into()));
        }

        let label = std::str::from_utf8(&bytes[offset..offset + label_len])
            .map_err(|_| NetworkError::Packet("Invalid UTF-8 in domain label".into()))?;
        labels.push(label);
        offset += label_len;

        if !jumped {
            return_offset = offset;
        }
    }

    Ok((labels.join("."), return_offset))
}
