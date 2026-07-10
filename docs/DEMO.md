# Demo walkthrough

## Fresh-clone setup

```bash
corepack pnpm install
corepack pnpm check
```

Expected output:
- Biome passes
- typecheck: 4 packages pass
- build: 4 packages build (including Next.js static generation)
- test: 6 test files, 41 tests, all pass

## Starting the application

Terminal 1 — API:

```bash
corepack pnpm --filter @config-drift-guard/api dev
```

The API binds to `http://127.0.0.1:4000` by default.

Terminal 2 — web app:

```bash
corepack pnpm --filter @config-drift-guard/web dev
```

The web app binds to `http://127.0.0.1:3000` by default.

Or use the single-command demo with simulated delays:

```bash
corepack pnpm demo
```

This sets `QUEUE_DELAY_MS=2000` (2s before workflow starts) and `PHASE_DELAY_MS=500` (500ms between each step) so you can observe the live SSE timeline filling in over ~5 seconds. Both env vars default to `0` when omitted.

## Primary happy path (service configuration drift)

1. Open `http://127.0.0.1:3000` in a browser.
2. The operator console appears.  "Service configuration drift" is the default scenario.
3. Click **Run drift scan**. A POST to `/api/environments/env_service_config/runs` succeeds with HTTP 201 and a `queued` snapshot.
4. The workflow executes asynchronously. The UI receives SSE notifications and refetches the run snapshot.
5. After execution completes, the run status reads `awaiting_approval`. The timeline shows all 6 steps as `succeeded`.
6. The findings panel lists three expected findings:
   - `/image` — critical, observed `api:v1`, desired `api:v2`
   - `/replicas` — warning, observed `1`, desired `3`
   - `/environment/LOG_LEVEL` — warning, observed `"debug"`, desired `"info"`
7. The evidence panel shows the canonical and observed SHA-256 digests.
8. The plan panel shows target state `{"image":"api:v2","replicas":3,"environment":{"LOG_LEVEL":"info"}}` with the expected observed digest and engine version.
9. Click **Approve reconcile**. A green notification confirms the approval. The reconciliation workflow executes: preflight, atomic apply, verification.
10. The timeline updates to show all 9 steps as `succeeded`. The run status reads `succeeded`. Findings are empty. Plan shows the same target but with the reconciliation decision `approved`.
11. The observed file at `apps/api/data/service-config.observed.json` now contains `api:v2`, `3` replicas, and `LOG_LEVEL: "info"`. The `runtimePid` and `healthCheckedAt` fields are preserved.

## Documentation drift happy path

1. Select **Structured documentation drift** from the scenario dropdown.
2. Click **Run drift scan**.
3. Three findings appear:
   - `/retries/default` — changed, observed `"5"`, desired `"3"`
   - `/timeout` — missing (desired value exists in schema, absent from documentation)
   - `/legacy_mode` — extra (present in documentation, absent from schema)
4. The plan target shows the corrected table with both `retries` and `timeout`.
5. Approve. A green notification confirms the decision. On success, the managed Markdown table at `apps/api/data/config-reference.md` contains both settings and `legacy_mode` is removed.

## Failure path — stale remediation plan

1. Start a service-config scan and wait for `awaiting_approval`.
2. Open `apps/api/data/service-config.observed.json` and change `image` to `"api:v3"`.
3. Click **Approve reconcile**.
4. The run ends in `failed`. Preflight reconciliation shows error code `stale_remediation_plan`. Apply and verify are `skipped`.
5. The observed file is unchanged—`"api:v3"` remains, proving no unsafe write occurred.

## Failure path — invalid canonical state

1. The adapter seeds valid canonical state; invalid canonical input causes immediate failure at `validate_canonical_state`.
2. All subsequent steps are `skipped`. No plan is generated. No observed Fixture is read.

## Failure path — malformed observed state

1. Write `{` (invalid JSON) to `apps/api/data/service-config.observed.json`.
2. Start a scan. The run fails at `load_observed_state` with a parse error. No plan. No mutation.

## Reset

After any scenario, select the environment and click the reset API (not a UI button in the current console). Send an empty POST to `/api/environments/env_service_config/reset`:

```bash
curl -X POST http://127.0.0.1:4000/api/environments/env_service_config/reset \
  -H 'Content-Type: application/json' \
  -d '{}'
```

This restores the seeded observed state. Browser-submitted payloads with extra fields (e.g., `{"path": "/tmp/unsafe"}`) return `400 invalid_reset_request`.

## Production build

```bash
corepack pnpm build
```

Produces:
- `apps/api/dist/` — compiled Fastify server
- `packages/contracts/dist/` — compiled contracts
- `packages/drift-engine/dist/` — compiled drift engine
- `apps/web/.next/` — optimized Next.js production build

Launch with:

```bash
corepack pnpm --filter @config-drift-guard/api start
corepack pnpm --filter @config-drift-guard/web start
```

## Running all checks

```bash
corepack pnpm check
```

Executes: `lint` → `typecheck` → `build` → `test`. Expected exit code 0.
