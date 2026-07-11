# AI Interaction Log

## AI-use statement

AI tools are used for requirements interpretation, architectural exploration, planning, implementation acceleration, test generation, security review, adversarial review, and documentation reconciliation.

The deterministic application remains human-owned. AI suggestions are reviewed before commit.

## Required evidence per session

Record:

- complete prompt;
- complete response and follow-up interaction;
- intended milestone;
- resulting commit SHA;
- author decisions;
- accepted suggestions;
- rejected suggestions;
- corrections requested;
- commands run;
- manual verification;
- known limitations.

## Full transcripts

Complete verbatim chat sessions are in [`docs/ai/`](ai/):

| Session | File |
| ------- | ---- |
| 00 — Repository assessment | [`00-assessment.md`](ai/00-assessment.md) |
| 01 — Workspace foundation | [`01-workspace-foundation.md`](ai/01-workspace-foundation.md) |
| 02 — Contracts and persistence | [`02-contracts-persistence.md`](ai/02-contracts-persistence.md) |
| 03 — Deterministic drift engine | [`03-drift-engine.md`](ai/03-drift-engine.md) |
| 04 — Persisted drift scans | [`04-persisted-drift-scans.md`](ai/04-persisted-drift-scans.md) |
| 05 — SSE workflow progress | [`05-sse-workflow-progress.md`](ai/05-sse-workflow-progress.md) |
| 06 — Approval-gated reconciliation | [`06-approval-reconciliation.md`](ai/06-approval-reconciliation.md) |
| 07 — Structured documentation drift | [`07-documentation-drift.md`](ai/07-documentation-drift.md) |
| 08 — Failure hardening | [`08-failure-hardening.md`](ai/08-failure-hardening.md) |
| 09 — Documentation and submission | [`09-documentation-submission.md`](ai/09-documentation-submission.md) |
| 10 — Maintenance | [`10-maintenance.md`](ai/10-maintenance.md) |
| 11 — P1 correctness fixes | [`11-p1-correctness-fixes.md`](ai/11-p1-correctness-fixes.md) |

## Important decisions already established

- Build an evaluator-ready vertical slice.
- Keep SQLite early.
- Use Drizzle unless it becomes a blocker.
- Use one operator console.
- Keep REST authoritative.
- Use minimal SSE.
- Keep drift deterministic.
- Use AI primarily as an engineering collaborator.
- Borrow evidence, provenance, approval, stale-plan checks, and verification from Anthesis/Meristem.
- Support structured documentation drift as a secondary adapter.
- Avoid generic workflow and governance frameworks.

## Session template

```markdown
## Session NN — Title

**Date:**
**Tool/model:**
**Milestone:**
**Commit:**

### Objective

### Complete prompt

### Complete interaction

### Author decisions

### Accepted suggestions

### Rejected suggestions

### Corrections

### Verification

### Result and remaining risks
```

## Session 01 — Workspace foundation

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 1 — Workspace foundation
**Commit:** `5cf81ae` — `chore: initialize TypeScript workspace and development tooling`

### Objective

Initialize the evaluator-ready TypeScript workspace foundation without adding SQLite, domain drift behavior, Docker, or speculative shared libraries.

### Complete prompt

> See [full transcript](ai/01-workspace-foundation.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/01-workspace-foundation.md#complete-interaction).

### Author decisions

- Keep the first implementation limited to foundation tooling and connectivity.
- Do not add SQLite, domain drift behavior, workflow modules, SSE, remediation, Docker, or runtime AI in this milestone.
- Keep the API host default at `127.0.0.1` and only allow local CORS origins.
- Use server-side Next.js health fetching so the browser does not supply backend paths or filesystem inputs.

### Accepted suggestions

- Add root workspace scripts for `dev`, `build`, `test`, `typecheck`, `lint`, and `check`.
- Add small unit tests for the health contract, drift-engine boundary placeholder, and API health route.
- Use package source files for type exports while runtime imports continue to target built `dist` output.

### Rejected suggestions

- No runtime AI was added.
- No persistence, adapters, domain comparison, Docker, or generic workflow framework was added.

### Corrections

- `pnpm` was unavailable as a direct executable, so commands were run through `corepack pnpm`.
- Root scripts were adjusted to use `corepack pnpm` internally for this environment.
- `pnpm check` order was adjusted to build workspace package runtime outputs before tests that resolve package imports through Vite.
- Biome config was migrated to the current schema and `preset` rule syntax.

### Verification

- `corepack pnpm check` passed.
- Started the built Fastify API with `corepack pnpm --filter @config-drift-guard/api start` and verified `GET http://127.0.0.1:4000/health` returned `{"service":"config-drift-guard-api","status":"ok"}`.
- Started the built Next.js app with `corepack pnpm --filter @config-drift-guard/web start` and verified `GET http://127.0.0.1:3000/` returned HTTP 200.

### Result and remaining risks

The workspace foundation is in place and intentionally does not claim domain readiness. Remaining product risks are the later deterministic drift engine, persistence, explicit state machine, executor, SSE notifications, immutable plans, stale-plan validation, atomic reconciliation, and verification workflow.

## Session 02 — Contracts and Persistence

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 2 — Persistence and contracts
**Commit:** `9f18cfa` — `feat: define shared contracts and SQLite persistence`

### Objective

Implement the evaluator-ready persistence/contracts slice: Zod contracts, Drizzle SQLite schema, migrations, repository methods, service-config environment seed, and read-time JSON validation.

### Complete prompt

> See [full transcript](ai/02-contracts-persistence.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/02-contracts-persistence.md#complete-interaction).

### Author decisions

- Use Drizzle as planned; raw SQLite was not selected.
- Keep persistence in `apps/api` and leave `packages/drift-engine` free of HTTP, database, filesystem, and React dependencies.
- Seed only the primary service-config environment to avoid distracting from the main slice.
- Store server-controlled fixture identifiers in environment metadata rather than accepting browser-provided filesystem paths.

### Accepted suggestions

- Validate persisted JSON on reads using the shared Zod contracts.
- Add repository methods around domain concepts instead of exposing table-shaped CRUD.
- Add explicit contracts for environments, runs, steps, findings, remediation plans, decisions, events, and run snapshots.
- Add tests for seeded metadata, repository round-trips, immutable plan storage, decisions, events, and invalid persisted JSON.

### Rejected suggestions

- No runtime AI was added.
- No documentation-drift environment was added in this milestone.
- No generic workflow framework, state-machine implementation, or reconciliation implementation was added before the deterministic core is ready.

### Corrections

- `rtk` was unavailable in the shell, so commands were run directly with `corepack pnpm`.
- The existing install initially lacked the `better-sqlite3` native binding; the package install script was run directly to build it locally.
- API tests initially resolved stale contracts `dist`; a Vitest alias was added for test-time source resolution.

### Verification

- `corepack pnpm lint` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed.
- `corepack pnpm test` passed after building the native SQLite binding.

### Result and remaining risks

Shared contracts and SQLite persistence are in place. Remaining product risks are deterministic drift-engine behavior, explicit state machine, explicit workflow executor, run-detail snapshots, SSE notifications, immutable plan generation from actual drift, approval-gated reconciliation, stale-plan validation, atomic apply, and verification.

## Session 03 — Deterministic Drift Engine

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 3 — Pure drift engine
**Commit:** `aee5686` — `feat: implement deterministic configuration drift engine`

### Objective

Implement the pure normalized-state comparison engine for the primary service-configuration scenario without adding runtime AI, HTTP, database, filesystem, React, state-machine, executor, SSE, or reconciliation code.

### Complete prompt

> See [full transcript](ai/03-drift-engine.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/03-drift-engine.md#complete-interaction).

### Author decisions

- Keep the milestone limited to `packages/drift-engine` plus documentation updates.
- Use adapter-provided top-level managed fields so service adapters can own `image`, `replicas`, and `environment` while ignoring runtime metadata.
- Use adapter-provided managed-field order for top-level findings and lexicographic ordering for nested object keys to make finding order and sequence stable.
- Use `sha256:`-prefixed canonical JSON digests for normalized managed state and generated targets.

### Accepted suggestions

- Add explicit finding kinds for `added`, `removed`, and `changed` inside the pure engine.
- Add default severity policy for the service-config fields and allow callers to supply a deterministic policy override.
- Deep-clone returned finding values and target data to avoid mutating caller-owned inputs.
- Preserve unmanaged observed fields when generating a complete remediation target.

### Rejected suggestions

- No runtime AI was added.
- No HTTP, database, filesystem, React, state-machine, executor, SSE, approval, or reconciliation implementation was added in this milestone.
- No generic workflow framework or broad adapter plugin system was introduced.

### Corrections

- `rtk` was unavailable in the shell, so commands were run directly with `corepack pnpm`.
- Strict TypeScript initially rejected one readonly test mutation and one JSON-object narrowing case; both were corrected without weakening compiler settings.

### Verification

- `corepack pnpm --filter @config-drift-guard/drift-engine test` passed.
- `corepack pnpm --filter @config-drift-guard/drift-engine typecheck` passed after corrections.
- Full repository checks are run before committing.

### Result and remaining risks

The pure deterministic drift engine is implemented and tested. Remaining product risks are integration with the service-config adapter, explicit run state machine, explicit workflow executor, persisted run snapshots using this engine, SSE refetch notifications, approval-gated reconciliation, stale-plan validation, atomic apply, and verification convergence.

## Session 04 — Persisted Drift Scans

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 4 — First end-to-end slice
**Commit:** `904a2e3` — `feat: execute and display persisted drift scans`

### Objective

Implement the evaluator-ready scan slice: local service-config adapter, explicit run state machine, explicit workflow executor, persisted steps/findings/plan, start-run and run-detail APIs, and one-page browser UI with refresh-safe persisted state.

### Complete prompt

> See [full transcript](ai/04-persisted-drift-scans.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/04-persisted-drift-scans.md#complete-interaction).

### Author decisions

- Execute the six-step scan synchronously inside the API request for this vertical slice instead of adding background workers or a generic workflow framework.
- Keep local adapter fixtures server-owned and in-process for this increment; environment metadata exposes fixture names only, not user-selectable filesystem paths.
- Store the last run ID in browser local storage so refreshes refetch the authoritative REST snapshot instead of duplicating state-machine logic in React.
- Stop at immutable plan generation because SSE and reconciliation were outside this requested increment.

### Accepted suggestions

- Persist every workflow step and finding before returning the run snapshot.
- Use the pure drift engine for comparison, digests, severity, and target generation.
- Add endpoint tests that prove a run can be created and read back by ID.
- Add workflow tests for the three expected service-config findings and generated plan target.

### Rejected suggestions

- No runtime AI was added.
- No SSE, generic workflow/DAG framework, documentation-drift adapter, approval APIs, or reconciliation implementation was added in this milestone.
- Browser input was not allowed to provide filesystem paths or remediation operations.

### Corrections

- `rtk` was unavailable in the shell, so commands were run directly with `corepack pnpm`.
- Biome required formatting/import-order fixes and a React hook dependency correction.
- The API package needed explicit dependencies on `@config-drift-guard/drift-engine` and `zod`; `corepack pnpm install` refreshed workspace links and the lockfile.

### Verification

- `corepack pnpm check` passed.

### Result and remaining risks

The evaluator can start a persisted service-config drift scan from the browser, see the final timeline and findings, and refresh to refetch the saved run snapshot. Remaining product risks are SSE notifications, approval/rejection APIs, stale-plan validation, atomic reconciliation, post-write verification, additional failure hardening, and any secondary documentation-drift adapter.

## Session 05 — SSE Workflow Progress

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 5 — Live progress
**Commit:** `d9c8c27` — `feat: stream workflow progress with server-sent events`

### Objective

Add persisted event replay and minimal server-sent events while keeping REST run snapshots authoritative and avoiding any React-side state-machine duplication.

### Complete prompt

> See [full transcript](ai/05-sse-workflow-progress.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/05-sse-workflow-progress.md#complete-interaction).

### Author decisions

- Reuse the existing persisted `events` table instead of adding a separate stream store.
- Keep SSE payloads compact: run ID, event ID, event type, and current run version.
- Keep React passive: EventSource notifications trigger REST refetches and are displayed for observability, but the snapshot drives all workflow state.
- Use in-process scheduling for the existing explicit executor rather than introducing workers, queues, DAGs, or a generic workflow framework.

### Accepted suggestions

- Add `Last-Event-ID` replay by querying persisted events after the provided monotonic event ID.
- Clean up run event listeners when the SSE socket closes.
- Guard SSE writes so a disconnected client cannot fail workflow execution.
- Show both the persisted event log and compact live notifications in the one-page console.

### Rejected suggestions

- No runtime AI was added.
- No approval/rejection or reconciliation behavior was added in this milestone.
- No React-side state transitions were added; REST remains authoritative.

### Corrections

- Fastify injection is not ideal for held-open SSE response testing, so replay/listener behavior is covered through repository tests and endpoint behavior is verified through type/build checks.

### Verification

- Full repository checks are run before committing.

### Result and remaining risks

The UI can subscribe to compact run-change notifications, reconnect with browser-managed `Last-Event-ID`, and refetch authoritative snapshots. Remaining product risks are approval/rejection APIs, stale-plan validation, atomic reconciliation, post-write verification, failure hardening, and direct manual browser verification of the SSE stream.

## Session 06 — Approval-Gated Reconciliation

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle (opencode/big-pickle)
**Milestone:** Milestone 6 — Approval and reconciliation
**Commit:** `804191b` — `feat: add approval-gated reconciliation and verification`

### Objective

Implement the evaluator-ready reconciliation path: immutable server-generated plan approval/rejection, local-operator decision records, stale-plan protection, atomic observed-state apply, verification scan, and UI controls without allowing browser-submitted replacement operations.

### Complete prompt

> See [full transcript](ai/06-approval-reconciliation.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/06-approval-reconciliation.md#complete-interaction).

### Author Decisions

- Keep the drift engine pure; filesystem I/O stays in the API adapter.
- Preserve one state-machine module and one explicit workflow executor; no workflow/DAG framework was added.
- Treat the observed-state path as server-controlled configuration, defaulting to `./data/service-config.observed.json`.
- Reject unknown decision request fields so browser-submitted replacement operations fail validation instead of being interpreted.
- Return 202 for approve (async reconciliation) and 200 for reject (synchronous terminal transition).

### Accepted Suggestions

- Persist a local-operator decision before reconciliation starts.
- Re-read observed state and compare the current managed-field digest to the plan digest before mutation.
- Build and validate a complete observed document by preserving unmanaged runtime metadata and replacing only adapter-managed fields.
- Write through a same-directory temporary file, fsync where practical, and rename atomically.
- Verify convergence by scanning observed state again after apply and only then marking the run succeeded.
- Clear findings after successful verification so the run snapshot reflects converged state.

### Rejected Suggestions

- No runtime AI was added.
- No generic workflow framework, policy DSL, browser-authored operations, or documentation-drift adapter was added.
- No browser-provided filesystem path was accepted.

### Corrections

- Repository run-state updates were adjusted to preserve existing evidence digests when optional fields are omitted.
- Tests use per-test server-side observed-state paths so file-backed reconciliation state does not leak between cases.
- Biome import ordering and formatting were corrected after each check attempt.
- Strict TypeScript required cloning Zod passthrough output through `JSON.parse(JSON.stringify(...))` to produce a proper `JsonValue`.

### Verification

- `corepack pnpm --filter @config-drift-guard/api test` passed (15 tests).
- `corepack pnpm check` passed (lint, typecheck, build, test across all 4 workspace packages).

### Result and remaining risks

Approval-gated reconciliation is implemented for the primary service-config scenario. The evaluator can now run a scan, see findings and evidence, approve or reject the immutable plan, observe reconciliation steps, and see verification succeed or fail. Remaining risks are broader failure hardening, reset/reseed convenience for repeated demos, direct manual browser verification, and the optional structured documentation-drift adapter.

## Session 07 — Structured Documentation Drift

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 7 — Documentation drift
**Commit:** `e83fc19` — `feat: detect structured documentation drift`

### Objective

Implement the secondary structured-documentation adapter as an evaluator-ready vertical slice while reusing the existing deterministic workflow, persisted findings, evidence, immutable plan, approval, stale-plan guard, atomic apply, verification, REST snapshots, SSE notifications, and operator UI.

### Complete prompt

> See [full transcript](ai/07-documentation-drift.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/07-documentation-drift.md#complete-interaction).

### Author decisions

- Keep documentation parsing and Markdown serialization in the API adapter; the drift engine remains pure and unchanged.
- Compare only rows in the managed `config-drift-guard` Markdown block and ignore arbitrary prose.
- Represent the immutable plan target as structured setting rows; the adapter deterministically renders those rows back into a corrected Markdown table during reconciliation.
- Reuse the existing one-page operator console without adding documentation-specific UI branches.

### Accepted suggestions

- Add a second seeded environment named structured documentation drift.
- Detect changed `retries.default`, missing `timeout`, and obsolete `legacy_mode` from the seeded Markdown table.
- Reuse the existing approval, stale-plan digest validation, atomic temp-file rename, and verification scan.
- Add tests for documentation drift detection and API-level reconciliation.

### Rejected suggestions

- No runtime AI was added.
- No generic adapter plugin framework, DAG engine, policy language, or prose-semantic comparison was introduced.
- Browser input still cannot provide filesystem paths or remediation operations.

### Corrections

- Biome formatting/import-order issues were corrected after the first full check attempt.
- Strict TypeScript required narrowing the documentation observed input to a Markdown string before replacement.

### Verification

- `corepack pnpm --filter @config-drift-guard/api test` passed.
- `corepack pnpm check` passed.

### Result and remaining risks

Structured documentation drift now uses the same persisted workflow, evidence, immutable plans, approval controls, stale-plan validation, atomic apply, and verification UI as service configuration drift. Remaining risks are broader failure hardening, reset/reseed convenience for repeated demos, direct manual browser verification, and only supporting the one managed Markdown table shape.

## Session 08 — Failure Hardening

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Milestone 8 — Failure hardening
**Commit:** `76a87e8` — `test: cover workflow transitions and failure scenarios`

### Objective

Cover workflow transitions and failure scenarios for the evaluator-ready vertical slice without adding runtime AI or broad orchestration abstractions.

### Complete prompt

> See [full transcript](ai/08-failure-hardening.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/08-failure-hardening.md#complete-interaction).

### Author decisions

- Keep hardening local to the existing explicit state-machine, repository, API route, and workflow tests.
- Do not add a generic workflow framework, DAG abstraction, runtime AI, browser-authored filesystem paths, or arbitrary remediation operation input.
- Mark interrupted queued/running runs failed on startup rather than resuming in-process work that may have lost adapter context.
- Require reset requests to be empty so reset remains server-controlled.

### Accepted suggestions

- Add deterministic tests for invalid canonical state and malformed observed state before plan generation.
- Assert stale-plan failure skips apply and preserves the changed observed state.
- Simulate apply failure and verification mismatch through test adapters.
- Add exhaustive legal/illegal transition coverage around the explicit state-machine functions.
- Add persisted-event replay and listener cleanup coverage.

### Rejected suggestions

- No runtime AI was added.
- No generic workflow framework, policy language, or plugin system was introduced.
- No browser-provided path or replacement operation input was accepted for reset or reconciliation.

### Corrections

- The reset endpoint was tightened from ignoring extra payload fields to rejecting non-empty bodies with `invalid_reset_request`.
- Documentation was reconciled after adding reset and startup recovery behavior.

### Verification

- `corepack pnpm --filter @config-drift-guard/api test` passed before the final full workspace check.

### Result and remaining risks

Failure hardening now covers the planned Milestone 8 scenarios and preserves deterministic mutation boundaries. Remaining risks are limited direct browser/manual verification in this session and the intentionally narrow adapter fixtures.

## Session 09 — Documentation and submission

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Milestone 9 — Documentation and submission
**Commit:** `8cecfe0` — `docs: finalize architecture, trade-offs, and AI usage`

### Objective

Reconcile all documentation to reflect implemented behavior, create architecture and trade-off documents, produce a demo walkthrough, update the project plan with LANDED markers and commit SHAs, and prepare the repository for submission.

### Complete prompt

> See [full transcript](ai/09-documentation-submission.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/09-documentation-submission.md#complete-interaction).

### Author decisions

- Create separate architecture and trade-off documents rather than expanding the README.
- Include the API implementation status indicators (checkmark/cross) directly in the plan's API surface section.
- Backfill commit SHAs retroactively into all existing sessions rather than leaving them as pending.
- Remove the screenshots/GIF item from milestone 9 since no screenshot tooling was available.

### Accepted suggestions

- Add the three-layer text diagram to ARCHITECTURE.md.
- Document all eight trade-offs with chosen/cost/benefit structure.
- Include the demo script with both happy paths and three failure paths.
- Mark milestone 9 as LANDED with the documentation commit.

### Rejected suggestions

- No runtime AI was added.
- No screenshots were captured in this session.
- No new features or code changes were introduced.

### Corrections

- The plan originally listed `docs: finalize architecture, trade-offs, and AI usage` with `(sha pending)`. The actual SHA `8cecfe0` was recorded after commit.

### Verification

- `corepack pnpm check` passed.
- All documentation links in README resolve to existing files.

### Result and remaining risks

All documentation reflects implemented behavior. The repository is ready for submission review. Remaining risks are limited to the intentionally narrow adapter fixtures and the absence of a screenshot in the README.

## Session 10 — Maintenance

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt5.5, big pickle
**Milestone:** Maintenance — SSE hardening, demo mode, notifications
**Commit:** `5a7bc72` — `fix: maintenance`

### Objective

Add demo-mode configurable delays, harden SSE with cross-origin support and heartbeat keepalive, add instant approve/reject success notifications in the operator console, make the workflow executor async-ready, and create the AGENTS.md agent configuration file.

### Complete prompt

> See [full transcript](ai/10-maintenance.md#complete-prompt).

### Complete interaction

> See [full transcript](ai/10-maintenance.md#complete-interaction).

### Author decisions

- Make the workflow executor async to support configurable phase delays without changing the synchronous step logic.
- Use `void executor.execute(run.id)` in the API route handlers since the executor runs in-process and errors are caught internally.
- Reflect the requesting origin for SSE CORS rather than using a wildcard, since browsers require exact origin matches for event streams.
- Keep the notification timer in a ref to handle cleanup correctly on unmount.
- Remove the SSE error handler that showed a disconnected warning, since SSE reconnection is browser-managed.

### Accepted suggestions

- Add configurable delays for demo mode.
- Add cross-origin SSE support.
- Add heartbeat keepalive.
- Add instant approve/reject success notifications.
- Create AGENTS.md for AI coding agents.

### Rejected suggestions

- No runtime AI was added.
- No generic workflow framework or DAG abstraction was introduced.
- No browser-provided filesystem paths were accepted.

### Corrections

- The existing `try/catch` around `executor.execute()` was replaced with `void` because the async executor already handles errors internally via the state machine.

### Verification

- `corepack pnpm check` passed with all 41 tests passing across 6 test files.

### Result and remaining risks

The operator console now shows live progress with configurable delays, SSE connections are hardened for cross-origin use with heartbeat keepalive, and approve/reject decisions produce instant visual feedback. Remaining risks are the intentionally narrow adapter fixtures and the absence of a screenshot in the README.
