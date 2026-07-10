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
