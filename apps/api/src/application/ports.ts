import type {
  EnvironmentRepository,
  Event,
  EventRepository,
  JsonValue,
  RunRepository,
  RunStateStore,
} from "@config-drift-guard/contracts";
import type { NormalizedResourceState } from "@config-drift-guard/drift-engine";

/** Executor needs run transitions, findings, plan persistence and snapshots only. */
export interface WorkflowRepository
  extends RunStateStore,
    Pick<RunRepository, "replaceFindings" | "saveRemediationPlan" | "getRunSnapshot"> {}

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

/** Optional runtime hook for UI-friendly progress; core workflow has no timers. */
export interface WorkflowPacer {
  afterPhase(): Promise<void>;
}

/** Public in-process delivery contract. Persistence does not own subscribers. */
export type RunEventListener = (event: Event) => void;

export interface RunEventBusPort {
  subscribe(runId: string, listener: RunEventListener): () => void;
  publish(event: Event): void;
}

/** Use case only reads environments and controls run/decision lifecycle. */
export interface RunOrchestratorRepository
  extends EnvironmentRepository,
    Pick<
      RunRepository,
      | "hasActiveRun"
      | "createQueuedRun"
      | "getRunSnapshot"
      | "recordDecisionAndApprove"
      | "recordDecisionAndReject"
    > {}

/** Routes require a run existence guard and durable replay, not mutable run state. */
export interface EventReadRepository extends EventRepository, Pick<RunStateStore, "getRun"> {}

export interface ResettableDriftAdapter extends DriftAdapter {
  resetObserved(): void;
}
