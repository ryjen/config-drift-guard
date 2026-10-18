# Portfolio demo storyboard (75–90 seconds)

**Current release (2026-10-18):** The owner approved and published an **87-second narrated, edited recording of genuine Playwright/Chromium browser tests**, with explanatory configuration cards. [View the GitHub video-only prerelease](https://github.com/ryjen/config-drift-guard/releases/tag/demo-video-2026-10-18), [download the mobile-compatible 720p MP4](https://github.com/ryjen/config-drift-guard/releases/download/demo-video-2026-10-18/config-drift-guard-demo-mobile-final-review.mp4), or [download English WebVTT captions](https://github.com/ryjen/config-drift-guard/releases/download/demo-video-2026-10-18/config-drift-guard-final-captions.vtt). The footage is *not* a continuous manually operated session or production use. The historical storyboard below remains as the capture plan; [the full hands-on walkthrough](DEMO.md) is still the reproducible behavior reference. [Media/source rights review](https://github.com/ryjen/config-drift-guard/issues/34) remains a separate open concern.

**Audience:** Staff/platform hiring managers and reviewers evaluating deterministic reconciliation, approval boundaries and failure behavior. **Scope:** local, synthetic service-configuration adapter; not a connection to production systems, cloud resources or real infrastructure.

## Historical capture preparation / reproducibility

1. Use an isolated checkout at a known commit. Keep only fixture data in the working tree; close terminals showing tokens, personal paths, email, hostnames or unrelated services.
2. Run `corepack pnpm install --frozen-lockfile` and `corepack pnpm check` before recording. Save the exact commit SHA and test result with the video description. Do **not** claim checks passed unless actually observed. **`pnpm check` does not include Chromium browser E2E**; if describing browser automated acceptance, also execute `pnpm test:e2e` with the [documented supported runtime](TESTING.md) and keep its separate exact-revision result.
3. Start `corepack pnpm demo`. The web UI uses `http://127.0.0.1:3000` and the API uses `http://127.0.0.1:4000` by default.
4. Use the seeded **Service configuration drift** scenario. Reset state between takes and before the failure demo:

   ```sh
   curl --fail-with-body -X POST \
     -H 'Content-Type: application/json' \
     -d '{}' \
     http://127.0.0.1:4000/api/environments/env_service_config/reset
   ```

5. Set screen capture to readable size (e.g. 1080p), increase browser zoom if needed, turn off desktop notifications, and avoid recording credentials or private services.

## Shot list and suggested narration

| Time budget | Capture | Narration |
| --- | --- | --- |
| 0–10 s | Title and operator console | “Config Drift Guard is an independent, local-platform demonstration of controlled configuration reconciliation, not an operated enterprise deployment.” |
| 10–30 s | **Run drift scan**; zoom on persisted steps and findings | “We compare canonical and observed state deterministically. The console reports differences and supporting evidence before proposing an immutable remediation plan.” |
| 30–47 s | Plan and **Approve reconcile**; show zero remaining findings | “An explicit operator decision gates changes. The system rechecks the observed state, writes atomically and verifies convergence.” |
| 47–55 s | Reset service-config scenario using the documented local API | “Now we test whether an approval can safely apply to stale input.” |
| 55–80 s | Run a fresh scan, then change the observed fixture's `image` value to `api:v3` **after** the scan and **before** approval; click **Approve reconcile**; display `stale_remediation_plan` and skipped apply | “Because the input changed after the plan was made, preflight rejects it. No reconciliation write is attempted. Failed approval is visible instead of silently altering state.” |
| 80–90 s | End card with repository link | “The source, tests, architecture and reproducible walkthrough are in the repository. This is bounded evaluation evidence, not a production certification.” |

**Editing note:** Take two clips if the sequence cannot be completed cleanly in 90 seconds; label the reset/second scenario transition in the caption. Do not splice together results in a way that suggests a single uninterrupted run or hide a failed check.

## Optional authentic browser capture in CI

This is an **internal PR-only, opt-in diagnostic recording** of the actual Playwright test scenarios. It is not a narrated portfolio video, is not automatically released, and should not be presented as a continuous operator walkthrough. The two Playwright cases use synthetic fixtures and produce separate raw WebM clips **plus genuine browser screenshots at six state milestones**. Raw Playwright WebM may be too short to communicate the full workflow; measure duration and inspect the screenshots before calling this a useful capture.

1. From a trusted **same-repository** pull request, add both `ci:e2e` and `ci:demo-capture` labels.
2. Trigger a `synchronize` pull-request event **after** adding the labels (for example, by pushing a reviewed change). Labels alone do not start the configured workflow. Fork PRs are never permitted to record.
3. Ensure `pnpm check`, `Install Chromium (opt-in E2E)`, `Browser E2E (opt-in)`, and `Upload raw browser captures (opt-in)` all succeed at the **same exact candidate SHA**.
4. Inspect the `config-drift-guard-raw-browser-captures` artifact from the matching GitHub Actions run. Confirm all six `milestone-*.png` screenshots show actual browser states and separately measure WebM dimensions/duration. It expires after three days. **Treat artifacts from a public repository as potentially public**, even though the only browser content should be locally seeded demo fixtures.
5. Review the two clips for truthful state transitions, legibility, unexpected data, and source provenance. Do not call them a finished 75–90-second demo or claim they have narration, editing or owner approval.
6. To produce a public portfolio video, record/assemble an owner-reviewed final cut with captions, explicit test-footage/source identification, links and rights review; publish only with owner approval.

The opt-in setting `CONFIG_DRIFT_GUARD_DEMO_CAPTURE=1` enables Playwright's real Chromium video capture, milestone screenshots, and slower fixture transitions **only during that job**; default test behavior is unchanged. No third-party video generation, AI-simulated UI, permanent hosted artifact, or production connection is involved.

## Current evidence and rights context

The published 87-second video is an edited derivative of the Chromium test captures. The earlier [internal integrity/QA report](DEMO-REVIEW-QUALITY.md) and [nine-cue silent descriptive VTT](DEMO-REVIEW-DESCRIPTIONS.vtt) refer to a **superseded silent review cut**, not the approved final narration or its [15-cue release captions](https://github.com/ryjen/config-drift-guard/releases/download/demo-video-2026-10-18/config-drift-guard-final-captions.vtt). The final release carries an MP4 SHA-256 of `fa0d50106b9f989970b7bd18c83ba7eacb6eb8cf68d36108a3e1146f9396fa5b` and VTT SHA-256 of `67e1da18a5ad36a6aa9228a66c4ecbccde8cad51fe609e66680ecd6cb98e6e83`, independently confirmed against GitHub asset metadata. For dependency provenance, see the [installed-manifest audit](provenance/dependency-license-inventory-2026-10-16.md) and [exact-version registry declarations](provenance/npm-registry-license-metadata-2026-10-16.md). Those reports do **not** grant distribution rights. [Issue #39](https://github.com/ryjen/config-drift-guard/issues/39) tracks repository/portfolio integration and link verification; [#34](https://github.com/ryjen/config-drift-guard/issues/34) tracks rights and licensing.

## Publication checklist

- [ ] Record locally from the exact reviewed revision; retain source video privately until approved.
- [ ] Confirm the UI behavior shown matches the current implementation and `DEMO.md`; do not use simulated, edited or invented result screens.
- [ ] Verify `stale_remediation_plan` appears only for the genuinely changed observed fixture, with apply/verify skipped and fixture content unchanged.
- [ ] Add readable captions, alt text/description, and a link to the GitHub repository and reproducible demo steps.
- [ ] Review for identifying data, third-party assets, trademarks, and redistribution restrictions before publishing video files; never commit raw source captures containing secrets.
- [x] Owner approved the corrected narrated cut and published the video with a GitHub prerelease on 2026-10-18.
- [ ] Link the approved release from the README and portfolio through reviewed changes; verify that unauthenticated visitors can reach the release and caption asset.
- [ ] Review applicable ElevenLabs/voice, font, and other media distribution terms; source-code licensing remains a separate owner decision under #34.

**Limitations to state:** synthetic adapters; no live Kubernetes/Terraform reconciliation; tests and demo are not enterprise deployment evidence; no production adoption claim. The source repository's license/provenance remains an independent decision ([issue #34](https://github.com/ryjen/config-drift-guard/issues/34)).
