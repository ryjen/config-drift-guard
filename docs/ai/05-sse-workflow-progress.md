# Session 05 — SSE Workflow Progress

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Milestone 5 — Live progress
**Commit:** `d9c8c27` — `feat: stream workflow progress with server-sent events`

---

## Objective

Add persisted event replay and minimal server-sent events while keeping REST run snapshots authoritative and avoiding any React-side state-machine duplication.

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
> feat: stream workflow progress with server-sent events
> ```
>
> ```text
> Add persisted events and minimal SSE.
>
> Rules:
>
> - REST run detail remains authoritative.
> - SSE sends compact change notifications.
> - The UI refetches the snapshot.
> - Support Last-Event-ID replay.
> - Clean up listeners on disconnect.
> - Show an event log and live workflow timeline.
>
> Do not replicate the state machine in React.
> ```

## Complete interaction

### 1. Read required docs

The assistant read the four required documents before making any code changes:

- `README.md` — product overview, assessment focus, planned scenarios
- `docs/CURRENT-UNDERSTANDING.md` — product model, drift domains, success definition
- `docs/PLAN.md` — milestones, data model, API surface, security constraints
- `docs/DECISIONS.md` — 15 ADRs including deterministic authority, REST snapshots, minimal SSE, adapter-scoped fields

### 2. Inspect repository state

The repository contained the Milestone 4 workspace:

- pnpm workspace with `apps/api`, `apps/web`, `packages/contracts`, `packages/drift-engine`
- `packages/contracts` — Zod contracts including `Event`, `EventSchema`, `RunSnapshot` with events array
- `packages/drift-engine` — pure comparison engine (unchanged)
- `apps/api` — Fastify 5, SQLite via Drizzle, seeded service-config environment, synchronous workflow executor, 10 tests
- `apps/web` — One-page operator console with timeline, findings, evidence, plan display, local-storage refresh persistence
- Untracked `AGENTS.md` was present from a prior session; intentionally excluded from the commit

### 3. Read existing source files

Read all relevant source to understand conventions, event persistence, and the UI snapshot flow:

- `apps/api/src/app.ts` — `buildApp()`, `BuildAppOptions`, CORS, `POST /api/environments/:id/runs` (synchronous), `GET /api/runs/:runId`
- `apps/api/src/persistence/repository.ts` — `PersistenceRepository` with `appendEvent()`, `getRunSnapshot()`, `getRun()`, `createQueuedRun()`, `updateRunState()`, `updateStepState()`, `skipPendingSteps()`
- `apps/api/src/persistence/schema.ts` — `events` table with autoincrement integer PK, `runId`, `eventType`, `payload`, `createdAt`
- `apps/api/src/workflow-executor.ts` — `WorkflowExecutor.execute(runId)` with six-step synchronous workflow
- `apps/web/app/operator-console.tsx` — `OperatorConsole` client component, `RunDetails` sub-component, local-storage restore, `startRun()`, state for `snapshot`, `error`, `isPending`
- `apps/web/app/styles.css` — full operational console styling
- `docs/PLAN.md` — Milestone 5 specified: persisted events, minimal SSE, client refetch, event log, live workflow timeline
- `docs/DECISIONS.md` — ADR-006 (REST snapshots authoritative), ADR-007 (minimal SSE compact payloads)

### 4. Design approach

Key design decisions made before writing code:

- **Reuse the existing `events` table.** The repository already persists `Event` records with monotonic autoincrement IDs for every `run.queued`, `run.updated`, `step.<status>`, `findings.replaced`, `plan.created`, and `decision.<action>`. No new table was needed.
- **Add in-process event listeners.** `PersistenceRepository` gets a `subscribeRunEvents(runId, listener)` method that returns an unsubscribe function. `appendEvent()` calls `notifyRunEvent()` after every insert.
- **Add `listRunEventsAfter(runId, afterEventId)`.** For `Last-Event-ID` replay, query persisted events with `id > afterEventId` using `gt()` from Drizzle.
- **Schedule executor asynchronously.** Change `POST /api/environments/:id/runs` to return the queued snapshot immediately, then `setTimeout(() => executor.execute(run.id), 0)` so the executor runs in-process after the HTTP response is sent. This gives SSE time to establish before events fire.
- **Add `/api/runs/:runId/events` SSE endpoint.** Use `reply.hijack()` with raw `res.writeHead()` to emit `text/event-stream`. Format each event as a compact `run-change` event with `id:`, `event:`, `data:` fields containing `{ runId, version, eventId, eventType }`.
- **Keep React passive.** The UI opens an `EventSource`, receives `run-change` notifications, and calls `refreshRun()` which does `GET /api/runs/:runId` to refetch the authoritative snapshot. No state transitions happen in React.
- **Guard disconnected writes.** Try/catch around `reply.raw.write()` in the SSE handler so a broken client cannot interrupt the workflow executor.

### 5. Add repository event replay and listener support

Modified `apps/api/src/persistence/repository.ts`:

- Added `RunEventListener` type: `(event: Event) => void`
- Added `eventListeners: Map<string, Set<RunEventListener>>` private field
- Added `listRunEventsAfter(runId, afterEventId)` — validates run exists, queries `events WHERE run_id = ? AND id > ? ORDER BY ASC id`, returns parsed `Event[]`
- Added `subscribeRunEvents(runId, listener)` — creates or reuses listener set, returns `() => void` unsubscribe function that removes listener and cleans up empty sets
- Modified `appendEvent()` — after persisting, calls `notifyRunEvent(event)`
- Added `private notifyRunEvent(event)` — iterates listeners for the event's run ID, calls each in try/catch so listener errors cannot interrupt persistence

### 6. Add SSE endpoint and async scheduling

Modified `apps/api/src/app.ts`:

- Added `type Event` import from `@config-drift-guard/contracts`
- Changed `POST /api/environments/:id/runs`: instead of `const snapshot = executor.execute(run.id)`, now does `const snapshot = repository.getRunSnapshot(run.id)` and schedules `setTimeout(() => { try { executor.execute(run.id) } catch ... }, 0)`. Returns the queued snapshot with `201`.
- Added `GET /api/runs/:runId/events`:
  - Parses `Last-Event-ID` header via `parseLastEventId()`
  - Validates run exists, returns 404 if not found
  - `reply.hijack()` with `writeHead(200, { Content-Type: text/event-stream, ... })`
  - `writeEvent()` closure: skips if `event.id <= lastSentEventId` or stream destroyed, writes `formatRunChangeEvent()`, catches write errors and destroys on failure
  - Subscribes via `repository.subscribeRunEvents()`, cleans up on `request.raw.on("close", unsubscribe)`
  - Replays persisted events after cursor via `listRunEventsAfter()`
- Added `parseLastEventId()` — safely parses string/array/undefined to integer, returns 0 for invalid
- Added `formatRunChangeEvent()` — returns SSE wire format: `id: <id>\nevent: run-change\ndata: <JSON>\n\n`

### 7. Add API tests

Extended `apps/api/src/app.test.ts`:

- Updated "starts a persisted run" test: POST now returns `queued` status immediately (not `awaiting_approval`). Added `await expect.poll(...)` to wait for async executor completion before asserting final state.
- Added "persists run events for replay" test: creates a run, polls until `awaiting_approval`, reads snapshot, asserts `events.length > 1` and first event is `run.queued`.

### 8. Add repository tests

Extended `apps/api/src/persistence/repository.test.ts`:

- Added `listRunEventsAfter()` assertion to existing round-trip test: after verifying all 4 events, asserts `listRunEventsAfter(run.id, firstEvent.id)` returns the 3 events after the first
- Added "notifies and cleans up run event listeners" test: subscribes, appends an event, unsubscribes, appends another, asserts only the first was received

### 9. Update operator console

Modified `apps/web/app/operator-console.tsx`:

- Added `LiveNotification` interface: `{ eventId, eventType, runId, version }`
- Added `liveNotifications` state: `LiveNotification[]`, capped at 8
- Added `activeRunId` derived state: `snapshot?.run.id ?? null`
- Added `EventSource` effect: opens `GET /api/runs/:activeRunId/events`, listens for `run-change`, calls `refreshRun()` on each notification, appends to `liveNotifications`
- Extracted `refreshRun()` helper: shared between mount restore and SSE-triggered refetch, avoids duplicating fetch logic
- Changed mount restore to use `refreshRun()` with a `restoredRunId` const (strict TypeScript requires non-null for `EventSource` URL)
- Added `EventLog` section in `RunDetails`: renders `snapshot.events` as a list with `#id`, `eventType`, and timestamp
- Added `LiveWorkflowTimeline` section: renders `liveNotifications` with `#id`, `eventType`, and run version
- Cleared `liveNotifications` on new run creation

### 10. Update web styles

Modified `apps/web/app/styles.css`:

- Added `.eventLog` — grid list with compact card items showing code, text, and time
- Added `.eventLog li` — three-column grid layout with border, rounded corners, padding
- Added `.liveLog li` — blue left border to distinguish live from persisted events
- Added responsive rule — single-column event log on mobile

### 11. Fix lint and formatting

First `corepack pnpm check` failed on:

- **Biome format:** `app.test.ts` and `repository.test.ts` had long lines needing reformatting
- **Biome hook lint:** `operator-console.tsx` had `snapshot?.run.id` as a dependency which is more specific than the captured `snapshot`. Changed to `activeRunId = snapshot?.run.id ?? null` and used `activeRunId` as the dependency.
- **TypeScript strict:** `runId` from `localStorage.getItem()` is `string | null` but `EventSource` URL requires `string`. Added `const restoredRunId = runId` after the null guard.
- **TypeScript strict:** `snapshot.events[0]` could be undefined. Added `expect(firstEvent).toBeDefined()` guard and used `firstEvent?.id ?? 0`.

### 12. Final check

```bash
corepack pnpm check
```

All stages passed:
- Biome lint: 34 files checked, no errors
- TypeScript typecheck: all 4 workspace packages passed
- Build: all packages compiled, Next.js production build succeeded
- Vitest: 6 test files, 41 tests passed (4 contracts + 10 drift-engine + 10 API + 3 repository + 1 workflow)

### 13. Update documentation

- Updated `README.md` current status to reflect Milestone 5 completion: added SSE endpoint to API surface, described compact SSE notifications, updated UI description to include event log and live timeline, updated remaining items.
- Updated `docs/AI-INTERACTION-LOG.md` with Session 05 entry including cross-reference to this file.

### 14. Commit

```bash
git add README.md apps/api/src/app.test.ts apps/api/src/app.ts \
  apps/api/src/persistence/repository.test.ts apps/api/src/persistence/repository.ts \
  apps/web/app/operator-console.tsx apps/web/app/styles.css \
  docs/AI-INTERACTION-LOG.md
git commit -m "feat: stream workflow progress with server-sent events"
# → d9c8c27
```

Excluded pre-existing untracked `AGENTS.md` from the commit.

## Author decisions

- Reuse the existing persisted `events` table instead of adding a separate stream store or in-memory buffer. The monotonic autoincrement IDs already satisfy `Last-Event-ID` replay requirements.
- Keep SSE payloads compact: `{ runId, version, eventId, eventType }`. The client refetches the full snapshot on each notification; SSE never carries findings, steps, or plans.
- Keep React passive: `EventSource` notifications trigger REST refetches. Workflow state lives in SQLite and is served through `GET /api/runs/:runId`. No state transitions, step progress tracking, or drift classification happens in the browser.
- Schedule the executor with `setTimeout(0)` instead of adding workers, queues, or a generic workflow framework. This is sufficient for the evaluator-ready vertical slice.
- Use `reply.hijack()` with raw `res.writeHead()` for SSE instead of Fastify's streaming utilities, to have direct control over headers and connection lifecycle.
- Guard disconnected SSE writes with try/catch and destroy the response on failure. Listener errors are caught and swallowed so a broken client cannot interrupt persisted workflow transitions.

## Accepted suggestions

- Add `Last-Event-ID` replay by querying persisted events after the provided monotonic event ID using `gt()` from Drizzle.
- Clean up run event listeners when the SSE socket closes via `request.raw.on("close", unsubscribe)`.
- Guard SSE writes so a disconnected client cannot fail workflow execution.
- Show both the persisted event log and compact live notifications in the one-page console.
- Extract `refreshRun()` helper to share fetch logic between mount restore and SSE-triggered refetch.

## Rejected suggestions

- No runtime AI was added.
- No approval/rejection or reconciliation behavior was added in this milestone.
- No React-side state transitions were added; REST remains authoritative.
- No new persistence tables or migration changes were required.

## Corrections

- Fastify injection is not ideal for held-open SSE response testing, so replay/listener behavior is covered through repository tests (`listRunEventsAfter`, `subscribeRunEvents`) and the endpoint is verified through type/build checks.
- React hook dependency lint required changing `snapshot?.run.id` to a derived `activeRunId` variable so the dependency is not more specific than the captured value.
- TypeScript strict mode required guarding `localStorage.getItem()` null return and `snapshot.events[0]` possibly-undefined access.

## Verification

- `corepack pnpm check` passed (lint → typecheck → build → test).
- Repository tests: 4 passed (seeding, round-trips with `listRunEventsAfter`, invalid JSON validation, listener subscribe/unsubscribe).
- API tests: 5 passed (health, environments, async run creation with polling, event persistence for replay, 404 unknown run).
- Workflow test: 1 passed (full deterministic service-config scan).
- Drift engine tests: 10 passed.
- Contracts tests: 4 passed.
- Web has no test files and exits successfully with `--passWithNoTests`.

## Result and remaining risks

The evaluator can start a persisted service-config drift scan from the browser, see compact live progress notifications via SSE, view the persisted event log, and refresh to refetch the authoritative REST snapshot.

**What was delivered:**
- Repository event replay via `listRunEventsAfter(runId, afterEventId)` using monotonic event IDs
- In-process event listener system: `subscribeRunEvents()` returns cleanup function, called on every `appendEvent()`
- Compact SSE endpoint: `GET /api/runs/:runId/events` with `Last-Event-ID` replay
- Async in-process scheduling: `POST /api/environments/:id/runs` returns queued snapshot immediately, executor runs via `setTimeout(0)`
- UI EventSource subscription with snapshot refetch on each notification
- Persisted event log and live workflow timeline panels in operator console
- 3 new repository tests (replay, listener cleanup) and 2 new/updated API tests (async creation, event persistence)
- Full `pnpm check` passes

**Remaining risks:**
- SSE route behavior is not covered by held-open HTTP integration tests; only repository replay/listener logic and type/build correctness are verified.
- No manual browser verification of the SSE stream was performed in this session.
- Approval/rejection APIs, stale-plan validation, atomic reconciliation, and post-write verification remain unimplemented.
- The `setTimeout(0)` scheduling is in-process only; no persistent background queue survives process restarts.
- `EventSource` auto-reconnects after network interruptions, but the replay cursor depends on browser retention of the last `Last-Event-ID`.
