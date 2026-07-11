# Session 03 — Deterministic Drift Engine

**Date:** 2026-07-10
**Tool/model:** OpenCode, big-pickle (opencode/big-pickle)
**Milestone:** Milestone 3 — Pure drift engine
**Commit:** `aee5686` — `feat: implement deterministic configuration drift engine`

## Objective

Implement the pure normalized-state comparison engine for the primary service-configuration scenario without adding runtime AI, HTTP, database, filesystem, React, state-machine, executor, SSE, or reconciliation code.

## Complete prompt

The user requested work in the current repository, required reading `README.md`, `docs/CURRENT-UNDERSTANDING.md`, `docs/PLAN.md`, and `docs/DECISIONS.md`, and asked for an evaluator-ready vertical slice with strict TypeScript, deterministic drift detection, a pure drift engine, adapter-managed fields only, immutable server-side plans later, approval/stale-plan/atomic/verification constraints for later reconciliation, documentation updates for implementation divergence, checks before commit, and commit message `feat: implement deterministic configuration drift engine`.

The specific implementation requirements were:

- deterministic ordering
- added, removed, and changed findings
- stable JSON-pointer-like paths
- no mutation of caller-owned data
- adapter-provided managed fields
- severity classification
- SHA-256 canonical digests
- complete target-state generation
- comprehensive tests

The service-config scenario must produce exactly:

- `/image` changed
- `/replicas` changed
- `/environment/LOG_LEVEL` changed

Unmanaged `runtimePid` must not produce drift.

## Complete interaction

The assistant read the required docs, inspected the workspace and drift-engine placeholder, implemented a pure TypeScript drift-engine API, added deterministic canonical JSON stringification and SHA-256 digests, compared only managed top-level fields recursively, emitted stable pointer-style paths, classified severity with service-config defaults and an override hook, generated complete target state by overlaying canonical managed fields onto observed state, preserved unmanaged fields, added unit tests, fixed strict TypeScript narrowing issues, and updated README implementation status.

## Author decisions

- Keep the milestone limited to `packages/drift-engine` plus documentation updates.
- Use adapter-provided top-level managed fields so service adapters can own `image`, `replicas`, and `environment` while ignoring runtime metadata.
- Use adapter-provided managed-field order for top-level findings and lexicographic ordering for nested object keys to make finding order and sequence stable.
- Use `sha256:`-prefixed canonical JSON digests for normalized managed state and generated targets.

## Accepted suggestions

- Add explicit finding kinds for `added`, `removed`, and `changed` inside the pure engine.
- Add default severity policy for the service-config fields and allow callers to supply a deterministic policy override.
- Deep-clone returned finding values and target data to avoid mutating caller-owned inputs.
- Preserve unmanaged observed fields when generating a complete remediation target.

## Rejected suggestions

- No runtime AI was added.
- No HTTP, database, filesystem, React, state-machine, executor, SSE, approval, or reconciliation implementation was added in this milestone.
- No generic workflow framework or broad adapter plugin system was introduced.

## Corrections

- `rtk` was unavailable in the shell, so commands were run directly with `corepack pnpm`.
- Strict TypeScript initially rejected one readonly test mutation and one JSON-object narrowing case; both were corrected without weakening compiler settings.
- Initial Biome lint failed on import ordering and formatting; fixed with `corepack pnpm biome check --write`.
- Test assertion for environment finding path was stale after managed-field ordering change; corrected to match `/image` first.

## Verification

- `corepack pnpm --filter @config-drift-guard/drift-engine test` passed (10 tests).
- `corepack pnpm --filter @config-drift-guard/drift-engine typecheck` passed after corrections.
- `corepack pnpm check` passed: lint, typecheck, build, and tests across the full workspace.
- Git diff inspected; only intended files staged.

## Commands and results

| Command | Result |
|---|---|
| `corepack pnpm --filter @config-drift-guard/drift-engine test` | 10 tests passed |
| `corepack pnpm --filter @config-drift-guard/drift-engine typecheck` | Passed after strict TS fixes |
| `corepack pnpm biome check --write packages/drift-engine/src/index.ts packages/drift-engine/src/index.test.ts` | Fixed 2 files |
| `corepack pnpm check` | Passed (lint + typecheck + build + test) |
| `git status --short` | 4 modified files, 1 unrelated untracked AGENTS.md |
| `git diff --stat` | 633 insertions, 8 deletions across 4 files |
| `git diff --check` | Clean |
| `git add` + `git commit -m "feat: implement deterministic configuration drift engine"` | Commit `aee5686` |

## Result and remaining risks

The pure deterministic drift engine is implemented and tested. Remaining product risks:

- Integration with the service-config adapter (Milestone 4).
- Explicit run state machine (Milestone 4).
- Explicit workflow executor (Milestone 4).
- Persisted run snapshots using this engine (Milestone 4).
- SSE refetch notifications (Milestone 5).
- Approval-gated reconciliation (Milestone 6).
- Stale-plan validation (Milestone 6).
- Atomic apply (Milestone 6).
- Verification convergence (Milestone 6).
- Documentation drift adapter (Milestone 7, optional).

## Files changed

| File | Action |
|---|---|
| `packages/drift-engine/src/index.ts` | Replaced placeholder with full engine |
| `packages/drift-engine/src/index.test.ts` | Replaced placeholder test with 10 comprehensive tests |
| `README.md` | Updated milestone status from 2 to 3 |
| `docs/AI-INTERACTION-LOG.md` | Added Session 03 entry |
