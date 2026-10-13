# Session 16 — Application ports and explicit adapter injection

**Date:** 2026-10-13
**User prompt (verbatim):** proceed with modernization
**Scope:** Issue #1, next Clean Architecture slice after Phase 1a.
**Record type:** Engineering summary, not a complete verbatim transcript.

## Architecture decision
Keep wire schemas/domain errors in contracts and pure drift types in drift-engine. Define RunStateStore, WorkflowRepository, DriftAdapter and ApplyResult in apps/api/src/application/ports.ts with type-only inward dependencies; avoid a reverse contracts-to-drift-engine package dependency. State machine and executor depend on ports, not concrete persistence/adapter implementations. Both adapters implement DriftAdapter. WorkflowExecutor now always receives an explicit adapter from the application composition root.

This is intended as structural refactoring with no runtime change. Demo timing and route extraction remain separate issues.

## Evidence
Isolated git worktree on current main. Workspace TypeScript typechecks and production builds passed. Locally all Vitest suites passed: API 43, contracts 5, drift engine 10, web 3 (61 total). Exact-head GitHub Actions lint/CI still required.

## Next
Continue issue #1 with orchestration/routing and issue #2 with injected demo pacing in independent PRs. No claim of browser E2E execution for this slice.
