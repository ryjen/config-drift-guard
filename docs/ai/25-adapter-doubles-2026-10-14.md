# Session 25 — Port-typed DriftAdapter test doubles

**Date:** 2026-10-14
**User request (verbatim):** Proceed
**Scope:** Issue #1 Phase 4b
**Record:** Bounded implementation summary, not a complete chat export.

## Decision

Remove inheritance-based failure adapters from the workflow executor and canonical-staleness test suites. Compose test doubles as objects satisfying the inward `DriftAdapter` interface, using a delegating helper that overrides only specified methods. Existing real adapters still provide file-backed behavior for unaffected operations, preserving workflow integration coverage.

Tests for malformed canonical state, failed atomic application, failed convergence verification, and changed canonical resource identity use the typed helper instead of extending `ServiceConfigAdapter`. No production API or adapter implementation changes are authorized for this slice.

## Verification

Require exact-head CI to pass Biome, TypeScript, production build, and the full test suite before merge. Independent code reviews remain skipped under the user's instruction, but CI and tests are mandatory. Phase 4c route tests remain pending.
