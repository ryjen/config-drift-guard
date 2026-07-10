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
**Commit:** Pending at time of entry; expected message `chore: initialize TypeScript workspace and development tooling`.

### Objective

Initialize the evaluator-ready TypeScript workspace foundation without adding SQLite, domain drift behavior, Docker, or speculative shared libraries.

### Complete prompt

The user requested work in the current repository, required reading `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`, and asked for a pnpm workspace with Fastify API, Next.js web app, contracts and drift-engine packages, strict TypeScript, Biome, Vitest, root scripts, API `/health`, web-to-API connectivity page, loopback binding, local-only CORS, safe `.gitignore`, environment examples, checks, app startup verification, and commit message `chore: initialize TypeScript workspace and development tooling`.

### Complete interaction

The assistant read the required docs, inspected the docs-only repository state, scaffolded the workspace, installed dependencies with Corepack because `pnpm` was not directly available, ran checks, corrected workspace package type exports and script ordering, migrated Biome config, updated README status, and prepared verification before commit.

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
**Commit:** Pending at time of entry; expected message `feat: define shared contracts and SQLite persistence`.

### Objective

Implement the evaluator-ready persistence/contracts slice: Zod contracts, Drizzle SQLite schema, migrations, repository methods, service-config environment seed, and read-time JSON validation.

### Complete prompt

The user requested work in the current repository, required reading `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`, and asked for strict TypeScript, deterministic boundaries, pure drift engine separation, one state-machine and executor later, REST snapshots as authoritative, SSE as notification only, no browser filesystem paths, adapter-managed fields only, server-owned immutable plans, approval/stale-plan/atomic/verification constraints for later reconciliation, documentation updates for divergence, checks before commit, and commit message `feat: define shared contracts and SQLite persistence`.

### Complete interaction

The assistant read the required docs, inspected the workspace, added Zod contracts, added Drizzle with `better-sqlite3`, created a SQLite schema and initial migration SQL, implemented database initialization and a domain-shaped persistence repository, seeded the primary service-config environment, exposed `GET /api/environments`, added repository and API tests, corrected transaction usage, handled the local native SQLite binding build, added a Vitest alias so API tests use contracts source instead of stale `dist`, and updated implementation documentation.

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
**Commit:** Pending at time of entry; expected message `feat: implement deterministic configuration drift engine`.

### Objective

Implement the pure normalized-state comparison engine for the primary service-configuration scenario without adding runtime AI, HTTP, database, filesystem, React, state-machine, executor, SSE, or reconciliation code.

### Complete prompt

The user requested work in the current repository, required reading `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`, and asked for an evaluator-ready vertical slice with strict TypeScript, deterministic drift detection, a pure drift engine, adapter-managed fields only, immutable server-side plans later, approval/stale-plan/atomic/verification constraints for later reconciliation, documentation updates for implementation divergence, checks before commit, and commit message `feat: implement deterministic configuration drift engine`. The specific implementation requirements were deterministic ordering, added/removed/changed findings, stable JSON-pointer-like paths, no mutation of caller-owned data, adapter-provided managed fields, severity classification, SHA-256 canonical digests, complete target-state generation, comprehensive tests, and a service-config scenario with exactly `/image`, `/replicas`, and `/environment/LOG_LEVEL` changed while ignoring `runtimePid`.

### Complete interaction

The assistant read the required docs, inspected the workspace and drift-engine placeholder, implemented a pure TypeScript drift-engine API, added deterministic canonical JSON stringification and SHA-256 digests, compared only managed top-level fields recursively, emitted stable pointer-style paths, classified severity with service-config defaults and an override hook, generated complete target state by overlaying canonical managed fields onto observed state, preserved unmanaged fields, added unit tests, fixed strict TypeScript narrowing issues, and updated README implementation status.

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
