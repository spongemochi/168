CREATE TABLE IF NOT EXISTS executor_lock (
  name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS judge_transactions (
  case_id TEXT NOT NULL REFERENCES cases(id),
  type TEXT NOT NULL CHECK(type IN ('reveal','verdict')),
  signer TEXT NOT NULL, nonce INTEGER NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE, raw_tx TEXT NOT NULL,
  max_fee_wei TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'signed',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  PRIMARY KEY(case_id,type), UNIQUE(signer,nonce)
);
CREATE INDEX IF NOT EXISTS judge_transactions_pending ON judge_transactions(state,created_at);
