import { type RunStatus, runStatusSchema } from "@config-drift-guard/contracts";
import { describe, expect, it } from "vitest";
import { StubRunStateStore } from "./__tests__/stub-store.js";
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

describe("run state machine (database-free)", () => {
  it("allows detection, approval, reconciliation, rejection, and failure", () => {
    const store = new StubRunStateStore();
    const run = store.createRun();

    expect(startRun(store, run.id).status).toBe("running");
    startStep(store, run.id, "validate_canonical_state");
    completeStep(store, run.id, "validate_canonical_state", null);
    expect(store.stepUpdates.map(({ input }) => input.status)).toEqual(["running", "succeeded"]);
    expect(
      finishRun(store, run.id, {
        canonicalDigest: "sha256:canonical",
        observedDigest: "sha256:observed",
      }).status,
    ).toBe("awaiting_approval");
    expect(approveRun(store, run.id).status).toBe("running");
    startStep(store, run.id, "verify_convergence");
    completeStep(store, run.id, "verify_convergence", null);
    const reconciled = finishReconciledRun(store, run.id, "sha256:verified");
    expect(reconciled.status).toBe("succeeded");
    expect(reconciled.canonicalDigest).toBe("sha256:canonical");
    expect(reconciled.observedDigest).toBe("sha256:verified");

    const rejectedRun = store.createRun();
    startRun(store, rejectedRun.id);
    finishRun(store, rejectedRun.id, {
      canonicalDigest: "sha256:canonical",
      observedDigest: "sha256:observed",
    });
    expect(rejectRun(store, rejectedRun.id).status).toBe("rejected");
    expect(store.skippedRuns).toContain(rejectedRun.id);

    const failedRun = store.createRun();
    startRun(store, failedRun.id);
    startStep(store, failedRun.id, "load_observed_state");
    const failure = { code: "test_failure", message: "test failure" };
    const failed = failRun(store, failedRun.id, "load_observed_state", failure);
    expect(failed.status).toBe("failed");
    expect(failed.error).toEqual(failure);
    expect(store.skippedRuns).toContain(failedRun.id);
    expect(store.stepUpdates.at(-1)).toEqual({
      runId: failedRun.id,
      key: "load_observed_state",
      input: { status: "failed", message: failure.message, output: null, error: failure },
    });
  });

  it("rejects illegal run and step transitions for each terminal and inactive status", () => {
    for (const status of statuses) {
      if (status !== "queued") {
        const store = new StubRunStateStore();
        const run = store.createRun(status);
        expect(() => startRun(store, run.id)).toThrow(`illegal_run_transition:${status}:running`);
      }

      if (status !== "running") {
        const store = new StubRunStateStore();
        const run = store.createRun(status);
        expect(() => startStep(store, run.id, "calculate_drift")).toThrow(
          `illegal_step_transition:${status}:calculate_drift`,
        );
        expect(() => completeStep(store, run.id, "calculate_drift", null)).toThrow(
          `illegal_step_completion:${status}:none:calculate_drift`,
        );
      }

      if (status !== "awaiting_approval") {
        const approval = new StubRunStateStore();
        const approving = approval.createRun(status);
        expect(() => approveRun(approval, approving.id)).toThrow(
          `illegal_run_transition:${status}:running`,
        );

        const rejection = new StubRunStateStore();
        const rejecting = rejection.createRun(status);
        expect(() => rejectRun(rejection, rejecting.id)).toThrow(
          `illegal_run_transition:${status}:rejected`,
        );
      }

      if (status !== "running") {
        const detection = new StubRunStateStore();
        const detectionRun = detection.createRun(status);
        expect(() =>
          finishRun(detection, detectionRun.id, {
            canonicalDigest: "sha256:canonical",
            observedDigest: "sha256:observed",
          }),
        ).toThrow(`illegal_run_transition:${status}:awaiting_approval`);

        const convergence = new StubRunStateStore();
        const convergenceRun = convergence.createRun(status);
        expect(() =>
          finishReconciledRun(convergence, convergenceRun.id, "sha256:verified"),
        ).toThrow(`illegal_run_transition:${status}:succeeded`);
      }
    }

    const store = new StubRunStateStore();
    const run = store.createRun("running");
    store.updateRunState(run.id, { status: "running", currentStep: "normalize_state" });
    expect(() => completeStep(store, run.id, "calculate_drift", null)).toThrow(
      "illegal_step_completion:running:normalize_state:calculate_drift",
    );
  });

  it("does not mutate the store for a forbidden transition", () => {
    for (const status of statuses) {
      const store = new StubRunStateStore();
      const run = store.createRun(status as RunStatus);
      if (status === "queued") continue;
      expect(() => startRun(store, run.id)).toThrow();
      expect(store.getRun(run.id)).toEqual(run);
      expect(store.skippedRuns).toEqual([]);
      expect(store.stepUpdates).toEqual([]);
    }
  });
});
