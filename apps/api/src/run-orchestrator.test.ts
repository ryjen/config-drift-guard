import type { Environment, Run, RunSnapshot } from "@config-drift-guard/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ResettableDriftAdapter, RunOrchestratorRepository } from "./application/ports.js";
import { RunOperationError, RunOrchestrator } from "./run-orchestrator.js";

const timestamp = "2026-10-13T00:00:00.000Z";
const environment = {
  id: "env_service_config",
  adapterKind: "service_config",
} as Environment;
const run = {
  id: "run_test",
  environmentId: environment.id,
  status: "queued",
  currentStep: null,
  version: 0,
  canonicalDigest: null,
  observedDigest: null,
  findingCount: 0,
  error: null,
  createdAt: timestamp,
  updatedAt: timestamp,
} as Run;
const queued = {
  run,
  steps: [],
  findings: [],
  plan: null,
  decision: null,
  events: [],
} satisfies RunSnapshot;

function setup(snapshot = queued) {
  const repository = {
    listEnvironments: vi.fn(() => [environment]),
    getEnvironment: vi.fn((id: string) => (id === environment.id ? environment : null)),
    hasActiveRun: vi.fn(() => false),
    createQueuedRun: vi.fn(() => run),
    getRunSnapshot: vi.fn(() => snapshot),
    recordDecisionAndApprove: vi.fn(),
    recordDecisionAndReject: vi.fn(),
  } as unknown as RunOrchestratorRepository;
  const resetObserved = vi.fn();
  const adapter = {
    kind: "service_config",
    resetObserved,
    loadCanonical: vi.fn(),
    loadObserved: vi.fn(),
    validateCanonical: vi.fn(),
    normalizeCanonical: vi.fn(),
    normalizeObserved: vi.fn(),
    applyTarget: vi.fn(),
  } satisfies ResettableDriftAdapter;
  const execute = vi.fn(async () => snapshot);
  const executeReconciliation = vi.fn(async () => snapshot);
  const schedule = vi.fn<(workflow: () => Promise<unknown>) => void>();
  const orchestrator = new RunOrchestrator(
    repository,
    { documentation: adapter, service_config: adapter },
    schedule,
    () => ({ execute, executeReconciliation }),
  );
  return { orchestrator, repository, resetObserved, execute, executeReconciliation, schedule };
}

describe("RunOrchestrator use-case boundary", () => {
  it("schedules one workflow after persisting a queued run, without executing inline", async () => {
    const ctx = setup();
    expect(ctx.orchestrator.createRun(environment.id)).toEqual(queued);
    expect(ctx.repository.createQueuedRun).toHaveBeenCalledExactlyOnceWith(environment.id);
    expect(ctx.schedule).toHaveBeenCalledTimes(1);
    expect(ctx.execute).not.toHaveBeenCalled();
    await ctx.schedule.mock.calls[0]?.[0]();
    expect(ctx.execute).toHaveBeenCalledExactlyOnceWith(run.id);
  });

  it("rejects missing environments and active runs before reset or creation", () => {
    const ctx = setup();
    expect(() => ctx.orchestrator.resetEnvironment("unknown")).toThrow(RunOperationError);
    expect(() => ctx.orchestrator.createRun("unknown")).toThrow(RunOperationError);
    vi.mocked(ctx.repository.hasActiveRun).mockReturnValue(true);
    expect(() => ctx.orchestrator.resetEnvironment(environment.id)).toThrow("active_run_exists");
    expect(() => ctx.orchestrator.createRun(environment.id)).toThrow("active_run_exists");
    expect(ctx.resetObserved).not.toHaveBeenCalled();
    expect(ctx.schedule).not.toHaveBeenCalled();
  });

  it("treats repeated approvals as idempotent and contradictory rejects as conflicts", () => {
    const approved = {
      ...queued,
      decision: { action: "approved" },
    } as RunSnapshot;
    const ctx = setup(approved);
    expect(ctx.orchestrator.approveRun(run.id, null)).toEqual({
      snapshot: approved,
      newlyApproved: false,
    });
    expect(() => ctx.orchestrator.rejectRun(run.id, null)).toThrow("contradictory_decision");
    expect(ctx.schedule).not.toHaveBeenCalled();
  });

  it("schedules reconciliation only after recording a new approval", async () => {
    const ready = {
      ...queued,
      run: { ...run, status: "awaiting_approval" },
      plan: { id: "plan_test" },
    } as RunSnapshot;
    const ctx = setup(ready);
    const outcome = ctx.orchestrator.approveRun(run.id, "approved");
    expect(outcome.newlyApproved).toBe(true);
    expect(ctx.repository.recordDecisionAndApprove).toHaveBeenCalledWith({
      runId: run.id,
      action: "approved",
      actor: "local-operator",
      comment: "approved",
    });
    expect(ctx.schedule).toHaveBeenCalledTimes(1);
    await ctx.schedule.mock.calls[0]?.[0]();
    expect(ctx.executeReconciliation).toHaveBeenCalledExactlyOnceWith(run.id);
  });

  it("maps missing snapshots to a typed domain outcome", () => {
    const ctx = setup();
    vi.mocked(ctx.repository.getRunSnapshot).mockImplementation(() => {
      throw new Error("run_not_found:run_test");
    });
    expect(() => ctx.orchestrator.getRunSnapshot(run.id)).toThrow("run_not_found");
  });
});
