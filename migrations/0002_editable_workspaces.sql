-- Apply once to each environment's existing metadata database. No model files.
-- Existing view links remain valid; the schema marker is written last.
ALTER TABLE shares ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1);
ALTER TABLE shares ADD COLUMN updated_at INTEGER;
ALTER TABLE shares ADD COLUMN label TEXT NOT NULL DEFAULT '' CHECK(length(label) <= 128);
ALTER TABLE shares ADD COLUMN edit_token_hash TEXT CHECK(edit_token_hash IS NULL OR length(edit_token_hash) = 64);
ALTER TABLE shares ADD COLUMN view_token_ciphertext TEXT;
ALTER TABLE shares ADD COLUMN edit_token_ciphertext TEXT;
CREATE UNIQUE INDEX shares_edit_token ON shares(edit_token_hash) WHERE edit_token_hash IS NOT NULL;
CREATE TABLE share_schema_version (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL CHECK(version = 2)
);
INSERT INTO share_schema_version(id, version) VALUES(1, 2);
