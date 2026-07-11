# Session 10 — Maintenance

**Date:** 2026-07-10
**Tool/model:** OpenCode, big pickle
**Milestone:** Maintenance — SSE hardening, demo mode, notifications
**Commit:** `1ebbaf2` — `feat: add full AI session logs`

---

## Summary

Fixed SSE live updates not working in the web UI, added demo mode with configurable delays, and added approve/reject success notifications.

## Changes

### SSE CORS fix (`apps/api/src/app.ts`)
- Added `Access-Control-Allow-Origin` header reflecting request origin in hijacked SSE response
- Root cause: `reply.hijack()` bypasses Fastify CORS middleware; origin must be reflected manually

### SSE heartbeat (`apps/api/src/app.ts`)
- Added 15-second `:heartbeat\n\n` interval on SSE connections
- Cleared on client disconnect

### Removed misleading onerror (`apps/web/app/operator-console.tsx`)
- Deleted `eventSource.onerror` handler — EventSource auto-reconnects

### Simulated delays (`apps/api/src/workflow-executor.ts`, `apps/api/src/app.ts`)
- Made `WorkflowExecutor.execute()` and `executeReconciliation()` async
- Added `phaseDelay` constructor parameter with `delay()` helper
- Added `QUEUE_DELAY_MS` and `PHASE_DELAY_MS` env vars in `app.ts`

### Demo script (`package.json`)
- Added `corepack pnpm demo` with `QUEUE_DELAY_MS=2000 PHASE_DELAY_MS=500`

### Approve/reject notification (`apps/web/app/operator-console.tsx`)
- Added `notice` state with `flashNotice()` auto-dismiss (4s)
- Green `.noticeText` CSS class in `apps/web/app/styles.css`

### README update (`README.md`)
- Documented recent SSE/CORS/heartbeat additions
- Added demo command section with env var docs

### Documentation (`docs/DEMO.md`)
- Added demo command, env var docs, notification mentions

## Issues created

- [Issue #2](https://github.com/ryjen/config-drift-guard/issues/2): Isolate or remove demo-only code (QUEUE_DELAY_MS, PHASE_DELAY_MS, phaseDelay)

## Verification

- `corepack pnpm check` — all 41 tests pass, lint/typecheck/build clean

## Prompts

```
What did we do so far?
```

```
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
```

```
update readme
```

```
can you create an issue to isolate or remove demo code - well groomed
```

```
write session to new log in docs/ai/
```
