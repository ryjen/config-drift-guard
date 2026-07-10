import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { approveRun } from "./state-machine.js";
import { WorkflowExecutor } from "./workflow-executor.js";

describe("WorkflowExecutor", () => {
  it("persists a complete deterministic service-config drift scan", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const adapter = new ServiceConfigAdapter(createObservedPath());

    const snapshot = new WorkflowExecutor(repository, adapter).execute(run.id);

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
      ["preflight_reconciliation", "pending"],
      ["apply_reconciliation", "pending"],
      ["verify_convergence", "pending"],
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

  it("applies an approved plan atomically and verifies convergence", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new ServiceConfigAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    executor.execute(run.id);
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const reconciled = executor.executeReconciliation(run.id);

    expect(reconciled.run.status).toBe("succeeded");
    expect(reconciled.run.findingCount).toBe(0);
    expect(reconciled.findings).toEqual([]);
    expect(reconciled.steps.map((step) => [step.key, step.status])).toEqual([
      ["validate_canonical_state", "succeeded"],
      ["load_observed_state", "succeeded"],
      ["normalize_state", "succeeded"],
      ["calculate_drift", "succeeded"],
      ["classify_findings", "succeeded"],
      ["build_remediation_plan", "succeeded"],
      ["preflight_reconciliation", "succeeded"],
      ["apply_reconciliation", "succeeded"],
      ["verify_convergence", "succeeded"],
    ]);
    expect(JSON.parse(readFileSync(observedPath, "utf8"))).toMatchObject({
      "api-service": {
        type: "service",
        image: "api:v2",
        replicas: 3,
        environment: { LOG_LEVEL: "info" },
        runtimePid: 1832,
      },
    });

    handle.close();
  });

  it("fails safely when the observed digest changed after plan generation", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new ServiceConfigAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    executor.execute(run.id);
    writeFileSync(
      observedPath,
      `${JSON.stringify({
        "api-service": {
          type: "service",
          image: "api:v3",
          replicas: 1,
          environment: { LOG_LEVEL: "debug" },
          runtimePid: 1832,
        },
      })}\n`,
      "utf8",
    );
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const failed = executor.executeReconciliation(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toMatchObject({ code: "stale_remediation_plan" });
    expect(failed.steps.find((step) => step.key === "preflight_reconciliation")).toMatchObject({
      status: "failed",
      error: { code: "stale_remediation_plan" },
    });
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v3");

    handle.close();
  });
});

function createObservedPath(): string {
  return join(mkdtempSync(join(tmpdir(), "config-drift-guard-")), "observed.json");
}
