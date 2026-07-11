# Session 07 — Structured Documentation Drift

**Date:** 2026-07-10
**Tool/model:** OpenCode, gpt-5.5
**Milestone:** Milestone 7 — Documentation drift
**Commit:** `e83fc19` — `feat: detect structured documentation drift`

## Objective

Implement the secondary structured-documentation adapter as an evaluator-ready vertical slice while reusing the existing deterministic workflow, persisted findings, evidence, immutable plan, approval, stale-plan guard, atomic apply, verification, REST snapshots, SSE notifications, and operator UI.

## What changed

- Added `apps/api/src/adapters/documentation.ts` for structured documentation drift.
- Added `apps/api/src/adapters/atomic-file.ts` for shared atomic temp-file writes.
- Updated `apps/api/src/workflow-executor.ts` with a `DriftAdapter` interface.
- Updated `apps/api/src/adapters/service-config.ts` to reuse the shared atomic writer.
- Updated `apps/api/src/app.ts` to seed both scenarios and select adapters from persisted environment metadata.
- Updated `apps/api/src/persistence/repository.ts` with the second seeded environment.
- Added tests in `apps/api/src/workflow-executor.test.ts` and `apps/api/src/app.test.ts`.
- Updated `apps/web/app/operator-console.tsx` copy.
- Updated `README.md` and `docs/AI-INTERACTION-LOG.md`.

## Design decisions

- Kept `packages/drift-engine` unchanged and pure.
- Kept Markdown parsing and serialization inside the API adapter.
- Compared only rows in the managed `<!-- config-drift-guard:start/end -->` Markdown block.
- Represented the immutable plan target as structured setting rows and rendered those rows deterministically during reconciliation.
- Reused the existing one-page operator console and approval workflow.

## Scope and constraints

- No runtime AI was added.
- No generic adapter plugin framework, DAG engine, policy language, or prose-semantic comparison was introduced.
- Browser input still cannot provide filesystem paths or remediation operations.
- `AGENTS.md` remained untracked and was intentionally excluded.

## Commands

- `rtk corepack pnpm --filter @config-drift-guard/api test` passed.
- `rtk corepack pnpm check` initially failed on formatting/type narrowing, then passed after corrections.
- Final `rtk corepack pnpm check` passed.
- `rtk git add` + `rtk git commit -m "feat: detect structured documentation drift"` created `e83fc19`.

## Test evidence

- Added a documentation-drift scan test asserting three findings:
  - `/retries/default` changed;
  - `/timeout` missing;
  - `/legacy_mode` extra.
- Added a documentation reconciliation test asserting successful convergence and Markdown rewrite.
- Added an API-level documentation run/reconciliation test.
- Full `corepack pnpm check` passed.

## Remaining risks

- Documentation adapter supports one managed Markdown table shape only.
- No direct manual browser verification was performed, only automated API/workflow checks.
- Existing documentation drift support is intentionally narrow and does not generalize to prose semantics.
