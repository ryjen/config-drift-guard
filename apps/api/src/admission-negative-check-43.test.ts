import { describe, expect, it } from "vitest";

// Disposable test for issue #43. This assertion must fail.
// Do not merge this branch or modify existing production code.
describe("GitHub provider admission negative control", () => {
  it("intentionally fails so the required check blocks the PR", () => {
    expect("blocked").toBe("mergeable");
  });
});
