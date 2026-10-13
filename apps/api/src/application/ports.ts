import type {
  Event,
  Finding,
  JsonValue,
  RunSnapshot,
  RunStateStore,
} from "@config-drift-guard/contracts";
import type { NormalizedResourceState } from "@config-drift-guard/drift-engine";

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
