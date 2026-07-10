import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API health", () => {
  it("returns a deterministic health payload", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "config-drift-guard-api",
      status: "ok",
    });

    await app.close();
  });
});
