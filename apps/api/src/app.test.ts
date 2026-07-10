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
});
