CREATE TABLE price_history (
 subject TEXT NOT NULL, at INTEGER NOT NULL, close TEXT NOT NULL,
 PRIMARY KEY(subject,at)
);
CREATE TABLE history_sync (
 subject TEXT PRIMARY KEY, cutoff INTEGER NOT NULL, next_before INTEGER NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at INTEGER NOT NULL
);
ALTER TABLE service_runs ADD COLUMN tracking_error TEXT;
ALTER TABLE cases ADD COLUMN resident_id TEXT;
CREATE INDEX cases_resident ON cases(resident_id,committed_block,inbox_index);
