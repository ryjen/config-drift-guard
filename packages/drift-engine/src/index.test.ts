import { describe, expect, it } from "vitest";
import { getDriftEngineVersion } from "./index.js";

describe("drift engine foundation", () => {
  it("exposes a deterministic engine version placeholder", () => {
    expect(getDriftEngineVersion()).toBe("0.1.0-foundation");
  });
});
