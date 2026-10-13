# Session 15 — Domain error extraction (Clean Architecture phase 1a)

**Date:** 2026-10-12

**Original user prompt (verbatim):** `Proceed with issues`

**Scope:** Config Drift Guard #1, Phase 1a, independent of #7 SSE PR #19.

This is an engineering summary, **not a complete conversation transcript**.

## Decision

Extract `StaleRemediationPlanError` into `@config-drift-guard/contracts` as a shared immutable error type. API adapters and the workflow orchestrator import this error from the contracts boundary rather than a concrete `ServiceConfigAdapter`. Preserve the existing constructor arguments, `instanceof` semantics and error message. Add a contract-unit regression for error identity and preserved digests.

This deliberately does not relocate application ports into the contracts package: ports referencing drift-engine domain types would invert the package-level dependency boundary. That design decision is recorded in issue #1 for its later phase.

## Verification

Exact-head CI must pass before integration. No CLI build execution is claimed for this PR prior to GitHub Actions results.

## Next steps

Phase 1b will move narrow interfaces to an inward application module or appropriate shared type boundary, followed by explicit adapter injection. Demo-only pacing (#2) can then be injected from the runtime composition layer without mixing demo concerns into domain logic.
