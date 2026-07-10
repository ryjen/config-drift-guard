import { describe, expect, it } from "vitest";
import { createDatabase } from "./database.js";
import { PersistenceRepository, workflowSteps } from "./repository.js";

describe("PersistenceRepository", () => {
  it("seeds the service-config environment", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);

    const environment = repository.seedServiceConfigEnvironment();

    expect(environment).toMatchObject({
      id: "env_service_config",
      adapterKind: "service_config",
      sourceConfig: {
        scenario: "service-config",
        canonicalFixture: "service-config.desired.yaml",
        observedFixture: "service-config.observed.json",
      },
    });
    expect(repository.listEnvironments()).toHaveLength(1);

    handle.close();
  });

  it("round-trips run state, findings, immutable plan, decision, and events", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();

    const run = repository.createQueuedRun(environment.id);
    const findings = repository.replaceFindings(run.id, [
      {
        resourceId: "api-service",
        path: "/image",
        kind: "changed",
        severity: "critical",
        canonicalValue: "api:v2",
        observedValue: "api:v1",
        sequence: 0,
      },
      {
        resourceId: "api-service",
        path: "/replicas",
        kind: "changed",
        severity: "warning",
        canonicalValue: 3,
        observedValue: 1,
        sequence: 1,
      },
    ]);
    const plan = repository.saveRemediationPlan({
      runId: run.id,
      canonicalDigest: "sha256:canonical",
      expectedObservedDigest: "sha256:observed",
      target: {
        resources: [
          {
            id: "api-service",
            image: "api:v2",
            replicas: 3,
            environment: { LOG_LEVEL: "info" },
          },
        ],
      },
      engineVersion: "test-engine",
    });
    const decision = repository.recordDecision({
      runId: run.id,
      action: "approved",
      actor: "operator",
      comment: "Proceed",
    });

    const snapshot = repository.getRunSnapshot(run.id);

    expect(snapshot.steps.map((step) => step.key)).toEqual(workflowSteps);
    expect(findings).toHaveLength(2);
    expect(snapshot.findings.map((finding) => finding.path)).toEqual(["/image", "/replicas"]);
    expect(plan).toMatchObject({ expectedObservedDigest: "sha256:observed" });
    expect(decision).toMatchObject({ action: "approved" });
    expect(snapshot.events.map((event) => event.eventType)).toEqual([
      "run.queued",
      "findings.replaced",
      "plan.created",
      "decision.approved",
    ]);
    const firstEvent = snapshot.events[0];
    expect(firstEvent).toBeDefined();
    expect(
      repository.listRunEventsAfter(run.id, firstEvent?.id ?? 0).map((event) => event.eventType),
    ).toEqual(["findings.replaced", "plan.created", "decision.approved"]);

    handle.close();
  });

  it("notifies and cleans up run event listeners", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);
    const received: string[] = [];

    const unsubscribe = repository.subscribeRunEvents(run.id, (event) => {
      received.push(event.eventType);
    });

    repository.appendEvent(run.id, "test.connected", { status: "ok" });
    unsubscribe();
    repository.appendEvent(run.id, "test.disconnected", { status: "ok" });

    expect(received).toEqual(["test.connected"]);

    handle.close();
  });

  it("validates persisted JSON when reading snapshots", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);

    handle.sqlite
      .prepare("insert into events (run_id, event_type, payload, created_at) values (?, ?, ?, ?)")
      .run(run.id, "invalid.payload", "not-json", new Date().toISOString());

    expect(() => repository.getRunSnapshot(run.id)).toThrow();

    handle.close();
  });
});
