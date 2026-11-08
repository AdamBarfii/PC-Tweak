## Description
Provide a brief summary of the changes made in this pull request and the problem they solve.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Performance optimization / telemetry improvement
- [ ] Documentation update

## Verification Checklist
- [ ] My code adheres to the project's code hygiene guidelines (no generic AI-slop comments, preserve existing comments).
- [ ] All 380+ unit and integration tests pass (`node --test tests/*.test.mjs`).
- [ ] TypeScript typecheck passes with zero errors (`npx tsc --noEmit`).
- [ ] Verified Telemetry Integrity: Zero hardcoded mock hardware strings (`node --test tests/telemetryIntegrity.test.mjs`).
- [ ] Anti-Cheat Safety: No process handle injection, function hooking, or kernel tampering.
- [ ] Overclocking Guardrails: Enforces locked voltage (+0 mV) and session-only in-memory adjustments.
- [ ] Verified production build succeeds (`npm run build`).
