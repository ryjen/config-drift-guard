import type {
  Decision,
  Environment,
  ErrorEnvelope,
  Event,
  Finding,
  JsonValue,
  RemediationPlan,
  Run,
  RunSnapshot,
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

/** Read-only environment catalog. Fixture seeding is an infrastructure concern. */
export interface EnvironmentRepository {
  listEnvironments(): Environment[];
  getEnvironment(environmentId: string): Environment | null;
}

/** Durable run lifecycle and decisions; transitions retain database atomicity. */
export interface RunRepository extends RunStateStore {
  hasActiveRun(environmentId: string): boolean;
  createQueuedRun(environmentId: string): Run;
  recoverInterruptedRuns(): Run[];
  getRunSnapshot(runId: string): RunSnapshot;
  replaceFindings(runId: string, records: readonly Omit<Finding, "id" | "runId">[]): Finding[];
  saveRemediationPlan(input: Omit<RemediationPlan, "id" | "createdAt">): RemediationPlan;
  recordDecisionAndApprove(input: Omit<Decision, "id" | "createdAt">): {
    decision: Decision;
    run: Run;
  };
  recordDecisionAndReject(input: Omit<Decision, "id" | "createdAt">): {
    decision: Decision;
    run: Run;
  };
}

/** Replayed events are durable; live in-process fan-out is a distinct port. */
export interface EventRepository {
  listRunEventsAfter(runId: string, afterEventId: number): Event[];
}

/** Backward-compatible aggregate for infrastructure composition only. */
export interface PersistencePorts extends EnvironmentRepository, RunRepository, EventRepository {}
