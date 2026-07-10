import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createDatabase } from "./persistence/database.js";

describe("API health", () => {
  it("returns a deterministic health payload", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "config-drift-guard-api",
      status: "ok",
    });

    await app.close();
    database.close();
  });

  it("returns seeded environment metadata", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database });
    const response = await app.inject({ method: "GET", url: "/api/environments" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: "env_service_config",
        adapterKind: "service_config",
      }),
    ]);

    await app.close();
    database.close();
  });

  it("starts a persisted run and returns it by id", async () => {
    const database = createDatabase(":memory:");
    const app = await buildApp({ database });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/environments/env_service_config/runs",
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.run.status).toBe("awaiting_approval");
    expect(created.findings).toHaveLength(3);

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
