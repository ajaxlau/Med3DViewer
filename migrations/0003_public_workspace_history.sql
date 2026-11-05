-- Apply after 0002. Existing public addresses and source encryption are preserved.
ALTER TABLE shares ADD COLUMN include_workspace INTEGER NOT NULL DEFAULT 1 CHECK(include_workspace IN (0,1));
ALTER TABLE shares ADD COLUMN editing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(editing_enabled IN (0,1));
ALTER TABLE shares ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN workspace_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE share_revisions (
  token_hash TEXT NOT NULL REFERENCES shares(token_hash) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>=1),
  workspace_json TEXT NOT NULL CHECK(length(CAST(workspace_json AS BLOB))<=262144),
  byte_count INTEGER NOT NULL CHECK(byte_count BETWEEN 1 AND 262144),
  author TEXT NOT NULL CHECK(length(author) BETWEEN 1 AND 80),
  saved_at INTEGER NOT NULL,
  save_id TEXT NOT NULL,
  PRIMARY KEY(token_hash,version)
);
CREATE TABLE share_users (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=64),
  username TEXT UNIQUE NOT NULL CHECK(length(username) BETWEEN 3 AND 64),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL CHECK(length(password_hash)=64),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Schema 0002 constrained its marker to exactly 2, so replace only the marker.
DROP TABLE share_schema_version;
CREATE TABLE share_schema_version(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version>=3));
INSERT INTO share_schema_version(id,version) VALUES(1,3);
