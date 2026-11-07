-- OAuth metadata only. No model bytes, plaintext credentials or account passwords.
CREATE TABLE dropbox_connection (
  id INTEGER PRIMARY KEY CHECK(id=1),
  epoch INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','connecting','connected','refreshing','reconnect')),
  account_id TEXT,
  account_name TEXT,
  folder_id TEXT,
  folder_name TEXT,
  credentials TEXT,
  access_expires_at INTEGER,
  refresh_due_at INTEGER,
  lock_id TEXT,
  lock_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO dropbox_connection(id) VALUES(1);
CREATE TABLE dropbox_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK(length(state_hash)=64),
  browser_hash TEXT NOT NULL CHECK(length(browser_hash)=64),
  epoch INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
UPDATE share_schema_version SET version=6 WHERE id=1;
