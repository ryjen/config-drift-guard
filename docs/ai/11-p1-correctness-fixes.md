# Session 11 — P1 Correctness Fixes

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Correctness hardening — five P1 review fixes
**Commit:** (pending)

---

## Summary

Addressed all five P1 findings from an external project review: concurrent active run guard, single-resource schema constraint, target digest persistence and verification, server-assigned actor identity, and atomic approval/rejection transitions.

## Changes

### 1. Concurrent active run guard

**Files:** `apps/api/src/persistence/repository.ts`, `apps/api/src/app.ts`

- Added `hasActiveRun(environmentId: string): boolean` to `PersistenceRepository`. Queries for runs in `queued | running | awaiting_approval` status for the given environment.
- POST `/api/environments/:id/runs` now returns `409 { error: "active_run_exists" }` when an active run already exists for the environment.
- Prevents the race condition where two scans could both pass pre-approval checks and produce competing reconciliation workflows on stale plans.

### 2. Single-resource schema constraint

**File:** `apps/api/src/adapters/service-config.ts`

- Changed `canonicalSchema` from `z.array(desiredServiceSchema).min(1)` to `z.array(desiredServiceSchema).length(1)`.
- A valid two-resource configuration now fails validation at the adapter level instead of silently processing only `resources[0]`.
- Multi-resource support requires changing the normalized state and comparison engine and is out of scope for this submission.

### 3. Target digest persistence and verification

**Files:** `packages/contracts/src/index.ts`, `apps/api/src/persistence/schema.ts`, `apps/api/src/persistence/migrations.ts`, `apps/api/src/workflow-executor.ts`

- Added `targetDigest: string` field to `RemediationPlan` Zod schema and TypeScript type.
- Added `target_digest TEXT NOT NULL` column to the `remediation_plans` table (Drizzle schema + raw SQL migration).
- Plan creation now persists `digestJson(target)` alongside the target payload.
- Reconciliation preflight now verifies `digestJson(plan.target) === plan.targetDigest` before applying. Throws `target_integrity_violation` on mismatch.
- This closes the gap where the plan was called "immutable" but the target was not content-addressed.

### 4. Server-assigned actor identity

**File:** `apps/api/src/app.ts`

- Removed `actor` from `decisionRequestSchema`. The schema is strict, so any client-submitted `actor` field is rejected with `invalid_decision_request`.
- Both approve and reject routes assign `actor: "local-operator"` server-side.
- Audit identity is no longer caller-controlled, making decision records meaningful.

### 5. Atomic approval and rejection

**Files:** `apps/api/src/persistence/repository.ts`, `apps/api/src/app.ts`

- Added `recordDecisionAndApprove(input)` to `PersistenceRepository`. Single transaction that: verifies run is `awaiting_approval`, verifies no existing decision, inserts the decision, transitions run to `running`, and emits `decision.approved` + `run.updated` events.
- Added `recordDecisionAndReject(input)` with the same atomic pattern for rejection, including `skipPendingSteps` within the transaction.
- Routes now call the atomic methods instead of separate `recordDecision` + `approveRun`/`rejectRun`.
- Concurrent duplicate approvals are handled gracefully: `decision_already_exists` errors return the current snapshot instead of a 500.
- Removed unused `approveRun`/`rejectRun` imports from `app.ts`.

### Test updates

**Files:** `apps/api/src/app.test.ts`, `apps/api/src/persistence/repository.test.ts`

- Removed `actor` field from all test request payloads (tests now submit only `comment` or empty `{}`).
- Added `targetDigest` to the repository round-trip test's `saveRemediationPlan` call.

## Verification

- `corepack pnpm check` passed (lint, typecheck, build, 27 tests across 4 packages).
- All existing test scenarios continue to pass.
- The `actor` removal test (`rejects browser-submitted replacement operations`) still correctly rejects unknown fields via the strict schema.

## Prompts

```
can you fix the P1s
```

(The user provided a full project review document identifying P0-P2 findings. P1 items were:
concurrent active runs, multi-resource schema mismatch, immutable plan integrity,
caller-controlled actor identity, non-atomic decision recording.)
