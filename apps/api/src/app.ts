import type { AdapterKind } from "@config-drift-guard/contracts";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { DocumentationAdapter } from "./adapters/documentation.js";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import type { ResettableDriftAdapter, WorkflowPacer } from "./application/ports.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { RunEventBus } from "./persistence/event-bus.js";
import { PersistenceRepository } from "./persistence/repository.js";
import { RunOrchestrator } from "./run-orchestrator.js";
import { registerEnvironmentRoutes } from "./routes/environments.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRunRoutes } from "./routes/runs.js";
import { WorkflowExecutor } from "./workflow-executor.js";

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return LOCAL_ORIGINS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export interface BuildAppOptions {
  readonly database?: DatabaseHandle;
  readonly documentationObservedPath?: string;
  readonly serviceConfigObservedPath?: string;
  readonly workflowPacer?: WorkflowPacer;
  readonly deferWorkflow?: (callback: () => void) => ReturnType<typeof setTimeout>;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const database = options.database ?? createDatabase();
  const eventBus = new RunEventBus();
  const repository = new PersistenceRepository(database.db, eventBus);
  const serviceConfigAdapter = new ServiceConfigAdapter(options.serviceConfigObservedPath);
  const documentationAdapter = new DocumentationAdapter(options.documentationObservedPath);
  const adapters = {
    documentation: documentationAdapter,
    service_config: serviceConfigAdapter,
  } satisfies Record<AdapterKind, ResettableDriftAdapter>;
  const pendingWorkflowTimers = new Set<ReturnType<typeof setTimeout>>();
  const activeWorkflows = new Set<Promise<unknown>>();
  const deferWork = options.deferWorkflow ?? ((callback: () => void) => setTimeout(callback, 0));
  let isClosing = false;

  const scheduleWorkflow = (workflow: () => Promise<unknown>): void => {
    const timer = deferWork(() => {
      pendingWorkflowTimers.delete(timer);
      if (isClosing) {
        return;
      }

      const execution = workflow();
      activeWorkflows.add(execution);
      void execution.finally(() => activeWorkflows.delete(execution));
    });
    pendingWorkflowTimers.add(timer);
  };

  const orchestrator = new RunOrchestrator(
    repository,
    adapters,
    scheduleWorkflow,
    (adapter) => new WorkflowExecutor(repository, adapter, options.workflowPacer),
  );

  repository.seedServiceConfigEnvironment();
  repository.seedDocumentationEnvironment();
  repository.recoverInterruptedRuns();

  app.addHook("onClose", async () => {
    isClosing = true;
    for (const timer of pendingWorkflowTimers) {
      clearTimeout(timer);
    }
    pendingWorkflowTimers.clear();
    await Promise.allSettled(activeWorkflows);

    if (options.database === undefined) {
      database.close();
    }
  });

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
  registerEnvironmentRoutes(app, orchestrator);
  registerRunRoutes(app, orchestrator);
  registerEventRoutes(app, repository, eventBus);

  return app;
}

/** Map domain outcomes and infra uniqueness conflicts to the existing HTTP envelope. */
