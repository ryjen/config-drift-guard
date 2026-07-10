export interface HealthResponse {
  readonly service: "config-drift-guard-api";
  readonly status: "ok";
}

export const healthResponse: HealthResponse = {
  service: "config-drift-guard-api",
  status: "ok",
};
