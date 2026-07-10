# Codex Prompts

## Shared preamble

Use this at the start of each implementation prompt:

```text
Work in the current repository.

Read README.md, docs/CURRENT-UNDERSTANDING.md, docs/PLAN.md, and docs/DECISIONS.md before changing code.

The goal is an evaluator-ready vertical slice, not exhaustive completion of all planned architecture.

Constraints:

- TypeScript strict mode.
- Deterministic drift detection.
- Pure drift engine with no HTTP, database, filesystem, or React dependencies.
- One explicit run state-machine module.
- One explicit workflow executor; no generic workflow framework.
- REST run snapshots are authoritative.
- SSE only notifies the client to refetch.
- Browser input cannot specify filesystem paths.
- Compare only adapter-managed fields.
- Plans are generated server-side and immutable.
- Reconciliation requires approval, stale-plan validation, atomic apply, and verification.
- Do not add runtime AI unless the complete deterministic core is already finished and tested.
- Update documentation when implementation differs from the plan.
- Run relevant checks before committing.

At the end:

1. Summarize changes and design decisions.
2. List commands and results.
3. Identify remaining risks.
4. Commit with the requested message.
```

## Prompt 0 — Repository assessment

```text
Inspect the repository without changing files.

Report:

- branch and git status;
- existing commits;
- package manager and scaffold;
- existing documentation and code;
- gaps against the planned evaluator-ready vertical slice;
- concrete simplifications;
- implementation sequence.

Explicitly distinguish required vertical-slice work from optional breadth.
```

## Prompt 1 — Foundation

Commit:

```text
chore: initialize TypeScript workspace and development tooling
```

```text
Create a pnpm workspace with:

- apps/api using Fastify;
- apps/web using Next.js and React;
- packages/contracts;
- packages/drift-engine;
- strict TypeScript;
- Biome;
- Vitest;
- root dev/build/test/typecheck/lint/check scripts;
- API /health;
- a basic web-to-API connectivity page;
- loopback binding and local-only CORS;
- safe .gitignore and environment examples.

Do not add SQLite, domain behavior, Docker, or speculative shared libraries yet.

Verify pnpm check and both applications start.
```

## Prompt 2 — Contracts and persistence

Commit:

```text
feat: define shared contracts and SQLite persistence
```

```text
Implement Zod contracts and SQLite persistence.

Add:

- environments;
- runs;
- steps;
- findings;
- remediation plans;
- decisions;
- events.

Use Drizzle unless it becomes a concrete blocker. If raw SQLite is chosen, document the reason in docs/DECISIONS.md.

Seed the service-config environment. Add the documentation environment metadata only if it does not distract from the primary slice.

Keep repository methods domain-shaped and validate persisted JSON on read.
```

## Prompt 3 — Pure drift engine

Commit:

```text
feat: implement deterministic configuration drift engine
```

```text
Implement a pure normalized-state comparison engine.

Requirements:

- deterministic ordering;
- added, removed, and changed findings;
- stable JSON-pointer-like paths;
- no mutation of caller-owned data;
- adapter-provided managed fields;
- severity classification;
- SHA-256 canonical digests;
- complete target-state generation;
- comprehensive tests.

The service-config scenario must produce exactly:

- /image changed;
- /replicas changed;
- /environment/LOG_LEVEL changed.

Unmanaged runtimePid must not produce drift.
```

## Prompt 4 — First end-to-end slice

Commit:

```text
feat: execute and display persisted drift scans
```

```text
Implement:

- local service-config adapter;
- run state machine;
- explicit workflow executor;
- persisted steps and findings;
- POST /api/environments/:id/runs;
- GET /api/runs/:runId;
- one-page operator UI.

Workflow:

validate_canonical_state
load_observed_state
normalize_state
calculate_drift
classify_findings
build_remediation_plan

The evaluator must be able to start a run in the browser, see the final timeline and findings, refresh, and retain state.

SSE is not required in this increment.
```

## Prompt 5 — Live progress

Commit:

```text
feat: stream workflow progress with server-sent events
```

```text
Add persisted events and minimal SSE.

Rules:

- REST run detail remains authoritative.
- SSE sends compact change notifications.
- The UI refetches the snapshot.
- Support Last-Event-ID replay.
- Clean up listeners on disconnect.
- Show an event log and live workflow timeline.

Do not replicate the state machine in React.
```

## Prompt 6 — Approval and reconciliation

Commit:

```text
feat: add approval-gated reconciliation and verification
```

```text
Add:

- immutable server-generated plan;
- approve/reject endpoints;
- local-operator decision record;
- idempotent repeated same decision;
- 409 on contradictory decision;
- observed digest recheck;
- stale_remediation_plan failure;
- complete target validation;
- temporary-file atomic rename;
- post-write verification scan;
- UI approval controls and evidence display.

The browser must not submit replacement operations.
```

## Prompt 7 — Structured documentation drift

Commit:

```text
feat: detect structured documentation drift
```

```text
Implement a second adapter for structured documentation drift.

Canonical input:
- configuration schema or structured metadata.

Derived input:
- a managed Markdown table or generated block.

Detect:
- missing documentation rows;
- obsolete rows;
- changed type/default values.

Generate a deterministic corrected target.

Do not compare arbitrary prose semantically.
Reuse the existing workflow, findings, evidence, plan, approval, and verification UI.
```

## Prompt 8 — Hardening

Commit:

```text
test: cover workflow transitions and failure scenarios
```

```text
Add and test:

- invalid canonical state;
- malformed observed state;
- stale plan;
- simulated atomic-write failure;
- verification mismatch;
- interrupted-run startup recovery;
- every legal and illegal state transition;
- SSE replay and cleanup;
- reset behavior.

Ensure no unsafe mutation occurs after any preflight failure.
```

## Prompt 9 — Submission reconciliation

Commit:

```text
docs: finalize architecture, trade-offs, and AI usage
```

```text
Reconcile all documentation with actual behavior.

Create or update:

- README.md;
- docs/CURRENT-UNDERSTANDING.md;
- docs/PLAN.md;
- docs/DECISIONS.md;
- docs/ARCHITECTURE.md;
- docs/TRADE-OFFS.md;
- docs/DEMO.md;
- docs/AI-INTERACTION-LOG.md.

Verify fresh-clone setup, the primary happy path, one failure path, pnpm check, and production build.

Do not leave aspirational claims unmarked.
```

## Prompt 10 — Final evaluator review

```text
Review the repository against the assessment.

Do not add features.

Inspect:

- real platform value;
- complete vertical slice;
- workflow transparency;
- state correctness;
- API design;
- safe reconciliation;
- failure handling;
- documentation accuracy;
- meaningful git history;
- complete AI interaction evidence;
- unnecessary abstraction.

Prefer deleting complexity over adding frameworks.
Commit only high-confidence simplification or correctness fixes.
```
