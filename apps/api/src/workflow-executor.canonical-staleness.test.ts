import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@config-drift-guard/contracts";
import { describe, expect, it } from "vitest";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { approveRun } from "./state-machine.js";
import { WorkflowExecutor } from "./workflow-executor.js";

describe("WorkflowExecutor canonical-state preflight", () => {
  it("rejects an approved plan when canonical state changed after plan generation", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = join(
      mkdtempSync(join(tmpdir(), "config-drift-guard-canonical-staleness-")),
      "observed.json",
    );
    const adapter = new MutableCanonicalAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    const planned = await executor.execute(run.id);
    expect(planned.run.status).toBe("awaiting_approval");
    expect(planned.plan?.target).toMatchObject({ image: "api:v2" });

    adapter.canonicalImage = "api:v3";
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);

    const failed = await executor.executeReconciliation(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toMatchObject({
      code: "stale_canonical_state",
      detail: {
        expectedCanonicalDigest: planned.plan?.canonicalDigest,
      },
    });
    expect(failed.steps.find((step) => step.key === "preflight_reconciliation")).toMatchObject({
      status: "failed",
      error: { code: "stale_canonical_state" },
    });
    expect(failed.steps.find((step) => step.key === "apply_reconciliation")).toMatchObject({
      status: "skipped",
    });
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v1");

    handle.close();
  });
});

class MutableCanonicalAdapter extends ServiceConfigAdapter {
  canonicalImage = "api:v2";

  override loadCanonical(): JsonValue {
    return {
      resources: [
        {
          id: "api-service",
          type: "service",
          desired: {
            image: this.canonicalImage,
            replicas: 3,
            environment: { LOG_LEVEL: "info" },
          },
        },
      ],
    };
  }
}
