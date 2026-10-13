import type { AdapterKind, Environment, RunSnapshot } from "@config-drift-guard/contracts";
import type {
  DriftAdapter,
  ResettableDriftAdapter,
  RunOrchestratorRepository,
} from "./application/ports.js";

export type RunOperationErrorCode =
  | "environment_not_found"
  | "active_run_exists"
  | "run_not_found"
  | "contradictory_decision"
  | "run_not_awaiting_approval";

/** Only domain outcomes cross this boundary; HTTP status and messages stay in routes. */
export class RunOperationError extends Error {
  constructor(readonly code: RunOperationErrorCode) {
    super(code);
  }
}

export interface RunExecutor {
  execute(runId: string): Promise<RunSnapshot>;
  executeReconciliation(runId: string): Promise<RunSnapshot>;
}

export type RunExecutorFactory = (adapter: DriftAdapter) => RunExecutor;
export type WorkflowScheduler = (workflow: () => Promise<unknown>) => void;

export class RunOrchestrator {
  constructor(
    private readonly repository: RunOrchestratorRepository,
    private readonly adapters: Record<AdapterKind, ResettableDriftAdapter>,
    private readonly schedule: WorkflowScheduler,
    private readonly executorFactory: RunExecutorFactory,
  ) {}

  listEnvironments(): Environment[] {
    return this.repository.listEnvironments();
  }

  getRunSnapshot(runId: string): RunSnapshot {
    try {
      return this.repository.getRunSnapshot(runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("run_not_found:")) {
        throw new RunOperationError("run_not_found");
      }
      throw error;
    }
  }

  resetEnvironment(environmentId: string): Environment {
    const environment = this.requireEnvironment(environmentId);
    this.assertNoActiveRun(environment.id);
    this.adapters[environment.adapterKind].resetObserved();
    return environment;
  }

  createRun(environmentId: string): RunSnapshot {
    const environment = this.requireEnvironment(environmentId);
    this.assertNoActiveRun(environment.id);

    // The adapter/repository's unique active-run constraint remains authoritative.
    const run = this.repository.createQueuedRun(environment.id);
    const snapshot = this.repository.getRunSnapshot(run.id);
    this.schedule(() =>
      this.executorFactory(this.adapters[environment.adapterKind]).execute(run.id),
    );
    return snapshot;
  }

  approveRun(
    runId: string,
    comment: string | null,
  ): {
    readonly snapshot: RunSnapshot;
    readonly newlyApproved: boolean;
  } {
    const snapshot = this.getRunSnapshot(runId);

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "approved") {
        return { snapshot, newlyApproved: false };
      }
      throw new RunOperationError("contradictory_decision");
    }

    if (snapshot.run.status !== "awaiting_approval" || snapshot.plan === null) {
      throw new RunOperationError("run_not_awaiting_approval");
    }

    try {
      this.repository.recordDecisionAndApprove({
        runId: snapshot.run.id,
        action: "approved",
        actor: "local-operator",
        comment,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "decision_already_exists") {
        return { snapshot: this.getRunSnapshot(snapshot.run.id), newlyApproved: false };
      }
      throw error;
    }

    const environment = this.requireEnvironment(snapshot.run.environmentId);
    this.schedule(() =>
      this.executorFactory(this.adapters[environment.adapterKind]).executeReconciliation(
        snapshot.run.id,
      ),
    );
    return { snapshot: this.getRunSnapshot(snapshot.run.id), newlyApproved: true };
  }

  rejectRun(runId: string, comment: string | null): RunSnapshot {
    const snapshot = this.getRunSnapshot(runId);

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "rejected") return snapshot;
      throw new RunOperationError("contradictory_decision");
    }
    if (snapshot.run.status !== "awaiting_approval") {
      throw new RunOperationError("run_not_awaiting_approval");
    }

    try {
      this.repository.recordDecisionAndReject({
        runId: snapshot.run.id,
        action: "rejected",
        actor: "local-operator",
        comment,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "decision_already_exists") {
        return this.getRunSnapshot(snapshot.run.id);
      }
      throw error;
    }
    return this.getRunSnapshot(snapshot.run.id);
  }

  private requireEnvironment(environmentId: string): Environment {
    const environment = this.repository.getEnvironment(environmentId);
    if (environment === null) throw new RunOperationError("environment_not_found");
    return environment;
  }

  private assertNoActiveRun(environmentId: string): void {
    if (this.repository.hasActiveRun(environmentId)) {
      throw new RunOperationError("active_run_exists");
    }
  }
}
