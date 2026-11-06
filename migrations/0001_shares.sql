-- Metadata only. Never insert original model files or encoded geometry here.
CREATE TABLE IF NOT EXISTS shares (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64),
  source_ciphertext TEXT NOT NULL,
  model_extension TEXT NOT NULL CHECK(model_extension IN ('stl', 'glb', '3mf')),
  model_identity TEXT NOT NULL CHECK(length(model_identity) = 64),
  workspace_json TEXT NOT NULL CHECK(length(CAST(workspace_json AS BLOB)) <= 262144),
  owner_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS shares_expiry ON shares(expires_at);
CREATE INDEX IF NOT EXISTS shares_revoked ON shares(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS share_rate_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_rate_expiry ON share_rate_limits(expires_at);

-- Initialize once per physical database; never copy this row across environments.
CREATE TABLE IF NOT EXISTS share_environment (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
  scope TEXT NOT NULL CHECK(scope IN ('test', 'beta', 'main'))
);
