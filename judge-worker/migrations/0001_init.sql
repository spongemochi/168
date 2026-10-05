CREATE TABLE IF NOT EXISTS cursors (
  stream TEXT PRIMARY KEY,
  next_index INTEGER NOT NULL DEFAULT 0,
  safe_block INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  inbox_index INTEGER NOT NULL UNIQUE,
  author_endpoint TEXT NOT NULL,
  author_container TEXT NOT NULL,
  kind TEXT NOT NULL,
  open_time INTEGER NOT NULL,
  commitment_ref TEXT NOT NULL,
  payload_hex TEXT NOT NULL,
  committed_block INTEGER NOT NULL,
  committed_at INTEGER NOT NULL,
  reveal_id TEXT,
  revealed_body TEXT,
  revealed_condition TEXT,
  revealed_claim TEXT,
  verdict_id TEXT,
  outcome TEXT,
  verdict_reason TEXT,
  verdict_sources TEXT
);
CREATE INDEX IF NOT EXISTS cases_open_time ON cases(open_time);

CREATE TABLE IF NOT EXISTS chain_records (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  record_type TEXT NOT NULL,
  case_id TEXT,
  valid INTEGER NOT NULL,
  reason TEXT,
  block_number INTEGER NOT NULL,
  tx_hint TEXT
);
CREATE INDEX IF NOT EXISTS chain_records_case ON chain_records(case_id);

CREATE TABLE IF NOT EXISTS public_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evidence','objection')),
  endpoint_name TEXT NOT NULL,
  signer TEXT NOT NULL,
  text TEXT NOT NULL,
  source_url TEXT,
  issued_at INTEGER NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(case_id, signer, issued_at, kind),
  FOREIGN KEY(case_id) REFERENCES cases(id)
);
CREATE INDEX IF NOT EXISTS public_submissions_case ON public_submissions(case_id);
