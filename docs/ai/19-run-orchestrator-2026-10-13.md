# Session 19 — RunOrchestrator use-case extraction

**Date:** 2026-10-13
**User prompt (verbatim):** proceed
**Scope:** issue #1 Phase 2b — RunOrchestrator
**Record:** Engineering activity summary; not a verbatim transcript.

## Design

Move workflow creation, duplicate-run guards, reset preconditions, approval/rejection idempotency, active-run state decisions, and background scheduling into the explicitly injected RunOrchestrator application service. The use case depends on RunOrchestratorRepository, ResettableDriftAdapter and a WorkflowScheduler/RunExecutorFactory, never Fastify or the concrete SQLite class. Keep HTTP status/error-envelope mapping, body validation, CORS, SSE replay and stream teardown in the Fastify adapter.

Preserve the atomic uniqueness constraint as the final authority even if the preliminary active-run guard passes. Preserve existing approval conflict/idempotence behavior and defer workflow execution after the queued run is persisted.

No changes to authentication policy or public API schemas; no user data migrations. Keep the original-implementation annotated tag unchanged.

## Evidence

Behavior is covered by existing API integration tests plus new database-free orchestrator unit tests for deferred scheduling, environment/run guards, idempotence, reconciliation scheduling, and missing-run outcomes. Exact-head CI must pass TypeScript, lint, production builds and tests before merge. This is not an independent code-review claim; review was skipped under the user's standing instruction.

## Remaining phases

Phase 2c: extract route registrars (health, environments, runs, SSE), with direct SSE bus injection. Phase 2d: explicit AppContainer. Phase 3: narrow repository ports. Phase 4: database-free state-machine stubs and route contract tests.
