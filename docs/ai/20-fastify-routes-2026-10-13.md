# Session 20 — Extract thin Fastify routes

**Date:** 2026-10-13
**User request (verbatim):** proceed
**Scope:** Issue #1 Phase 2c — HTTP route adapters and direct live SSE bus subscription
**Record:** Bounded engineering activity summary, not a complete transcript.

## Decision

Extract explicit route registrars for health, environment, run and event endpoints, plus transport-only error mapping, from apps/api/src/app.ts. Keep the Fastify application as a composition root responsible for constructing the database, repository, event bus, adapters, use-case service, scheduler, lifecycle hooks and CORS. Routes must not instantiate WorkflowExecutor or decide run transitions; RunOrchestrator remains the application authority. Validation and response mapping remain outer HTTP concerns.

The SSE route now consumes the directly injected RunEventBusPort for live subscription. Durable Last-Event-ID replay and version authority remain in a separately injected read-only repository port. The server still closes subscriber/heartbeat resources on the streaming response's close event, not the incoming request's close event. The previous PersistenceRepository.subscribeRunEvents compatibility facade remains temporarily for existing repository tests and later interface segregation.

## Verification

Local Node 24/pnpm workspace typecheck, production build, and all 72 unit/integration tests passed (54 API, 5 contracts, 10 drift-engine, 3 web). The real-HTTP SSE regression now spies on RunEventBus subscriptions rather than the obsolete repository facade. Exact-head CI lint/typecheck/build/test remains mandatory. This structural slice does not claim an additional Chromium Playwright run. Code reviews intentionally skipped under the user's standing instruction.

## Follow-up

Issue #1 Phase 2d: explicit container interface; Phase 3: repository interface segregation; Phase 4: database-free state-machine tests and route contract tests. Original implementation tag remains unchanged.

## Exact-head browser qualification gate

Because this change moves the SSE live-subscription call from a persistence facade to the injected event-bus port, PR #25 is explicitly opted into the bounded `ci:e2e` gate on GitHub-hosted CI. It is restricted to same-repository PRs and does not use Dubnium runners. A passing actual Chromium run, in addition to lint, typecheck, builds, and integration tests, is required before this PR is merged. No passing browser result is asserted by this log entry.
