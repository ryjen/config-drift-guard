import type {
  ErrorEnvelope,
  JsonValue,
  Run,
  RunStatus,
  StepStatus,
  WorkflowStepKey,
} from "@config-drift-guard/contracts";

export interface RunStateStore {
  getRun(runId: string): Run;
  updateRunState(
    runId: string,
    input: {
      readonly status: RunStatus;
      readonly currentStep?: WorkflowStepKey | null;
      readonly canonicalDigest?: string | null;
      readonly observedDigest?: string | null;
      readonly error?: ErrorEnvelope | null;
    },
  ): Run;
  updateStepState(
    runId: string,
    key: WorkflowStepKey,
    input: {
      readonly status: StepStatus;
      readonly message?: string | null;
      readonly output?: JsonValue | null;
      readonly error?: ErrorEnvelope | null;
    },
  ): void;
  skipPendingSteps(runId: string): void;
}

export function startRun(store: RunStateStore, runId: string): Run {
  const run = store.getRun(runId);
  if (run.status !== "queued") {
    throw new Error(`illegal_run_transition:${run.status}:running`);
  }

  return store.updateRunState(runId, { status: "running", currentStep: null, error: null });
}

export function startStep(store: RunStateStore, runId: string, key: WorkflowStepKey): void {
  const run = store.getRun(runId);
  if (run.status !== "running") {
    throw new Error(`illegal_step_transition:${run.status}:${key}`);
  }

  store.updateRunState(runId, { status: "running", currentStep: key });
  store.updateStepState(runId, key, { status: "running", message: "Running" });
}

export function completeStep(
  store: RunStateStore,
  runId: string,
  key: WorkflowStepKey,
  output: JsonValue | null,
  message = "Succeeded",
): void {
  const run = store.getRun(runId);
  if (run.status !== "running" || run.currentStep !== key) {
    throw new Error(`illegal_step_completion:${run.status}:${run.currentStep ?? "none"}:${key}`);
  }

  store.updateStepState(runId, key, { status: "succeeded", message, output, error: null });
}

export function finishRun(
  store: RunStateStore,
  runId: string,
  input: { readonly canonicalDigest: string; readonly observedDigest: string },
): Run {
  const run = store.getRun(runId);
  if (run.status !== "running") {
    throw new Error(`illegal_run_transition:${run.status}:awaiting_approval`);
  }

  return store.updateRunState(runId, {
    status: "awaiting_approval",
    currentStep: null,
    canonicalDigest: input.canonicalDigest,
    observedDigest: input.observedDigest,
    error: null,
  });
}

export function approveRun(store: RunStateStore, runId: string): Run {
  const run = store.getRun(runId);
  if (run.status !== "awaiting_approval") {
    throw new Error(`illegal_run_transition:${run.status}:running`);
  }

  return store.updateRunState(runId, { status: "running", currentStep: null, error: null });
}

export function rejectRun(store: RunStateStore, runId: string): Run {
  const run = store.getRun(runId);
  if (run.status !== "awaiting_approval") {
    throw new Error(`illegal_run_transition:${run.status}:rejected`);
  }

  store.skipPendingSteps(runId);
  return store.updateRunState(runId, { status: "rejected", currentStep: null, error: null });
}

export function finishReconciledRun(
  store: RunStateStore,
  runId: string,
  observedDigest: string,
): Run {
  const run = store.getRun(runId);
  if (run.status !== "running") {
    throw new Error(`illegal_run_transition:${run.status}:succeeded`);
  }

  return store.updateRunState(runId, {
    status: "succeeded",
    currentStep: null,
    canonicalDigest: run.canonicalDigest,
    observedDigest,
    error: null,
  });
}

export function failRun(
  store: RunStateStore,
  runId: string,
  key: WorkflowStepKey | null,
  error: ErrorEnvelope,
): Run {
  if (key !== null) {
    store.updateStepState(runId, key, {
      status: "failed",
      message: error.message,
      output: null,
      error,
    });
  }
  store.skipPendingSteps(runId);
  return store.updateRunState(runId, { status: "failed", currentStep: null, error });
}
