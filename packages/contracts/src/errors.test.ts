import { describe, expect, it } from "vitest";
import { StaleRemediationPlanError } from "./errors.js";

describe("StaleRemediationPlanError", () => {
  it("preserves the expected and current observed-state digests", () => {
    const error = new StaleRemediationPlanError("sha256:expected", "sha256:current");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("stale_remediation_plan");
    expect(error.expectedObservedDigest).toBe("sha256:expected");
    expect(error.currentObservedDigest).toBe("sha256:current");
  });
});
