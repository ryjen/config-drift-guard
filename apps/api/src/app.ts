import { type HealthResponse, healthResponse } from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return LOCAL_ORIGINS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

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

  return app;
}
