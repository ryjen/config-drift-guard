# GitHub main admission activation — issue #43

**Status (2026-10-17): provider admission ACTIVE and failing-check rejection VERIFIED.** Ruleset `18793052` requires pull requests and strict source-pinned `check` for `main`, with no ambient bypass. [Disposable PR #45](https://github.com/ryjen/config-drift-guard/pull/45) produced a failed required `check` and GitHub reported `mergeable_state: blocked`; it was closed unmerged and its branch deleted. The old **baseline/activation PUT below is historical and must NOT be replayed** now that the policy is active. For routine inspection use the **read-only `--mode active`** verification in step 3. See [issue #43 evidence](https://github.com/ryjen/config-drift-guard/issues/43#issuecomment-6244761893).

## Historical provider baseline and binding (before activation)

- Repository: `ryjen/config-drift-guard`, default branch `main`; live main SHA on inspection `36286b4e489b3ac424fb3d2ab85f1925e8f47206`.
- Active default branch ruleset [ID 18793052](https://github.com/ryjen/config-drift-guard/rules/18793052), source `ryjen/config-drift-guard`; target `branch`; `~DEFAULT_BRANCH`, enforcement `active`.
- Existing rules: **deletion** and **non_fast_forward** only. Standing bypass: `RepositoryRole` ID `5`, mode `always`.
- Observed timestamp: `2026-07-10T16:10:43.266-07:00`. Recheck it; a changed timestamp **blocks** this prepared update until the new state is reviewed.
- Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), triggered by `pull_request` and `push/main`, running one stable **`check`** job (`pnpm check` with lint, typecheck, build and tests). Workflow token permission is `contents: read`.
- Required check source: **GitHub Actions App, integration ID 15368**, independently observed on successful `main` check-run [117239252802](https://github.com/ryjen/config-drift-guard/actions/runs/38980276862/job/117239252802), commit `36286b4e489b3ac424fb3d2ab85f1925e8f47206`.
- Classic branch-protection API alone reports no required status checks; the effective ruleset API on inspection lists only deletion/non-fast-forward. A workflow reporting success does **not** imply provider-required admission.

The reviewed [`examples/provider-admission/main.ruleset.json`](../../examples/provider-admission/main.ruleset.json) was applied to that historical baseline. It preserves deletion and force-push restrictions and now requires:

1. **Require pull requests** and resolved review conversations. Retain all three allowed repository merge methods.
2. **Require the source-pinned `check` context** (`integration_id: 15368`), with strict current-base freshness.
3. **Remove `always` bypass actors.** Admin ability to edit provider rulesets remains a separate privileged control-plane operation.
4. **Require zero mandatory approving GitHub reviews.** This is intentionally compatible with the solo maintainer; it does *not* prove human reviewer independence. Accountable review is still a policy requirement; reconsider a mandatory reviewer only when an eligible independent reviewer exists.

The provider change did not alter GitHub workflow code, application reconciliation behavior or production runtime permissions.

## Activated provider observation and bounded proof (2026-10-17)

- **Ruleset readback:** `updated_at: 2026-10-17T19:26:01.079-07:00`, `enforcement=active`, source `ryjen/config-drift-guard`, `~DEFAULT_BRANCH`; `bypass_actors=[]`, `current_user_can_bypass=never`.
- **Effective `main` rules:** `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`; strict current-base `check` from GitHub Actions integration `15368`; zero required approving reviews, review threads must resolve.
- **Real rejection:** normal [PR #45](https://github.com/ryjen/config-drift-guard/pull/45), base `8acdf920f84c37387359576f8f488c254b9f0dac`, head `cdd78c4458c324f6ce5f8274e72bb6537e5c9e1a`, added only a deliberately failing Vitest file. [Run 39090210545](https://github.com/ryjen/config-drift-guard/actions/runs/39090210545) and required `check` job `117565165464` completed **failure** with the expected assertion at `apps/api/src/admission-negative-check-43.test.ts:7`.
- **Admission result:** authenticated GitHub PR readback after the failure showed `mergeable=true` (no Git conflict), but **`mergeable_state=blocked`**. PR closed **unmerged**; SHA-guarded deletion removed disposable branch `test/admission-negative-check-43-20261017`, verified absent via GitHub ref 404. Protected `main` was not modified by this test.
- **Limitations:** Missing-required-check and direct-push scenarios were not separately tested. An administrator can still edit ruleset settings in the provider control plane. GitHub PR checks generally run against a synthetic merge ref; a later squash commit has distinct post-merge validation identity. The zero-review-count rule avoids solo-maintainer deadlock but is not evidence of independent human review.

The [issue #43 evidence record](https://github.com/ryjen/config-drift-guard/issues/43#issuecomment-6244761893) contains the full observations. A green CI check or repository-local checker success **alone** would not have established this behavior.

## Historical activation operator sequence — completed; do not replay

**Do not run historical steps 1–2 to reactivate the already-active ruleset.** The original `updated_at` baseline is intentionally obsolete; `--mode baseline` must now fail. The commands document the guarded transition for audit and are **not reusable** for later ruleset edits. For future policy changes, create a new proposal and baseline, with accountable admin review and a fresh read-check/write guard.

At the time of initial activation, the operator used the reviewed checkout and an authenticated `gh` session with repository administration access, as evidenced by successful provider PUT and live readback. **A truly authenticated provider readback is required:** anonymous GitHub API responses can omit `bypass_actors` altogether, which makes the verifier intentionally fail its baseline comparison. Do not treat that redacted public result as `bypass_actors: []`, and do not remove a guard to make it pass. The connected read-only GitHub integration can inspect policy but **cannot perform ruleset PUT**. Never copy a token into logs, issues or terminals.

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

**Historical-only step: already executed; do not run again against the old baseline.** At the time, this PUT changed live GitHub repository rules after the reviewed payload and original baseline were verified. The PUT is conditional on **fresh GET AND successful preflight** in the same block; keep the interval minimal. This is *not* provider-level atomic compare-and-swap: a concurrent edit between GET and PUT remains possible and must be reconciled on readback.

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

- [x] Authenticated read-only proposal and original provider baseline passed before activation (the original baseline must now fail).
- [x] Administrator applied the reviewed provider policy through an authorized `gh` session.
- [x] Active and effective `main` readbacks show required PR and strict, GitHub Actions-source-bound `check`, with **no standing bypass**.
- [x] Deliberately failing [PR #45](https://github.com/ryjen/config-drift-guard/pull/45) yielded a failed `check` **and** provider `mergeable_state: blocked`. PR closed unmerged and branch deleted.
- [x] Baseline, mutation, independent readback, provider-negative evidence and residual limits recorded in [issue #43](https://github.com/ryjen/config-drift-guard/issues/43#issuecomment-6244761893).

**Claim boundary:** Provider-backed required-PR/failed-check admission is verified for this repository; missing-check/direct-push paths and external administrator-control-plane changes are **not** separately qualified. Never replay the historical baseline PUT or claim CI alone established enforcement.
