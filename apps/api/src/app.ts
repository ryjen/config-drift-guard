import {
  type AdapterKind,
  type ApiErrorResponse,
  type Environment,
  type Event,
  type HealthResponse,
  healthResponse,
  type RunSnapshot,
} from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { DocumentationAdapter } from "./adapters/documentation.js";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { apiError } from "./api-error.js";
import { isActiveRunConstraintError } from "./persistence/constraint-errors.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { WorkflowExecutor } from "./workflow-executor.js";

const DECISION_COMMENT_MAX_LENGTH = 1000;
const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);
const QUEUE_DELAY_MS = Number.parseInt(process.env.QUEUE_DELAY_MS ?? "0", 10) || 0;
const PHASE_DELAY_MS = Number.parseInt(process.env.PHASE_DELAY_MS ?? "0", 10) || 0;

const decisionRequestSchema = z
  .object({
    comment: z.string().trim().min(1).max(DECISION_COMMENT_MAX_LENGTH).nullable().optional(),
  })
  .strict();
const emptyRequestSchema = z.object({}).strict();

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return LOCAL_ORIGINS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export interface BuildAppOptions {
  readonly database?: DatabaseHandle;
  readonly documentationObservedPath?: string;
  readonly serviceConfigObservedPath?: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const database = options.database ?? createDatabase();
  const repository = new PersistenceRepository(database.db);
  const serviceConfigAdapter = new ServiceConfigAdapter(options.serviceConfigObservedPath);
  const documentationAdapter = new DocumentationAdapter(options.documentationObservedPath);
  const adapters = {
    documentation: documentationAdapter,
    service_config: serviceConfigAdapter,
  } satisfies Record<AdapterKind, ServiceConfigAdapter | DocumentationAdapter>;
  const pendingWorkflowTimers = new Set<ReturnType<typeof setTimeout>>();
  const activeWorkflows = new Set<Promise<unknown>>();
  let isClosing = false;

  const scheduleWorkflow = (workflow: () => Promise<unknown>): void => {
    const timer = setTimeout(() => {
      pendingWorkflowTimers.delete(timer);
      if (isClosing) {
        return;
      }

      const execution = workflow();
      activeWorkflows.add(execution);
      void execution.finally(() => activeWorkflows.delete(execution));
    }, QUEUE_DELAY_MS);
    pendingWorkflowTimers.add(timer);
  };

  repository.seedServiceConfigEnvironment();
  repository.seedDocumentationEnvironment();
  repository.recoverInterruptedRuns();

  app.addHook("onClose", async () => {
    isClosing = true;
    for (const timer of pendingWorkflowTimers) {
      clearTimeout(timer);
    }
    pendingWorkflowTimers.clear();
    await Promise.allSettled(activeWorkflows);

    if (options.database === undefined) {
      database.close();
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || isLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"), false);
    },
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => healthResponse);
  app.get<{ Reply: Environment[] }>("/api/environments", async () => repository.listEnvironments());

  app.post<{
    Params: { id: string };
    Body: unknown;
    Reply: { status: "reset"; environment: Environment } | ApiErrorResponse;
  }>("/api/environments/:id/reset", async (request, reply) => {
    const requestId = request.id;
    const parsed = emptyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Request body must be empty", requestId);
    }

    const environment = repository.getEnvironment(request.params.id);
    if (environment === null) {
      reply.code(404);
      return apiError("environment_not_found", "Environment not found", requestId);
    }

    if (repository.hasActiveRun(environment.id)) {
      reply.code(409);
      return apiError(
        "active_run_exists",
        "An active run already exists for this environment",
        requestId,
      );
    }

    adapters[environment.adapterKind].resetObserved();
    return { status: "reset", environment };
  });

  app.post<{ Params: { id: string }; Reply: RunSnapshot | ApiErrorResponse }>(
    "/api/environments/:id/runs",
    async (request, reply) => {
      const requestId = request.id;
      const environment = repository.getEnvironment(request.params.id);
      if (environment === null) {
        reply.code(404);
        return apiError("environment_not_found", "Environment not found", requestId);
      }

      if (repository.hasActiveRun(environment.id)) {
        reply.code(409);
        return apiError(
          "active_run_exists",
          "An active run already exists for this environment",
          requestId,
        );
      }

      let run: ReturnType<typeof repository.createQueuedRun>;
      try {
        run = repository.createQueuedRun(environment.id);
      } catch (error) {
        if (isActiveRunConstraintError(error)) {
          reply.code(409);
          return apiError(
            "active_run_exists",
            "An active run already exists for this environment",
            requestId,
          );
        }
        throw error;
      }
      const snapshot = repository.getRunSnapshot(run.id);
      const executor = new WorkflowExecutor(
        repository,
        adapters[environment.adapterKind],
        PHASE_DELAY_MS,
      );
      scheduleWorkflow(() => executor.execute(run.id));
      reply.code(201);
      return snapshot;
    },
  );

  app.get<{ Params: { runId: string }; Reply: RunSnapshot | ApiErrorResponse }>(
    "/api/runs/:runId",
    async (request, reply) => {
      try {
        return repository.getRunSnapshot(request.params.runId);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("run_not_found:")) {
          reply.code(404);
          return apiError("run_not_found", "Run not found", request.id);
        }

        throw error;
      }
    },
  );

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | ApiErrorResponse;
  }>("/api/runs/:runId/approve", async (request, reply) => {
    const requestId = request.id;
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Invalid decision request", requestId);
    }

    const snapshot = getSnapshotOrReplyNotFound(repository, request.params.runId, reply);
    if (snapshot === null) {
      return apiError("run_not_found", "Run not found", requestId);
    }

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "approved") {
        return snapshot;
      }
      reply.code(409);
      return apiError(
        "contradictory_decision",
        "A contradictory decision already exists",
        requestId,
      );
    }

    if (snapshot.run.status !== "awaiting_approval" || snapshot.plan === null) {
      reply.code(409);
      return apiError("run_not_awaiting_approval", "Run is not awaiting approval", requestId);
    }

    try {
      repository.recordDecisionAndApprove({
        runId: snapshot.run.id,
        action: "approved",
        actor: "local-operator",
        comment: parsed.data.comment ?? null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "decision_already_exists") {
        return repository.getRunSnapshot(snapshot.run.id);
      }
      throw error;
    }
    const environment = repository.getEnvironment(snapshot.run.environmentId);
    if (environment === null) {
      reply.code(404);
      return apiError("environment_not_found", "Environment not found", requestId);
    }
    const executor = new WorkflowExecutor(
      repository,
      adapters[environment.adapterKind],
      PHASE_DELAY_MS,
    );
    scheduleWorkflow(() => executor.executeReconciliation(snapshot.run.id));
    reply.code(202);
    return repository.getRunSnapshot(snapshot.run.id);
  });

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | ApiErrorResponse;
  }>("/api/runs/:runId/reject", async (request, reply) => {
    const requestId = request.id;
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Invalid decision request", requestId);
    }

    const snapshot = getSnapshotOrReplyNotFound(repository, request.params.runId, reply);
    if (snapshot === null) {
      return apiError("run_not_found", "Run not found", requestId);
    }

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "rejected") {
        return snapshot;
      }
      reply.code(409);
      return apiError(
        "contradictory_decision",
        "A contradictory decision already exists",
        requestId,
      );
    }

    if (snapshot.run.status !== "awaiting_approval") {
      reply.code(409);
      return apiError("run_not_awaiting_approval", "Run is not awaiting approval", requestId);
    }

    try {
      repository.recordDecisionAndReject({
        runId: snapshot.run.id,
        action: "rejected",
        actor: "local-operator",
        comment: parsed.data.comment ?? null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "decision_already_exists") {
        return repository.getRunSnapshot(snapshot.run.id);
      }
      throw error;
    }
    return repository.getRunSnapshot(snapshot.run.id);
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/events", async (request, reply) => {
    let lastSentEventId = parseLastEventId(request.headers["last-event-id"]);

    try {
      repository.getRun(request.params.runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("run_not_found:")) {
        reply.code(404);
        return apiError("run_not_found", "Run not found", request.id);
      }

      throw error;
    }

    reply.hijack();
    const requestOrigin = request.headers.origin;
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
      "X-Request-Id": request.id,
      ...(requestOrigin !== undefined ? { "Access-Control-Allow-Origin": requestOrigin } : {}),
    });

    let unsubscribe = (): void => undefined;
    const writeEvent = (event: Event): void => {
      if (event.id <= lastSentEventId || reply.raw.destroyed) {
        return;
      }

      lastSentEventId = event.id;
      try {
        reply.raw.write(formatRunChangeEvent(event, repository.getRun(event.runId).version));
      } catch {
        unsubscribe();
        reply.raw.destroy();
      }
    };

    unsubscribe = repository.subscribeRunEvents(request.params.runId, writeEvent);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(":heartbeat\n\n");
      }
    }, 15_000);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    for (const event of repository.listRunEventsAfter(request.params.runId, lastSentEventId)) {
      writeEvent(event);
    }
  });

  return app;
}

function getSnapshotOrReplyNotFound(
  repository: PersistenceRepository,
  runId: string,
  reply: { code(statusCode: number): unknown },
): RunSnapshot | null {
  try {
    return repository.getRunSnapshot(runId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("run_not_found:")) {
      reply.code(404);
      return null;
    }

    throw error;
  }
}

function parseLastEventId(value: string | string[] | undefined): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (rawValue === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function formatRunChangeEvent(event: Event, version: number): string {
  const data = JSON.stringify({
    runId: event.runId,
    version,
    eventId: event.id,
    eventType: event.eventType,
  });

  return `id: ${event.id}\nevent: run-change\ndata: ${data}\n\n`;
}
