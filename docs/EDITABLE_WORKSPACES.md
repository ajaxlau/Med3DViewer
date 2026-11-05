# Protected workspaces: 3MF, edits and administration

The test implementation supports self-contained Dropbox **STL, 3MF and GLB** models. Model files stay at Dropbox. D1 stores only the encrypted source reference, bounded workspace JSON, hashed capabilities, encrypted link-recovery material and management metadata. No model uploads or geometry copies were added.

The owner confirmed STL viewing works. Synthetic package/mesh tests and local Worker/D1/browser checks cover this extension; a representative real 3MF still needs acceptance on the test deployment, especially on physical iOS/Android devices.

## View and edit links

Create a protected **view-only** link from the existing Share dialog. The workspace includes annotations, analytic definitions/transforms/groups and per-mesh visibility/opacity. Mesh state uses checked scene-instance paths and geometry counts, together with the existing source SHA-256 fingerprint; changed source bytes or a different mesh layout fail before applying saved state. Geometry is never embedded in workspace JSON. Older schema-v1 snapshots remain supported.

Choose **Authorize sharing an edit link…** and enter the existing private creator password (`SHARES_CREATE_KEY`). It is the same credential as share creation, **not** a Cloudflare API/build token. The Share dialog and admin page ask for this password for each edit-link action, even if the manager is already unlocked. No password is placed in the URL, JSON or persistent browser storage. View metadata never exposes an edit token.

Recipients of the edit link can use the existing tools and press **Save workspace**. This updates D1, including mesh show/hide and opacity. Changes appear to other recipients when they reopen/refresh the link. This is explicit saving, not simultaneous live collaboration. View-link users may experiment locally but cannot write to D1.

Each save supplies the source identity and expected revision. Concurrent saves or admin setting changes cause a conflict rather than silently replacing newer data. Export unsaved planning data as a backup and reload before trying again. An edit link is a bearer credential and can be forwarded by someone who already holds it; the creator-password prompt controls issuance/retrieval through the platform, not recipient identity.

## One-time upgrade of the existing test database

1. Open Cloudflare → D1 → **med3dviewer-shares-test** (UUID `5645e9dd-918f-4bbc-a0d6-9e1c315c27ca`) → Console. Keep the existing database, scope and two runtime secrets.
2. Inspect `PRAGMA table_info(shares);`. If the `revision`, `updated_at`, `label`, `edit_token_hash`, `view_token_ciphertext` and `edit_token_ciphertext` columns are absent, execute [0002_editable_workspaces.sql](../migrations/0002_editable_workspaces.sql) **once**. Do not rerun it after successful application. For a partially applied migration, inspect the columns and complete the missing statements before adding the schema marker.
3. Verify:

```sql
SELECT scope FROM share_environment WHERE id = 1;
SELECT version FROM share_schema_version WHERE id = 1;
```

Expected results: `test` and `2`. The migration adds metadata columns and an edit-token index; it preserves existing shares. The Worker keeps legacy view loading/creation available while the upgrade is absent, and keeps editing/management disabled until the schema marker is present.

4. **Dashboard SQL only:** record the completed migrations so a later Wrangler migration run does not try to add the same columns again. Wrangler's own migration command performs this bookkeeping automatically; do not add these statements to the migration file.

```sql
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations(name)
SELECT '0001_shares.sql' WHERE EXISTS (SELECT 1 FROM share_environment WHERE id = 1);
INSERT OR IGNORE INTO d1_migrations(name)
SELECT '0002_editable_workspaces.sql' WHERE EXISTS (SELECT 1 FROM share_schema_version WHERE id = 1 AND version = 2);
```

5. After the latest test deployment, open `/api/shares/config` in a fresh private window. Expect `enabled: true`, `editingEnabled: true` and formats `stl`, `3mf`, `glb`. No new binding, build command, database UUID or secret is required.

## Workspace manager

Test URL: **https://ntec3dpo-m3dv-sharing-test.x-panda.workers.dev/admin/shares**. The Share dialog also links to it. Unlock with the existing creator password. This is a staff-wide credential, not individual user accounts. Lock the manager or close its tab when finished.

The manager lists 25 records per page, allows labels and expiry changes, reveals view addresses, authorizes edit links after a fresh password prompt, and revokes a workspace's view and edit links together. It does not display Dropbox sources or model geometry. Older records may lack encrypted view-link recovery material: open the existing view link and authorize an edit link there to record its recoverable view address. Listing, expiry management and revocation do not require recovery of that old address.

Expiry defaults to **180 days from creation**. Admins may shorten or extend an active record only within that original maximum. Opening, saving or sharing never renews the lifetime. Revoked/expired records cannot be revived through the manager; cleanup may already have deleted them. Access checks and the existing scheduled deletion apply to both capabilities. D1 recovery history retains its separate Cloudflare policy.

## Acceptance checklist

- Use a synthetic/de-identified multi-mesh 3MF. Hide one mesh, adjust another's opacity, add an annotation and distance/angle objects. Create a view link and verify the exact states restore in a private window.
- View-link `PUT` requests must fail. Sharing an edit link must prompt for the creator password; a wrong password must fail and view JSON must contain no edit token.
- Open an authorized edit link, modify mesh visibility and analytics, press Save, then refresh the view link and verify the update. Two editors saving the same revision must produce one success and one conflict.
- In `/admin/shares`, test labels, an earlier expiry, the original 180-day maximum, wrong-password access and revocation of both addresses. Confirm API/model responses remain uncached and private source references are not exposed.
- Test a 3MF with unsafe external paths/entities or excessive actual expanded bytes. It must stop before the viewer parser; oversized mobile models should give a desktop/smaller-model recommendation. Package checks cannot guarantee every permitted mesh fits a device's actual GPU budget.

## Beta/main promotion

Keep this work in the draft test PR until acceptance is reviewed. Apply **both** migrations to each separate beta/main database, preserve its own scope marker and keys, and follow [SHARING_SETUP.md](SHARING_SETUP.md) for bindings and scheduled cleanup. Do not copy test rows, sources, tokens or credentials between tiers. Existing root-Worker-name and production release approval gates still apply.
