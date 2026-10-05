CREATE TABLE IF NOT EXISTS judge_jobs (
  case_id TEXT PRIMARY KEY REFERENCES cases(id),
  state TEXT NOT NULL,
  rule_version TEXT,
  outcome TEXT,
  reason TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT,
  prepared_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  retry_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS service_runs (
  name TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  ok INTEGER,
  error TEXT
);
