import { describe, expect, it } from "vitest";
import { isActiveRunConstraintError } from "./constraint-errors.js";

describe("isActiveRunConstraintError", () => {
  it("accepts the active-run environment uniqueness violation", () => {
    const error = Object.assign(new Error("UNIQUE constraint failed: runs.environment_id"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });

    expect(isActiveRunConstraintError(error)).toBe(true);
  });

  it("rejects unrelated uniqueness violations", () => {
    const error = Object.assign(new Error("UNIQUE constraint failed: steps.run_id, steps.key"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });

    expect(isActiveRunConstraintError(error)).toBe(false);
  });

  it("rejects message matches without the SQLite constraint code", () => {
    expect(
      isActiveRunConstraintError(new Error("UNIQUE constraint failed: runs.environment_id")),
    ).toBe(false);
  });
});
