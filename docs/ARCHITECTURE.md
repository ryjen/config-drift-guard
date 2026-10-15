# Architecture

## High-level structure

```text
apps/web  Next.js operator console
    |
    | REST snapshots are authoritative; SSE prompts refetch
    v
apps/api  Fastify HTTP boundary
  app.ts               Fastify setup, CORS, lifecycle and route registration
  routes/              health, environment, run, SSE, error mapping
    |                     (narrow RunOrchestrator and event-read ports)
    v
  run-orchestrator.ts  run decisions and scheduling
  workflow-executor.ts deterministic scan/reconciliation orchestration
  state-machine.ts     pure guarded run/step transitions via RunStateStore
    |                           |
    | use-case/domain ports     | adapter ports
    v                           v
  application/ports.ts       adapters/
    |                        service-config / documentation
    |                              |
    v                              v
  container.ts              packages/drift-engine/
    |                       pure normalized comparison and SHA-256 digests
    | composes ONE AppDatabase and ONE RunEventBus
    v
  persistence/
    environments.ts         SqliteEnvironmentRepository
    repository.ts           SqliteRunRepository (atomic run/decision transitions)
    events.ts               SqliteEventRepository (durable event IDs/replay)
    event-bus.ts            in-memory live SSE notification fan-out

packages/contracts/
  Zod schemas, domain types, segregated repository interfaces, RunStateStore
  (no Fastify, SQLite, filesystem or drift-engine dependency)
```

## Dependency and verification boundaries

- Dependency direction is inward: HTTP handlers depend on narrow use-case/event-read interfaces, orchestration depends on application/domain ports, and concrete SQLite repositories and adapters implement those ports. The application container owns construction, workflow shutdown and database lifetime.
- Environment, run and durable event repositories share a single SQLite database handle. Multi-table approval/rejection mutations remain atomic in the run repository.
- State-machine tests use a database-free `RunStateStore` stub. Workflow tests use `DriftAdapter` port-typed doubles for fault injection. Fastify route tests use mocked orchestrator/event ports, with no SQLite or observed-state files.
- At the Phase 4 completion checkpoint, the canonical CI suite has **81 tests across 19 test files** (63 API, 5 contracts, 10 drift-engine, 3 web). The opt-in hosted Chromium E2E suite separately verifies 2 browser workflows.
- Original implementation is preserved at the annotated `original-implementation` tag.

## Run statuses

```
queued → running → awaiting_approval → running → succeeded
                  → running → failed                    (reconciliation)
  queued → failed         (startup recovery)
  running → failed        (any step failure)
  awaiting_approval → rejected
```

## Step statuses

```
pending → running → succeeded
pending → running → failed
pending → skipped          (on sibling failure, via skipPendingSteps)
```

## Workflow steps

### Primary scan (6 steps, always executed)

1. `validate_canonical_state` — parse & validate canonical Fixture
2. `load_observed_state`   — read and parse observed Fixture
3. `normalize_state`       — extract adapter-managed fields into NormalizedResourceState
4. `calculate_drift`       — pure engine comparison via `compareNormalizedResourceStates`
5. `classify_findings`     — persist deterministic findings
6. `build_remediation_plan`— generate immutable target via `buildCompleteTargetState`

### Reconciliation (3 steps, approval-gated)

7. `preflight_reconciliation`   — re-validate canonical, digest observed, compare to plan digest
8. `apply_reconciliation`       — atomic temp-file write with fsync+rename
9. `verify_convergence`         — re-scan observed, assert zero drift

## Data model

```text
environments ───1:N─── runs ───1:N─── steps
                              ───1:N─── findings
                              ───1:1─── remediation_plans
                              ───1:1─── decisions
                              ───1:N─── events
```

- Snake_case table and column names.
- JSON columns for flexible payloads.
- Unique constraints on `steps(run_id, key)` and `findings(run_id, sequence)`.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health |
| GET | `/api/environments` | List seeded environments |
| POST | `/api/environments/:id/reset` | Reset server-controlled observed state (empty body only) |
| POST | `/api/environments/:id/runs` | Start a drift scan, return snapshot immediately |
| GET | `/api/runs/:runId` | Authoritative REST snapshot |
| GET | `/api/runs/:runId/events` | SSE endpoint for compact change notifications |
| POST | `/api/runs/:runId/approve` | Approve generated remediation plan |
| POST | `/api/runs/:runId/reject` | Reject generated remediation plan |

## Pure engine boundaries

`packages/drift-engine`:
- Zero dependencies beyond `node:crypto`
- No HTTP, database, fs, React
- Canonical JSON stringification with sorted keys for deterministic SHA-256 digests
- Comparison limited to adapter-provided managed fields

`packages/contracts`:
- Zod schemas for all persisted and API-serialized shapes
- Validates persisted JSON on each repository read (crash on corruption)

## SSE contract

- Compact event with `runId`, `version`, `eventId`, `eventType`
- REST snapshot is authoritative; SSE only triggers refetch
- `Last-Event-ID` replay on reconnect
- Listener and heartbeat cleanup on **outgoing streaming response close** (not incoming request completion)

## Adapter contract

Each adapter must implement:

| Method | Purpose |
|--------|---------|
| `loadCanonical()` | Return raw canonical Fixture |
| `loadObserved()` | Return raw observed Fixture |
| `validateCanonical(input)` | Throw on schema violation or duplicate IDs |
| `normalizeCanonical(input)` → `NormalizedResourceState` | Extract managed fields |
| `normalizeObserved(input, resourceId)` → `NormalizedResourceState` | Extract managed fields |
| `applyTarget(expectedDigest, target)` → `ApplyResult` | Validate, re-digest, atomic write |
| `resetObserved()` | Restore seeded observed Fixture |
