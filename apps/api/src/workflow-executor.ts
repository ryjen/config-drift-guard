import type { ErrorEnvelope, Finding, JsonValue, RunSnapshot } from "@config-drift-guard/contracts";
import {
  buildCompleteTargetState,
  compareNormalizedResourceStates,
  type DriftFinding,
  digestNormalizedResourceState,
} from "@config-drift-guard/drift-engine";
import { ZodError } from "zod";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import {
  completeStep,
  failRun,
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
    readonly target: JsonValue;
    readonly engineVersion: string;
  }): unknown;
  getRunSnapshot(runId: string): RunSnapshot;
}

export class WorkflowExecutor {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly adapter = new ServiceConfigAdapter(),
  ) {}

  execute(runId: string): RunSnapshot {
    let activeStep: RunSnapshot["steps"][number]["key"] | null = null;

    try {
      startRun(this.repository, runId);

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

      activeStep = "build_remediation_plan";
      startStep(this.repository, runId, activeStep);
      const target = buildCompleteTargetState(canonical, observed);
      this.repository.saveRemediationPlan({
        runId,
        canonicalDigest,
        expectedObservedDigest: target.expectedObservedDigest,
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
