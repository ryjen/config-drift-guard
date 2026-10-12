# Config Drift Guard

Config Drift Guard is a small internal-platform control plane that detects differences between canonical and observed state.

It models drift analysis as an explicit, persisted workflow so operators can initiate a run, observe each stage, inspect evidence and findings, review an immutable remediation plan, approve or reject reconciliation, and verify the resulting state.

![Config Drift Guard operator console](docs/images/operator-console.png)

## Status

The evaluator-ready vertical slice is implemented.

It includes:

- deterministic drift detection for service configuration and structured documentation;
- persisted workflow state using SQLite;
- a Next.js operator console and Fastify API;
- live progress notifications over SSE;
- approval-gated reconciliation with stale-plan protection;
- atomic writes and post-reconciliation verification;
- deterministic failure scenarios and automated tests.

## Local development

```bash
corepack enable
corepack pnpm install
corepack pnpm check
corepack pnpm dev
```

For a demo with visible delays between workflow phases:

```bash
corepack pnpm demo
```

This sets `QUEUE_DELAY_MS=2000` and `PHASE_DELAY_MS=500` so the operator console shows each transition clearly.

The API defaults to `http://127.0.0.1:4000` and the web app defaults to `http://127.0.0.1:3000`.

## Five-minute demo

1. Open `http://127.0.0.1:3000`.
2. Select the service configuration scenario.
3. Click **Run drift scan**.
4. Observe the six persisted analysis steps complete.
5. Review the image, replica, and environment findings with evidence digests.
6. Approve reconciliation.
7. Confirm that verification reports zero remaining findings.
8. Reset the scenario and repeat with structured documentation drift.

See [docs/DEMO.md](docs/DEMO.md) for the full walkthrough including failure paths.

## Product model

```text
canonical state
→ validation
→ normalization
→ observed or derived state
→ deterministic comparison
→ policy classification
→ immutable remediation plan
→ operator decision
→ reconciliation
→ verification
```

The first adapter compares desired service configuration with observed runtime state.

The second adapter compares canonical configuration metadata with a managed Markdown reference table.

## Control plane pattern

Config Drift Guard is implemented as a small declarative control plane rather than a CRUD application. Each operator-triggered run executes a declarative reconciliation workflow over desired state, observed state, reconciliation, and verification. While the demo uses local adapters, the architecture is designed so additional adapters (e.g., Kubernetes resources, Terraform state, OpenAPI specifications, or documentation) can participate in the same deterministic workflow.

## Why deterministic

Infrastructure correctness requires:

- reproducible results;
- exact comparison;
- stable policy;
- explainable findings;
- testable failure semantics.

AI is used extensively during development and documented in the repository, but it is not responsible for determining drift or authorizing mutation.

An optional future AI layer may explain findings or suggest investigation steps while the deterministic engine remains authoritative.

## Safety model

- Findings are deterministic.
- Plans are generated server-side from adapter-managed fields only.
- Approval references an immutable plan digest.
- Reconciliation fails if observed state changed since plan generation.
- Writes are atomic (temp file + rename).
- Success requires post-write convergence verification.

## Demo scenarios

### Service configuration drift

Detect changes in:

- service image;
- replica count;
- environment variables.

Ignore unmanaged runtime metadata.

### Documentation drift

Detect structured differences between:

- configuration schema and Markdown reference table;
- canonical metadata and generated documentation block;
- API schema and managed documentation representation.

Arbitrary prose similarity is out of scope.

## Failure scenarios

| Scenario | Trigger | Expected outcome |
| --- | --- | --- |
| Invalid canonical state | Adapter returns invalid canonical input | Validation step fails; all later steps skipped |
| Malformed observed state | Write `{` to observed JSON file | `load_observed_state` fails; no plan generated |
| Stale remediation plan | Modify observed file between scan and approval | Preflight returns `stale_remediation_plan`; no write occurs |
| Simulated write failure | Adapter injects write error | Apply fails; original observed state preserved |
| Interrupted run | Kill process during workflow | Startup recovery marks run `failed` |
| Contradictory decision | Approve then reject same run | Returns `409`; decision unchanged |

See [docs/DEMO.md](docs/DEMO.md) for exact UI steps.

## Key design properties

- canonical source versus derived state;
- adapter-scoped managed fields;
- evidence digests and provenance;
- REST snapshots as the source of truth;
- cross-origin SSE with heartbeat keepalive (notification-only; client refetches snapshots);
- generated, immutable remediation plans;
- approval as an enforced state transition;
- stale-plan detection before mutation;
- atomic writes and post-write verification.

## Assessment focus

The target is an evaluator-ready vertical slice, not a generic platform framework.

The project demonstrates:

- declarative state;
- reconciliation;
- workflow persistence;
- operator visibility;
- API design;
- failure handling;
- evidence and provenance;
- pragmatic local execution.

## Documentation

- [Plain-language explanation](docs/EXPLAINED-SIMPLY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current understanding](docs/CURRENT-UNDERSTANDING.md)
- [Project plan](docs/PLAN.md)
- [Architectural decisions](docs/DECISIONS.md)
- [Trade-offs](docs/TRADE-OFFS.md)
- [Demo walkthrough](docs/DEMO.md)
- [Codex prompts](docs/CODEX-PROMPTS.md)
- [AI interaction log](docs/AI-INTERACTION-LOG.md)

The authoritative product understanding and delivery plan are maintained in [`docs/CURRENT-UNDERSTANDING.md`](docs/CURRENT-UNDERSTANDING.md), [`docs/PLAN.md`](docs/PLAN.md), and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## AI usage

AI is used for planning, implementation acceleration, review, testing, threat modeling, and documentation reconciliation.

Interaction sessions are recorded in [`docs/AI-INTERACTION-LOG.md`](docs/AI-INTERACTION-LOG.md). Each session documents the objective, prompt, interaction, author decisions, accepted and rejected suggestions, corrections, verification, and outcomes.

## Implemented endpoints

`apps/api` exposes:

- `GET /health`
- `GET /api/environments`
- `POST /api/environments/:id/reset`
- `POST /api/environments/:id/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`
- `POST /api/runs/:runId/approve`
- `POST /api/runs/:runId/reject`

The API binds to `127.0.0.1` by default and CORS allows local browser origins only.

The primary workflow executes six scan steps (`validate_canonical_state`, `load_observed_state`, `normalize_state`, `calculate_drift`, `classify_findings`, `build_remediation_plan`); approved runs execute three reconciliation steps (`preflight_reconciliation`, `apply_reconciliation`, `verify_convergence`). Progress is persisted step-by-step and the UI refetches authoritative REST snapshots on SSE notifications.

## Workspace layout

```
packages/contracts/          Zod schemas and TypeScript types
packages/drift-engine/       Pure comparison engine (no runtime dependencies)
apps/api/                    Fastify API, SQLite persistence, adapters, workflow executor
apps/web/                    Next.js operator console
```

## Implementation notes

- Persistence uses SQLite via Drizzle. Environments are seeded on startup with `onConflictDoNothing`.
- The service-config adapter manages `image`, `replicas`, and `environment` fields; unmanaged fields like `runtimePid` are preserved through reconciliation.
- The documentation adapter manages only the Markdown table block between `<!-- config-drift-guard:start -->` and `<!-- config-drift-guard:end -->`.
- API startup marks interrupted queued/running runs as failed with `startup_recovery`.
- SSE uses reflected `Access-Control-Allow-Origin` and 15-second heartbeat keepalive.
- Repeated same decisions are idempotent; contradictory decisions return `409`.
- Browser input never specifies filesystem paths or submits arbitrary remediation operations.
