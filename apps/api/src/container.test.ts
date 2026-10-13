import { describe, expect, it, vi } from "vitest";
import { createAppContainer } from "./container.js";
import { createDatabase } from "./persistence/database.js";

describe("AppContainer resource ownership", () => {
  it("cancels deferred work while preserving an injected database", async () => {
    const database = createDatabase(":memory:");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const container = createAppContainer({
      database,
      deferWorkflow: (callback) => setTimeout(callback, 60_000),
    });

    try {
      expect(container.repository.listEnvironments()).toHaveLength(2);
      const snapshot = container.orchestrator.createRun("env_service_config");
      expect(snapshot.run.status).toBe("queued");

      await container.close();
      expect(clearSpy).toHaveBeenCalled();
      // Container shutdown does not close a database supplied by its caller.
      expect(container.repository.getRunSnapshot(snapshot.run.id).run.status).toBe("queued");
    } finally {
      await container.close();
      database.close();
      clearSpy.mockRestore();
    }
  });
});
