# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## Anti-Cheat Safety Architecture

PC Tweak operates under a strict **Zero-Game-Process Intervention** policy:
* **No Handle Injection:** PC Tweak never opens process handles (`PROCESS_ALL_ACCESS`, `PROCESS_VM_WRITE`, etc.) to running game binaries.
* **No Code Hooking:** No memory modifications, function detours, or thread injections.
* **No Kernel Driver Signing Bypass:** Test signing (`TESTSIGNING`) and driver signature enforcement bypasses are strictly forbidden.
* **Vendor Compatibility:** Read-only compliance verification for Riot Vanguard, Easy Anti-Cheat (EAC), BattlEye, and FACEIT.

Any pull request or modification that attempts to inject into games, disable anti-cheat modules, or violate vendor Terms of Service will be immediately rejected.

---

## Hardware Safety Policy (Overclocking)

The Overclocking engine enforces non-destructive hardware guardrails:
1. **Zero Overvolting:** Voltage modification is strictly hard-locked at factory stock (+0 mV).
2. **Boot-Loop Immunity:** Offsets operate purely in active memory at the driver level during the active session. No changes are written to vBIOS, BIOS, or NVRAM.
3. **100ms Thermal Tripwire:** Active background watchdog checks temperatures every 100ms. If GPU core temp exceeds 80°C, hotspot exceeds 92°C, or CPU exceeds 85°C, clocks immediately drop to factory defaults.
4. **Safe Envelopes:** Hardware offsets are clamped to vendor-safe maximums (+120 MHz Core, +350 MHz Memory, 105% Power Target).

---

## Reporting a Vulnerability

If you discover a security vulnerability or anti-cheat conflict in PC Tweak:
1. Please do **NOT** open a public issue.
2. Email your report to: `security@pctweak.local` or open a private security advisory through GitHub Security Advisories.
3. Provide a clear description of the vulnerability, affected modules, and reproduction steps.
4. We aim to acknowledge reports within 48 hours and release fixes promptly.
