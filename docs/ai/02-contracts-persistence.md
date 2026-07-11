# Session 02 — Contracts and Persistence

**Date:** 2026-07-10
**Tool/model:** OpenCode, big-pickle
**Milestone:** Milestone 2 — Persistence and contracts
**Commit:** `9f18cfa` — `feat: define shared contracts and SQLite persistence`

## Objective

Implement the evaluator-ready persistence/contracts slice: Zod contracts, Drizzle SQLite schema, migrations, repository methods, service-config environment seed, and read-time JSON validation.

## Complete prompt

The user requested work in the current repository, required reading `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`, and asked for:

- TypeScript strict mode
- Deterministic drift detection
- Pure drift engine with no HTTP, database, filesystem, or React dependencies
- One explicit run state-machine module
- One explicit workflow executor; no generic workflow framework
- REST run snapshots are authoritative
- SSE only notifies the client to refetch
- Browser input cannot specify filesystem paths
- Compare only adapter-managed fields
- Plans are generated server-side and immutable
- Reconciliation requires approval, stale-plan validation, atomic apply, and verification
- Do not add runtime AI unless the complete deterministic core is already finished and tested
- Update documentation when implementation differs from the plan
- Run relevant checks before committing

Commit message: `feat: define shared contracts and SQLite persistence`

With sub-instructions to:

- Implement Zod contracts and SQLite persistence for environments, runs, steps, findings, remediation plans, decisions, and events
- Use Drizzle unless it becomes a concrete blocker; if raw SQLite is chosen, document the reason in `docs/DECISIONS.md`
- Seed the service-config environment; add the documentation environment metadata only if it does not distract from the primary slice
- Keep repository methods domain-shaped and validate persisted JSON on read

## Complete interaction

The assistant:

1. Read all four required docs (`README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, `docs/DECISIONS.md`).
2. Inspected the workspace layout, existing package.json files, tsconfig files, Biome config, vitest setup, and git state.
3. Added `zod` to `packages/contracts` and `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `@types/better-sqlite3` to `apps/api`.
4. Implemented shared Zod contracts in `packages/contracts/src/index.ts`:
   - `JsonValue` type and `jsonValueSchema`
   - `healthResponseSchema`
   - `adapterKindSchema`, `environmentSourceConfigSchema`, `environmentSchema`
   - `runStatusSchema`, `stepStatusSchema`, `workflowStepKeySchema`
   - `errorEnvelopeSchema`, `runSchema`, `stepSchema`
   - `findingKindSchema`, `findingSeveritySchema`, `findingSchema`
   - `remediationPlanSchema`
   - `decisionActionSchema`, `decisionSchema`
   - `eventSchema`
   - `runSnapshotSchema`
5. Added Drizzle SQLite schema in `apps/api/src/persistence/schema.ts` with tables for environments, runs, steps, findings, remediation plans, decisions, and events.
6. Added initial SQL migration in `apps/api/drizzle/0000_initial_persistence.sql` for reproducible database creation.
7. Added embedded migration SQL in `apps/api/src/persistence/migrations.ts` so database creation does not depend on reading external files at runtime.
8. Added `apps/api/src/persistence/database.ts` with `createDatabase()` supporting both file-backed and `:memory:` SQLite, creating the data directory if needed, enabling foreign keys, and running the initial migration.
9. Added `apps/api/src/persistence/repository.ts` with:
   - `primaryWorkflowSteps` constant
   - `serviceConfigEnvironmentId` constant
   - `seedServiceConfigEnvironment()` with idempotent insert
   - `listEnvironments()`, `getEnvironment()`
   - `createQueuedRun()` inserting run + pending steps + event in a transaction
   - `getRun()`, `getRunSnapshot()`
   - `replaceFindings()`, `saveRemediationPlan()`, `recordDecision()`, `appendEvent()`
   - All reads validated through Zod schemas via `parseEnvironment`, `parseRun`, `parseStep`, `parseFinding`, `parsePlan`, `parseDecision`, `parseEvent`
10. Added `apps/api/src/persistence/repository.test.ts` with three tests:
    - Seeds the service-config environment
    - Round-trips run state, findings, immutable plan, decision, and events
    - Validates persisted JSON when reading snapshots (corruption test using raw SQLite insert)
11. Updated `apps/api/src/app.ts` to accept optional `DatabaseHandle`, create database, seed environment, expose `GET /api/environments`, and close database on app shutdown.
12. Updated `apps/api/src/app.test.ts` to add environment metadata endpoint test and use in-memory SQLite.
13. Ran `corepack pnpm lint` — found Biome formatting/import ordering issues.
14. Ran `corepack pnpm exec biome check . --write` — fixed 2 files.
15. Ran `corepack pnpm typecheck` — found TS2349 errors from `this.db.transaction(() => { ... })()` (double-invocation).
16. Fixed transaction calls by removing trailing `()` since Drizzle's `transaction()` already executes the callback.
17. Ran `corepack pnpm typecheck` — passed.
18. Ran `corepack pnpm test` — found `better-sqlite3` native binding missing (lockfile-only install did not build the native module).
19. Ran `corepack pnpm rebuild better-sqlite3` — no output, binding still missing.
20. Ran `corepack pnpm install` — reported synced, no rebuild needed.
21. Ran `corepack pnpm ignored-builds` — reported no builds ignored.
22. Ran `corepack pnpm --filter @config-drift-guard/api rebuild better-sqlite3` — warning only.
23. Inspected `better-sqlite3` package.json, found `"scripts": { "install": "prebuild-install || node-gyp rebuild --release" }`.
24. Ran `npm run install` in the `better-sqlite3` package directory — native binding built successfully.
25. Ran `corepack pnpm test` — found API tests failing with `Cannot read properties of undefined (reading 'parse')` because tests resolved contracts from stale `dist` output.
26. Added `apps/api/vitest.config.ts` with a Vitest alias so API tests resolve `@config-drift-guard/contracts` from source.
27. Ran `corepack pnpm lint && corepack pnpm test` — all passed (9 contract tests + 1 drift-engine test + 5 API tests).
28. Ran `corepack pnpm build && corepack pnpm test` — all passed.
29. Ran `corepack pnpm check` — full gate passed (lint + typecheck + build + test).
30. Updated `README.md` to reflect Milestone 2 status.
31. Updated `.gitignore` to ignore `data/` directory.
32. Updated `docs/AI-INTERACTION-LOG.md` with Session 02 entry.
33. Staged 17 files, committed with message `feat: define shared contracts and SQLite persistence`.
34. Verified post-commit state: only unrelated `AGENTS.md` remains untracked.

## Author decisions

- Used Drizzle as planned; raw SQLite fallback was not needed.
- Kept persistence in `apps/api` only; `packages/drift-engine` remains free of HTTP, database, filesystem, and React dependencies.
- Seeded only the primary service-config environment to avoid distracting from the main slice.
- Stored server-controlled fixture identifiers in environment metadata rather than accepting browser-provided filesystem paths.
- Embedded migration SQL as a string constant in `migrations.ts` so database creation does not depend on filesystem reads at runtime, while also keeping the SQL file at `apps/api/drizzle/0000_initial_persistence.sql` for reference.
- Exposed the raw `sqlite` handle on `DatabaseHandle` for the corruption test and future low-level use.

## Accepted suggestions

- Validate persisted JSON on reads using the shared Zod schemas so corrupted rows fail closed.
- Add repository methods around domain concepts instead of exposing table-shaped CRUD.
- Add explicit Zod contracts for all seven domain tables plus the run snapshot REST representation.
- Add a Vitest alias so API tests resolve contracts from source, avoiding stale `dist` dependency.
- Add tests for seeded metadata, repository round-trips, plan/decision/event persistence, and invalid persisted JSON.

## Rejected suggestions

- No runtime AI was added.
- No documentation-drift environment was added in this milestone.
- No generic workflow framework, state-machine implementation, or reconciliation implementation was added before the deterministic core is ready.

## Corrections

- `rtk` was not available in the shell, so commands were run directly with `corepack pnpm`.
- The existing install initially lacked the `better-sqlite3` native binding; the package install script was run directly to build it locally.
- API tests initially resolved stale contracts `dist`; a Vitest alias was added for test-time source resolution.
- Drizzle `transaction()` already executes the callback — the trailing `()` call was removed from four sites.

## Verification

- `corepack pnpm lint` — passed (Biome check on 29 files).
- `corepack pnpm typecheck` — passed (4 workspace projects).
- `corepack pnpm build` — passed (contracts, drift-engine, API, Next.js).
- `corepack pnpm test` — passed (9 contract tests + 1 drift-engine test + 5 API tests = 15 total).
- `corepack pnpm check` — full gate passed.
- Commit `9f18cfa` created with 17 files changed, 1972 insertions, 12 deletions.

## Result and remaining risks

Shared contracts and SQLite persistence are in place with domain-shaped repository methods, seeded service-config environment, and Zod-validated reads.

Remaining product risks:

- Deterministic drift engine is not implemented yet.
- Explicit run state machine and workflow executor are not implemented yet.
- Run-detail REST snapshots (beyond `getRunSnapshot`) are not wired to API routes yet.
- SSE notifications are not implemented yet.
- Remediation plan generation from actual drift is not implemented yet.
- Approval-gated reconciliation, stale-plan validation, atomic apply, and verification are not implemented yet.
- `better-sqlite3` requires a native build; the lockfile-only install did not trigger it automatically on this system.
