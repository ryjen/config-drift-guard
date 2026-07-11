import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations, initialMigrationSql } from "./migrations.js";

const activeStatuses = ["queued", "running", "awaiting_approval"];

describe("database migrations", () => {
  it("preserves the most recoverable active run and terminalizes duplicates consistently", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(initialMigrationSql);
    sqlite
      .prepare(
        `
        INSERT INTO environments (id, name, adapter_kind, source_config)
        VALUES ('env_test', 'Test', 'service_config', '{}')
        `,
      )
      .run();

    const insertRun = sqlite.prepare(
      `
      INSERT INTO runs (id, environment_id, status, current_step, created_at, updated_at)
      VALUES (?, 'env_test', ?, ?, ?, ?)
      `,
    );
    insertRun.run(
      "run_approval",
      "awaiting_approval",
      null,
      "2026-07-10T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z",
    );
    insertRun.run(
      "run_newer_running",
      "running",
      "calculate_drift",
      "2026-07-11T00:00:00.000Z",
      "2026-07-11T00:00:00.000Z",
    );

    const insertStep = sqlite.prepare(
      `
      INSERT INTO steps (run_id, key, sequence, status)
      VALUES (?, ?, ?, ?)
      `,
    );
    insertStep.run("run_newer_running", "calculate_drift", 0, "running");
    insertStep.run("run_newer_running", "classify_findings", 1, "pending");

    expect(() => applyMigrations(sqlite)).not.toThrow();

    const rows = sqlite
      .prepare("SELECT id, status, current_step, error, version FROM runs ORDER BY id")
      .all() as Array<{
      id: string;
      status: string;
      current_step: string | null;
      error: string | null;
      version: number;
    }>;
    expect(rows).toEqual([
      {
        id: "run_approval",
        status: "awaiting_approval",
        current_step: null,
        error: null,
        version: 0,
      },
      {
        id: "run_newer_running",
        status: "failed",
        current_step: null,
        error: expect.stringContaining("duplicate_active_run_recovered"),
        version: 1,
      },
    ]);

    const recoveredSteps = sqlite
      .prepare(
        `
        SELECT key, status, error, completed_at
        FROM steps
        WHERE run_id = 'run_newer_running'
        ORDER BY sequence
        `,
      )
      .all() as Array<{
      key: string;
      status: string;
      error: string | null;
      completed_at: string | null;
    }>;
    expect(recoveredSteps).toEqual([
      {
        key: "calculate_drift",
        status: "failed",
        error: expect.stringContaining("duplicate_active_run_recovered"),
        completed_at: expect.any(String),
      },
      {
        key: "classify_findings",
        status: "skipped",
        error: null,
        completed_at: expect.any(String),
      },
    ]);

    const recoveryEvent = sqlite
      .prepare(
        `
        SELECT event_type, payload
        FROM events
        WHERE run_id = 'run_newer_running'
        `,
      )
      .get() as { event_type: string; payload: string };
    expect(recoveryEvent.event_type).toBe("run.recovered_duplicate_active");
    expect(recoveryEvent.payload).toContain("duplicate_active_run_recovered");

    expect(() =>
      insertRun.run(
        "run_conflict",
        "queued",
        null,
        "2026-07-11T01:00:00.000Z",
        "2026-07-11T01:00:00.000Z",
      ),
    ).toThrow("UNIQUE constraint failed: runs.environment_id");

    const activeCount = sqlite
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM runs
        WHERE environment_id = 'env_test'
          AND status IN (${activeStatuses.map(() => "?").join(", ")})
        `,
      )
      .get(...activeStatuses) as { count: number };
    expect(activeCount.count).toBe(1);

    sqlite.close();
  });

  it("is idempotent after the active-run index exists", () => {
    const sqlite = new Database(":memory:");

    expect(() => applyMigrations(sqlite)).not.toThrow();
    expect(() => applyMigrations(sqlite)).not.toThrow();

    sqlite.close();
  });
});
