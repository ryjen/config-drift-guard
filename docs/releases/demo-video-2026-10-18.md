# Config Drift Guard — Drift Detection & Approval-Gated Reconciliation Demo

An 87-second video demonstration of deterministic drift detection, human approval before configuration changes, convergence verification, and rejection of stale remediation plans.

## What the demonstration shows

This is **edited Chromium/Playwright browser-test footage against local synthetic fixtures**, with explanatory overlays and ElevenLabs narration. It is not a continuous manual recording, a production deployment, or an independent security certification.

**Desired configuration (api-service):**

```json
{"image":"api:v2","replicas":3,"environment":{"LOG_LEVEL":"info"}}
```

**Initially observed:**

```json
{"image":"api:v1","replicas":1,"environment":{"LOG_LEVEL":"debug"}}
```

The system reports drift in the image, replica count, and log level. After explicit operator approval, it checks that the remediation plan is still valid, writes the managed settings atomically, and verifies the final observed values match the desired configuration: **no drift remains**. Unmanaged runtime metadata is preserved.

In a separate failure scenario, the observed image changes to `api:v3` **after planning and before approval**. Preflight rejects the now-stale plan, records the failed step, skips application and verification, and leaves that updated observed state untouched. The operator can also reject a fresh plan without a write.

## Implementation and provenance

- Next.js operator console, Fastify API, SQLite-persisted workflow, SSE progress events.
- Deterministic comparison and evidence digests; immutable remediation plans; approval gate; stale-plan preflight; atomic apply; verification.
- Video includes real browser-test captures with editorial holds and configuration overlays; test footage is clearly identified as synthetic.
- English narration synthesized with ElevenLabs (Jeremy); captions supplied as a separate WebVTT file.
- Source and reproducible steps: https://github.com/ryjen/config-drift-guard and https://github.com/ryjen/config-drift-guard/blob/main/docs/DEMO.md
- Repository source-code license/distribution provenance is tracked separately in https://github.com/ryjen/config-drift-guard/issues/34. Publishing this demo video does **not** grant a new source-code license.

## Release assets

- `config-drift-guard-demo-mobile-final-review.mp4`: 87.168 seconds, 1280×720 H.264 Constrained Baseline, AAC-LC stereo, 8,373,190 bytes; SHA-256 `fa0d50106b9f989970b7bd18c83ba7eacb6eb8cf68d36108a3e1146f9396fa5b`.
- `config-drift-guard-final-captions.vtt`: English closed-caption transcript, 1,652 bytes; SHA-256 `67e1da18a5ad36a6aa9228a66c4ecbccde8cad51fe609e66680ecd6cb98e6e83`.

**Media-rights check before public release:** Confirm that the ElevenLabs subscription used to generate both speech takes allows the intended use (a free plan does not allow commercial use). Confirm any applicable narration/voice and third-party overlay attribution terms. This note does not assert that clearance has been obtained.