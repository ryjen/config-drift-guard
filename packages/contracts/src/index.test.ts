import { describe, expect, it } from "vitest";
import {
  environmentSchema,
  healthResponse,
  remediationPlanSchema,
  runSnapshotSchema,
} from "./index.js";

describe("contracts", () => {
  it("defines the API health contract", () => {
    expect(healthResponse).toEqual({
      service: "config-drift-guard-api",
      status: "ok",
    });
  });

  it("validates service-config environment metadata", () => {
    expect(
      environmentSchema.parse({
        id: "env_service_config",
        name: "Service configuration drift",
        adapterKind: "service_config",
        sourceConfig: {
          scenario: "service-config",
          canonicalFixture: "service-config.desired.yaml",
          observedFixture: "service-config.observed.json",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ adapterKind: "service_config" });
  });

  it("rejects invalid persisted plan JSON", () => {
    expect(() =>
      remediationPlanSchema.parse({
        id: "plan_1",
        runId: "run_1",
        canonicalDigest: "sha256:a",
        expectedObservedDigest: "sha256:b",
        target: undefined,
        engineVersion: "test",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("validates complete REST run snapshots", () => {
    expect(
      runSnapshotSchema.parse({
        run: {
          id: "run_1",
          environmentId: "env_service_config",
          status: "queued",
          currentStep: null,
          version: 0,
          canonicalDigest: null,
          observedDigest: null,
          findingCount: 0,
          error: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        steps: [],
        findings: [],
        plan: null,
        decision: null,
        events: [],
      }),
    ).toMatchObject({ run: { status: "queued" } });
  });
});
