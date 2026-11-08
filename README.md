# PC Tweak

An open, high-performance Windows optimization, telemetry, and non-destructive tweaking application built with Electron, React, TypeScript, and Tailwind CSS.

---

## Key Features

### 1. Zero-Harm Safe Overclocking & Performance Analytics Suite
* **Zero Overvolting:** Voltage adjustment is strictly hard-locked at factory stock (+0 mV) to eliminate silicon degradation risks.
* **Boot-Loop Immunity:** Offsets operate purely in active memory at the driver level during the active Windows session. No changes are written to vBIOS, BIOS, or NVRAM. Any system reboot restores 100% factory defaults.
* **100ms Thermal Tripwire:** Active watchdog monitors GPU temperature (< 80°C), hotspot (< 92°C), and CPU temperature (< 85°C), reverting clocks back to stock within 100ms if thresholds are breached.
* **Safe Vendor Clamping:** GPU Core offset clamped to `[-50, +120 MHz]`, Memory offset to `[0, +350 MHz]`, and Power limit to `[100%, 105%]`.
* **Hardware Telemetry Cockpit:** Live readings for Core Clock, Memory Clock, GPU Temp, Power Draw (Watts), and Fan RPM.
* **Silicon Stability Index & Headroom Analytics:** Live thermal headroom margin to 80°C, Silicon Stability Index (`Grade A+`), estimated FPS gains, and memory bandwidth delta (+GB/s).

### 2. High-Precision Input Lab & Native Raw Input
* **Sub-millisecond Polling & Jitter Analysis:** Native C++ raw input sampler (`pctweak-rawinput.exe`) measuring true mouse packet rate, variance, and dropped frames.
* **Windows SPI Scaling:** Accurate mathematical mapping across all 11 mouse pointer speed notches with enhanced pointer precision toggling.
* **DirectX & Presentation Optimizations:** Max frame latency configuration, modern DXGI flip model upgrade, and elevated shader cache buffers.

### 3. System Optimizer & Gaming Engine
* **Working Set RAM Trimming:** Non-destructive working set memory compaction without process killing.
* **Junk Cleaner:** Safe removal of temporary clutter, crash dumps, and shader caches.
* **Service & Task Auditor:** Identifies orphaned services and telemetry updaters with safe toggling and rollback.
* **Esports CPU Affinity & MSI Interrupts:** Dedicated Message Signaled Interrupts (MSI-X) allocation and CPU thread isolation.

### 4. Anti-Cheat Safety & Compatibility Guardrails
* **Zero Process Injection:** PC Tweak operates with strict zero-game-process intervention (no handle injection, no code hooking, no kernel drivers).
* **Compliance Checks:** Read-only system state inspection for Secure Boot, TPM 2.0, HVCI/VBS, and official verification for Vanguard, Easy Anti-Cheat, and BattlEye.

---

## Tech Stack
* **Framework:** Electron 33 + Vite 6
* **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Zustand
* **Localization:** i18next (English & Persian)
* **Testing:** Node.js native test runner (`node:test`, 380+ automated unit tests)
* **Packaging:** electron-builder (NSIS Installer & Portable x64)

---

## Development & Building

### Prerequisites
* Windows 10 (Build 19041+) or Windows 11 (22H2 / 23H2 / 24H2)
* Node.js 20+

### Setup
```bash
npm install
```

### Run in Development
```bash
npm run dev
```

### Run Tests
```bash
node --test tests/*.test.mjs
```

### Build Production Binary & Installer
```bash
npm run build
npm run dist
```
Installer outputs to `release/PC Tweak Setup 1.0.0.exe`.

---

## License
MIT License.
