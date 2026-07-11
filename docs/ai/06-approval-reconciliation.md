# Session 06 — Approval-Gated Reconciliation

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle (opencode/big-pickle)
**Milestone:** Milestone 6 — Approval and reconciliation
**Commit:** `804191b` — `feat: add approval-gated reconciliation and verification`

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
> feat: add approval-gated reconciliation and verification
> ```
>
> ```text
> Add:
>
> - immutable server-generated plan;
> - approve/reject endpoints;
> - local-operator decision record;
> - idempotent repeated same decision;
> - 409 on contradictory decision;
> - observed digest recheck;
> - stale_remediation_plan failure;
> - complete target validation;
> - temporary-file atomic rename;
> - post-write verification scan;
> - UI approval controls and evidence display.
>
> The browser must not submit replacement operations.
> ```

## Complete interaction

### Step 1 — Read brief and inspect repo

The assistant read `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`.

Key observations from the brief:

- Milestone 5 had landed (scan + SSE).
- Milestone 6 (approval and reconciliation) was next.
- The drift engine, contracts, persistence, state machine, executor, and UI were all in place.
- The primary gap was: no approve/reject endpoints, no reconciliation steps, no stale-plan guard, no atomic apply, no verification scan, no UI controls.

The assistant then inspected every relevant source file in parallel:

- `apps/api/src/workflow-executor.ts` — current executor runs six scan steps, ends at `awaiting_approval`.
- `apps/api/src/state-machine.ts` — has `startRun`, `startStep`, `completeStep`, `finishRun`, `failRun`; no approve/reject transitions.
- `apps/api/src/adapters/service-config.ts` — loads seeded canonical/observed in-memory; no filesystem, no apply, no reset.
- `apps/api/src/app.ts` — has create-run, get-run, SSE endpoints; no approve/reject.
- `apps/api/src/persistence/repository.ts` — has `recordDecision` and `saveRemediationPlan`; run steps seeded with only six primary steps.
- `apps/api/src/persistence/schema.ts` — decisions table exists with unique constraint on run_id.
- `packages/contracts/src/index.ts` — has `workflowStepKeySchema` with all nine step keys including reconciliation steps; `decisionSchema`, `decisionActionSchema` present.
- `packages/drift-engine/src/index.ts` — pure functions, `buildCompleteTargetState`, `compareNormalizedResourceStates`, `digestNormalizedResourceState`.
- `apps/web/app/operator-console.tsx` — renders scan, timeline, findings, evidence, plan, events; no approve/reject buttons.
- `apps/web/app/styles.css` — operational styling.
- `apps/api/src/workflow-executor.test.ts` — single test for scan execution.
- `apps/api/src/app.test.ts` — four tests (health, environments, create+read run, event replay, 404).
- `apps/api/src/persistence/repository.test.ts` — four tests (seed, round-trip, listeners, JSON validation).
- `apps/api/drizzle/0000_initial_persistence.sql` — raw migration matches schema.

The assistant identified the minimal set of changes needed:

1. Extend the adapter with `applyTarget`, `resetObserved`, and server-controlled observed JSON file.
2. Add `approveRun`, `rejectRun`, `finishReconciledRun` to the state machine.
3. Fix `updateRunState` to preserve existing digests when optional fields are omitted.
4. Add `executeReconciliation` to the workflow executor with three steps.
5. Add approve/reject endpoints to the API.
6. Add UI approve/reject controls.
7. Add tests.
8. Update docs.

### Step 2 — Extend service-config adapter

The assistant added to `apps/api/src/adapters/service-config.ts`:

**New imports:** `node:fs` (closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync), `node:path` (basename, dirname, join), `digestJson`, `digestNormalizedResourceState` from drift-engine.

**New types:**
- `targetSchema` — Zod schema validating `{ image, replicas, environment }`.
- `ApplyResult` — readonly interface with `observedDigestBefore`, `observedDigestAfter`, `targetDigest`.
- `StaleRemediationPlanError` — custom error class carrying both expected and current digests.

**Constructor change:** Added `observedPath` parameter defaulting to `process.env.CONFIG_DRIFT_GUARD_OBSERVED_STATE ?? "./data/service-config.observed.json"`.

**`loadObserved()`:** Changed from returning a clone of `seededObserved` to reading the JSON file from `observedPath` (creating it from seed if missing).

**`applyTarget(expectedObservedDigest, target)`:**
1. Load canonical and observed, normalize both.
2. Compute current observed digest; compare to plan's expected digest.
3. Throw `StaleRemediationPlanError` on mismatch.
4. Validate target through `targetSchema`.
5. Parse full observed document through `observedSchema`.
6. Build complete next observed document: spread current resource, replace only managed fields from target, preserve unmanaged fields (runtimePid, healthCheckedAt).
7. Validate the assembled document.
8. Write atomically through `writeJsonAtomically`.
9. Re-read and re-normalize to compute post-write digest.
10. Return `ApplyResult`.

**`resetObserved()`:** Writes `seededObserved` to the observed path atomically.

**`ensureObservedStateFile()`:** Creates the file from seed if it does not exist.

**Helper functions:**
- `writeJsonAtomically(path, value)` — mkdirSync, openSync with 0o600, writeFileSync, fsyncSync, closeSync, renameSync, then fsyncDirectory.
- `fsyncDirectory(path)` — best-effort directory fsync wrapped in try/catch.

### Step 3 — Extend state machine

The assistant added three new transitions to `apps/api/src/state-machine.ts`:

**`approveRun(store, runId)`:**
- Guards: run must be `awaiting_approval`.
- Transitions to `running`, clears currentStep and error.

**`rejectRun(store, runId)`:**
- Guards: run must be `awaiting_approval`.
- Skips all pending steps.
- Transitions to `rejected`.

**`finishReconciledRun(store, runId, observedDigest)`:**
- Guards: run must be `running`.
- Transitions to `succeeded`, preserving existing `canonicalDigest`, setting new `observedDigest`.

### Step 4 — Fix repository digest preservation

The assistant identified that `PersistenceRepository.updateRunState` unconditionally overwrote `canonicalDigest` and `observedDigest` when those optional fields were omitted, which would erase evidence during reconciliation.

**Fix:** Changed `updateRunState` to read the current run first, then preserve existing digest values when the input field is `undefined`:

```typescript
canonicalDigest:
  input.canonicalDigest === undefined ? current.canonicalDigest : input.canonicalDigest,
observedDigest:
  input.observedDigest === undefined ? current.observedDigest : input.observedDigest,
```

Also changed `version: this.getRun(runId).version + 1` to use the already-fetched `current.version + 1` to avoid a redundant query.

### Step 5 — Seed reconciliation steps in runs

The assistant added to `apps/api/src/persistence/repository.ts`:

```typescript
export const reconciliationWorkflowSteps: readonly WorkflowStepKey[] = [
  "preflight_reconciliation",
  "apply_reconciliation",
  "verify_convergence",
];

export const workflowSteps: readonly WorkflowStepKey[] = [
  ...primaryWorkflowSteps,
  ...reconciliationWorkflowSteps,
];
```

Changed `createQueuedRun` to seed all nine steps (six primary + three reconciliation) instead of only six.

### Step 6 — Add reconciliation executor

The assistant added `executeReconciliation(runId)` to `WorkflowExecutor`:

**Step 1 — `preflight_reconciliation`:**
1. Load and validate canonical state.
2. Load and normalize current observed state.
3. Compute current observed digest.
4. Compare to plan's `expectedObservedDigest`.
5. Throw `StaleRemediationPlanError` on mismatch.
6. Complete step with digest evidence.

**Step 2 — `apply_reconciliation`:**
1. Call `adapter.applyTarget(plan.expectedObservedDigest, plan.target)`.
2. Complete step with `ApplyResult`.

**Step 3 — `verify_convergence`:**
1. Re-read and normalize observed state after apply.
2. Run `compareNormalizedResourceStates(canonical, observedAfter)`.
3. If `hasDrift` is true, throw `verification_mismatch`.
4. Clear findings via `repository.replaceFindings(runId, [])`.
5. Complete step with verification evidence.

After all three steps succeed, call `finishReconciledRun` with the verification observed digest.

**Error handling:** Same pattern as `execute` — catch, call `failRun` with active step and error envelope.

**Error mapping:** Added `StaleRemediationPlanError` handling to `toErrorEnvelope`:

```typescript
if (error instanceof StaleRemediationPlanError) {
  return {
    code: "stale_remediation_plan",
    message: "Observed state changed after the remediation plan was generated",
    detail: {
      expectedObservedDigest: error.expectedObservedDigest,
      currentObservedDigest: error.currentObservedDigest,
    },
  };
}
```

### Step 7 — Add approve/reject endpoints

The assistant added to `apps/api/src/app.ts`:

**Decision request schema:**
```typescript
const decisionRequestSchema = z
  .object({
    actor: z.string().min(1).default("local-operator"),
    comment: z.string().trim().min(1).nullable().optional(),
  })
  .strict();  // rejects unknown fields — blocks browser-submitted operations
```

**`POST /api/runs/:runId/approve`:**
1. Parse body through `decisionRequestSchema.safeParse`. Return 400 `invalid_decision_request` on failure.
2. Load snapshot. Return 404 if not found.
3. If decision exists and is `approved`, return snapshot idempotently.
4. If decision exists and is `rejected`, return 409 `contradictory_decision`.
5. If run is not `awaiting_approval` or plan is null, return 409 `run_not_awaiting_approval`.
6. Record decision, approve run, schedule `executor.executeReconciliation` in `setTimeout(0)`.
7. Return 202 with updated snapshot.

**`POST /api/runs/:runId/reject`:**
1. Same schema parsing and 404 handling.
2. If decision exists and is `rejected`, return snapshot idempotently.
3. If decision exists and is `approved`, return 409 `contradictory_decision`.
4. If run is not `awaiting_approval`, return 409 `run_not_awaiting_approval`.
5. Record decision, reject run.
6. Return 200 with updated snapshot.

**Helper:** `getSnapshotOrReplyNotFound(repository, runId, reply)` — centralized 404 handling.

**BuildApp options:** Added `serviceConfigObservedPath` to `BuildAppOptions` and wired it through to `ServiceConfigAdapter`.

### Step 8 — Add UI controls

The assistant modified `apps/web/app/operator-console.tsx`:

**`decideRun(action)` function:**
- Guards: only if snapshot is not null.
- POSTs `{ actor: "local-operator", comment: null }` to `/api/runs/:runId/approve` or `/reject`.
- On error, parses error payload and sets error message.
- On success, updates snapshot and localStorage.

**`RunDetails` component changes:**
- Added `isPending` and `onDecision` props.
- Computed `canDecide = snapshot.run.status === "awaiting_approval" && snapshot.decision === null`.
- Added decision evidence display:
  - Expected observed digest
  - Engine version
  - Decision status (awaiting/approved-by/rejected-by)
- Added approve/reject buttons, disabled when `!canDecide || isPending`.
- Added explanatory text: "Approval submits only a local-operator decision. Replacement operations are generated and applied server-side from the immutable plan."

### Step 9 — Add styling

Added to `apps/web/app/styles.css`:

- `.secondaryButton` — white background with blue text for the reject button.
- `.planFacts` — margin-top for evidence display under plan.
- `.decisionControls` — two-column grid for approve/reject buttons.
- Mobile responsive: `.decisionControls` collapses to single column.

### Step 10 — Add tests

**`apps/api/src/workflow-executor.test.ts` — two new tests:**

1. **"applies an approved plan atomically and verifies convergence":**
   - Seeds environment, creates run, executes scan.
   - Records decision, approves run, executes reconciliation.
   - Asserts `succeeded` status, 0 findings, all nine steps succeeded.
   - Reads observed file and asserts target values applied, unmanaged fields preserved.

2. **"fails safely when the observed digest changed after plan generation":**
   - Seeds environment, creates run, executes scan.
   - Writes changed observed state directly to file.
   - Records decision, approves, executes reconciliation.
   - Asserts `failed` status, `stale_remediation_plan` error code.
   - Asserts preflight step failed with stale-plan error.
   - Asserts original changed file is preserved (no mutation).

Both tests use per-test temp directories via `createObservedPath()` to isolate file state.

**`apps/api/src/app.test.ts` — three new tests:**

1. **"approves a server-generated plan and converges":**
   - Creates run, polls to `awaiting_approval`.
   - POSTs approve with `{ actor, comment }`.
   - Asserts 202, decision recorded.
   - Polls to `succeeded`.
   - Asserts 0 findings, verify_convergence step succeeded.

2. **"rejects browser-submitted replacement operations":**
   - Creates run, polls to `awaiting_approval`.
   - POSTs approve with `{ actor, operations: [...] }`.
   - Asserts 400 `invalid_decision_request`.

3. **"makes repeated same decisions idempotent and contradictory decisions conflict":**
   - Creates run, polls to `awaiting_approval`.
   - Rejects (200), rejects again (200, same decision id), approves (409).

**`apps/api/src/persistence/repository.test.ts`:**
- Changed `primaryWorkflowSteps` reference to `workflowSteps` to match the new nine-step seed.

All tests use `createObservedPath()` returning `join(mkdtempSync(...), "observed.json")` for isolation.

### Step 11 — Run checks

First `corepack pnpm check` attempt failed with eight Biome errors:
- Import order issues in `service-config.ts` and `workflow-executor.ts`.
- Formatter issues in `service-config.ts`, `app.ts`, `app.test.ts`, `repository.ts`, `state-machine.ts`, `workflow-executor.ts`.

Ran `corepack pnpm exec biome check . --write` to auto-fix. One remaining typecheck error:

```
TS1360: Type '{ [x: string]: ... }' does not satisfy the expected type 'JsonValue'.
```

Root cause: Zod `passthrough()` on observed service schema produced `{ [x: string]: unknown }` for unmanaged fields, which TypeScript could not assign to `JsonValue`.

Fix: Changed the spread from `satisfies JsonValue` to `JSON.parse(JSON.stringify({...})) as JsonValue`, which strips type metadata while preserving runtime values. Biome auto-formatted again.

Second `corepack pnpm check` passed completely.

### Step 12 — Update documentation

**`README.md`:**
- Updated milestone status from 5 to 6.
- Added approve/reject endpoints to API surface list.
- Added reconciliation step names.
- Replaced "not implemented yet" claims with descriptions of implemented behavior.

**`docs/AI-INTERACTION-LOG.md`:**
- Added Session 06 entry with all required sections.

### Step 13 — Commit

```
rtk git add README.md apps/api/src/adapters/service-config.ts apps/api/src/app.test.ts \
  apps/api/src/app.ts apps/api/src/persistence/repository.test.ts \
  apps/api/src/persistence/repository.ts apps/api/src/state-machine.ts \
  apps/api/src/workflow-executor.test.ts apps/api/src/workflow-executor.ts \
  apps/web/app/operator-console.tsx apps/web/app/styles.css docs/AI-INTERACTION-LOG.md
rtk git commit -m "feat: add approval-gated reconciliation and verification"
```

Result: `804191b`

12 files changed, 775 insertions, 22 deletions.

---

## Author decisions

- Keep the drift engine pure; all filesystem I/O stays in the API adapter.
- Preserve one state-machine module and one explicit workflow executor; no workflow/DAG framework was added.
- Treat the observed-state path as server-controlled configuration, defaulting to `./data/service-config.observed.json`.
- Reject unknown decision request fields so browser-submitted replacement operations fail validation instead of being interpreted.
- Use `setTimeout(0)` for reconciliation scheduling, matching the existing scan scheduling pattern.
- Return 202 for approve (reconciliation starts async) and 200 for reject (synchronous terminal transition).
- Preserve unmanaged runtime metadata (runtimePid, healthCheckedAt) when applying targets.
- Fail on `verification_mismatch` even if the write succeeded, because a successful write is not a successful run.

## Accepted suggestions

- Persist a local-operator decision before reconciliation starts.
- Re-read observed state and compare the current managed-field digest to the plan digest before mutation.
- Build and validate a complete observed document by preserving unmanaged runtime metadata and replacing only adapter-managed fields.
- Write through a same-directory temporary file, fsync where practical, and rename atomically.
- Verify convergence by scanning observed state again after apply and only then marking the run succeeded.
- Clear findings after successful verification so the run snapshot reflects converged state.

## Rejected suggestions

- No runtime AI was added.
- No generic workflow framework, policy DSL, browser-authored operations, or documentation-drift adapter was added.
- No browser-provided filesystem path was accepted.

## Corrections

- Repository run-state updates were adjusted to preserve existing evidence digests when optional fields are omitted.
- Tests use per-test server-side observed-state paths so file-backed reconciliation state does not leak between cases.
- Biome import ordering and formatting were corrected after each check attempt.
- Strict TypeScript required cloning Zod passthrough output through `JSON.parse(JSON.stringify(...))` to produce a proper `JsonValue`.

## Verification

- `corepack pnpm --filter @config-drift-guard/api test` passed (15 tests).
- `corepack pnpm check` passed (lint, typecheck, build, test across all 4 workspace packages).

## Commands and results

| Command | Result |
|---|---|
| `rtk corepack pnpm --filter @config-drift-guard/api test` | 3 test files, 15 tests passed |
| `rtk corepack pnpm check` (first attempt) | 8 Biome errors |
| `rtk corepack pnpm exec biome check . --write` | Fixed 6 files |
| `rtk corepack pnpm check` (second attempt) | 1 TypeScript error (JsonValue strictness) |
| `rtk corepack pnpm exec biome check . --write` | Fixed 1 file |
| `rtk corepack pnpm check` (third attempt) | All passed |
| `rtk git commit` | `804191b` — 12 files, +775/-22 |

## Result and remaining risks

Approval-gated reconciliation is implemented for the primary service-config scenario. The evaluator can now run a scan, see findings and evidence, approve or reject the immutable plan, observe reconciliation steps, and see verification succeed or fail.

Remaining risks:
- No manual browser smoke test was run in this session.
- Repeated demo reset/reseed is still a convenience gap (no reset endpoint yet).
- The optional structured documentation-drift adapter remains unimplemented.
- The pre-existing untracked `AGENTS.md` was left uncommitted.
