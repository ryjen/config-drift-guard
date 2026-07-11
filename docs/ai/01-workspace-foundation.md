# Session 01 — Workspace Foundation

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Milestone 1 — Workspace foundation
**Commit:** `5cf81ae` — `chore: initialize TypeScript workspace and development tooling`

## Objective

Initialize the evaluator-ready TypeScript workspace foundation without adding SQLite, domain drift behavior, Docker, or speculative shared libraries.

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
> chore: initialize TypeScript workspace and development tooling
> ```
>
> ```text
> Create a pnpm workspace with:
>
> - apps/api using Fastify;
> - apps/web using Next.js and React;
> - packages/contracts;
> - packages/drift-engine;
> - strict TypeScript;
> - Biome;
> - Vitest;
> - root dev/build/test/typecheck/lint/check scripts;
> - API /health;
> - a basic web-to-API connectivity page;
> - loopback binding and local-only CORS;
> - safe .gitignore and environment examples.
>
> Do not add SQLite, domain behavior, Docker, or speculative shared libraries yet.
>
> Verify pnpm check and both applications start.
> ```

## Complete interaction

### 1. Read required docs

The assistant read the four required documents before making any code changes:

- `README.md` — product overview, assessment focus, planned scenarios
- `docs/CURRENT-UNDERSTANDING.md` — product model, drift domains, success definition
- `docs/PLAN.md` — milestones, data model, API surface, security constraints
- `docs/DECISIONS.md` — 15 ADRs including deterministic authority, REST snapshots, adapter-scoped fields

### 2. Inspect repository state

The repository contained only documentation:

```text
.git/
.gitignore
.qmd/
.serena/
AGENTS.md
docs/
README.md
```

Single prior commit: `0db6848 feat: initial documentation`

The `.gitignore` only ignored `.serena` and `.qmd`. No `node_modules`, no workspace config, no application code.

### 3. Scaffold workspace

Created all workspace files in a single batch:

**Root config:**
- `package.json` — workspace scripts (`dev`, `build`, `test`, `typecheck`, `lint`, `check`)
- `pnpm-workspace.yaml` — declares `apps/*` and `packages/*`
- `tsconfig.base.json` — strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `NodeNext` module resolution
- `biome.json` — formatter (space, 2 indent, 100 lineWidth) + linter (recommended preset)
- `.env.example` — root environment template

**apps/api:**
- `package.json` — Fastify 5, `@fastify/cors`, workspace contracts dependency, tsx watch dev
- `tsconfig.json` — extends base, `outDir: dist`, `rootDir: src`, `declaration: true`
- `.env.example` — `HOST=127.0.0.1`, `PORT=4000`, `WEB_ORIGIN=http://127.0.0.1:3000`
- `src/app.ts` — builds Fastify instance, registers CORS (local origins only), mounts `GET /health`
- `src/server.ts` — reads `HOST`/`PORT` env, validates port range, starts server
- `src/app.test.ts` — inject test proving health returns `{"service":"config-drift-guard-api","status":"ok"}`

**apps/web:**
- `package.json` — Next.js 15, React 19, workspace contracts dependency
- `tsconfig.json` — extends base, `Bundler` module resolution, Next.js plugin
- `next.config.ts` — empty config
- `next-env.d.ts` — Next.js type reference
- `.env.example` — `API_BASE_URL=http://127.0.0.1:4000`
- `app/layout.tsx` — root HTML shell
- `app/page.tsx` — server-side fetch of API health, displays connectivity status
- `app/styles.css` — restrained operational styling

**packages/contracts:**
- `package.json` — exports both `types` (source) and `import` (dist)
- `tsconfig.json` — extends base
- `src/index.ts` — `HealthResponse` interface + `healthResponse` constant
- `src/index.test.ts` — verifies health contract shape

**packages/drift-engine:**
- `package.json` — exports both `types` (source) and `import` (dist)
- `tsconfig.json` — extends base
- `src/index.ts` — `DRIFT_ENGINE_VERSION` constant + getter (pure, no deps)
- `src/index.test.ts` — verifies engine version placeholder

**.gitignore** — expanded from 2 lines to cover `node_modules`, `dist`, `.next`, `coverage`, `.env`, logs, OS noise

### 4. Install dependencies

`pnpm` was not directly available as an executable. Used Corepack:

```bash
corepack prepare pnpm@10.13.1 --activate
corepack pnpm install
```

Installed 132 packages. Lockfile generated.

### 5. First check attempt — failures

**`corepack pnpm check`** failed because root scripts invoked nested `pnpm` which was not found.

**Fix:** Changed root scripts from `pnpm` to `corepack pnpm` internally.

**Second attempt** failed: Biome schema version mismatch (2.1.2 vs installed 2.5.3), deprecated `recommended` field.

**Fix:** Updated `$schema` to `2.5.3`, ran `corepack pnpm exec biome migrate --write` to convert to `preset: "recommended"`.

**Third attempt** failed: import order in `apps/api/src/app.ts`.

**Fix:** Reordered imports per Biome's expected order.

**Fourth attempt** failed: TypeScript could not find `@config-drift-guard/contracts` because package type exports pointed at `./dist/index.d.ts` which did not exist before first build.

**Fix:** Changed package type exports to `./src/index.ts` while keeping runtime imports on `./dist/index.js`.

**Fifth attempt** failed: API tests failed because Vitest/Vite resolves package entries at runtime; the `dist` did not exist yet.

**Fix:** Reordered `pnpm check` to run `build` before `test`, so workspace package runtime outputs exist before Vitest resolution.

### 6. Successful check

```bash
corepack pnpm check
```

All stages passed:
- Biome lint: 23 files checked, no errors
- TypeScript typecheck: all 4 workspace packages passed
- Build: all packages compiled, Next.js production build succeeded
- Vitest: 3 test files, 3 tests passed (contracts, drift-engine, API health)

### 7. Biome config cleanup

Ran `corepack pnpm exec biome migrate --write` to clean the deprecation warning in `biome.json` (deprecated `recommended` → `preset: "recommended"`).

Then discovered `!**/dist/**` glob patterns triggered Biome's `useBiomeIgnoreFolder` lint rule (since v2.2.0 trailing `/**` is unnecessary). Simplified to `!**/dist`, `!**/.next`, `!**/coverage`.

### 8. Verify both applications start

```bash
# API
corepack pnpm --filter @config-drift-guard/api start
curl http://127.0.0.1:4000/health
# → {"service":"config-drift-guard-api","status":"ok"}

# Web
corepack pnpm --filter @config-drift-guard/web start
curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
# → 200
```

Both applications start and respond correctly.

### 9. Documentation updates

- Updated `README.md` current status to reflect Milestone 1 completion with specific scope
- Added Local Development section with `corepack pnpm install/check/dev`
- Added Session 01 entry to `docs/AI-INTERACTION-LOG.md` with full evidence

### 10. Commit

```bash
git add . ':!AGENTS.md'
git commit -m "chore: initialize TypeScript workspace and development tooling"
# → 5cf81ae
```

Excluded pre-existing untracked `AGENTS.md` from the commit.

## Author decisions

- Keep the first implementation limited to foundation tooling and connectivity.
- Do not add SQLite, domain drift behavior, workflow modules, SSE, remediation, Docker, or runtime AI in this milestone.
- Keep the API host default at `127.0.0.1` and only allow local CORS origins.
- Use server-side Next.js health fetching so the browser does not supply backend paths or filesystem inputs.
- Exclude `AGENTS.md` from the foundation commit since it was not created in this session.

## Accepted suggestions

- Add root workspace scripts for `dev`, `build`, `test`, `typecheck`, `lint`, and `check`.
- Add small unit tests for the health contract, drift-engine boundary placeholder, and API health route.
- Use package source files for type exports while runtime imports continue to target built `dist` output.
- Build workspace packages before running tests that resolve their exports.

## Rejected suggestions

- No runtime AI was added.
- No persistence, adapters, domain comparison, Docker, or generic workflow framework was added.

## Corrections

- `pnpm` was unavailable as a direct executable, so commands were run through `corepack pnpm`.
- Root scripts were adjusted to use `corepack pnpm` internally for this environment.
- `pnpm check` order was adjusted to build workspace package runtime outputs before tests that resolve package imports through Vite.
- Biome config was migrated to the current schema and `preset` rule syntax.
- Biome file-exclude patterns were simplified from `!**/dist/**` to `!**/dist` per v2.2+ conventions.

## Verification

- `corepack pnpm check` passed (lint → typecheck → build → test).
- Started the built Fastify API with `corepack pnpm --filter @config-drift-guard/api start` and verified `GET http://127.0.0.1:4000/health` returned `{"service":"config-drift-guard-api","status":"ok"}`.
- Started the built Next.js app with `corepack pnpm --filter @config-drift-guard/web start` and verified `GET http://127.0.0.1:3000/` returned HTTP 200.

## Result and remaining risks

The workspace foundation is in place and intentionally does not claim domain readiness.

**What was delivered:**
- pnpm workspace with 4 packages (api, web, contracts, drift-engine)
- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- Biome lint/format, Vitest, root scripts including `check`
- Fastify API with `/health` endpoint and local-only CORS
- Next.js operator console page with server-side API health check
- Safe `.gitignore` and environment examples
- 3 tests passing across 3 test files

**Remaining risks are the later milestones:**
- Deterministic drift engine (packages/drift-engine is a placeholder only)
- SQLite persistence
- Explicit run state machine
- Explicit workflow executor
- SSE notifications
- Immutable plans
- Stale-plan validation
- Atomic reconciliation
- Post-write verification
- Documentation drift adapter
- Failure hardening
- Full documentation reconciliation
