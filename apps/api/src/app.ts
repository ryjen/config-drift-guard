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
import type { ResettableDriftAdapter, WorkflowPacer } from "./application/ports.js";
import { isActiveRunConstraintError } from "./persistence/constraint-errors.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { RunEventBus } from "./persistence/event-bus.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { RunOperationError, RunOrchestrator } from "./run-orchestrator.js";
import { WorkflowExecutor } from "./workflow-executor.js";

const DECISION_COMMENT_MAX_LENGTH = 1000;
const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

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
  readonly workflowPacer?: WorkflowPacer;
  readonly deferWorkflow?: (callback: () => void) => ReturnType<typeof setTimeout>;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const database = options.database ?? createDatabase();
  const repository = new PersistenceRepository(database.db, new RunEventBus());
  const serviceConfigAdapter = new ServiceConfigAdapter(options.serviceConfigObservedPath);
  const documentationAdapter = new DocumentationAdapter(options.documentationObservedPath);
  const adapters = {
    documentation: documentationAdapter,
    service_config: serviceConfigAdapter,
  } satisfies Record<AdapterKind, ResettableDriftAdapter>;
  const pendingWorkflowTimers = new Set<ReturnType<typeof setTimeout>>();
  const activeWorkflows = new Set<Promise<unknown>>();
  const deferWork = options.deferWorkflow ?? ((callback: () => void) => setTimeout(callback, 0));
  let isClosing = false;

  const scheduleWorkflow = (workflow: () => Promise<unknown>): void => {
    const timer = deferWork(() => {
      pendingWorkflowTimers.delete(timer);
      if (isClosing) {
        return;
      }

      const execution = workflow();
      activeWorkflows.add(execution);
      void execution.finally(() => activeWorkflows.delete(execution));
    });
    pendingWorkflowTimers.add(timer);
  };

  const orchestrator = new RunOrchestrator(
    repository,
    adapters,
    scheduleWorkflow,
    (adapter) => new WorkflowExecutor(repository, adapter, options.workflowPacer),
  );

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
  app.get<{ Reply: Environment[] }>("/api/environments", async () =>
    orchestrator.listEnvironments(),
  );

  app.post<{
    Params: { id: string };
    Body: unknown;
    Reply: { status: "reset"; environment: Environment } | ApiErrorResponse;
  }>("/api/environments/:id/reset", async (request, reply) => {
    const parsed = emptyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Request body must be empty", request.id);
    }
    try {
      const environment = orchestrator.resetEnvironment(request.params.id);
      return { status: "reset", environment };
    } catch (error) {
      return runOperationErrorResponse(error, reply, request.id);
    }
  });

  app.post<{ Params: { id: string }; Reply: RunSnapshot | ApiErrorResponse }>(
    "/api/environments/:id/runs",
    async (request, reply) => {
      try {
        const snapshot = orchestrator.createRun(request.params.id);
        reply.code(201);
        return snapshot;
      } catch (error) {
        return runOperationErrorResponse(error, reply, request.id);
      }
    },
  );

  app.get<{ Params: { runId: string }; Reply: RunSnapshot | ApiErrorResponse }>(
    "/api/runs/:runId",
    async (request, reply) => {
      try {
        return orchestrator.getRunSnapshot(request.params.runId);
      } catch (error) {
        return runOperationErrorResponse(error, reply, request.id);
      }
    },
  );

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | ApiErrorResponse;
  }>("/api/runs/:runId/approve", async (request, reply) => {
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Invalid decision request", request.id);
    }
    try {
      const result = orchestrator.approveRun(request.params.runId, parsed.data.comment ?? null);
      if (result.newlyApproved) reply.code(202);
      return result.snapshot;
    } catch (error) {
      return runOperationErrorResponse(error, reply, request.id);
    }
  });

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | ApiErrorResponse;
  }>("/api/runs/:runId/reject", async (request, reply) => {
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return apiError("invalid_request", "Invalid decision request", request.id);
    }
    try {
      return orchestrator.rejectRun(request.params.runId, parsed.data.comment ?? null);
    } catch (error) {
      return runOperationErrorResponse(error, reply, request.id);
    }
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
    reply.raw.once("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    for (const event of repository.listRunEventsAfter(request.params.runId, lastSentEventId)) {
      writeEvent(event);
    }
  });

  return app;
}

/** Map domain outcomes and infra uniqueness conflicts to the existing HTTP envelope. */
function runOperationErrorResponse(
  error: unknown,
  reply: { code(statusCode: number): unknown },
  requestId: string,
): ApiErrorResponse {
  if (isActiveRunConstraintError(error)) {
    reply.code(409);
    return apiError(
      "active_run_exists",
      "An active run already exists for this environment",
      requestId,
    );
  }
  if (!(error instanceof RunOperationError)) throw error;

  switch (error.code) {
    case "environment_not_found":
      reply.code(404);
      return apiError("environment_not_found", "Environment not found", requestId);
    case "run_not_found":
      reply.code(404);
      return apiError("run_not_found", "Run not found", requestId);
    case "active_run_exists":
      reply.code(409);
      return apiError(
        "active_run_exists",
        "An active run already exists for this environment",
        requestId,
      );
    case "contradictory_decision":
      reply.code(409);
      return apiError(
        "contradictory_decision",
        "A contradictory decision already exists",
        requestId,
      );
    case "run_not_awaiting_approval":
      reply.code(409);
      return apiError("run_not_awaiting_approval", "Run is not awaiting approval", requestId);
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
