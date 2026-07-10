# Architecture

## High-level structure

```text
┌─────────────────────────────────────────────────────────┐
│  apps/web                                               │
│  Next.js 15 + React 19                                  │
│  one-page operator console                              │
│  refetches REST snapshots on SSE change notification    │
│  no React-side state machine                            │
└──────────────┬──────────────────────────────────────────┘
               │ HTTP REST + SSE
               ▼
┌─────────────────────────────────────────────────────────┐
│  apps/api                                                │
│  Fastify 5                                               │
│  loopback binding (127.0.0.1)                            │
│  local-only CORS                                         │
│                                                          │
│  ├─ routes: health, environments, runs, decision, SSE    │
│  ├─ PersistenceRepository (Drizzle + better-sqlite3)     │
│  ├─ state-machine.ts (explicit transitions)             │
│  ├─ workflow-executor.ts (explicit executor)            │
│  └─ adapters/                                            │
│       ├─ service-config.ts  (primary adapter)            │
│       ├─ documentation.ts   (secondary adapter)          │
│       └─ atomic-file.ts     (temp-file+atomic-rename)    │
└──────────────┬──────────────────────────────────────────┘
               │ pure function calls
               ▼
┌─────────────────────────────────────────────────────────┐
│  packages/                                               │
│                                                          │
│  contracts/  (Zod schemas + TypeScript types)            │
│  drift-engine/                                           │
│  ├─ canonical JSON stringify + SHA-256 digests           │
│  ├─ normalized comparison with managed-field scoping     │
│  └─ severity policy + complete target generation          │
└─────────────────────────────────────────────────────────┘
```

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
- Listener cleanup on socket close

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
