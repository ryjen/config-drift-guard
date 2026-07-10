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

**Workflow executor** (`apps/api/src/workflow-executor.ts`): One class, two methods: `execute()` (6 scan steps) and `executeReconciliation()` (3 post-approval steps). Runs in-process via `setTimeout(0)`.

**Adapters** (`apps/api/src/adapters/`): `ServiceConfigAdapter` and `DocumentationAdapter`. Each implements `loadCanonical`, `loadObserved`, `validateCanonical`, `normalizeCanonical`, `normalizeObserved`, `applyTarget`, `resetObserved`.

**Drift engine** (`packages/drift-engine/src/index.ts`): Pure functions only. Compares `NormalizedResourceState` objects. `SERVICE_CONFIG_MANAGED_FIELDS = ["image", "replicas", "environment"]`. Digests are SHA-256 of canonical JSON over managed fields only.

**Persistence** (`apps/api/src/persistence/`): SQLite via better-sqlite3 + Drizzle. 7 tables. Schema is raw SQL in `migrations.ts`, Drizzle schema in `schema.ts`. Tests use `:memory:` database. Seeded environments are inserted with `onConflictDoNothing`.

**REST snapshots are authoritative.** SSE is notification-only — the client refetches `GET /api/runs/:runId` on each event.

## Testing

- Tests use in-memory SQLite (`:memory:`) — no external services required.
- 6 test files, 41 tests total across the workspace.
- `apps/web` has no tests (`--passWithNoTests`).
- API integration tests (`apps/api/src/app.test.ts`) exercise the full happy path including async approval + reconciliation via polling.
- No snapshot tests, no MSW, no test containers.

## Key Constraints

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (from `tsconfig.base.json`).
- Biome for lint + format. No Prettier, no ESLint.
- ESM throughout (`"type": "module"`). Imports use `.js` extension suffix.
- API binds to `127.0.0.1` by default. CORS allows local origins only.
- Browser input never specifies filesystem paths or submits arbitrary remediation operations.
- The `DriftAdapter` interface (`workflow-executor.ts:32-46`) uses `ReturnType<ServiceConfigAdapter[...]>` instead of `NormalizedResourceState` directly — this is a known coupling, not a bug.
- Finding kind naming: engine uses `"added"|"removed"|"changed"`, contracts use `"missing"|"extra"|"changed"`. The mapping is in `toContractFindingKind()` in `workflow-executor.ts`.

## Documentation

If implementation diverges from docs, update the docs. README implementation claims must track landed milestones. AI interaction evidence goes in `docs/AI-INTERACTION-LOG.md`.
