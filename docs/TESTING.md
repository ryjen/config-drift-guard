# Browser end-to-end tests

Issue: [#10](https://github.com/ryjen/config-drift-guard/issues/10), with the terminal-stream acceptance criteria tracked in [#7](https://github.com/ryjen/config-drift-guard/issues/7).

## Run

Use Node 24 and pnpm 10.13.1 in a Linux environment supported by Playwright Chromium:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

When running in an ephemeral Linux CI image without Chromium system libraries, install its OS dependencies as part of provisioning (for example `playwright install --with-deps chromium` on a supported Ubuntu runner).

The Playwright config starts the built Next.js server on loopback port 3000. An automatic per-test fixture starts and terminates a separate built API process on loopback port 4000 with fresh in-memory SQLite, so a failed or interrupted test cannot retain an active run for the next test. The API uses `data/e2e-service.observed.json` as its dedicated observed fixture, not the normal operator fixture; each test resets this file through the API. Tests are serialized to avoid port/fixture races.

## Coverage

- Real Chromium UI: scan → plan → approve → verified convergence.
- Browser `EventSource` instrumentation: terminal transitions call `close()` exactly once on every constructed stream, and the UI reports `closed`.
- Stale-plan safety: externally change observed state after a plan, approve, verify failure without overwriting the changed state, then reset and reject a fresh plan.
- Existing Vitest unit and integration tests continue to cover deterministic comparison, persisted transitions, concurrency, and reconnection logic.

## Limitations / runner contract

The E2E suite is **separate from `pnpm check`**, and no new GitHub-hosted browser job is enabled. It needs an explicitly provisioned, trusted Chromium-capable runner before making E2E a blocking CI check. Do not route untrusted fork PR code to a personal self-hosted runner. Keep browser downloads and temporary fixtures outside protected host paths.

The initial attempted run on the NixOS Desktop Commander host failed to spawn Playwright's downloaded Ubuntu Chromium executable (`ENOENT`, runtime-loader incompatibility); this is **not** browser-test success or an app regression. Build and existing unit/integration tests passed independently. Record successful browser evidence, including the exact git head, before resolving issue #7 or #10.
