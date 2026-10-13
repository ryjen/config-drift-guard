import type {
  EnvironmentRepository,
  EventRepository,
  RunRepository,
} from "@config-drift-guard/contracts";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "./database.js";
import { SqliteEnvironmentRepository } from "./environments.js";
import { RunEventBus } from "./event-bus.js";
import { SqliteEventRepository } from "./events.js";
import { SqliteRunRepository } from "./repository.js";

describe("explicit SQLite repositories on one database", () => {
  it("keeps run transactions and event replay visible across narrow repository instances", () => {
    const handle = createDatabase(":memory:");
    try {
      const environments: EnvironmentRepository = new SqliteEnvironmentRepository(handle.db);
      const seed = new SqliteEnvironmentRepository(handle.db);
      const bus = new RunEventBus();
      const events: EventRepository = new SqliteEventRepository(handle.db, bus);
      const runs: RunRepository = new SqliteRunRepository(
        handle.db,
        bus,
        seed,
        new SqliteEventRepository(handle.db, bus),
      );

      const environment = seed.seedServiceConfigEnvironment();
      expect(environments.getEnvironment(environment.id)).toEqual(environment);
      const run = runs.createQueuedRun(environment.id);
      const replay = events.listRunEventsAfter(run.id, 0);
      expect(replay.map((entry) => entry.eventType)).toContain("run.queued");

      const live = vi.fn();
      const unsubscribe = bus.subscribe(run.id, live);
      const repository = new SqliteEventRepository(handle.db, bus);
      const next = repository.appendEvent(run.id, "test.live", { accepted: true });
      expect(live).toHaveBeenCalledExactlyOnceWith(next);
      unsubscribe();
      repository.appendEvent(run.id, "test.after_unsubscribe", { accepted: true });
      expect(live).toHaveBeenCalledTimes(1);
      expect(events.listRunEventsAfter(run.id, next.id).map((event) => event.eventType)).toEqual([
        "test.after_unsubscribe",
      ]);
      expect(() => events.listRunEventsAfter("run_missing", 0)).toThrow(
        "run_not_found:run_missing",
      );
    } finally {
      handle.close();
    }
  });
});
