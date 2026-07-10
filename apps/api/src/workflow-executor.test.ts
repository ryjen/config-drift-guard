import { describe, expect, it } from "vitest";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { WorkflowExecutor } from "./workflow-executor.js";

describe("WorkflowExecutor", () => {
  it("persists a complete deterministic service-config drift scan", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);

    const snapshot = new WorkflowExecutor(repository).execute(run.id);

    expect(snapshot.run).toMatchObject({
      status: "awaiting_approval",
      currentStep: null,
      findingCount: 3,
    });
    expect(snapshot.run.canonicalDigest).toMatch(/^sha256:/);
    expect(snapshot.run.observedDigest).toMatch(/^sha256:/);
    expect(snapshot.steps.map((step) => [step.key, step.status])).toEqual([
      ["validate_canonical_state", "succeeded"],
      ["load_observed_state", "succeeded"],
      ["normalize_state", "succeeded"],
      ["calculate_drift", "succeeded"],
      ["classify_findings", "succeeded"],
      ["build_remediation_plan", "succeeded"],
    ]);
    expect(snapshot.findings.map((finding) => [finding.path, finding.severity])).toEqual([
      ["/image", "critical"],
      ["/replicas", "warning"],
      ["/environment/LOG_LEVEL", "warning"],
    ]);
    expect(snapshot.plan).toMatchObject({
      expectedObservedDigest: snapshot.run.observedDigest,
      target: {
        image: "api:v2",
        replicas: 3,
        environment: { LOG_LEVEL: "info" },
      },
    });

    const reloaded = repository.getRunSnapshot(run.id);
    expect(reloaded.findings.map((finding) => finding.path)).toEqual(
      snapshot.findings.map((finding) => finding.path),
    );

    handle.close();
  });
});
