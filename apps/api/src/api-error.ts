import type { ApiErrorResponse, JsonValue } from "@config-drift-guard/contracts";

const RETRYABLE_CODES = new Set(["active_run_exists"]);

export function apiError(
  code: string,
  message: string,
  requestId: string,
  detail?: JsonValue,
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      retryable: RETRYABLE_CODES.has(code),
      requestId,
      detail,
    },
  };
}
