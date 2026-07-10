import {
  type Environment,
  type HealthResponse,
  healthResponse,
  type RunSnapshot,
} from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { WorkflowExecutor } from "./workflow-executor.js";

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

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
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const database = options.database ?? createDatabase();
  const repository = new PersistenceRepository(database.db);
  const executor = new WorkflowExecutor(repository);

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
      const snapshot = executor.execute(run.id);
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

  return app;
}
