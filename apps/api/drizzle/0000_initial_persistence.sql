PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  adapter_kind TEXT NOT NULL,
  source_config TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY NOT NULL,
  environment_id TEXT NOT NULL REFERENCES environments(id),
  status TEXT NOT NULL,
  current_step TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  canonical_digest TEXT,
  observed_digest TEXT,
  finding_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS steps (
  run_id TEXT NOT NULL REFERENCES runs(id),
  key TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  output TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(run_id, key)
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  resource_id TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  canonical_value TEXT,
  observed_value TEXT,
  sequence INTEGER NOT NULL,
  UNIQUE(run_id, sequence)
);

CREATE TABLE IF NOT EXISTS remediation_plans (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  canonical_digest TEXT NOT NULL,
  expected_observed_digest TEXT NOT NULL,
  target TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
