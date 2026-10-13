# Session 22 — Phase 3a repository interfaces

**Date:** 2026-10-13
**Request (verbatim):** proceed with deliver to done for phase 3
**Scope:** Config Drift Guard issue #1 Phase 3a
**Record:** Bounded engineering activity log; not a verbatim chat transcript.

## Decision

Publish EnvironmentRepository, RunRepository, EventRepository and PersistencePorts as pure, type-only domain contracts. Implement these on the existing PersistenceRepository so existing SQLite transactions, concurrency and event publication remain unchanged. No dependency from contracts to drift-engine or infrastructure is introduced.

Actual implementation shapes take precedence over the stale illustration in issue #1: replay cursors are numeric event IDs; environment lookup returns Environment | null; fixture-specific environment seeding stays in the infrastructure composition boundary, rather than inventing a generic seedEnvironment method. WorkflowRepository needs only RunStateStore and its own findings/plan/snapshot methods, RunOrchestratorRepository consumes a selected subset of EnvironmentRepository and RunRepository, and the SSE route consumes EventRepository plus the minimal getRun guard.

This separation preserves the existing application ports and route behavior while establishing compile-checked interfaces for Phase 3b concrete implementation separation.

## Verification

Local workspace typecheck and production build passed, and all 73 existing tests passed. Added a segregated-view integration regression proving the typed environment, run and event readers observe the same in-memory SQLite run and durable replay without duplicating storage. Exact-head GitHub Actions checks must pass before merge. The user's prior instruction to skip independent code reviews remains in effect; CI is not waived.

## Follow-up

Phase 3b should extract concrete environment and durable event storage into separate SQLite-backed classes, preserving the single database transaction domain for run transitions. Avoid dividing multi-table approval/rejection transactions across independent commit boundaries.
