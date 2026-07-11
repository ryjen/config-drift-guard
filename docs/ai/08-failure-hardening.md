# Session 08 — Failure Hardening

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle (opencode/big-pickle)
**Milestone:** Milestone 8 — Failure hardening
**Commit:** `76a87e8` — `test: cover workflow transitions and failure scenarios`

---

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
> 4. Commit with the requested message. Commit:
>
> ```text
> test: cover workflow transitions and failure scenarios
> ```
>
> ```text
> Add and test:
>
> - invalid canonical state;
> - malformed observed state;
> - stale plan;
> - simulated atomic-write failure;
> - verification mismatch;
> - interrupted-run startup recovery;
> - every legal and illegal state transition;
> - SSE replay and cleanup;
> - reset behavior.
>
> Ensure no unsafe mutation occurs after any preflight failure.
> ```

## What changed

### Startup recovery (`apps/api/src/persistence/repository.ts`)

Added `recoverInterruptedRuns()` which on API startup:

1. Queries for any run with status `queued` or `running`.
2. For each interrupted run: if a `currentStep` is set, marks that step failed with `startup_recovery`.
3. Skips all remaining pending steps.
4. Transitions the run to `failed` with a structured `startup_recovery` error envelope.
5. Returns the list of recovered runs.

Uses `inArray` from Drizzle to query by status list. Called automatically in `buildApp()` before any routes are registered.

### Server-controlled reset endpoint (`apps/api/src/app.ts`)

Added `POST /api/environments/:id/reset`:

- Accepts only `{}` as request body (validated with `z.object({}).strict()`).
- Any extra fields (e.g. `{ path: "/tmp/unsafe" }`) return `400 invalid_reset_request`.
- Calls the adapter's `resetObserved()` to restore the seeded observed state.
- Returns `{ status: "reset", environment }`.
- 404 if the environment does not exist.

This ensures the browser cannot specify filesystem paths or arbitrary remediation operations through the reset action.

### State-machine transition tests (`apps/api/src/state-machine.test.ts`)

New file with two test cases:

1. **Legal transitions**: Verifies the complete happy path — queued → running → awaiting_approval → running → succeeded — plus rejection and failure transitions.
2. **Illegal transitions for every status**: Iterates all six `RunStatus` values and asserts that `startRun`, `startStep`, `completeStep`, `finishRun`, `approveRun`, `rejectRun`, and `finishReconciledRun` throw the correct `illegal_*` errors when called from invalid statuses. Also tests mismatched `currentStep` on `completeStep`.

### Workflow failure tests (`apps/api/src/workflow-executor.test.ts`)

Added five new test cases using adapter subclasses to inject failures:

| Test | Adapter | Asserts |
|---|---|---|
| Invalid canonical state | `InvalidCanonicalAdapter` (returns malformed desired state) | `validation_failed` error, no plan generated, `load_observed_state` skipped |
| Malformed observed state | Writes `{` to observed file | `workflow_failed` error, no plan generated, `normalize_state` skipped, file unchanged |
| Stale plan (existing) | Modifies observed file between scan and approval | `stale_remediation_plan` error, `apply_reconciliation` skipped, observed file preserved |
| Simulated atomic-write failure | `AtomicFailureAdapter` (overrides `applyTarget` to throw) | `workflow_failed` on `apply_reconciliation`, `verify_convergence` skipped, observed file unchanged |
| Verification mismatch | `VerificationMismatchAdapter` (overrides `applyTarget` to return fake digests) | `verification_mismatch` on `verify_convergence`, `apply_reconciliation` succeeded, observed file preserved |

All tests assert that no unsafe mutation occurs after any preflight failure.

### Repository tests (`apps/api/src/persistence/repository.test.ts`)

- **Event replay after cursor**: Appends an event before subscribing, subscribes, appends two more, unsubscribes, appends one more. Asserts `listRunEventsAfter` returns only events after the cursor, and the listener received only the events during its subscription.
- **Startup recovery**: Creates queued and running runs, calls `recoverInterruptedRuns()`, asserts both transitioned to `failed` with `startup_recovery` error, active step marked failed, pending steps skipped.

### API tests (`apps/api/src/app.test.ts`)

- **Reset behavior**: Runs a full scan, approves, reconciles, then calls reset with an unsafe payload (`{ path: "/tmp/unsafe" }`) — asserts `400`. Calls reset with `{}` — asserts `200` and correct response. Reruns the scan and asserts the same three findings reappear (proving seed was restored).
- **Startup recovery via API**: Seeds interrupted runs in the database, builds the app (which triggers recovery), fetches the run snapshot, asserts `failed` status and `startup_recovery` error on the active step.

### Documentation

- Updated `README.md` milestone status from 7 to 8.
- Listed new reset endpoint in the API surface description.
- Documented startup recovery and server-controlled reset behavior.
- Updated `docs/AI-INTERACTION-LOG.md` with Session 08.

## Design decisions

### Fail on startup, never resume

Interrupted runs may have lost adapter context (open file handles, in-memory state). Marking them `failed` with `startup_recovery` is the safe choice. The operator can re-run the scan manually.

### Reset requires empty body

The reset endpoint uses `z.object({}).strict()` so any extra fields are rejected. This prevents a browser from smuggling filesystem paths, remediation operations, or other unexpected input through the reset action.

### Test failures through adapter subclasses

Rather than adding a broad mocking framework, failures are injected by subclassing `ServiceConfigAdapter` in test files. This keeps the test harness deterministic and avoids introducing test infrastructure that would distract from the vertical slice.

### No new abstractions

All hardening fits the existing one-state-machine, one-executor architecture. No DAG engine, plugin framework, retry mechanism, or circuit breaker was introduced.

## Scope and constraints

- No runtime AI was added.
- No generic workflow framework, policy language, or plugin system was introduced.
- No browser-provided filesystem paths or remediation operation input was accepted.
- The drift engine (`packages/drift-engine`) remained unchanged and pure.
- `AGENTS.md` remained untracked and was intentionally excluded from the commit.

## Commands

| Command | Result |
|---|---|
| `rtk corepack pnpm --filter @config-drift-guard/api test` | 27 tests passed (4 files) |
| `rtk corepack pnpm check` | First attempt failed on Biome formatting; after manual corrections, all passed |
| Final `rtk corepack pnpm check` | lint, typecheck, build, test all passed |
| `rtk git add` + `rtk git commit` | Created `76a87e8` with message `test: cover workflow transitions and failure scenarios` |

## Test evidence

- `apps/api/src/state-machine.test.ts`: 2 tests (legal transitions + exhaustive illegal transitions)
- `apps/api/src/workflow-executor.test.ts`: 9 tests total (4 existing + 5 new failure scenarios)
- `apps/api/src/persistence/repository.test.ts`: 5 tests total (3 existing + 2 new: event replay cursor + startup recovery)
- `apps/api/src/app.test.ts`: 11 tests total (9 existing + 2 new: reset behavior + startup recovery via API)
- Total API test count: 27 tests, all passing
- Full workspace `corepack pnpm check` passed

## Remaining risks

- No direct browser/manual verification was performed in this session.
- SSE endpoint was not tested via HTTP streaming; event replay and cleanup are validated through repository-level tests only.
- Adapter fixtures remain intentionally narrow (single service-config and single documentation scenario).
- The `AGENTS.md` file remains uncommitted.
