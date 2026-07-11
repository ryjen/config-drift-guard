import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations, initialMigrationSql } from "./migrations.js";

const activeStatuses = ["queued", "running", "awaiting_approval"];

describe("database migrations", () => {
  it("terminalizes duplicate active runs before creating the unique index", () => {
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
      INSERT INTO runs (id, environment_id, status, created_at, updated_at)
      VALUES (?, 'env_test', ?, ?, ?)
      `,
    );
    insertRun.run("run_old", "running", "2026-07-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z");
    insertRun.run(
      "run_new",
      "awaiting_approval",
      "2026-07-11T00:00:00.000Z",
      "2026-07-11T00:00:00.000Z",
    );

    expect(() => applyMigrations(sqlite)).not.toThrow();

    const rows = sqlite
      .prepare("SELECT id, status, error, version FROM runs ORDER BY id")
      .all() as Array<{ id: string; status: string; error: string | null; version: number }>;
    expect(rows).toEqual([
      {
        id: "run_new",
        status: "awaiting_approval",
        error: null,
        version: 0,
      },
      {
        id: "run_old",
        status: "failed",
        error: expect.stringContaining("duplicate_active_run_recovered"),
        version: 1,
      },
    ]);

    expect(() =>
      insertRun.run(
        "run_conflict",
        "queued",
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
