# Config Drift Guard

Config Drift Guard is a small internal-platform control plane that detects differences between canonical and observed state.

It models drift analysis as an explicit, persisted workflow so operators can initiate a run, observe each stage, inspect evidence and findings, review an immutable remediation plan, approve or reject reconciliation, and verify the resulting state.

## Current status

Milestone 5 has landed: the repository now has a strict pnpm TypeScript workspace with Fastify API, Next.js web app, contracts package, pure drift-engine package, Biome, Vitest, root verification scripts, shared Zod contracts, SQLite persistence through Drizzle, deterministic normalized-state comparison, an end-to-end persisted service-config drift scan, and compact SSE progress notifications.

Implemented behavior is intentionally narrow:

- `apps/api` exposes `GET /health`, `GET /api/environments`, `POST /api/environments/:id/runs`, `GET /api/runs/:runId`, and `GET /api/runs/:runId/events`, and binds to `127.0.0.1` by default.
- `apps/api` initializes SQLite at `./data/config-drift-guard.sqlite` by default and exposes seeded environment metadata at `GET /api/environments`.
- API CORS allows local browser origins only.
- `apps/api` starts the primary six-step workflow in-process and persists progress events for `validate_canonical_state`, `load_observed_state`, `normalize_state`, `calculate_drift`, `classify_findings`, and `build_remediation_plan`.
- `apps/api` includes a local service-config adapter with server-controlled seeded canonical and observed state; browser requests cannot provide filesystem paths or arbitrary remediation operations.
- `apps/web` renders a one-page operator console that starts a drift scan, displays the persisted timeline, findings, evidence digests, immutable remediation plan, event log, and live workflow notifications, and reloads the last run after browser refresh.
- `packages/contracts` defines Zod-validated contracts for environments, runs, steps, findings, remediation plans, decisions, events, and REST run snapshots.
- `packages/drift-engine` implements pure normalized-state comparison over adapter-managed fields, deterministic ordering, stable JSON-pointer-like paths, severity classification, SHA-256 canonical digests, and complete target-state generation.
- Persistence includes environments, runs, steps, findings, remediation plans, decisions, and events, with repository reads validating persisted JSON through shared schemas.
- SSE supports compact run-change notifications and `Last-Event-ID` replay; REST run snapshots remain authoritative and the UI refetches snapshots on notifications.
- Approval/rejection APIs, stale-plan validation, atomic reconciliation, and post-write verification are not implemented yet.

## Local development

```bash
corepack pnpm install
corepack pnpm check
corepack pnpm dev
```

The API defaults to `http://127.0.0.1:4000` and the web app defaults to `http://127.0.0.1:3000`.

The authoritative product understanding and delivery plan are maintained in:

- [`docs/CURRENT-UNDERSTANDING.md`](docs/CURRENT-UNDERSTANDING.md)
- [`docs/PLAN.md`](docs/PLAN.md)
- [`docs/DECISIONS.md`](docs/DECISIONS.md)

Implementation claims in this README must be updated as milestones land.

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

A secondary adapter can compare structured documentation with its canonical schema or metadata source.

## Control Plane Pattern

Config Drift Guard is intentionally implemented as a small declarative control plane rather than a CRUD application. The system continuously reasons about desired state, observed state, reconciliation, and verification. While the demo uses local adapters, the architecture is designed so additional adapters (e.g., Kubernetes resources, Terraform state, OpenAPI specifications, or documentation) can participate in the same deterministic workflow.

## Why deterministic

Infrastructure correctness requires:

- reproducible results;
- exact comparison;
- stable policy;
- explainable findings;
- testable failure semantics.

AI is used extensively during development and documented in the repository, but it is not responsible for determining drift or authorizing mutation.

An optional future AI layer may explain findings or suggest investigation steps while the deterministic engine remains authoritative.

## Key design properties

- canonical source versus derived state;
- adapter-scoped managed fields;
- persisted run and step state;
- REST snapshots as the source of truth;
- minimal SSE progress notification;
- evidence digests and provenance;
- generated, immutable remediation plans;
- approval as an enforced state transition;
- stale-plan detection;
- atomic writes;
- post-write verification.

## Planned scenarios

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
- pragmatic local execution;
- AI-assisted engineering with a complete interaction log.

## Documentation

- [Current understanding](docs/CURRENT-UNDERSTANDING.md)
- [Project plan](docs/PLAN.md)
- [Architectural decisions](docs/DECISIONS.md)
- [Codex prompts](docs/CODEX-PROMPTS.md)
- [AI interaction log](docs/AI-INTERACTION-LOG.md)

## AI usage

AI is used for planning, implementation acceleration, review, testing, threat modeling, and documentation reconciliation.

The complete interaction record must preserve accepted suggestions, rejected suggestions, corrections, and human verification.
