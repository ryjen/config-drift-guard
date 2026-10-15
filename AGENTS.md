# Agent Notes

## Commands

All commands require `corepack` prefix (`pnpm` is not directly available):

```
corepack pnpm install
corepack pnpm lint          # Biome, fast
corepack pnpm typecheck     # tsc --noEmit across 4 packages
corepack pnpm build         # tsc + next build across 4 packages
corepack pnpm test          # Vitest across 4 packages (in-memory SQLite)
corepack pnpm check         # lint → typecheck → build → test (full gate)
corepack pnpm dev           # API on 127.0.0.1:4000, web on 127.0.0.1:3000
```

Root `check` is the single verification command. Run it before committing.

## Workspace Layout

```
pnpm-workspace.yaml         # apps/* + packages/*
packages/contracts/          # Zod schemas + TS types (run, step, finding, plan, decision, event, snapshot)
packages/drift-engine/       # Pure comparison engine — zero runtime deps, only node:crypto
apps/api/                    # Fastify 5, SQLite via Drizzle, adapters, state machine, workflow executor
apps/web/                    # Next.js 15, single-page operator console ("use client")
```

- `packages/contracts` and `packages/drift-engine` are imported via `workspace:*` — build them first if doing incremental work.
- `apps/web` depends on `packages/contracts` only. It does NOT depend on drift-engine.
- `apps/api` depends on both contracts and drift-engine.

## Architecture Quick Reference

**State machine** (`apps/api/src/state-machine.ts`): Pure functions, no class. Operates on `RunStateStore` interface. Every transition is guarded.

**Workflow executor** (`apps/api/src/workflow-executor.ts`): One class, two methods: `execute()` (6 scan steps) and `executeReconciliation()` (3 post-approval steps). Has an optional `WorkflowPacer` injection; demo-specific delays are not built into the executor.

**Adapters** (`apps/api/src/adapters/`): `ServiceConfigAdapter` and `DocumentationAdapter`. Each implements `loadCanonical`, `loadObserved`, `validateCanonical`, `normalizeCanonical`, `normalizeObserved`, `applyTarget`, `resetObserved`.

**Drift engine** (`packages/drift-engine/src/index.ts`): Pure functions only. Compares `NormalizedResourceState` objects. `SERVICE_CONFIG_MANAGED_FIELDS = ["image", "replicas", "environment"]`. Digests are SHA-256 of canonical JSON over managed fields only.

**Application boundary** (`apps/api/src/`): `run-orchestrator.ts` owns run decisions; `container.ts` composes adapters, scheduling and shutdown; `app.ts` (~48 lines) configures Fastify and registers thin handlers in `routes/`. The optional demo pacer is composed only by `demo/runtime.ts` with `DEMO_MODE=1`.

**Repository ports** (`packages/contracts/src/ports.ts`, `apps/api/src/application/ports.ts`): `EnvironmentRepository`, `RunRepository`, `EventRepository` and `PersistencePorts` keep domain types infrastructure-independent. `WorkflowRepository` and `RunOrchestratorRepository` consume narrower subsets. The SSE route reads durable events via an event-read port and subscribes to live notifications through `RunEventBusPort`.

**Persistence** (`apps/api/src/persistence/`): SQLite via better-sqlite3 + Drizzle; 7 tables. `SqliteEnvironmentRepository`, `SqliteRunRepository` and `SqliteEventRepository` share one database handle; `PersistenceRepository` remains a compatibility alias. Multi-table run/decision transactions remain in the run repository; event replay remains durable, while `RunEventBus` handles in-memory delivery. Environment fixtures use `onConflictDoNothing`.

**REST snapshots are authoritative.** SSE is notification-only — the client refetches `GET /api/runs/:runId` on each event.

## Testing

- Integration tests use in-memory SQLite (`:memory:`) — no external services required. State-machine unit tests use `StubRunStateStore` without SQLite; isolated Fastify route tests use mocked use-case/event ports without a database or observed-state fixture files.
- 19 test files, 81 tests across the workspace at the Phase 4 completion checkpoint (63 API, 5 contracts, 10 drift-engine, 3 web); the separate opt-in Chromium Playwright suite contains 2 browser scenarios.
- `apps/web` includes unit tests for SSE subscription state transitions.
- API integration tests (`apps/api/src/app.test.ts`) exercise the full happy path including async approval + reconciliation via polling.
- No snapshot tests, no MSW, no test containers. The opt-in `ci:e2e` label enables real Chromium Playwright coverage for trusted same-repository PRs, with bounded steps and no self-hosted runner.

## Key Constraints

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (from `tsconfig.base.json`).
- Biome for lint + format. No Prettier, no ESLint.
- ESM throughout (`"type": "module"`). Imports use `.js` extension suffix.
- API binds to `127.0.0.1` by default. CORS allows local origins only.
- Browser input never specifies filesystem paths or submits arbitrary remediation operations.
- The `DriftAdapter` port is in `apps/api/src/application/ports.ts` and uses `NormalizedResourceState` from the inward drift-engine package; `packages/contracts` must never import drift-engine or SQLite.
- Finding kind naming: engine uses `"added"|"removed"|"changed"`, contracts use `"missing"|"extra"|"changed"`. The mapping is in `toContractFindingKind()` in `workflow-executor.ts`.

## Documentation

If implementation diverges from docs, update the docs. README implementation claims must track landed milestones. AI interaction evidence goes in `docs/AI-INTERACTION-LOG.md`.
