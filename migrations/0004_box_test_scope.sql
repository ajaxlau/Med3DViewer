-- Extend environment isolation without changing existing scope, shares or keys.
-- No model files or Box credentials are stored by this migration.
CREATE TABLE share_environment_next (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
  scope TEXT NOT NULL CHECK(scope IN ('test', 'beta', 'main', 'box-test'))
);
INSERT INTO share_environment_next(id, scope) SELECT id, scope FROM share_environment;
DROP TABLE share_environment;
ALTER TABLE share_environment_next RENAME TO share_environment;
UPDATE share_schema_version SET version = 4 WHERE id = 1;
