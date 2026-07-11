import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@config-drift-guard/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { approveRun } from "./state-machine.js";
import { WorkflowExecutor } from "./workflow-executor.js";

describe("WorkflowExecutor canonical-state preflight", () => {
  let handle: DatabaseHandle;
  let tempDir: string;

  afterEach(() => {
    handle?.close();
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects an approved plan when canonical managed state changed after plan generation", async () => {
    const { adapter, executor, observedPath, planned, repository, runId } = await createPlannedRun();

    adapter.canonicalImage = "api:v3";
    approve(repository, runId);

    const failed = await executor.executeReconciliation(runId);

    expectStaleCanonicalFailure(failed, planned.plan?.canonicalDigest);
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v1");
  });

  it("rejects an approved plan when canonical resource identity changed", async () => {
    const { adapter, executor, observedPath, planned, repository, runId } = await createPlannedRun();

    adapter.canonicalResourceId = "replacement-service";
    approve(repository, runId);

    const failed = await executor.executeReconciliation(runId);

    expectStaleCanonicalFailure(failed, planned.plan?.canonicalDigest);
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v1");
  });

  async function createPlannedRun() {
    handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    tempDir = mkdtempSync(join(tmpdir(), "config-drift-guard-canonical-staleness-"));
    const observedPath = join(tempDir, "observed.json");
    const adapter = new MutableCanonicalAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);
    const planned = await executor.execute(run.id);

    expect(planned.run.status).toBe("awaiting_approval");
    expect(planned.plan?.target).toMatchObject({ image: "api:v2" });

    return { adapter, executor, observedPath, planned, repository, runId: run.id };
  }
});

function approve(repository: PersistenceRepository, runId: string): void {
  repository.recordDecision({
    runId,
    action: "approved",
    actor: "local-operator",
    comment: null,
  });
  approveRun(repository, runId);
}

function expectStaleCanonicalFailure(
  failed: ReturnType<PersistenceRepository["getRunSnapshot"]>,
  expectedCanonicalDigest: string | undefined,
): void {
  expect(failed.run.status).toBe("failed");
  expect(failed.run.error).toMatchObject({
    code: "stale_canonical_state",
    detail: {
      expectedCanonicalDigest,
      currentCanonicalDigest: expect.stringMatching(/^sha256:/),
    },
  });
  expect(failed.run.error?.detail).not.toMatchObject({
    currentCanonicalDigest: expectedCanonicalDigest,
  });
  expect(failed.steps.find((step) => step.key === "preflight_reconciliation")).toMatchObject({
    status: "failed",
    error: { code: "stale_canonical_state" },
  });
  expect(failed.steps.find((step) => step.key === "apply_reconciliation")).toMatchObject({
    status: "skipped",
  });
}

class MutableCanonicalAdapter extends ServiceConfigAdapter {
  canonicalResourceId = "api-service";
  canonicalImage = "api:v2";

  override loadCanonical(): JsonValue {
    return {
      resources: [
        {
          id: this.canonicalResourceId,
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
