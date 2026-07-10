import { describe, expect, it } from "vitest";
import { healthResponse } from "./index.js";

describe("contracts", () => {
  it("defines the API health contract", () => {
    expect(healthResponse).toEqual({
      service: "config-drift-guard-api",
      status: "ok",
    });
  });
});
