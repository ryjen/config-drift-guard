# Session 04 — Persisted Drift Scans

**Date:** 2026-07-10
**Tool/model:** OpenCode, big-pickle
**Milestone:** Milestone 4 — First end-to-end slice
**Commit:** `904a2e3` — `feat: execute and display persisted drift scans`

---

## Objective

Implement the evaluator-ready scan slice: local service-config adapter, explicit run state machine, explicit workflow executor, persisted steps/findings/plan, start-run and run-detail APIs, and one-page browser UI with refresh-safe persisted state.

## Complete prompt

> Work in the current repository.
>
> Read README.md, docs/CURRENT-UNDERSTANDING.md, docs/PLAN.md, and docs/DECISIONS.md before changing code.
>
> The goal is an evaluator-ready vertical slice, not exhaustive completion of all planned architecture.
>
> Constraints:
>
> - TypeScript strict mode.
> - Deterministic drift detection.
> - Pure drift engine with no HTTP, database, filesystem, or React dependencies.
> - One explicit run state-machine module.
> - One explicit workflow executor; no generic workflow framework.
> - REST run snapshots are authoritative.
> - SSE only notifies the client to refetch.
> - Browser input cannot specify filesystem paths.
> - Compare only adapter-managed fields.
> - Plans are generated server-side and immutable.
> - Reconciliation requires approval, stale-plan validation, atomic apply, and verification.
> - Do not add runtime AI unless the complete deterministic core is already finished and tested.
> - Update documentation when implementation differs from the plan.
> - Run relevant checks before committing.
>
> At the end:
>
> 1. Summarize changes and design decisions.
> 2. List commands and results.
> 3. Identify remaining risks.
> 4. Commit with the requested message.
>
> Commit:
>
> ```text
> feat: execute and display persisted drift scans
> ```
>
> ```text
> Implement:
>
> - local service-config adapter;
> - run state machine;
> - explicit workflow executor;
> - persisted steps and findings;
> - POST /api/environments/:id/runs;
> - GET /api/runs/:runId;
> - one-page operator UI.
>
> Workflow:
>
> validate_canonical_state
> load_observed_state
> normalize_state
> calculate_drift
> classify_findings
> build_remediation_plan
>
> The evaluator must be able to start a run in the browser, see the final timeline and findings, refresh, and retain state.
>
> SSE is not required in this increment.
> ```

## Complete interaction

### 1. Read required docs

The assistant read the four required documents before making any code changes:

- `README.md` — product overview, assessment focus, planned scenarios
- `docs/CURRENT-UNDERSTANDING.md` — product model, drift domains, success definition
- `docs/PLAN.md` — milestones, data model, API surface, security constraints
- `docs/DECISIONS.md` — 15 ADRs including deterministic authority, REST snapshots, adapter-scoped fields

### 2. Inspect repository state

The repository contained the Milestone 3 workspace:

- pnpm workspace with `apps/api`, `apps/web`, `packages/contracts`, `packages/drift-engine`
- `packages/contracts` — full Zod contracts for environments, runs, steps, findings, remediation plans, decisions, events, snapshots
- `packages/drift-engine` — pure comparison engine, SHA-256 digests, severity, target generation, 10 tests
- `apps/api` — Fastify 5, SQLite via Drizzle, seeded service-config environment, `GET /health`, `GET /api/environments`, repository with CRUD + Zod validation, 5 tests
- `apps/web` — Next.js connectivity page only (server-side health fetch)
- Untracked `AGENTS.md` was present from a prior session; intentionally excluded from the commit

### 3. Read existing source files

Read all existing source to understand conventions, schemas, types, and the API surface before adding code:

- `packages/contracts/src/index.ts` — `RunSnapshot`, `Finding`, `WorkflowStepKey`, `Step`, `ErrorEnvelope`, `JsonValue`
- `packages/drift-engine/src/index.ts` — `compareNormalizedResourceStates`, `buildCompleteTargetState`, `digestNormalizedResourceState`, `SERVICE_CONFIG_MANAGED_FIELDS`, `NormalizedResourceState`, `DriftFinding`
- `apps/api/src/app.ts` — `buildApp()`, `BuildAppOptions`, CORS setup, environment list route
- `apps/api/src/persistence/repository.ts` — `PersistenceRepository` with `createQueuedRun`, `replaceFindings`, `saveRemediationPlan`, `getRunSnapshot`, `primaryWorkflowSteps`, `serviceConfigEnvironmentId`
- `apps/api/src/persistence/schema.ts` — Drizzle tables for all 7 tables
- `apps/api/src/persistence/database.ts` — `createDatabase()` with `:memory:` support
- `apps/web/app/page.tsx` — connectivity page reading `API_BASE_URL` from env
- `apps/web/app/styles.css` — restrained operational styling

### 4. Add service-config adapter

Created `apps/api/src/adapters/service-config.ts`:

- `ServiceConfigAdapter` class with `loadCanonical()`, `loadObserved()`, `validateCanonical()`, `normalizeCanonical()`, `normalizeObserved()`
- Canonical fixture: `api:v2` image, 3 replicas, `LOG_LEVEL: info`
- Observed fixture: `api:v1` image, 1 replica, `LOG_LEVEL: debug`, plus unmanaged `runtimePid` and `healthCheckedAt`
- Server-controlled seeded data; no filesystem reads; browser cannot provide paths
- `validateCanonical()` checks for duplicate resource IDs
- `normalizeCanonical()` and `normalizeObserved()` return `NormalizedResourceState` with `SERVICE_CONFIG_MANAGED_FIELDS`
- Uses `zod` for schema validation of canonical and observed structures

### 5. Add run state machine

Created `apps/api/src/state-machine.ts`:

- `RunStateStore` interface defining `getRun`, `updateRunState`, `updateStepState`, `skipPendingSteps`
- `startRun()` — validates `queued → running` transition
- `startStep()` — validates `running` status, sets current step
- `completeStep()` — validates active step matches key, transitions to `succeeded`
- `finishRun()` — transitions `running → awaiting_approval` with digests
- `failRun()` — transitions to `failed`, skips remaining pending steps

All transitions are pure functions operating on the store interface; no direct database access.

### 6. Add workflow executor

Created `apps/api/src/workflow-executor.ts`:

- `WorkflowExecutor` class with `execute(runId)` method
- `WorkflowRepository` interface extending `RunStateStore` and `PersistenceRepository`
- Six-step synchronous workflow:
  1. `validate_canonical_state` — load canonical, validate schema
  2. `load_observed_state` — load observed runtime state
  3. `normalize_state` — normalize both, compute digests
  4. `calculate_drift` — call `compareNormalizedResourceStates`
  5. `classify_findings` — persist findings via `replaceFindings`
  6. `build_remediation_plan` — generate target, save immutable plan
- Each step is wrapped in `startStep`/`completeStep` transitions
- On error, `failRun` is called with the active step; remaining pending steps are skipped
- Finding kinds are mapped from engine (`added`/`removed`) to contracts (`missing`/`extra`)

### 7. Extend repository with state transitions

Added to `apps/api/src/persistence/repository.ts`:

- `updateRunState()` — updates run status, current step, digests, error, version; emits `run.updated` event
- `updateStepState()` — updates step status, message, output, error, startedAt, completedAt; emits `step.<status>` event
- `skipPendingSteps()` — marks remaining pending steps as `skipped`; emits `steps.pending_skipped` event

All transitions persist within transactions and append events.

### 8. Add API routes

Added to `apps/api/src/app.ts`:

- `POST /api/environments/:id/runs` — validates environment exists, checks adapter kind is `service_config`, creates queued run, executes workflow synchronously, returns 201 with full `RunSnapshot`
- `GET /api/runs/:runId` — returns authoritative `RunSnapshot` or 404 if not found

### 9. Add API tests

Extended `apps/api/src/app.test.ts`:

- "starts a persisted run and returns it by id" — POST creates run with `awaiting_approval` status, 3 findings, then GET returns same snapshot
- "returns 404 for unknown run snapshots" — GET with nonexistent run ID returns 404

### 10. Add workflow test

Created `apps/api/src/workflow-executor.test.ts`:

- "persists a complete deterministic service-config drift scan" — creates run, executes workflow, asserts all 6 steps succeeded, 3 findings at expected paths/severities, plan has correct target, reloaded snapshot matches

### 11. Replace web connectivity page with operator console

Replaced `apps/web/app/page.tsx`:

- Server component fetches `GET /api/environments` (not health)
- Passes `apiBaseUrl` and `environments` to client `OperatorConsole`
- Error state if API unreachable

Created `apps/web/app/operator-console.tsx`:

- `"use client"` component with `useState`, `useEffect`, `useTransition`
- Scenario selector from environment list
- "Run drift scan" button — POST to `/api/environments/:id/runs`
- Persisted workflow timeline with status per step
- Findings display with resource, path, severity, canonical/observed values
- Evidence panel showing run ID, digests, finding count
- Remediation plan rendered as JSON
- Stores last run ID in `localStorage`; loads it on mount so refresh preserves state
- Mobile responsive CSS

### 12. Update web styles

Replaced `apps/web/app/styles.css`:

- Full operational console styling: grid layout, panel, timeline, status pills, severity badges, finding cards, responsive breakpoints

### 13. Fix lint and formatting

- Ran `corepack pnpm exec biome check --write .` — fixed 6 files (formatting, import ordering)
- Fixed React hook dependency warning in `operator-console.tsx` — moved `loadRun` logic into the `useEffect` body to avoid a stale closure
- Removed unused `loadRun` helper function

### 14. Fix missing dependencies

- `corepack pnpm check` failed typecheck: `@config-drift-guard/drift-engine` and `zod` were not in `apps/api/package.json`
- Added both dependencies and ran `corepack pnpm install` to refresh workspace links and lockfile

### 15. Full check

```bash
corepack pnpm check
```

All stages passed:
- Biome lint: 34 files checked, no errors
- TypeScript typecheck: all 4 workspace packages passed
- Build: all packages compiled, Next.js production build succeeded
- Vitest: 4 test files, 23 tests passed (4 contracts + 10 drift-engine + 8 API + 1 workflow)

### 16. Update documentation

- Updated `README.md` current status to reflect Milestone 4 completion
- Updated `docs/AI-INTERACTION-LOG.md` with Session 04 entry

### 17. Commit

```bash
git add README.md apps/api/package.json apps/api/src/app.test.ts apps/api/src/app.ts \
  apps/api/src/persistence/repository.ts apps/api/src/adapters/service-config.ts \
  apps/api/src/state-machine.ts apps/api/src/workflow-executor.test.ts \
  apps/api/src/workflow-executor.ts apps/web/app/page.tsx apps/web/app/styles.css \
  apps/web/app/operator-console.tsx docs/AI-INTERACTION-LOG.md pnpm-lock.yaml
git commit -m "feat: execute and display persisted drift scans"
# → 904a2e3
```

Excluded pre-existing untracked `AGENTS.md` from the commit.

## Author decisions

- Execute the six-step scan synchronously inside the API request for this vertical slice instead of adding background workers or a generic workflow framework.
- Keep local adapter fixtures server-owned and in-process for this increment; environment metadata exposes fixture names only, not user-selectable filesystem paths.
- Store the last run ID in browser local storage so refreshes refetch the authoritative REST snapshot instead of duplicating state-machine logic in React.
- Stop at immutable plan generation because SSE and reconciliation were outside this requested increment.
- Map engine finding kinds to contract kinds in the executor boundary (`added→missing`, `removed→extra`) to avoid leaking engine-specific names into the REST contract.
- Skip pending steps on failure instead of leaving them `pending` indefinitely, so the UI can display a complete timeline after failure.
- Exclude `AGENTS.md` from the commit since it was not created in this session.

## Accepted suggestions

- Persist every workflow step and finding before returning the run snapshot.
- Use the pure drift engine for comparison, digests, severity, and target generation.
- Add endpoint tests that prove a run can be created and read back by ID.
- Add workflow tests for the three expected service-config findings and generated plan target.
- Add a `RunStateStore` interface so the state machine operates on an abstraction rather than directly on the database.

## Rejected suggestions

- No runtime AI was added.
- No SSE, generic workflow/DAG framework, documentation-drift adapter, approval APIs, or reconciliation implementation was added in this milestone.
- Browser input was not allowed to provide filesystem paths or remediation operations.

## Corrections

- `rtk` was unavailable in the shell, so commands were run directly with `corepack pnpm`.
- Biome required formatting/import-order fixes on 6 files after initial implementation.
- React hook dependency warning in `operator-console.tsx` was fixed by inlining the mount fetch logic.
- The API package needed explicit dependencies on `@config-drift-guard/drift-engine` and `zod`; `corepack pnpm install` refreshed workspace links and the lockfile.

## Verification

- `corepack pnpm check` passed (lint → typecheck → build → test).
- API tests: 8 passed (health, environments, create+read run, 404 unknown run).
- Workflow test: 1 passed (full deterministic service-config scan with 3 findings).
- Drift engine tests: 10 passed.
- Contracts tests: 4 passed.
- Web has no test files and exits successfully with `--passWithNoTests`.

## Result and remaining risks

The evaluator can start a persisted service-config drift scan from the browser, see the final timeline and findings, and refresh to refetch the saved run snapshot.

**What was delivered:**
- Local server-owned service-config adapter with seeded canonical/observed state
- Explicit run state machine with `RunStateStore` interface
- Explicit synchronous workflow executor with 6-step workflow
- Persisted run transitions, steps, findings, events, and immutable remediation plan
- `POST /api/environments/:id/runs` and `GET /api/runs/:runId` endpoints
- One-page operator console with timeline, findings, evidence, and plan display
- Browser refresh preserves state via local storage + REST refetch
- 8 new API/workflow tests
- Full `pnpm check` passes

**Remaining risks:**
- SSE notifications are not implemented; progress is only visible after the full scan completes.
- Approval/rejection APIs are not implemented; `awaiting_approval` is the terminal state.
- Stale-plan validation, atomic reconciliation, and post-write verification are not implemented.
- Failure hardening beyond the happy-path scan is limited to the `failRun` path in the executor.
- The workflow executor has one adapter type (`service_config`); documentation-drift adapter is not wired.
- `better-sqlite3` requires a native build; the lockfile-only install did not trigger it automatically on this system.
- Browser local storage is cleared on logout/incognito; a fresh evaluator loses the last run ID.
