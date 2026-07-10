import { randomUUID } from "node:crypto";
import {
  type Decision,
  decisionSchema,
  type Environment,
  type ErrorEnvelope,
  type Event,
  environmentSchema,
  eventSchema,
  type Finding,
  findingSchema,
  type JsonValue,
  type RemediationPlan,
  type Run,
  type RunSnapshot,
  type RunStatus,
  remediationPlanSchema,
  runSchema,
  runSnapshotSchema,
  type Step,
  type StepStatus,
  stepSchema,
  type WorkflowStepKey,
} from "@config-drift-guard/contracts";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { AppDatabase } from "./database.js";
import {
  decisions,
  environments,
  events,
  findings,
  remediationPlans,
  runs,
  steps,
} from "./schema.js";

type RunEventListener = (event: Event) => void;

export const primaryWorkflowSteps: readonly WorkflowStepKey[] = [
  "validate_canonical_state",
  "load_observed_state",
  "normalize_state",
  "calculate_drift",
  "classify_findings",
  "build_remediation_plan",
];

export const reconciliationWorkflowSteps: readonly WorkflowStepKey[] = [
  "preflight_reconciliation",
  "apply_reconciliation",
  "verify_convergence",
];

export const workflowSteps: readonly WorkflowStepKey[] = [
  ...primaryWorkflowSteps,
  ...reconciliationWorkflowSteps,
];

export const serviceConfigEnvironmentId = "env_service_config";
export const documentationEnvironmentId = "env_documentation";

function nowIso(): string {
  return new Date().toISOString();
}

function parseEnvironment(row: typeof environments.$inferSelect): Environment {
  return environmentSchema.parse(row);
}

function parseRun(row: typeof runs.$inferSelect): Run {
  return runSchema.parse(row);
}

function parseStep(row: typeof steps.$inferSelect): Step {
  return stepSchema.parse(row);
}

function parseFinding(row: typeof findings.$inferSelect): Finding {
  return findingSchema.parse(row);
}

function parsePlan(row: typeof remediationPlans.$inferSelect | undefined): RemediationPlan | null {
  return row === undefined ? null : remediationPlanSchema.parse(row);
}

function parseDecision(row: typeof decisions.$inferSelect | undefined): Decision | null {
  return row === undefined ? null : decisionSchema.parse(row);
}

function parseEvent(row: typeof events.$inferSelect): Event {
  return eventSchema.parse(row);
}

export class PersistenceRepository {
  private readonly eventListeners = new Map<string, Set<RunEventListener>>();

  constructor(private readonly db: AppDatabase) {}

  seedServiceConfigEnvironment(): Environment {
    const timestamp = nowIso();
    const environment = {
      id: serviceConfigEnvironmentId,
      name: "Service configuration drift",
      adapterKind: "service_config" as const,
      sourceConfig: {
        scenario: "service-config",
        canonicalFixture: "service-config.desired.yaml",
        observedFixture: "service-config.observed.json",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(environments).values(environment).onConflictDoNothing().run();

    const seeded = this.getEnvironment(environment.id);
    if (seeded === null) {
      throw new Error("service_config_environment_seed_failed");
    }

    return seeded;
  }

  seedDocumentationEnvironment(): Environment {
    const timestamp = nowIso();
    const environment = {
      id: documentationEnvironmentId,
      name: "Structured documentation drift",
      adapterKind: "documentation" as const,
      sourceConfig: {
        scenario: "documentation",
        canonicalFixture: "configuration-schema.yaml",
        observedFixture: "config-reference.md",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(environments).values(environment).onConflictDoNothing().run();

    const seeded = this.getEnvironment(environment.id);
    if (seeded === null) {
      throw new Error("documentation_environment_seed_failed");
    }

    return seeded;
  }

  listEnvironments(): Environment[] {
    return this.db
      .select()
      .from(environments)
      .orderBy(asc(environments.name))
      .all()
      .map(parseEnvironment);
  }

  recoverInterruptedRuns(): Run[] {
    const interruptedRuns = this.db
      .select()
      .from(runs)
      .where(inArray(runs.status, ["queued", "running"]))
      .all()
      .map(parseRun);

    for (const run of interruptedRuns) {
      const error = {
        code: "startup_recovery",
        message: "Run was interrupted before the API process started",
      } satisfies ErrorEnvelope;

      this.db.transaction(() => {
        if (run.currentStep !== null) {
          this.updateStepState(run.id, run.currentStep, {
            status: "failed",
            message: error.message,
            output: null,
            error,
          });
        }
        this.skipPendingSteps(run.id);
        this.updateRunState(run.id, { status: "failed", currentStep: null, error });
      });
    }

    return interruptedRuns.map((run) => this.getRun(run.id));
  }

  getEnvironment(environmentId: string): Environment | null {
    const [row] = this.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1)
      .all();
    return row === undefined ? null : parseEnvironment(row);
  }

  createQueuedRun(environmentId: string): Run {
    const timestamp = nowIso();
    const run = {
      id: `run_${randomUUID()}`,
      environmentId,
      status: "queued" as const,
      currentStep: null,
      version: 0,
      canonicalDigest: null,
      observedDigest: null,
      findingCount: 0,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.transaction(() => {
      this.db.insert(runs).values(run).run();
      this.db
        .insert(steps)
        .values(
          workflowSteps.map((key, sequence) => ({
            runId: run.id,
            key,
            sequence,
            status: "pending" as const,
            message: null,
            output: null,
            error: null,
            startedAt: null,
            completedAt: null,
          })),
        )
        .run();
      this.appendEvent(run.id, "run.queued", { status: "queued" });
    });

    return this.getRun(run.id);
  }

  getRun(runId: string): Run {
    const [row] = this.db.select().from(runs).where(eq(runs.id, runId)).limit(1).all();
    if (row === undefined) {
      throw new Error(`run_not_found:${runId}`);
    }
    return parseRun(row);
  }

  updateRunState(
    runId: string,
    input: {
      readonly status: RunStatus;
      readonly currentStep?: WorkflowStepKey | null;
      readonly canonicalDigest?: string | null;
      readonly observedDigest?: string | null;
      readonly error?: ErrorEnvelope | null;
    },
  ): Run {
    const timestamp = nowIso();
    const current = this.getRun(runId);
    this.db
      .update(runs)
      .set({
        status: input.status,
        currentStep: input.currentStep ?? null,
        canonicalDigest:
          input.canonicalDigest === undefined ? current.canonicalDigest : input.canonicalDigest,
        observedDigest:
          input.observedDigest === undefined ? current.observedDigest : input.observedDigest,
        error: input.error,
        version: current.version + 1,
        updatedAt: timestamp,
      })
      .where(eq(runs.id, runId))
      .run();
    this.appendEvent(runId, "run.updated", {
      status: input.status,
      currentStep: input.currentStep ?? null,
    });
    return this.getRun(runId);
  }

  updateStepState(
    runId: string,
    key: WorkflowStepKey,
    input: {
      readonly status: StepStatus;
      readonly message?: string | null;
      readonly output?: JsonValue | null;
      readonly error?: ErrorEnvelope | null;
    },
  ): void {
    const timestamp = nowIso();
    this.db
      .update(steps)
      .set({
        status: input.status,
        message: input.message ?? null,
        output: input.output ?? null,
        error: input.error ?? null,
        startedAt: input.status === "running" ? timestamp : undefined,
        completedAt: ["succeeded", "failed", "skipped"].includes(input.status)
          ? timestamp
          : undefined,
      })
      .where(and(eq(steps.runId, runId), eq(steps.key, key)))
      .run();
    this.appendEvent(runId, `step.${input.status}`, { key });
  }

  skipPendingSteps(runId: string): void {
    const timestamp = nowIso();
    this.db
      .update(steps)
      .set({ status: "skipped", message: "Skipped after workflow failure", completedAt: timestamp })
      .where(and(eq(steps.runId, runId), eq(steps.status, "pending")))
      .run();
    this.appendEvent(runId, "steps.pending_skipped", { runId });
  }

  getRunSnapshot(runId: string): RunSnapshot {
    const run = this.getRun(runId);
    const snapshot = {
      run,
      steps: this.db
        .select()
        .from(steps)
        .where(eq(steps.runId, runId))
        .orderBy(asc(steps.sequence))
        .all()
        .map(parseStep),
      findings: this.db
        .select()
        .from(findings)
        .where(eq(findings.runId, runId))
        .orderBy(asc(findings.sequence))
        .all()
        .map(parseFinding),
      plan: parsePlan(
        this.db
          .select()
          .from(remediationPlans)
          .where(eq(remediationPlans.runId, runId))
          .limit(1)
          .all()[0],
      ),
      decision: parseDecision(
        this.db.select().from(decisions).where(eq(decisions.runId, runId)).limit(1).all()[0],
      ),
      events: this.db
        .select()
        .from(events)
        .where(eq(events.runId, runId))
        .orderBy(asc(events.id))
        .all()
        .map(parseEvent),
    };

    return runSnapshotSchema.parse(snapshot);
  }

  listRunEventsAfter(runId: string, afterEventId: number): Event[] {
    this.getRun(runId);
    return this.db
      .select()
      .from(events)
      .where(and(eq(events.runId, runId), gt(events.id, afterEventId)))
      .orderBy(asc(events.id))
      .all()
      .map(parseEvent);
  }

  subscribeRunEvents(runId: string, listener: RunEventListener): () => void {
    let listeners = this.eventListeners.get(runId);
    if (listeners === undefined) {
      listeners = new Set<RunEventListener>();
      this.eventListeners.set(runId, listeners);
    }

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(runId);
      }
    };
  }

  replaceFindings(runId: string, records: readonly Omit<Finding, "id" | "runId">[]): Finding[] {
    this.db.transaction(() => {
      this.db.delete(findings).where(eq(findings.runId, runId)).run();
      if (records.length > 0) {
        this.db
          .insert(findings)
          .values(records.map((record) => ({ ...record, id: `finding_${randomUUID()}`, runId })))
          .run();
      }
      this.db
        .update(runs)
        .set({ findingCount: records.length, updatedAt: nowIso() })
        .where(eq(runs.id, runId))
        .run();
      this.appendEvent(runId, "findings.replaced", { findingCount: records.length });
    });

    return this.getRunSnapshot(runId).findings;
  }

  saveRemediationPlan(input: Omit<RemediationPlan, "id" | "createdAt">): RemediationPlan {
    const plan = { ...input, id: `plan_${randomUUID()}`, createdAt: nowIso() };
    remediationPlanSchema.parse(plan);

    this.db.transaction(() => {
      this.db.insert(remediationPlans).values(plan).run();
      this.appendEvent(input.runId, "plan.created", { planId: plan.id });
    });

    const saved = this.getRunSnapshot(input.runId).plan;
    if (saved === null) {
      throw new Error("remediation_plan_not_saved");
    }

    return saved;
  }

  recordDecision(input: Omit<Decision, "id" | "createdAt">): Decision {
    const decision = { ...input, id: `decision_${randomUUID()}`, createdAt: nowIso() };
    decisionSchema.parse(decision);

    this.db.transaction(() => {
      this.db.insert(decisions).values(decision).run();
      this.appendEvent(input.runId, `decision.${input.action}`, { actor: input.actor });
    });

    const saved = this.getRunSnapshot(input.runId).decision;
    if (saved === null) {
      throw new Error("decision_not_saved");
    }

    return saved;
  }

  appendEvent(runId: string, eventType: string, payload: JsonValue): Event {
    this.db.insert(events).values({ runId, eventType, payload, createdAt: nowIso() }).run();
    const [row] = this.db
      .select()
      .from(events)
      .where(eq(events.runId, runId))
      .orderBy(asc(events.id))
      .all()
      .slice(-1);
    if (row === undefined) {
      throw new Error("event_not_saved");
    }
    const event = parseEvent(row);
    this.notifyRunEvent(event);
    return event;
  }

  private notifyRunEvent(event: Event): void {
    const listeners = this.eventListeners.get(event.runId);
    if (listeners === undefined) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Event stream clients must not interrupt persisted workflow transitions.
      }
    }
  }
}
