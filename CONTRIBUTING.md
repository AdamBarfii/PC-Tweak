# Contributing to PC Tweak

Thank you for your interest in contributing to **PC Tweak**! We welcome bug reports, feature suggestions, documentation enhancements, and pull requests.

---

## Code of Conduct & Core Principles

Before contributing, please review our foundational principles:
1. **Zero Fake Telemetry:** Mock hardware strings, fabricated sparklines, and simulated metrics in place of real hardware queries are strictly forbidden. Telemetry must always reflect real Windows subsystem data.
2. **Anti-Cheat Safety:** No game process hooking, memory tampering, or kernel-level modifications. All tweaks must be safe for competitive esports environments (Vanguard, EAC, BattlEye, FACEIT).
3. **Non-Destructive Safety:** Overclocking features must enforce the zero-overvolting policy (+0 mV locked) and session-only in-memory adjustments.
4. **Clean Code Hygiene:** Maintain documentation integrity, avoid generic AI-slop comments, and adhere strictly to TypeScript type safety. Do not use em dashes in user-facing prose.

---

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AdamBarfii/PC-Tweak.git
   cd PC-Tweak
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## Testing & Verification

Every pull request must pass the entire automated test suite:

1. **Run Unit & Integration Tests:**
   ```bash
   node --test tests/*.test.mjs
   ```
   *(All 380+ tests must pass).*

2. **Run Typecheck:**
   ```bash
   npx tsc --noEmit
   ```

3. **Verify Telemetry Integrity:**
   ```bash
   node --test tests/telemetryIntegrity.test.mjs
   ```

4. **Verify Production Build:**
   ```bash
   npm run build
   ```

---

## Pull Request Guidelines

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit your changes with clear, semantic commit messages:
   * `feat: add GPU hotspot thermal telemetry`
   * `fix: correct build number detection for Windows 11 24H2`
   * `test: add unit tests for safe offset clamping`
3. Push to your fork and submit a Pull Request targeting the `main` branch.
