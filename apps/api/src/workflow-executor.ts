import type { ErrorEnvelope, Finding, JsonValue, RunSnapshot } from "@config-drift-guard/contracts";
import {
  buildCompleteTargetState,
  compareNormalizedResourceStates,
  type DriftFinding,
  digestJson,
  digestNormalizedResourceState,
  type NormalizedResourceState,
} from "@config-drift-guard/drift-engine";
import { ZodError } from "zod";
import { ServiceConfigAdapter, StaleRemediationPlanError } from "./adapters/service-config.js";
import {
  completeStep,
  failRun,
  finishReconciledRun,
  finishRun,
  type RunStateStore,
  startRun,
  startStep,
} from "./state-machine.js";

interface WorkflowRepository extends RunStateStore {
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

export class StaleCanonicalStateError extends Error {
  constructor(
    readonly expectedCanonicalDigest: string,
    readonly currentCanonicalDigest: string,
  ) {
    super("stale_canonical_state");
  }
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export class WorkflowExecutor {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly adapter: DriftAdapter = new ServiceConfigAdapter(),
    private readonly phaseDelay = 0,
  ) {}

  async execute(runId: string): Promise<RunSnapshot> {
    let activeStep: RunSnapshot["steps"][number]["key"] | null = null;

    try {
      startRun(this.repository, runId);
      await delay(this.phaseDelay);

      activeStep = "validate_canonical_state";
      startStep(this.repository, runId, activeStep);
      const canonicalRaw = this.adapter.loadCanonical();
      this.adapter.validateCanonical(canonicalRaw);
      completeStep(
        this.repository,
        runId,
        activeStep,
        { resourceCount: 1 },
        "Canonical state is valid",
      );
      await delay(this.phaseDelay);

      activeStep = "load_observed_state";
      startStep(this.repository, runId, activeStep);
      const observedRaw = this.adapter.loadObserved();
      completeStep(
        this.repository,
        runId,
        activeStep,
        { source: "seeded-local-runtime" },
        "Observed state loaded",
      );
      await delay(this.phaseDelay);

      activeStep = "normalize_state";
      startStep(this.repository, runId, activeStep);
      const canonical = this.adapter.normalizeCanonical(canonicalRaw);
      const observed = this.adapter.normalizeObserved(observedRaw, canonical.resourceId);
      const canonicalDigest = digestNormalizedResourceState(canonical);
      const observedDigest = digestNormalizedResourceState(observed);
      completeStep(
        this.repository,
        runId,
        activeStep,
        { canonicalDigest, observedDigest, managedFields: canonical.managedFields },
        "Canonical and observed state normalized",
      );
      await delay(this.phaseDelay);

      activeStep = "calculate_drift";
      startStep(this.repository, runId, activeStep);
      const comparison = compareNormalizedResourceStates(canonical, observed);
      completeStep(
        this.repository,
        runId,
        activeStep,
        { findingCount: comparison.findings.length, engineVersion: comparison.engineVersion },
        "Drift calculated deterministically",
      );
      await delay(this.phaseDelay);

      activeStep = "classify_findings";
      startStep(this.repository, runId, activeStep);
      const findings = comparison.findings.map(toPersistedFinding);
      this.repository.replaceFindings(runId, findings);
      completeStep(
        this.repository,
        runId,
        activeStep,
        severitySummary(comparison.findings),
        "Findings classified",
      );
      await delay(this.phaseDelay);

      activeStep = "build_remediation_plan";
      startStep(this.repository, runId, activeStep);
      const target = buildCompleteTargetState(canonical, observed);
      this.repository.saveRemediationPlan({
        runId,
        canonicalDigest,
        expectedObservedDigest: target.expectedObservedDigest,
        targetDigest: target.targetDigest,
        target: target.target,
        engineVersion: target.engineVersion,
      });
      completeStep(
        this.repository,
        runId,
        activeStep,
        {
          targetDigest: target.targetDigest,
          expectedObservedDigest: target.expectedObservedDigest,
        },
        "Immutable remediation plan generated",
      );

      finishRun(this.repository, runId, { canonicalDigest, observedDigest });
      return this.repository.getRunSnapshot(runId);
    } catch (error) {
      failRun(this.repository, runId, activeStep, toErrorEnvelope(error));
      return this.repository.getRunSnapshot(runId);
    }
  }

  async executeReconciliation(runId: string): Promise<RunSnapshot> {
    let activeStep: RunSnapshot["steps"][number]["key"] | null = null;

    try {
      const snapshot = this.repository.getRunSnapshot(runId);
      if (snapshot.plan === null) {
        throw new Error("remediation_plan_missing");
      }

      activeStep = "preflight_reconciliation";
      startStep(this.repository, runId, activeStep);
      const canonicalRaw = this.adapter.loadCanonical();
      this.adapter.validateCanonical(canonicalRaw);
      const canonical = this.adapter.normalizeCanonical(canonicalRaw);
      const currentCanonicalDigest = digestNormalizedResourceState(canonical);
      if (currentCanonicalDigest !== snapshot.plan.canonicalDigest) {
        throw new StaleCanonicalStateError(
          snapshot.plan.canonicalDigest,
          currentCanonicalDigest,
        );
      }

      const observedBefore = this.adapter.normalizeObserved(
        this.adapter.loadObserved(),
        canonical.resourceId,
      );
      const currentObservedDigest = digestNormalizedResourceState(observedBefore);
      if (currentObservedDigest !== snapshot.plan.expectedObservedDigest) {
        throw new StaleRemediationPlanError(
          snapshot.plan.expectedObservedDigest,
          currentObservedDigest,
        );
      }

      const currentTargetDigest = digestJson(snapshot.plan.target as JsonValue);
      if (currentTargetDigest !== snapshot.plan.targetDigest) {
        throw new Error("target_integrity_violation");
      }

      completeStep(
        this.repository,
        runId,
        activeStep,
        {
          expectedCanonicalDigest: snapshot.plan.canonicalDigest,
          currentCanonicalDigest,
          expectedObservedDigest: snapshot.plan.expectedObservedDigest,
          currentObservedDigest,
        },
        "Canonical and observed digests match immutable plan",
      );
      await delay(this.phaseDelay);

      activeStep = "apply_reconciliation";
      startStep(this.repository, runId, activeStep);
      const applyResult = this.adapter.applyTarget(
        snapshot.plan.expectedObservedDigest,
        snapshot.plan.target,
      );
      completeStep(
        this.repository,
        runId,
        activeStep,
        { ...applyResult },
        "Target state applied with temporary-file atomic rename",
      );
      await delay(this.phaseDelay);

      activeStep = "verify_convergence";
      startStep(this.repository, runId, activeStep);
      const observedAfter = this.adapter.normalizeObserved(
        this.adapter.loadObserved(),
        canonical.resourceId,
      );
      const verification = compareNormalizedResourceStates(canonical, observedAfter);
      if (verification.hasDrift) {
        throw new Error("verification_mismatch");
      }
      this.repository.replaceFindings(runId, []);
      completeStep(
        this.repository,
        runId,
        activeStep,
        {
          observedDigest: verification.observedDigest,
          findingCount: verification.findings.length,
          engineVersion: verification.engineVersion,
        },
        "Post-write verification scan converged",
      );
      await delay(this.phaseDelay);

      finishReconciledRun(this.repository, runId, verification.observedDigest);
      return this.repository.getRunSnapshot(runId);
    } catch (error) {
      failRun(this.repository, runId, activeStep, toErrorEnvelope(error));
      return this.repository.getRunSnapshot(runId);
    }
  }
}

function toPersistedFinding(finding: DriftFinding): Omit<Finding, "id" | "runId"> {
  return {
    resourceId: finding.resourceId,
    path: finding.path,
    kind: toContractFindingKind(finding.kind),
    severity: finding.severity,
    canonicalValue: finding.canonicalValue,
    observedValue: finding.observedValue,
    sequence: finding.sequence,
  };
}

function toContractFindingKind(kind: DriftFinding["kind"]): Finding["kind"] {
  if (kind === "added") {
    return "missing";
  }
  if (kind === "removed") {
    return "extra";
  }
  return "changed";
}

function severitySummary(findings: readonly DriftFinding[]): JsonValue {
  return findings.reduce<Record<string, number>>((summary, finding) => {
    summary[finding.severity] = (summary[finding.severity] ?? 0) + 1;
    return summary;
  }, {});
}

function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof StaleCanonicalStateError) {
    return {
      code: "stale_canonical_state",
      message: "Canonical state changed after the remediation plan was generated",
      detail: {
        expectedCanonicalDigest: error.expectedCanonicalDigest,
        currentCanonicalDigest: error.currentCanonicalDigest,
      },
    };
  }

  if (error instanceof StaleRemediationPlanError) {
    return {
      code: "stale_remediation_plan",
      message: "Observed state changed after the remediation plan was generated",
      detail: {
        expectedObservedDigest: error.expectedObservedDigest,
        currentObservedDigest: error.currentObservedDigest,
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      code: "validation_failed",
      message: "State validation failed",
      detail: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
  }

  if (error instanceof Error) {
    return { code: "workflow_failed", message: error.message };
  }

  return { code: "workflow_failed", message: "Unknown workflow failure" };
}
