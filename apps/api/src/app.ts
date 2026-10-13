import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createAppContainer, type BuildAppOptions } from "./container.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";

export type { BuildAppOptions } from "./container.js";

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return LOCAL_ORIGINS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const container = createAppContainer(options);
  app.addHook("onClose", async () => container.close());

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

  registerHealthRoutes(app);
  registerEnvironmentRoutes(app, container.orchestrator);
  registerRunRoutes(app, container.orchestrator);
  registerEventRoutes(app, container.repository, container.eventBus);

  return app;
}
