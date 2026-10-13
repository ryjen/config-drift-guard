# Session 17 — Demo runtime isolation

**Date:** 2026-10-13

**User request (verbatim):** proceed with modernization

**Scope:** Issue #2, explicit demonstration-only queue timing and phase pacing.

**Record status:** Engineering summary with the exact request, not a complete transcript export.

## Decision

Preserve visible demo-mode run progression without placing demo timers and environment parsing inside the production workflow engine.

The API's WorkflowExecutor now accepts an optional generic WorkflowPacer port and invokes it at phase boundaries. Normal construction supplies no pacer, so workflow steps do not instantiate demo timers. The API's application composition optionally injects a deferred scheduling function, but defaults to normal zero-delay queue dispatch and retains its existing cancellation/active-workflow accounting.

The sole parser of DEMO_MODE, QUEUE_DELAY_MS and PHASE_DELAY_MS now lives under apps/api/src/demo/runtime.ts and is used by the server composition root. Its default returns no hooks, even when stale demo delay variables exist without DEMO_MODE=1. Invalid or excessive explicit demo values are rejected, and timers are bounded to at most 60 seconds.

The root demo script sets DEMO_MODE=1. Standard dev, production, unit tests and browser tests remain fast unless explicitly supplied a hook. No changes to reconciliation, authorization, SSE authority or persistence rules.

## Evidence and outstanding gates

Unit tests cover the explicitly enabled queue and phase delays, disabled behavior when the flag is absent, and invalid settings. An executor test exercises injected pacing independently of timer implementation. Exact-head GitHub CI lint, typechecking, build and test results are required for completion; this document does not claim those checks have passed until observed.

## Follow-up

Issue #1 remains open for route/orchestration segregation and repository ports. Browser network-drop/reconnect chaos coverage remains distinct from this demo-pacing refactor. Independent code review is omitted under the user's explicit instruction to skip reviews; CI and behavioral tests remain mandatory.
