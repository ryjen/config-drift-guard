import type {
  ErrorEnvelope,
  Finding,
  JsonValue,
  Run,
  RunSnapshot,
  RunStatus,
  StepStatus,
  WorkflowStepKey,
} from "@config-drift-guard/contracts";
import type { NormalizedResourceState } from "@config-drift-guard/drift-engine";

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

export interface WorkflowRepository extends RunStateStore {
  replaceFindings(runId: string, records: readonly Omit<Finding, "id" | "runId">[]): Finding[];
  saveRemediationPlan(input: {
    readonly runId: string;
    readonly canonicalDigest: string;
    readonly expectedObservedDigest: string;
    readonly targetDigest: string;
    readonly target: JsonValue;
    readonly engineVersion: string;
  }): unknown;
  getRunSnapshot(runId: string): RunSnapshot;
}

export interface ApplyResult {
  readonly observedDigestBefore: string;
  readonly observedDigestAfter: string;
  readonly targetDigest: string;
}

export interface DriftAdapter {
  readonly kind: string;
  loadCanonical(): JsonValue;
  loadObserved(): JsonValue;
  validateCanonical(input: JsonValue): void;
  normalizeCanonical(input: JsonValue): NormalizedResourceState;
  normalizeObserved(input: JsonValue, resourceId: string): NormalizedResourceState;
  applyTarget(expectedObservedDigest: string, target: JsonValue): ApplyResult;
}
