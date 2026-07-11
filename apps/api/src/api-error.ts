import type { ApiErrorResponse, JsonValue } from "@config-drift-guard/contracts";

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
      retryable: false,
      requestId,
      detail,
    },
  };
}
