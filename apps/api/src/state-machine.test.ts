import { type RunStatus, runStatusSchema } from "@config-drift-guard/contracts";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import {
  approveRun,
  completeStep,
  failRun,
  finishReconciledRun,
  finishRun,
  rejectRun,
  startRun,
  startStep,
} from "./state-machine.js";

const statuses = runStatusSchema.options;

describe("run state machine", () => {
  it("allows the legal detection, approval, reconciliation, rejection, and failure transitions", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();
    const run = repository.createQueuedRun(environment.id);

    expect(startRun(repository, run.id).status).toBe("running");
    startStep(repository, run.id, "validate_canonical_state");
    completeStep(repository, run.id, "validate_canonical_state", null);
    expect(
      finishRun(repository, run.id, {
        canonicalDigest: "sha256:canonical",
        observedDigest: "sha256:observed",
      }).status,
    ).toBe("awaiting_approval");
    expect(approveRun(repository, run.id).status).toBe("running");
    startStep(repository, run.id, "verify_convergence");
    completeStep(repository, run.id, "verify_convergence", null);
    expect(finishReconciledRun(repository, run.id, "sha256:verified").status).toBe("succeeded");

    const rejectedRun = repository.createQueuedRun(environment.id);
    startRun(repository, rejectedRun.id);
    finishRun(repository, rejectedRun.id, {
      canonicalDigest: "sha256:canonical",
      observedDigest: "sha256:observed",
    });
    expect(rejectRun(repository, rejectedRun.id).status).toBe("rejected");

    const failedRun = repository.createQueuedRun(environment.id);
    startRun(repository, failedRun.id);
    startStep(repository, failedRun.id, "load_observed_state");
    expect(
      failRun(repository, failedRun.id, "load_observed_state", {
        code: "test_failure",
        message: "test failure",
      }).status,
    ).toBe("failed");
    expect(
      repository.getRunSnapshot(failedRun.id).steps.filter((step) => step.status === "pending"),
    ).toEqual([]);

    handle.close();
  });

  it("rejects illegal run and step transitions for every terminal and inactive status", () => {
    const handle = createDatabase(":memory:");
    const repository = new PersistenceRepository(handle.db);
    const environment = repository.seedServiceConfigEnvironment();

    for (const status of statuses) {
      if (status !== "queued") {
        const run = createRunWithStatus(repository, environment.id, status);
        expect(() => startRun(repository, run.id)).toThrow(
          `illegal_run_transition:${status}:running`,
        );
      }

      if (status !== "running") {
        const run = createRunWithStatus(repository, environment.id, status);
        expect(() => startStep(repository, run.id, "calculate_drift")).toThrow(
          `illegal_step_transition:${status}:calculate_drift`,
        );
        expect(() => completeStep(repository, run.id, "calculate_drift", null)).toThrow(
          `illegal_step_completion:${status}:none:calculate_drift`,
        );
      }

      if (status !== "awaiting_approval") {
        const approveCandidate = createRunWithStatus(repository, environment.id, status);
        expect(() => approveRun(repository, approveCandidate.id)).toThrow(
          `illegal_run_transition:${status}:running`,
        );

        const rejectCandidate = createRunWithStatus(repository, environment.id, status);
        expect(() => rejectRun(repository, rejectCandidate.id)).toThrow(
          `illegal_run_transition:${status}:rejected`,
        );
      }

      if (status !== "running") {
        const finishCandidate = createRunWithStatus(repository, environment.id, status);
        expect(() =>
          finishRun(repository, finishCandidate.id, {
            canonicalDigest: "sha256:canonical",
            observedDigest: "sha256:observed",
          }),
        ).toThrow(`illegal_run_transition:${status}:awaiting_approval`);

        const reconciledCandidate = createRunWithStatus(repository, environment.id, status);
        expect(() =>
          finishReconciledRun(repository, reconciledCandidate.id, "sha256:verified"),
        ).toThrow(`illegal_run_transition:${status}:succeeded`);
      }
    }

    const runningRun = createRunWithStatus(repository, environment.id, "running");
    repository.updateRunState(runningRun.id, {
      status: "running",
      currentStep: "normalize_state",
    });
    expect(() => completeStep(repository, runningRun.id, "calculate_drift", null)).toThrow(
      "illegal_step_completion:running:normalize_state:calculate_drift",
    );

    handle.close();
  });
});

function createRunWithStatus(
  repository: PersistenceRepository,
  environmentId: string,
  status: RunStatus,
) {
  const run = repository.createQueuedRun(environmentId);
  if (status === "queued") {
    return run;
  }

  return repository.updateRunState(run.id, { status, currentStep: null, error: null });
}
