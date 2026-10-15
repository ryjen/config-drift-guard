# Session 24 — Database-free state-machine testing

**Date:** 2026-10-14
**User request (verbatim):** Proceed
**Scope:** Issue #1 Phase 4a, after Phase 3 completion
**Record:** Bounded engineering summary, not a verbatim conversation export.

## Decision

Replace `state-machine.test.ts`'s dependency on in-memory SQLite and concrete repository fixtures with `StubRunStateStore` in `apps/api/src/__tests__/stub-store.ts`. The stub implements only the shared `RunStateStore` port, maintaining synthetic run status and digest changes plus a record of step updates and skipped-run requests. No production code, storage schema, migration, event publication or HTTP behavior is changed.

Existing legal and illegal transition checks are retained. Additional assertions prove canonical/observed digests, failed-step forwarding and absence of state mutation after forbidden transitions. Other suites still cover real SQLite transactions, integrations, SSE and browser workflows.

## Verification

Exact-head CI must run Biome lint, TypeScript, production build and full tests. Do not claim verified results before completion. Independent code review is skipped under the user's standing instruction; CI remains mandatory.

## Remaining work

Phase 4b: mock adapters through `DriftAdapter` without extending concrete adapter classes. Phase 4c: isolated route contract tests with mocked orchestrators. The original-implementation tag remains unchanged.
