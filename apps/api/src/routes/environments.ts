import type { ApiErrorResponse, Environment } from "@config-drift-guard/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../api-error.js";
import type { RunOrchestrator } from "../run-orchestrator.js";
import { runOperationErrorResponse } from "./errors.js";

const emptyRequestSchema = z.object({}).strict();

export function registerEnvironmentRoutes(
  app: FastifyInstance,
  orchestrator: RunOrchestrator,
): void {
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
}
