import type { ApiErrorResponse } from "@config-drift-guard/contracts";
import { apiError } from "../api-error.js";
import { isActiveRunConstraintError } from "../persistence/constraint-errors.js";
import { RunOperationError } from "../run-orchestrator.js";

export function runOperationErrorResponse(
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
