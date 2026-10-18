# GitHub main admission activation — issue #43

**Status (2026-10-17): proposal prepared; GitHub admission is NOT activated.** This document does not enforce the rules simply by existing in the repository. Follow it from a trusted operator host with authenticated `gh`, after its PR and read-only preflight checks pass. Never use a model, CI job, or repository write token as a substitute for authorized ruleset administration.

## Exact provider baseline and binding

- Repository: `ryjen/config-drift-guard`, default branch `main`; live main SHA on inspection `36286b4e489b3ac424fb3d2ab85f1925e8f47206`.
- Active default branch ruleset [ID 18793052](https://github.com/ryjen/config-drift-guard/rules/18793052), source `ryjen/config-drift-guard`; target `branch`; `~DEFAULT_BRANCH`, enforcement `active`.
- Existing rules: **deletion** and **non_fast_forward** only. Standing bypass: `RepositoryRole` ID `5`, mode `always`.
- Observed timestamp: `2026-07-10T16:10:43.266-07:00`. Recheck it; a changed timestamp **blocks** this prepared update until the new state is reviewed.
- Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), triggered by `pull_request` and `push/main`, running one stable **`check`** job (`pnpm check` with lint, typecheck, build and tests). Workflow token permission is `contents: read`.
- Required check source: **GitHub Actions App, integration ID 15368**, independently observed on successful `main` check-run [117239252802](https://github.com/ryjen/config-drift-guard/actions/runs/38980276862/job/117239252802), commit `36286b4e489b3ac424fb3d2ab85f1925e8f47206`.
- Classic branch-protection API alone reports no required status checks; the effective ruleset API on inspection lists only deletion/non-fast-forward. A workflow reporting success does **not** imply provider-required admission.

The proposal [`examples/provider-admission/main.ruleset.json`](../../examples/provider-admission/main.ruleset.json) retains the existing deletion and force-push restrictions, and adds:

1. **Require pull requests** and resolved review conversations. Retain all three allowed repository merge methods.
2. **Require the source-pinned `check` context** (`integration_id: 15368`), with strict current-base freshness.
3. **Remove `always` bypass actors.** Admin ability to edit provider rulesets remains a separate privileged control-plane operation.
4. **Require zero mandatory approving GitHub reviews.** This is intentionally compatible with the solo maintainer; it does *not* prove human reviewer independence. Accountable review is still a policy requirement; reconsider a mandatory reviewer only when an eligible independent reviewer exists.

No GitHub automation/CI, application reconciliation logic, or production runtime permissions are changed by the proposed ruleset payload.

## Operator sequence — inspect, guard, activate, observe

Use a trusted clone of the **reviewed and merged** main revision containing this file, script and candidate JSON. Check `gh auth status` and repository admin permission. The connected read-only GitHub integration can inspect policy but **cannot perform ruleset PUT**. Never copy a token into logs, issues or terminals.

### 1. Read-only source and baseline validation

```bash
set -euo pipefail
cd /path/to/config-drift-guard
git switch main
git pull --ff-only
gh auth status
python3 scripts/check-main-ruleset.py --mode proposal

gh api repos/ryjen/config-drift-guard/rulesets/18793052 \
  > /tmp/config-drift-guard-43-before.json
python3 scripts/check-main-ruleset.py \
  --mode baseline --observed /tmp/config-drift-guard-43-before.json
```

The checker validates repository identity, original timestamp as an offset-aware instant, all six relevant policy fields, allowed rules, exact source-bound check and no extra bypass in the candidate. `--mode proposal` and `--mode baseline` are read-only; both must print `OK`. A changed baseline is a **STOP and reassess**, not an invitation to restore old rules.

### 2. Apply through a separately authorized administrator (one mutation)

**This step changes live GitHub repository rules.** Execute only after reviewing the exact proposed JSON and original baseline. The PUT is conditional on **fresh GET AND successful preflight** in the same block; keep the interval minimal. This is *not* provider-level atomic compare-and-swap: a concurrent edit between GET and PUT remains possible and must be reconciled on readback.

```bash
if gh api repos/ryjen/config-drift-guard/rulesets/18793052 \
    > /tmp/config-drift-guard-43-before.json \
  && python3 scripts/check-main-ruleset.py \
    --mode baseline --observed /tmp/config-drift-guard-43-before.json
then
  gh api --method PUT \
    -H 'Accept: application/vnd.github+json' \
    repos/ryjen/config-drift-guard/rulesets/18793052 \
    --input examples/provider-admission/main.ruleset.json \
    > /tmp/config-drift-guard-43-after.json
else
  printf '%s\n' 'STOP: live policy changed, is inaccessible or preflight failed' >&2
  false
fi
```

The PUT replaces the selected ruleset's rules and bypass list. It must not be retried blindly after an error, especially if the write succeeded but its response failed. Never weaken the payload for convenience, use another credential to bypass a 401/403, or disable current CI jobs to get a green result.

### 3. Independently observe provider state (read-only)

```bash
gh api repos/ryjen/config-drift-guard/rulesets/18793052 \
  > /tmp/config-drift-guard-43-observed.json
python3 scripts/check-main-ruleset.py \
  --mode active --observed /tmp/config-drift-guard-43-observed.json

gh api repos/ryjen/config-drift-guard/rules/branches/main \
  --jq '[.[] | {type, ruleset_id}]'
```

The expected effective `main` types are `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`. The active verifier allows only **known inert** provider-added defaults (e.g., `do_not_enforce_on_create=false`, the documented unattributed-Copilot-approval default at zero required approvals), and rejects substantive drift. When the live policy is active, the **old baseline must fail**; do not reapply the original payload to make it pass.

### 4. Demonstrate provider rejection with a disposable PR

Use a separate throwaway branch with one deliberately invalid TypeScript *test-only* file under `apps/api/src/` that will fail the existing `typecheck` or `test` step. Do **not** edit CI workflows, existing product files, `main`, secrets, or provider rules. Have GitHub create a normal PR (not draft) and run the stable `check` job to a completed `failure`; confirm the PR's API `mergeable_state: blocked`, not just red CI. Record branch, PR, base and head SHAs, run/job IDs, failure reason, full ruleset readback and observation time in [issue #43](https://github.com/ryjen/config-drift-guard/issues/43).

Close the disposable PR **without merging**, then delete only its verified throwaway branch. The test demonstrates a failing required-check path; a missing-check or attempted direct push is *not* qualified unless exercised safely and separately. Do not manufacture a success status or test protected administration with an untrusted token. If provider results are ambiguous, leave #43 open.

### 5. Failure recovery and residual controls

Authorized administrators can still alter, disable or delete GitHub rulesets even when `bypass_actors: []`. Record control-plane changes separately with an accountable owner, current configuration, reason, bounded exception, expiry and independent post-restore verification. Prefer regular passing PRs and retaining the rule rather than exceptional bypass. Avoid invoking CI or untrusted agent runtimes to change GitHub settings.

Provider validation of `pull_request` jobs usually concerns the candidate **merge ref**; the final squash/rebase commit differs. Current-base freshness protects against stale checks but does not prove bitwise identity of a later merge commit. The `push` workflow provides post-merge evidence. No review count was enforced in the ruleset, and the configured `check` is not a substitute for human governance decisions.

## Completion criteria

- [ ] Read-only proposal and unchanged provider baseline both pass.
- [ ] Admin applies the exact reviewed policy (separate authorized operation).
- [ ] Active readback and effective `main` rules show strict, GitHub Actions-source-bound `check` and required PRs with **no bypass**.
- [ ] Deliberately failing disposable normal PR yields a failed `check` **and** provider `mergeable_state: blocked`; cleanup completed.
- [ ] Baseline snapshot, exact operator action, readback, failure evidence and residual limits documented in #43.

**A passing CI job or merged documentation PR alone is not completion of #43.**
