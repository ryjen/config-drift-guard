import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@config-drift-guard/contracts";
import { describe, expect, it } from "vitest";
import { DocumentationAdapter } from "./adapters/documentation.js";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { approveRun } from "./state-machine.js";
import { WorkflowExecutor } from "./workflow-executor.js";

describe("WorkflowExecutor", () => {
  it("persists a complete deterministic service-config drift scan", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const adapter = new ServiceConfigAdapter(createObservedPath());

    const snapshot = await new WorkflowExecutor(repository, adapter).execute(run.id);

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

  it("persists a complete deterministic structured-documentation drift scan", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedDocumentationEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const adapter = new DocumentationAdapter(createObservedPath());

    const snapshot = await new WorkflowExecutor(repository, adapter).execute(run.id);

    expect(snapshot.run).toMatchObject({
      status: "awaiting_approval",
      currentStep: null,
      findingCount: 3,
    });
    expect(snapshot.findings.map((finding) => [finding.path, finding.kind])).toEqual([
      ["/retries/default", "changed"],
      ["/timeout", "missing"],
      ["/legacy_mode", "extra"],
    ]);
    expect(snapshot.plan).toMatchObject({
      expectedObservedDigest: snapshot.run.observedDigest,
      target: {
        retries: { type: "integer", default: "3" },
        timeout: { type: "integer", default: "30" },
      },
    });

    handle.close();
  });

  it("applies an approved documentation plan atomically and verifies convergence", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedDocumentationEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new DocumentationAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    await executor.execute(run.id);
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const reconciled = await executor.executeReconciliation(run.id);

    expect(reconciled.run.status).toBe("succeeded");
    expect(reconciled.findings).toEqual([]);
    expect(readFileSync(observedPath, "utf8")).toContain("| retries | integer | 3 |");
    expect(readFileSync(observedPath, "utf8")).toContain("| timeout | integer | 30 |");
    expect(readFileSync(observedPath, "utf8")).not.toContain("legacy_mode");

    handle.close();
  });

  it("applies an approved plan atomically and verifies convergence", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new ServiceConfigAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    await executor.execute(run.id);
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const reconciled = await executor.executeReconciliation(run.id);

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

  it("fails safely when the observed digest changed after plan generation", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new ServiceConfigAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    await executor.execute(run.id);
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
    const failed = await executor.executeReconciliation(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toMatchObject({ code: "stale_remediation_plan" });
    expect(failed.steps.find((step) => step.key === "preflight_reconciliation")).toMatchObject({
      status: "failed",
      error: { code: "stale_remediation_plan" },
    });
    expect(failed.steps.find((step) => step.key === "apply_reconciliation")).toMatchObject({
      status: "skipped",
    });
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v3");

    handle.close();
  });

  it("fails invalid canonical state before reading observed state or building a plan", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new InvalidCanonicalAdapter(observedPath);

    const failed = await new WorkflowExecutor(repository, adapter).execute(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toMatchObject({ code: "validation_failed" });
    expect(failed.plan).toBeNull();
    expect(failed.steps.find((step) => step.key === "validate_canonical_state")).toMatchObject({
      status: "failed",
      error: { code: "validation_failed" },
    });
    expect(failed.steps.find((step) => step.key === "load_observed_state")).toMatchObject({
      status: "skipped",
    });

    handle.close();
  });

  it("fails malformed observed state before plan generation or mutation", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    writeFileSync(observedPath, "{", "utf8");

    const failed = await new WorkflowExecutor(
      repository,
      new ServiceConfigAdapter(observedPath),
    ).execute(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.run.error).toMatchObject({ code: "workflow_failed" });
    expect(failed.plan).toBeNull();
    expect(failed.steps.find((step) => step.key === "load_observed_state")).toMatchObject({
      status: "failed",
    });
    expect(failed.steps.find((step) => step.key === "normalize_state")).toMatchObject({
      status: "skipped",
    });
    expect(readFileSync(observedPath, "utf8")).toBe("{");

    handle.close();
  });

  it("fails safely when the atomic apply step throws", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new AtomicFailureAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    await executor.execute(run.id);
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const failed = await executor.executeReconciliation(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.steps.find((step) => step.key === "apply_reconciliation")).toMatchObject({
      status: "failed",
      error: { message: "simulated_atomic_write_failure" },
    });
    expect(failed.steps.find((step) => step.key === "verify_convergence")).toMatchObject({
      status: "skipped",
    });
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v1");

    handle.close();
  });

  it("fails verification when the observed state does not converge after apply", async () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const observedPath = createObservedPath();
    const adapter = new VerificationMismatchAdapter(observedPath);
    const executor = new WorkflowExecutor(repository, adapter);

    await executor.execute(run.id);
    repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: null,
    });
    approveRun(repository, run.id);
    const failed = await executor.executeReconciliation(run.id);

    expect(failed.run.status).toBe("failed");
    expect(failed.steps.find((step) => step.key === "apply_reconciliation")).toMatchObject({
      status: "succeeded",
    });
    expect(failed.steps.find((step) => step.key === "verify_convergence")).toMatchObject({
      status: "failed",
      error: { message: "verification_mismatch" },
    });
    expect(JSON.parse(readFileSync(observedPath, "utf8"))["api-service"].image).toBe("api:v1");

    handle.close();
  });
});

function createObservedPath(): string {
  return join(mkdtempSync(join(tmpdir(), "config-drift-guard-")), "observed.json");
}

class InvalidCanonicalAdapter extends ServiceConfigAdapter {
  override loadCanonical(): JsonValue {
    return { resources: [{ id: "api-service", type: "service", desired: { replicas: -1 } }] };
  }
}

class AtomicFailureAdapter extends ServiceConfigAdapter {
  override applyTarget(): ReturnType<ServiceConfigAdapter["applyTarget"]> {
    throw new Error("simulated_atomic_write_failure");
  }
}

class VerificationMismatchAdapter extends ServiceConfigAdapter {
  override applyTarget(): ReturnType<ServiceConfigAdapter["applyTarget"]> {
    return {
      observedDigestBefore: "sha256:before",
      observedDigestAfter: "sha256:after",
      targetDigest: "sha256:target",
    };
  }
}
