# Session 28 — Opt-in browser capture (engineering summary, not a full transcript)

**Date:** 2026-10-16
**Milestone:** Record truthful raw Chromium demonstrations of deterministic drift and stale-plan rejection without weakening authorization or publishing unreviewed footage
**Operator message:** "Proceed" following successful delivery of portfolio page, demo storyboard, browser qualification, and an open human-recording task
**Tooling:** ChatGPT, GitHub connector, Desktop Commander (read-only capability inspection), GitHub Actions / Playwright
**Candidate PR:** #38, `feat/ci-demo-capture-20261016`
**Conversation/transcript status:** This is a bounded session summary. It is **not** a full export of assistant/tool messages and must not be presented as one.

## Decision and rationale

The connected Desktop Commander runtime is an isolated Linux container without `DISPLAY`, `WAYLAND_DISPLAY`, or installed graphical screen-capture tools. It cannot capture the owner's desktop UI. Existing Playwright browser tests already exercise real synthetic UI flows. Enable a temporary **explicit opt-in** browser video artifact, not artificial/generated screenshots or auto-publication.

## Implemented proposal

- Browser recording is off by default; `CONFIG_DRIFT_GUARD_DEMO_CAPTURE=1` enables real Playwright Chromium WebM output.
- When capture is enabled, use slower delays only in the existing E2E fixture to make state transitions viewable.
- GitHub Actions upload is restricted to same-repository PRs explicitly carrying both `ci:e2e` and `ci:demo-capture` labels. The job maintains `contents: read` and uses existing ephemeral hosted Chromium, not privileged self-hosted runners.
- Raw WebM artifacts have 3-day retention. They are **not private secrets storage** on a public repository, nor approved demo footage.
- Publication remains human-approved in the existing Todoist task; project license/provenance decision remains separate issue #34.

## Evidence and safeguards

- Verified existing `e2e/operator.spec.ts` runs actual browser scans and approvals and checks state after a stale-plan failure.
- Verified current Playwright config and same-repo/fork conditions in existing CI workflow.
- Added a revised storyboard path for collecting and inspecting actual raw videos.
- No claims of CI pass, video-artifact existence, voiceover, captions, final production demo, or upstream licensing until separately observed.
- **Follow-up:** Review PR patch independently, confirm exact-head CI and browser capture/artifact existence, inspect outputs, then merge only after passing gates. Any hosted captured footage remains evidence only, not an approved public demo.

## Known limitations

- Captures are of test automation, not manual operator gestures or a continuous 75–90 second narrative.
- The synthetic fixture videos may be brief or require owner editing for viewer comprehension.
- A successful test without a verified downloadable artifact is not a recording deliverable.
