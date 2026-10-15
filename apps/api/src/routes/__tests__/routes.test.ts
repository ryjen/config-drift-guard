import { get, type IncomingMessage } from "node:http";
import {
  type Environment,
  type Event,
  healthResponse,
  type Run,
  type RunSnapshot,
} from "@config-drift-guard/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { EventReadRepository, RunEventBusPort } from "../../application/ports.js";
import { RunOperationError } from "../../run-orchestrator.js";
import { registerEnvironmentRoutes } from "../environments.js";
import { registerEventRoutes } from "../events.js";
import { registerHealthRoutes } from "../health.js";
import { registerRunRoutes } from "../runs.js";

const timestamp = "2026-10-14T00:00:00.000Z";
const environment: Environment = {
  id: "env_service_config",
  name: "Test service",
  adapterKind: "service_config",
  sourceConfig: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};
const run: Run = {
  id: "run_test",
  environmentId: environment.id,
  status: "awaiting_approval",
  currentStep: null,
  version: 2,
  canonicalDigest: "sha256:canonical",
  observedDigest: "sha256:observed",
  findingCount: 0,
  error: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const snapshot: RunSnapshot = {
  run,
  steps: [],
  findings: [],
  events: [],
  plan: null,
  decision: null,
};

async function withRoutes(
  register: (app: FastifyInstance) => void,
  check: (app: FastifyInstance) => Promise<void>,
): Promise<void> {
  const app = Fastify({ logger: false });
  register(app);
  try {
    await check(app);
  } finally {
    await app.close();
  }
}

function environmentRoutes() {
  return {
    listEnvironments: vi.fn(() => [environment]),
    resetEnvironment: vi.fn(() => environment),
  } satisfies Parameters<typeof registerEnvironmentRoutes>[1];
}

function runRoutes() {
  return {
    createRun: vi.fn(() => snapshot),
    getRunSnapshot: vi.fn(() => snapshot),
    approveRun: vi.fn(() => ({ snapshot, newlyApproved: true })),
    rejectRun: vi.fn(() => snapshot),
  } satisfies Parameters<typeof registerRunRoutes>[1];
}

describe("isolated Fastify route contracts (no SQLite or filesystem)", () => {
  it("serves the health route with the documented payload", async () => {
    await withRoutes(registerHealthRoutes, async (app) => {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(healthResponse);
    });
  });

  it("lists, validates and resets environments through a narrow use-case mock", async () => {
    const orchestrator = environmentRoutes();
    await withRoutes((app) => registerEnvironmentRoutes(app, orchestrator), async (app) => {
      const list = await app.inject({ method: "GET", url: "/api/environments" });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual([environment]);

      const invalid = await app.inject({
        method: "POST",
        url: "/api/environments/env_service_config/reset",
        payload: { arbitrary: true },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("invalid_request");
      expect(orchestrator.resetEnvironment).not.toHaveBeenCalled();

      const reset = await app.inject({
        method: "POST",
        url: "/api/environments/env_service_config/reset",
        payload: {},
      });
      expect(reset.statusCode).toBe(200);
      expect(reset.json().environment).toEqual(environment);
      expect(orchestrator.resetEnvironment).toHaveBeenCalledExactlyOnceWith(environment.id);

      orchestrator.resetEnvironment.mockImplementation(() => {
        throw new RunOperationError("active_run_exists");
      });
      const conflict = await app.inject({
        method: "POST",
        url: "/api/environments/env_service_config/reset",
        payload: {},
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.retryable).toBe(true);
    });
  });

  it("maps run creation, snapshots, approval and rejection HTTP semantics", async () => {
    const orchestrator = runRoutes();
    await withRoutes((app) => registerRunRoutes(app, orchestrator), async (app) => {
      const created = await app.inject({
        method: "POST",
        url: "/api/environments/env_service_config/runs",
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().run.id).toBe(run.id);
      expect(orchestrator.createRun).toHaveBeenCalledExactlyOnceWith(environment.id);

      const read = await app.inject({ method: "GET", url: "/api/runs/run_test" });
      expect(read.statusCode).toBe(200);
      expect(orchestrator.getRunSnapshot).toHaveBeenCalledExactlyOnceWith("run_test");

      const invalid = await app.inject({
        method: "POST",
        url: "/api/runs/run_test/approve",
        payload: { comment: "  " },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("invalid_request");
      expect(orchestrator.approveRun).not.toHaveBeenCalled();

      const approved = await app.inject({
        method: "POST",
        url: "/api/runs/run_test/approve",
        payload: { comment: "  proceed  " },
      });
      expect(approved.statusCode).toBe(202);
      expect(orchestrator.approveRun).toHaveBeenCalledExactlyOnceWith(run.id, "proceed");

      orchestrator.approveRun.mockReturnValue({ snapshot, newlyApproved: false });
      const repeated = await app.inject({
        method: "POST",
        url: "/api/runs/run_test/approve",
        payload: {},
      });
      expect(repeated.statusCode).toBe(200);

      const rejected = await app.inject({
        method: "POST",
        url: "/api/runs/run_test/reject",
        payload: { comment: null },
      });
      expect(rejected.statusCode).toBe(200);
      expect(orchestrator.rejectRun).toHaveBeenCalledExactlyOnceWith(run.id, null);

      orchestrator.rejectRun.mockImplementation(() => {
        throw new RunOperationError("contradictory_decision");
      });
      const contradiction = await app.inject({
        method: "POST",
        url: "/api/runs/run_test/reject",
        payload: {},
      });
      expect(contradiction.statusCode).toBe(409);
      expect(contradiction.json().error.code).toBe("contradictory_decision");

      orchestrator.getRunSnapshot.mockImplementation(() => {
        throw new RunOperationError("run_not_found");
      });
      const missing = await app.inject({ method: "GET", url: "/api/runs/run_missing" });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe("run_not_found");
    });
  });

  it("rejects a nonexistent SSE run without subscribing", async () => {
    const repository: EventReadRepository = {
      getRun: () => {
        throw new Error("run_not_found:run_missing");
      },
      listRunEventsAfter: () => [],
    };
    const subscribe = vi.fn(() => () => undefined);
    const bus: RunEventBusPort = { subscribe, publish: () => undefined };
    await withRoutes((app) => registerEventRoutes(app, repository, bus), async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/runs/run_missing/events" });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("run_not_found");
      expect(subscribe).not.toHaveBeenCalled();
    });
  });

  it("replays an SSE event and disposes an in-memory subscription after disconnect", async () => {
    const replayed: Event = {
      id: 2,
      runId: run.id,
      eventType: "run.updated",
      payload: { status: "running" },
      createdAt: timestamp,
    };
    const repository: EventReadRepository = {
      getRun: () => run,
      listRunEventsAfter: () => [replayed],
    };
    let unsubscribes = 0;
    const bus: RunEventBusPort = {
      subscribe: () => () => {
        unsubscribes += 1;
      },
      publish: () => undefined,
    };
    await withRoutes((app) => registerEventRoutes(app, repository, bus), async (app) => {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const stream = await new Promise<IncomingMessage>((resolve, reject) => {
        get(
          `${address}/api/runs/${run.id}/events`,
          { headers: { "Last-Event-ID": "1" } },
          resolve,
        ).once("error", reject);
      });
      const chunks: string[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
      try {
        expect(stream.statusCode).toBe(200);
        await expect.poll(() => chunks.join("").includes("id: 2\n")).toBe(true);
        expect(chunks.join("")).toContain("event: run-change");
      } finally {
        stream.destroy();
      }
      await expect.poll(() => unsubscribes).toBe(1);
    });
  });
});
