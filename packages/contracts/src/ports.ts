import type {
  ErrorEnvelope,
  JsonValue,
  Run,
  RunStatus,
  StepStatus,
  WorkflowStepKey,
} from "./index.js";

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
