import { type HealthResponse, healthResponse } from "@config-drift-guard/contracts";
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get<{ Reply: HealthResponse }>("/health", async () => healthResponse);
}
