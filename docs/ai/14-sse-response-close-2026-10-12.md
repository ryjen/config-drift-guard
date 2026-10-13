# Session 14 — SSE response-close lifecycle and HTTP regression

**Date:** 2026-10-12
**User prompt (verbatim):** `Proceed with issues`
**Scope:** Config Drift Guard issue #7, followed by review of open issues #1/#2
**Branch:** `fix/sse-response-disconnect` based on merge `20da5b9`
**Tooling:** GPT-6, GitHub connector, Desktop Commander Node 24 / pnpm 10.13.1
**Transcript completeness:** This is a bounded engineering summary; it is **not** a full verbatim interaction export.

## Decision and change

Issue #7 remained open because the SSE server registered its lifecycle cleanup on `request.raw.on("close")`. Modern Node.js `IncomingMessage.close` can fire once the incoming request has been read, even while the server is still streaming the response; cleanup was therefore attached to the wrong half of the HTTP exchange.

Change `apps/api/src/app.ts` to register the heartbeat disposal and repository unsubscribe on `reply.raw.once("close")`, which corresponds to the outgoing response closing (including a disconnected client). Do not change REST authority, SSE replay semantics, run-state logic, or unrelated demo timers. The client already avoids opening streams for terminal runs after PR #17.

Add `apps/api/src/sse.test.ts` to use a *real TCP HTTP server* and an in-memory database; verify a replayed notification after `Last-Event-ID`, a subsequent live rejection notification while the stream is still connected, exactly one subscription teardown after client disconnect, and the matching `clearInterval` of the heartbeat timer. These observations prevent a regression where cleanup happens at incoming request completion rather than response disconnect.

## Evidence and limits

- Isolated additional git worktree; original `develop` checkout untouched.
- Node 24 / pnpm 10.13.1 install from offline cache, workspace TypeScript checks **passed**, production build **passed**, all **43 Vitest tests / 8 files passed** with the new transport regression.
- Local Biome binary cannot start on Desktop Commander's NixOS container (missing ELF interpreter), including inside Nix-portable/proot. Use exact-head GitHub Actions `pnpm check` to qualify formatting and complete test gates.
- The regression verifies replay and live push after subscribing and response close cleanup. It does **not** simulate actual intermittent network reconnects in a browser; prior `run-events.test.ts` covers state/reopen logic and Playwright PR #18 covers terminal client cleanup.
- API transport fixes should be merged only after independent review and exact-head CI; issue #7 should not be closed prematurely.
