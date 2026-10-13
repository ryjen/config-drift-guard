import type { AdapterKind } from "@config-drift-guard/contracts";
import { DocumentationAdapter } from "./adapters/documentation.js";
import { ServiceConfigAdapter } from "./adapters/service-config.js";
import type { ResettableDriftAdapter, WorkflowPacer } from "./application/ports.js";
import { createDatabase, type DatabaseHandle } from "./persistence/database.js";
import { SqliteEnvironmentRepository } from "./persistence/environments.js";
import { RunEventBus } from "./persistence/event-bus.js";
import { SqliteEventRepository } from "./persistence/events.js";
import { SqliteRunRepository } from "./persistence/repository.js";
import { RunOrchestrator } from "./run-orchestrator.js";
import { WorkflowExecutor } from "./workflow-executor.js";

export interface BuildAppOptions {
  readonly database?: DatabaseHandle;
  readonly documentationObservedPath?: string;
  readonly serviceConfigObservedPath?: string;
  readonly workflowPacer?: WorkflowPacer;
  readonly deferWorkflow?: (callback: () => void) => ReturnType<typeof setTimeout>;
}

/** Infrastructure composition is centralized and explicitly owned by the application. */
export interface AppContainer {
  readonly database: DatabaseHandle;
  readonly repository: SqliteRunRepository;
  readonly eventBus: RunEventBus;
  readonly adapters: Record<AdapterKind, ResettableDriftAdapter>;
  readonly orchestrator: RunOrchestrator;
  close(): Promise<void>;
}

export function createAppContainer(options: BuildAppOptions = {}): AppContainer {
  const database = options.database ?? createDatabase();
  const eventBus = new RunEventBus();
  const environmentStore = new SqliteEnvironmentRepository(database.db);
  const eventStore = new SqliteEventRepository(database.db, eventBus);
  const repository = new SqliteRunRepository(database.db, eventBus, environmentStore, eventStore);
  const adapters = {
    documentation: new DocumentationAdapter(options.documentationObservedPath),
    service_config: new ServiceConfigAdapter(options.serviceConfigObservedPath),
  } satisfies Record<AdapterKind, ResettableDriftAdapter>;

  const pendingWorkflowTimers = new Set<ReturnType<typeof setTimeout>>();
  const activeWorkflows = new Set<Promise<unknown>>();
  const deferWork = options.deferWorkflow ?? ((callback: () => void) => setTimeout(callback, 0));
  let isClosing = false;

  const scheduleWorkflow = (workflow: () => Promise<unknown>): void => {
    const timer = deferWork(() => {
      pendingWorkflowTimers.delete(timer);
      if (isClosing) return;

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

  return {
    database,
    repository,
    eventBus,
    adapters,
    orchestrator,
    async close() {
      isClosing = true;
      for (const timer of pendingWorkflowTimers) clearTimeout(timer);
      pendingWorkflowTimers.clear();
      await Promise.allSettled(activeWorkflows);
      if (options.database === undefined) database.close();
    },
  };
}
