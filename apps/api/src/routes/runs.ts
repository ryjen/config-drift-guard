import type { ApiErrorResponse, RunSnapshot } from "@config-drift-guard/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../api-error.js";
import type { RunOrchestrator } from "../run-orchestrator.js";
import { runOperationErrorResponse } from "./errors.js";

const DECISION_COMMENT_MAX_LENGTH = 1000;
const decisionRequestSchema = z
  .object({
    comment: z.string().trim().min(1).max(DECISION_COMMENT_MAX_LENGTH).nullable().optional(),
  })
  .strict();

export function registerRunRoutes(
  app: FastifyInstance,
  orchestrator: Pick<RunOrchestrator, "createRun" | "getRunSnapshot" | "approveRun" | "rejectRun">,
): void {
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
}
