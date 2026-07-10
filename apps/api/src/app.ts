import {
  type Environment,
  type Event,
  type HealthResponse,
  healthResponse,
  type RunSnapshot,
} from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { approveRun, rejectRun } from "./state-machine.js";
import { WorkflowExecutor } from "./workflow-executor.js";

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

const decisionRequestSchema = z
  .object({
    actor: z.string().min(1).default("local-operator"),
    comment: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

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
  readonly serviceConfigObservedPath?: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const database = options.database ?? createDatabase();
  const repository = new PersistenceRepository(database.db);
  const serviceConfigAdapter = new ServiceConfigAdapter(options.serviceConfigObservedPath);
  const executor = new WorkflowExecutor(repository, serviceConfigAdapter);

  repository.seedServiceConfigEnvironment();

  if (options.database === undefined) {
    app.addHook("onClose", async () => database.close());
  }

  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || isLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"), false);
    },
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => healthResponse);
  app.get<{ Reply: Environment[] }>("/api/environments", async () => repository.listEnvironments());

  app.post<{ Params: { id: string }; Reply: RunSnapshot | { error: string } }>(
    "/api/environments/:id/runs",
    async (request, reply) => {
      const environment = repository.getEnvironment(request.params.id);
      if (environment === null) {
        reply.code(404);
        return { error: "environment_not_found" };
      }

      if (environment.adapterKind !== "service_config") {
        reply.code(400);
        return { error: "unsupported_adapter" };
      }

      const run = repository.createQueuedRun(environment.id);
      const snapshot = repository.getRunSnapshot(run.id);
      setTimeout(() => {
        try {
          executor.execute(run.id);
        } catch (error) {
          request.log.error({ error, runId: run.id }, "workflow execution failed");
        }
      }, 0);
      reply.code(201);
      return snapshot;
    },
  );

  app.get<{ Params: { runId: string }; Reply: RunSnapshot | { error: string } }>(
    "/api/runs/:runId",
    async (request, reply) => {
      try {
        return repository.getRunSnapshot(request.params.runId);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("run_not_found:")) {
          reply.code(404);
          return { error: "run_not_found" };
        }

        throw error;
      }
    },
  );

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | { error: string };
  }>("/api/runs/:runId/approve", async (request, reply) => {
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_decision_request" };
    }

    const snapshot = getSnapshotOrReplyNotFound(repository, request.params.runId, reply);
    if (snapshot === null) {
      return { error: "run_not_found" };
    }

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "approved") {
        return snapshot;
      }
      reply.code(409);
      return { error: "contradictory_decision" };
    }

    if (snapshot.run.status !== "awaiting_approval" || snapshot.plan === null) {
      reply.code(409);
      return { error: "run_not_awaiting_approval" };
    }

    repository.recordDecision({
      runId: snapshot.run.id,
      action: "approved",
      actor: parsed.data.actor,
      comment: parsed.data.comment ?? null,
    });
    approveRun(repository, snapshot.run.id);
    setTimeout(() => {
      try {
        executor.executeReconciliation(snapshot.run.id);
      } catch (error) {
        request.log.error({ error, runId: snapshot.run.id }, "reconciliation execution failed");
      }
    }, 0);
    reply.code(202);
    return repository.getRunSnapshot(snapshot.run.id);
  });

  app.post<{
    Params: { runId: string };
    Body: unknown;
    Reply: RunSnapshot | { error: string };
  }>("/api/runs/:runId/reject", async (request, reply) => {
    const parsed = decisionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_decision_request" };
    }

    const snapshot = getSnapshotOrReplyNotFound(repository, request.params.runId, reply);
    if (snapshot === null) {
      return { error: "run_not_found" };
    }

    if (snapshot.decision !== null) {
      if (snapshot.decision.action === "rejected") {
        return snapshot;
      }
      reply.code(409);
      return { error: "contradictory_decision" };
    }

    if (snapshot.run.status !== "awaiting_approval") {
      reply.code(409);
      return { error: "run_not_awaiting_approval" };
    }

    repository.recordDecision({
      runId: snapshot.run.id,
      action: "rejected",
      actor: parsed.data.actor,
      comment: parsed.data.comment ?? null,
    });
    rejectRun(repository, snapshot.run.id);
    return repository.getRunSnapshot(snapshot.run.id);
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/events", async (request, reply) => {
    let lastSentEventId = parseLastEventId(request.headers["last-event-id"]);

    try {
      repository.getRun(request.params.runId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("run_not_found:")) {
        reply.code(404);
        return { error: "run_not_found" };
      }

      throw error;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
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
    request.raw.on("close", unsubscribe);

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
