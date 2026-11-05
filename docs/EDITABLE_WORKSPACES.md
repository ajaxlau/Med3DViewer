# Public workspaces, revision history and sharing users

Public addresses hide the original Dropbox URL. Self-contained STL, 3MF and GLB are supported. D1 stores encrypted source references and workspace metadata; model files stay at Dropbox. No model copies or geometry uploads are added.

## The sharing flow

- **Checkbox off:** create a public model-only address without a password. Analytics, object revisions and mesh display changes are excluded. Anonymous creation is limited to five attempts per source IP per day, plus the existing global creation quotas.
- **Include analytics, object/mesh state and saved revision history:** the **person sharing** enters their assigned sharing username and password. The administrator creates these credentials. The admin password is not accepted for publishing a workspace.
- Recipients open the same `/s/<random-token>` address **without signing in**. If public editing is enabled, they enter a display name and click **Save workspace** to publish changes. Adjusting tools or objects does not save automatically.
- The version selector loads a chosen saved version after confirming replacement of local unsaved changes. Loading an old version does not rewrite history; a subsequent explicit Save creates a new version. Concurrent changes cause a conflict rather than overwriting a newer revision.
- Opening Share for an existing workspace prompts the sharer for their assigned credentials before the platform displays its QR/copy controls. Since viewing is public, someone who already has the address can still copy or forward it themselves. This password controls the platform's publishing action, not recipient access.

Workspace JSON includes annotations, analytic definitions/transforms/groups, object state and per-mesh visibility/opacity. The source fingerprint and scene-instance paths/geometry counts are checked before restoring state. Geometry and source URLs are excluded. Older workspace JSON remains supported.

## One-time upgrade from your current schema 2

Your existing test database already returned version **2**. Keep that database, its scope, bindings and runtime secrets.

1. Open Cloudflare → D1 → **med3dviewer-shares-test** (`5645e9dd-918f-4bbc-a0d6-9e1c315c27ca`) → Console. Execute this check separately:

```sql
SELECT version FROM share_schema_version WHERE id = 1;
```

2. If it returns **2**, execute [0003_public_workspace_history.sql](../migrations/0003_public_workspace_history.sql) **once**. If it already returns **3**, do not rerun the migration. This migration preserves existing share records and encrypted source references. It replaces only the schema marker table because migration 0002 constrained its value to exactly 2.
3. Execute these checks separately. Expected results are **3** and **test**:

```sql
SELECT version FROM share_schema_version WHERE id = 1;
SELECT scope FROM share_environment WHERE id = 1;
```

4. For migrations applied manually in the Dashboard, record their completion for future Wrangler runs. Wrangler's migration command handles bookkeeping automatically; these statements do not belong inside the migration file.

```sql
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations(name)
SELECT '0001_shares.sql' WHERE EXISTS (SELECT 1 FROM share_environment WHERE id = 1);
INSERT OR IGNORE INTO d1_migrations(name)
SELECT '0002_editable_workspaces.sql' WHERE EXISTS (SELECT 1 FROM share_schema_version WHERE id = 1 AND version >= 3);
INSERT OR IGNORE INTO d1_migrations(name)
SELECT '0003_public_workspace_history.sql' WHERE EXISTS (SELECT 1 FROM share_schema_version WHERE id = 1 AND version = 3);
```

5. After the new test deployment, open `/api/shares/config` in a fresh private window. Expect `enabled: true`, `historyEnabled: true` and formats `stl`, `3mf`, `glb`. No additional database binding, build command or Cloudflare secret is needed.
6. Open **https://ntec3dpo-m3dv-sharing-test.x-panda.workers.dev/admin/shares**. Sign in with the existing admin secret (`SHARES_CREATE_KEY`, retained under its existing configuration name). Under **Sharing users**, add a username and assign a different password to each sharer. Passwords are 12–128 characters. Deliver them privately, outside the model URL and chat.

Existing addresses remain publicly viewable after upgrading. Previously issued edit tokens no longer grant separate write privileges. Existing workspaces start with public editing **disabled**; the admin may enable it explicitly. Their current saved JSON becomes version 1, with a historical snapshot materialized on the first successful new save. A legacy row without recoverable view-token encryption remains viewable at its original public URL, but the admin cannot recover that URL from its hash alone.

## Administration

The admin password is used only for administration. The manager supports:

- Assigning sharing users, changing their individual passwords, and enabling/disabling sharing access. Select multiple users to disable their sharing access in one action. Up to 50 sharing users are supported; usernames are unique and permanent.
- Switching a workspace between **public view only** and **public view + public editing**. Recipients never need a password. Display names on revisions are self-reported labels, not authenticated identities.
- Editing labels and expiry. The maximum remains **180 days from original creation**. Sharing, saving, viewing and admin edits do not reset that lifetime.
- Selecting up to 50 workspace links for **batch revocation**, which stops viewing, model downloads, history access and saves for every holder of those selected links.

Disabling a sharing user stops their future platform sharing actions; it does not revoke public links already distributed. Revoke selected workspace links separately when recipient access should stop. Revoked or expired links cannot be revived. Passwords stay in page memory while entered and are not placed in URLs or browser storage. D1 stores salted PBKDF2-SHA256 password digests, protected with a server-side pepper derived from the existing encryption secret. Admin lists never return digests or passwords.

## Storage and resource limits

Each snapshot is at most 256 KiB. The latest **20 saved versions per workspace** are retained, with a **64 MiB global revision-history budget** in each database. Older versions are removed after successful saves. A full budget rejects a save without replacing the current workspace. The existing share-record quotas bound current snapshot storage separately. Only the selected version is loaded in the browser; version lists contain small metadata records.

Expiry/revocation is checked on every API/model/history/save request. Scheduled share deletion cascades into revision history. Cloudflare recovery history follows its own retention policy. Downloaded/rendered data cannot be recalled. Models must remain accessible at Dropbox and match their original fingerprint.

## Test acceptance before beta/main

1. With a synthetic/de-identified multi-mesh 3MF, hide a mesh, change opacity and add analytic/annotation objects. Publish with the checkbox and assigned sharing credentials.
2. Open that public URL on another device without a password. Confirm mesh and analytic state. Change objects; verify reopening still shows the saved state until **Save workspace** is clicked.
3. Save with different display names, select earlier versions, and verify an old version can be saved as a new version without replacing its history. Two editors saving the same revision must yield one success and one conflict.
4. Confirm admin credentials cannot publish workspaces, sharing credentials cannot administer them, and disabled/old sharing passwords fail after an admin change.
5. Test public view-only permission, individual/batch user disable, bounded expiry and batch workspace revocation. Test both checkbox settings and ensure QR/copy/WhatsApp addresses contain no original source URL.
6. Complete physical iOS/Android, representative real 3MF and 3D Slicer import/export checks. Local synthetic tests cannot establish device GPU fit or clinical measurement accuracy.

Keep this work in the draft test PR until reviewed. Apply migrations 0001–0003 to separate beta/main databases, preserve each environment's scope and keys, and follow [SHARING_SETUP.md](SHARING_SETUP.md). Do not copy test rows or credentials between environments. Restore the production root Worker name before promotion. Beta merge and production release still require owner review.
