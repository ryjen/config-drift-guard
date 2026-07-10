import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { startRun, startStep } from "./state-machine.js";

describe("API health", () => {
  it("returns a deterministic health payload", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "config-drift-guard-api",
      status: "ok",
    });

    await app.close();
    database.close();
  });

  it("approves a server-generated plan and converges", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/approve`,
      payload: { actor: "local-operator", comment: "Apply generated plan" },
    });

    expect(approveResponse.statusCode).toBe(202);
    expect(approveResponse.json().decision).toMatchObject({ action: "approved" });

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("succeeded");

    const snapshot = (
      await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` })
    ).json();
    expect(snapshot.run.findingCount).toBe(0);
    expect(snapshot.findings).toEqual([]);
    expect(snapshot.steps.at(-1)).toMatchObject({
      key: "verify_convergence",
      status: "succeeded",
    });

    await app.close();
    database.close();
  });

  it("runs and reconciles structured documentation drift through the shared API", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, documentationObservedPath: createObservedPath() });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_documentation/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const beforeApproval = (
      await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` })
    ).json();
    expect(
      beforeApproval.findings.map((finding: { path: string; kind: string }) => [
        finding.path,
        finding.kind,
      ]),
    ).toEqual([
      ["/retries/default", "changed"],
      ["/timeout", "missing"],
      ["/legacy_mode", "extra"],
    ]);

    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/approve`,
      payload: { actor: "local-operator", comment: "Apply generated documentation table" },
    });

    expect(approveResponse.statusCode).toBe(202);

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("succeeded");

    const snapshot = (
      await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` })
    ).json();
    expect(snapshot.run.findingCount).toBe(0);
    expect(snapshot.findings).toEqual([]);

    await app.close();
    database.close();
  });

  it("resets a server-controlled scenario without accepting browser file paths", async () => {
    const database = createDatabase(":memory:");
    const observedPath = createObservedPath();
    const app = await buildApp({ database, serviceConfigObservedPath: observedPath });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/approve`,
      payload: { actor: "local-operator" },
    });
    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("succeeded");

    const unsafeResetResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/reset",
      payload: { path: "/tmp/unsafe" },
    });

    expect(unsafeResetResponse.statusCode).toBe(400);
    expect(unsafeResetResponse.json()).toEqual({ error: "invalid_reset_request" });

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/reset",
      payload: {},
    });

    expect(resetResponse.statusCode).toBe(200);
    expect(resetResponse.json()).toMatchObject({
      status: "reset",
      environment: { id: "env_service_config" },
    });

    const rerunResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const rerun = rerunResponse.json();
    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${rerun.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const snapshot = (await app.inject({ method: "GET", url: `/api/runs/${rerun.run.id}` })).json();
    expect(snapshot.findings.map((finding: { path: string }) => finding.path)).toEqual([
      "/image",
      "/replicas",
      "/environment/LOG_LEVEL",
    ]);

    await app.close();
    database.close();
  });

  it("recovers interrupted runs when the API starts", async () => {
    const database = createDatabase(":memory:");
    const repository = new PersistenceRepository(database.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    startRun(repository, run.id);
    startStep(repository, run.id, "load_observed_state");

    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const snapshot = (await app.inject({ method: "GET", url: `/api/runs/${run.id}` })).json();

    expect(snapshot.run.status).toBe("failed");
    expect(snapshot.run.error).toMatchObject({ code: "startup_recovery" });
    expect(
      snapshot.steps.find((step: { key: string }) => step.key === "load_observed_state"),
    ).toMatchObject({ status: "failed", error: { code: "startup_recovery" } });

    await app.close();
    database.close();
  });

  it("rejects browser-submitted replacement operations", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/approve`,
      payload: { actor: "local-operator", operations: [{ path: "/image", value: "evil:v1" }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_decision_request" });

    await app.close();
    database.close();
  });

  it("makes repeated same decisions idempotent and contradictory decisions conflict", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/reject`,
      payload: { actor: "local-operator" },
    });
    const repeatRejectResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/reject`,
      payload: { actor: "local-operator" },
    });
    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/runs/${created.run.id}/approve`,
      payload: { actor: "local-operator" },
    });

    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.json().run.status).toBe("rejected");
    expect(repeatRejectResponse.statusCode).toBe(200);
    expect(repeatRejectResponse.json().decision.id).toBe(rejectResponse.json().decision.id);
    expect(approveResponse.statusCode).toBe(409);
    expect(approveResponse.json()).toEqual({ error: "contradictory_decision" });

    await app.close();
    database.close();
  });

  it("returns seeded environment metadata", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const response = await app.inject({ method: "GET", url: "/api/environments" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: "env_service_config",
        adapterKind: "service_config",
      }),
      expect.objectContaining({
        id: "env_documentation",
        adapterKind: "documentation",
      }),
    ]);

    await app.close();
    database.close();
  });

  it("starts a persisted run and returns it by id", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database, serviceConfigObservedPath: createObservedPath() });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.run.status).toBe("queued");
    expect(created.events.map((event: { eventType: string }) => event.eventType)).toEqual([
      "run.queued",
    ]);

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const readResponse = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toMatchObject({
      run: { id: created.run.id, findingCount: 3 },
      findings: [
        { path: "/image", severity: "critical" },
        { path: "/replicas", severity: "warning" },
        { path: "/environment/LOG_LEVEL", severity: "warning" },
      ],
    });

    await app.close();
    database.close();
  });

  it("persists run events for replay", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });
    const created = createResponse.json();

    await expect
      .poll(async () => {
        const response = await app.inject({ method: "GET", url: `/api/runs/${created.run.id}` });
        return response.json().run.status;
      })
      .toBe("awaiting_approval");

    const snapshotResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${created.run.id}`,
    });
    const snapshot = snapshotResponse.json();

    expect(snapshot.events.length).toBeGreaterThan(1);
    expect(snapshot.events.at(0).eventType).toBe("run.queued");

    await app.close();
    database.close();
  });

  it("returns 404 for unknown run snapshots", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database });
    const response = await app.inject({ method: "GET", url: "/api/runs/run_missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "run_not_found" });

    await app.close();
    database.close();
  });
});

function createObservedPath(): string {
  return join(mkdtempSync(join(tmpdir(), "config-drift-guard-")), "observed.json");
}
