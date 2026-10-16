# Browser end-to-end tests

Historical implementation issues: [#10](https://github.com/ryjen/config-drift-guard/issues/10) (closed) and terminal-stream [#7](https://github.com/ryjen/config-drift-guard/issues/7) (closed). These issue states do not certify every future revision or native workstation environment.

## Run with a reproducible browser runtime

### NixOS / reproducible browser runtime (x86_64-linux)

Use the repo's `flake.nix` for Node 24, Corepack, and Nix-packaged
Chromium. Its nixpkgs input is pinned to the revision whose
`playwright-driver` version is **1.56.1**, matching the root
`@playwright/test` dependency. A Nix assertion prevents accidental
driver/npm version skew.

```sh
nix develop
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test:e2e
```

Alternatively, in one invocation:

```sh
nix develop -c bash -c 'corepack pnpm install --frozen-lockfile && corepack pnpm check && corepack pnpm test:e2e'
```

The flake sets `PLAYWRIGHT_BROWSERS_PATH` to the patched Nix browser
closure and disables the upstream browser download. **Do not run
`playwright install chromium` inside the Nix shell**: it would download
an Ubuntu browser that cannot run on unmodified NixOS. The host-library
validation skip applies only inside this development shell; an actual
browser launch and passing Playwright assertions are still required.

The nixpkgs input and committed `flake.lock` pin the same full Git revision
(`f665af0cdb70ed27e1bd8f9fdfecaf451260fc55`).
The shell intentionally includes Chromium, Chromium headless shell, and
FFmpeg, not Firefox or WebKit. Update the lock, nixpkgs pin, and npm
Playwright version together.

**Validation recorded 2026-10-12:** A temporary, isolated Nix-portable
bootstrap successfully ran `nix flake lock`, `nix flake show`, and
`nix develop`. The shell reported Node 24.12.0, Corepack 0.34.5, and a
three-component browser closure, matching the locked Playwright 1.56.1
runtime. GitHub Actions `pnpm check` passed at the lockfile commit.

**Native NixOS browser qualification on the connected Desktop Commander host remains unverified:** The connected Desktop Commander
environment does not expose the host Nix installation or permit user
namespaces. Nix-portable fell back to `proot`; Next.js workers and the
Chromium smoke process crashed with `double free or corruption` while
executing inside that emulation. Those crashes do not prove an
application or native Nix browser defect. Execute `nix develop -c
corepack pnpm test:e2e` on a trusted host with **native Nix**, record
the exact candidate SHA and Playwright traces as **new native-host evidence**. Issues #7 and #10 are already closed and do not depend on this host-specific check.

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

## Opt-in browser CI gate

For a pull request originating **inside this repository**, apply the
`ci:e2e` GitHub label to run the browser scenarios in the existing CI
job after `pnpm check`. Browser installation and the E2E step each have
a five-minute timeout. The gate never executes for fork PRs; the
workflow retains read-only contents permissions. No additional CI job
is provisioned, and unlabelled PRs do not download browser runtimes.
The workflow uses default `pull_request` event types: **labelling alone does not trigger a new job**. Push a reviewed branch update or otherwise initiate a supported PR event after assigning `ci:e2e`, then verify the exact-head browser steps rather than relying on the label's presence.

**Evidence (2026-10-12):** On the hosted Ubuntu runner, PR #18's
temporary qualification workflow passed both Chromium scenarios in
[run #65](https://github.com/ryjen/config-drift-guard/actions/runs/38327729208):
terminal EventSource cleanup/convergence and stale-plan
failure/reset/rejection. That run used exact commit `34a7532c`.
The opt-in label implementation supersedes the PR-number-specific
condition, so its own exact-head CI must be qualified separately.

## Limitations / runner contract

**Latest portfolio checkpoint (2026-10-16):** Merge commit `31c05ebf295bd9b1a83253424b2ee1c1e0fdb47e` passed the `check` context. That context is **not evidence of browser E2E**, because the `ci:e2e` opt-in is unavailable on the ordinary `main` push. The historical hosted browser run remains tied to its earlier candidate; capture new exact-revision browser evidence before attributing E2E success to the portfolio recording.

The E2E suite is **separate from `pnpm check`**. The existing GitHub-hosted CI job runs it only when a trusted same-repository PR carries `ci:e2e`; it is not a default required job for other PRs. Qualify changes on a trusted Chromium-capable runner with the label rather than exposing personal self-hosted runners to untrusted changes. Do not route untrusted fork PR code to a personal self-hosted runner. Keep browser downloads and temporary fixtures outside protected host paths.

The initial attempted run on the NixOS Desktop Commander host failed to spawn Playwright's downloaded Ubuntu Chromium executable (`ENOENT`, runtime-loader incompatibility); this is **not** browser-test success or an app regression. Build and existing unit/integration tests passed independently. Record successful browser evidence, including the exact git head, before claiming that a new revision was qualified in the browser. Both implementation issues are already closed.
