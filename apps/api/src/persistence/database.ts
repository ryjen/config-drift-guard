import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { applyMigrations } from "./migrations.js";
import * as schema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  readonly db: AppDatabase;
  readonly sqlite: Database.Database;
  close(): void;
}

export function createDatabase(
  path = process.env.CONFIG_DRIFT_GUARD_DB ?? "./data/config-drift-guard.sqlite",
): DatabaseHandle {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    close: () => sqlite.close(),
  };
}
