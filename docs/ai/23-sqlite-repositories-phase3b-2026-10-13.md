# Session 23 — Phase 3b SQLite repository extraction

**Date:** 2026-10-13
**User prompt (verbatim):** proceed with deliver to done for phase 3
**Scope:** Config Drift Guard issue #1 Phase 3b
**Record:** Engineering summary, not a full chat transcript.

## Decision

Extract SQLite environment catalog and fixture seeding to `SqliteEnvironmentRepository`, and durable append/replay to `SqliteEventRepository`. Keep run state, findings, plan creation, and approval/rejection multi-table transitions in `SqliteRunRepository`. Existing consumers continue importing `PersistenceRepository` as a compatibility alias. The container explicitly composes the three repositories with one AppDatabase and a separate RunEventBus.

The facade retains backwards-compatible environment lookup, seeding, append and durable replay until consumers can migrate to the narrow ports. Remove its live-subscription method, so run storage has no direct live-listener API; tests subscribe through RunEventBus. In-process event notifications still occur at their previous point in event insertion, preserving existing ordering. Durable replay checks the run existence independently.

This split is intentionally **not** three independent databases or transactions. Cross-table decisions remain atomic inside the run repository; environment and event stores share the same handle. Do not change schemas, migration code, authorization or public REST endpoints.

## Verification

Local TypeScript, build and 74 tests passed before renaming and added integration regression. New test verifies independently typed storage views, live event fanout, unsubscribe and durable replay after unsubscribe. Exact-head hosted lint, typecheck, build, tests and Chromium E2E required before merge because replay storage and SSE wiring are affected.

## Follow-up

Phase 4 covers database-free state machine stubs, mock adapters and route contract tests. The original-implementation tag is unchanged.

## Final qualification requirement

PR #28 carries the same-repository opt-in `ci:e2e` label. Because this refactor extracts durable event storage consumed by SSE, the exact PR head must run and pass both real Chromium workflows in the hosted CI job in addition to `pnpm check`. This is a pending acceptance gate, not a claim of browser validation. The original `original-implementation` tag remains untouched.

## Verified integration outcome

[PR #28](https://github.com/ryjen/config-drift-guard/pull/28) merged as `8734f13a090901fa153c3fe0ea1d976a7625f17f`. Exact-head [CI #115](https://github.com/ryjen/config-drift-guard/actions/runs/38369912285) passed lint, typechecking, production builds, 75 tests, and 2/2 real Chromium Playwright scenarios covering terminal SSE cleanup and stale-plan recovery. `main` was separately checked for the three concrete repositories and container composition. This closes issue #1 Phase 3 while preserving Phase 4. The user instructed skipping independent code reviews; verification gates were still applied. The `original-implementation` tag is unchanged.
