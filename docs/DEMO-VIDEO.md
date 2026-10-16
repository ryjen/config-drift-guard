# Portfolio demo storyboard (75–90 seconds)

**State:** Recording plan only. No video, captions, screen capture, or verified recording artifact has been produced. The [full hands-on walkthrough](DEMO.md) remains the authoritative source for app behavior and reset commands.

**Audience:** Staff/platform hiring managers and reviewers evaluating deterministic reconciliation, approval boundaries and failure behavior. **Scope:** local, synthetic service-configuration adapter; not a connection to production systems, cloud resources or real infrastructure.

## Preparation

1. Use an isolated checkout at a known commit. Keep only fixture data in the working tree; close terminals showing tokens, personal paths, email, hostnames or unrelated services.
2. Run `corepack pnpm install` and `corepack pnpm check` before recording. Save the exact commit SHA and test result with the video description. Do **not** claim checks passed unless actually observed.
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

## Publication checklist

- [ ] Record locally from the exact reviewed revision; retain source video privately until approved.
- [ ] Confirm the UI behavior shown matches the current implementation and `DEMO.md`; do not use simulated, edited or invented result screens.
- [ ] Verify `stale_remediation_plan` appears only for the genuinely changed observed fixture, with apply/verify skipped and fixture content unchanged.
- [ ] Add readable captions, alt text/description, and a link to the GitHub repository and reproducible demo steps.
- [ ] Review for identifying data, third-party assets, trademarks, and redistribution restrictions before publishing video files; never commit raw source captures containing secrets.
- [ ] Publish only after owner confirmation of the recorded content and chosen host. After publication, add the final video link to README/site by reviewed PR.

**Limitations to state:** synthetic adapters; no live Kubernetes/Terraform reconciliation; tests and demo are not enterprise deployment evidence; no production adoption claim. The source repository's license/provenance remains an independent decision ([issue #34](https://github.com/ryjen/config-drift-guard/issues/34)).
