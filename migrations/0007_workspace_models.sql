-- Model bytes remain in Dropbox. Only private metadata and bounded chunk hashes.
CREATE TABLE model_uploads (
 id TEXT PRIMARY KEY CHECK(length(id)=64), owner_id TEXT NOT NULL,
 request_key TEXT NOT NULL, connection_epoch INTEGER NOT NULL,
 filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 128),
 extension TEXT NOT NULL CHECK(extension IN ('stl','3mf')),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 157286400),
 offset INTEGER NOT NULL DEFAULT 0, block_hashes TEXT NOT NULL DEFAULT '[]',
 session_ciphertext TEXT, target_hash TEXT, target_epoch INTEGER,
 status TEXT NOT NULL CHECK(status IN ('starting','open','sending','finalizing','ready','failed','cancelled')),
 lock_id TEXT, lock_at INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 UNIQUE(owner_id,request_key)
);
CREATE INDEX model_upload_expiry ON model_uploads(expires_at);
CREATE TABLE model_assets (
 id TEXT PRIMARY KEY CHECK(length(id)=64), owner_id TEXT NOT NULL,
 connection_epoch INTEGER NOT NULL, filename TEXT NOT NULL, extension TEXT NOT NULL,
 size INTEGER NOT NULL, content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
 file_id TEXT NOT NULL, file_rev TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE workspace_models (
 token_hash TEXT NOT NULL REFERENCES shares(token_hash) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES model_assets(id), PRIMARY KEY(token_hash,asset_id)
);
ALTER TABLE shares ADD COLUMN model_asset_id TEXT;
ALTER TABLE shares ADD COLUMN identity_kind TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE share_revisions ADD COLUMN model_asset_id TEXT;
ALTER TABLE share_revisions ADD COLUMN model_identity TEXT;
ALTER TABLE share_revisions ADD COLUMN identity_kind TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE share_revisions ADD COLUMN source_ciphertext TEXT;
ALTER TABLE share_revisions ADD COLUMN model_extension TEXT;
UPDATE share_revisions SET model_identity=(SELECT model_identity FROM shares WHERE shares.token_hash=share_revisions.token_hash),
 source_ciphertext=(SELECT source_ciphertext FROM shares WHERE shares.token_hash=share_revisions.token_hash),
 model_extension=(SELECT model_extension FROM shares WHERE shares.token_hash=share_revisions.token_hash);
UPDATE share_schema_version SET version=7 WHERE id=1;
