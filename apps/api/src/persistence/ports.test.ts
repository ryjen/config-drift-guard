import type {
  EnvironmentRepository,
  EventRepository,
  RunRepository,
} from "@config-drift-guard/contracts";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./database.js";
import { RunEventBus } from "./event-bus.js";
import { PersistenceRepository } from "./repository.js";

describe("segregated persistence contracts", () => {
  it("shares one durable database across independently typed environment, run and event views", () => {
    const handle = createDatabase(":memory:");
    try {
      const repository = new PersistenceRepository(handle.db, new RunEventBus());
      const environments: EnvironmentRepository = repository;
      const runs: RunRepository = repository;
      const events: EventRepository = repository;

      const environment = repository.seedServiceConfigEnvironment();
      expect(environments.getEnvironment(environment.id)).toEqual(environment);
      expect(environments.listEnvironments()).toHaveLength(1);

      const run = runs.createQueuedRun(environment.id);
      expect(runs.getRunSnapshot(run.id).run.id).toBe(run.id);
      const replay = events.listRunEventsAfter(run.id, 0);
      expect(replay.map((event) => event.eventType)).toContain("run.queued");
      expect(events.listRunEventsAfter(run.id, replay.at(-1)?.id ?? 0)).toEqual([]);
    } finally {
      handle.close();
    }
  });
});
