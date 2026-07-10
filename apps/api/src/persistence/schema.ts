import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const environments = sqliteTable("environments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  adapterKind: text("adapter_kind").notNull(),
  sourceConfig: text("source_config", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  environmentId: text("environment_id")
    .notNull()
    .references(() => environments.id),
  status: text("status").notNull(),
  currentStep: text("current_step"),
  version: integer("version").notNull().default(0),
  canonicalDigest: text("canonical_digest"),
  observedDigest: text("observed_digest"),
  findingCount: integer("finding_count").notNull().default(0),
  error: text("error", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const steps = sqliteTable(
  "steps",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id),
    key: text("key").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull(),
    message: text("message"),
    output: text("output", { mode: "json" }),
    error: text("error", { mode: "json" }),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [uniqueIndex("steps_run_key_unique").on(table.runId, table.key)],
);

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id),
    resourceId: text("resource_id").notNull(),
    path: text("path").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    canonicalValue: text("canonical_value", { mode: "json" }),
    observedValue: text("observed_value", { mode: "json" }),
    sequence: integer("sequence").notNull(),
  },
  (table) => [uniqueIndex("findings_run_sequence_unique").on(table.runId, table.sequence)],
);

export const remediationPlans = sqliteTable("remediation_plans", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .unique()
    .references(() => runs.id),
  canonicalDigest: text("canonical_digest").notNull(),
  expectedObservedDigest: text("expected_observed_digest").notNull(),
  targetDigest: text("target_digest").notNull(),
  target: text("target", { mode: "json" }).notNull(),
  engineVersion: text("engine_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .unique()
    .references(() => runs.id),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  comment: text("comment"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  eventType: text("event_type").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
