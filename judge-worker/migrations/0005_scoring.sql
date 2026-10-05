CREATE TABLE score_candidates (
 case_id TEXT PRIMARY KEY REFERENCES cases(id), state TEXT NOT NULL, reason TEXT,
 private_parameters TEXT, evidence_json TEXT, updated_at INTEGER NOT NULL, slot_key TEXT UNIQUE
);
CREATE TABLE score_receipts (
 case_id TEXT PRIMARY KEY REFERENCES cases(id), receipt_id TEXT NOT NULL UNIQUE,
 parameters_hash TEXT NOT NULL, receipt_at INTEGER NOT NULL, receipt_tx TEXT,
 parameters_id TEXT UNIQUE, parameters_tx TEXT, parameters_json TEXT,
 circuit_id TEXT UNIQUE, author_wallet TEXT, resident_id TEXT, p_units INTEGER,
 verified INTEGER NOT NULL DEFAULT 0, next_verify_at INTEGER NOT NULL DEFAULT 0, error TEXT
);
-- Extend the existing durable transaction journal; retain every prior transaction.
ALTER TABLE judge_transactions RENAME TO judge_transactions_old;
CREATE TABLE judge_transactions (
 case_id TEXT NOT NULL REFERENCES cases(id),
 type TEXT NOT NULL CHECK(type IN ('reveal','verdict','receipt','parameters')),
 signer TEXT NOT NULL, nonce INTEGER NOT NULL, tx_hash TEXT NOT NULL UNIQUE,
 raw_tx TEXT NOT NULL, max_fee_wei TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'signed',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
 PRIMARY KEY(case_id,type), UNIQUE(signer,nonce)
);
INSERT INTO judge_transactions SELECT * FROM judge_transactions_old;
DROP TABLE judge_transactions_old;
CREATE INDEX judge_transactions_pending ON judge_transactions(state,created_at);
ALTER TABLE cases ADD COLUMN revealed_scoring TEXT;

ALTER TABLE service_runs ADD COLUMN scoring_error TEXT;
