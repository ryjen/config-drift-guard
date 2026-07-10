import {
  type Environment,
  type HealthResponse,
  healthResponse,
} from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { PersistenceRepository } from "./persistence/repository.js";

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

  return app;
}
