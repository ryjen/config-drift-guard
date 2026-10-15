import type {
  Run,
  RunStateStore,
  RunStatus,
  WorkflowStepKey,
} from "@config-drift-guard/contracts";

type RunUpdate = Parameters<RunStateStore["updateRunState"]>[1];
type StepUpdate = Parameters<RunStateStore["updateStepState"]>[2];

/** An in-memory state-machine port, not a fake SQLite repository. */
export class StubRunStateStore implements RunStateStore {
  private readonly runs = new Map<string, Run>();
  private nextId = 0;
  readonly stepUpdates: Array<{
    runId: string;
    key: WorkflowStepKey;
    input: StepUpdate;
  }> = [];
  readonly skippedRuns: string[] = [];

  createRun(status: RunStatus = "queued"): Run {
    const id = `run_stub_${++this.nextId}`;
    const run: Run = {
      id,
      environmentId: "env_stub",
      status,
      currentStep: null,
      version: 0,
      canonicalDigest: null,
      observedDigest: null,
      findingCount: 0,
      error: null,
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
    };
    this.runs.set(id, run);
    return run;
  }

  getRun(runId: string): Run {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run_not_found:${runId}`);
    return run;
  }

  updateRunState(runId: string, input: RunUpdate): Run {
    const previous = this.getRun(runId);
    const updated: Run = {
      ...previous,
      status: input.status,
      currentStep: input.currentStep ?? null,
      canonicalDigest:
        input.canonicalDigest === undefined ? previous.canonicalDigest : input.canonicalDigest,
      observedDigest:
        input.observedDigest === undefined ? previous.observedDigest : input.observedDigest,
      error: input.error === undefined ? previous.error : input.error,
      version: previous.version + 1,
    };
    this.runs.set(runId, updated);
    return updated;
  }

  updateStepState(runId: string, key: WorkflowStepKey, input: StepUpdate): void {
    this.getRun(runId);
    this.stepUpdates.push({ runId, key, input });
  }

  skipPendingSteps(runId: string): void {
    this.getRun(runId);
    this.skippedRuns.push(runId);
  }
}
