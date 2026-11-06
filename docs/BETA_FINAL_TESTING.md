# PR #12 → beta: final testing setup

PR #12 targets `beta`. This prepares the existing **beta Worker Preview**, not a production release. Keep `main`, the production deployment and the working sharing-test Worker in place. Merge only after the beta database and settings below have been checked with the owner.

## Confirmed resources

| Target | Worker | D1 database | Database ID | Scope |
| --- | --- | --- | --- | --- |
| Existing test | `ntec3dpo-m3dv-sharing-test` | `med3dviewer-shares-test` | `5645e9dd-918f-4bbc-a0d6-9e1c315c27ca` | `test` |
| Final beta testing | `ntec3dpo-m3dv`, Preview **beta** | `med3dviewer-shares-beta` | `d23f95bc-a6a2-4f43-9fa9-5afaa340f325` | `beta` |
| Beta cleanup | `ntec3dpo-m3dv-sharing-beta-cleanup` | Same beta database | Same beta ID | `beta` |

[config/shares.beta.json](../config/shares.beta.json) records the owner-confirmed beta ID, name and tier. The generated configuration supplies binding **`SHARES_DB`**, `ASSETS`, `SHARES_ENABLED=true`, `SHARES_ENVIRONMENT=beta` and the API/SPA routing. UUIDs are not passwords. Main has no database defaults.

The root `wrangler.jsonc` must retain **`name: ntec3dpo-m3dv`**, sharing disabled and no D1 binding. Test and beta commands use separate generated configurations. The publisher rejects a test database used for beta/main, a beta database used for test/main, and beta publishing from another source branch.

## 1. Initialize the beta database on a phone/tablet

Open Cloudflare → Storage & databases → D1 → **med3dviewer-shares-beta**. Confirm the ID above before running SQL. Keep test records and secrets in test; do not copy encrypted sources, users, sessions or shared links between environments.

First inspect the beta database's Console:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
```

If there are no application tables, execute the following files **separately, once each, in this order**. The whole contents of each file belong in the SQL Console; a completed DDL query may report no returned data.

1. [0001_shares.sql](../migrations/0001_shares.sql)
2. [0002_editable_workspaces.sql](../migrations/0002_editable_workspaces.sql)
3. [0003_public_workspace_history.sql](../migrations/0003_public_workspace_history.sql)

If application tables already exist, inspect `share_schema_version` and `share_environment` first. A version of **3** with scope **beta** needs no migration. Do not rerun `ALTER TABLE` migrations or change an existing `test`/`main` marker to beta. For a partially applied migration or existing shares, report the schema results before continuing.

Initialize the new database's scope, without replacing an existing marker:

```sql
INSERT INTO share_environment(id, scope) VALUES (1, 'beta')
ON CONFLICT(id) DO NOTHING;
```

Run this verification **as a separate query**:

```sql
SELECT
  (SELECT scope FROM share_environment WHERE id = 1) AS environment,
  (SELECT version FROM share_schema_version WHERE id = 1) AS schema_version,
  (SELECT COUNT(*) FROM pragma_table_info('shares') WHERE name IN
    ('include_workspace','editing_enabled','auth_epoch','workspace_version')) AS history_columns,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
    AND name IN ('share_revisions','share_users')) AS history_tables,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index'
    AND name = 'share_revisions_byte_ledger') AS ledger_index;
```

Expected: **`beta | 3 | 4 | 2 | 1`**. Share only those results, not model data. Do not manually raise the version number to conceal missing columns/tables/indexes.

After that complete result, record the manual migrations so a future Wrangler migration command will not repeat them. Run these statements separately if the dashboard executes only one statement per request:

```sql
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations(name) VALUES ('0001_shares.sql');
INSERT OR IGNORE INTO d1_migrations(name) VALUES ('0002_editable_workspaces.sql');
INSERT OR IGNORE INTO d1_migrations(name) VALUES ('0003_public_workspace_history.sql');
```

## 2. Configure only the existing beta Preview build

Cloudflare → Workers & Pages → **ntec3dpo-m3dv** → select Preview **beta** → Settings → Build. Some layouts show this under Previews → beta → Builds. Check the tracking branch and save these settings on that specific Preview:

| Setting | Value |
| --- | --- |
| Repository | `ajaxlau/Med3DViewer` |
| Tracking branch | `beta` |
| Root directory | `/` |
| Build command | `npm run build:cloudflare` |
| Preview command | `npm run preview:shares:beta` |
| Build variable | `NODE_VERSION=22` |
| Build authentication | Keep the working `med3dviewer build token` selection |

The beta database profile is committed. No additional database build variables are needed. If old `SHARES_DB_NAME`, `SHARES_DB_ID` or `SHARES_RESOURCE_TIER` build variables exist, remove obsolete overrides or make all three match the beta profile. Do not put the test ID in beta.

Keep **Production** tracking `main` with its existing production command. Keep **Previews Base** on the ordinary preview command `npx wrangler preview --config ./wrangler.jsonc`; do not put beta's special command, database or secrets into defaults for every feature branch. Beta's publisher explicitly names Preview `beta` and rejects execution from a different branch.

These settings can be saved before merge. The old beta code does not yet contain the new command; wait for the merge commit before starting its new build. A retry of an old failed build can reuse obsolete settings. Inspect a **new build's** source commit and recorded command before retrying.

## 3. Add beta runtime secrets

Within the existing **beta Preview**, open Settings → Variables and Secrets. These are **runtime** secrets, not build variables, GitHub secrets or the Cloudflare build token:

| Name | Value/purpose |
| --- | --- |
| `SHARES_CREATE_KEY` | A separate, random beta admin password, 32–256 characters |
| `SHARES_ENCRYPTION_KEY` | A different, random beta encryption secret, 32–256 characters |

Generate/save them in your password manager. Preserve existing beta secrets if that environment already has shares; never rotate the encryption key as a troubleshooting step. Do not reuse test/main keys or send values in chat. Keep these out of `VITE_*`, source files and SQL. The admin key is used only at `/admin/shares`; assign separate sharing-user accounts there after deployment.

Select **beta**, not Production or Previews Base. Base secret changes do not update an existing Preview. If the phone interface does not expose the beta secret editor, report that limitation; do not add the keys to another environment. A trusted-terminal fallback is documented in [SHARING_SETUP.md](SHARING_SETUP.md#promotion-to-beta-requires-test-review).

## 4. Prepare the scheduled beta cleanup Worker

Worker Previews do not execute Cron Triggers. Beta therefore needs this separate, scheduled-only Worker. Access expiry is enforced on every request, but scheduled deletion must also be tested.

Create **ntec3dpo-m3dv-sharing-beta-cleanup** in Workers & Pages. A phone-friendly approach is Create Worker → Hello World, then connect its **Build** settings to the existing GitHub repository. Use the reviewed `beta` branch and:

| Setting | Value |
| --- | --- |
| Tracking branch | `beta` |
| Root | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `node scripts/share-cloudflare.mjs beta cleanup` |
| Build variable | `NODE_VERSION=22` |
| Runtime passwords/secrets | None |

Keep automatic builds paused until beta contains the merged code. Use the committed beta database profile; remove conflicting database overrides. Do not accept a Git-import change that renames the root Wrangler Worker to the cleanup Worker. The deploy command generates the cleanup-specific configuration itself.

After deployment, confirm **SHARES_DB → med3dviewer-shares-beta**, runtime `SHARES_ENVIRONMENT=beta`, and Cron **`17 * * * *`**. Public `workers.dev` and version-preview URLs are disabled intentionally; this Worker does not need a visible URL. It has no HTTP cleanup action and no model/admin secret. It deletes only expired/revoked/orphaned beta metadata and expired limiter/session rows.

## 5. GitHub handoff and merge

1. Open [PR #12](https://github.com/ajaxlau/Med3DViewer/pull/12). Confirm **base beta**, the reviewed latest head, no conflicts, and the checks for that exact commit. GitHub Actions validates tests, assets, ordinary packaging, beta packaging and cleanup packaging without deployment credentials.
2. This repository uses Cloudflare's Git integration for deployment. Do not add a GitHub deployment workflow or paste a Cloudflare API token into repository secrets for this handoff. No additional GitHub secret is required by CI.
3. Record the current beta commit/deployment before merging. At preparation time beta is `100f409997217f1c1fc1c6323e3916f9a70105ba`; main is `123a5edc76c2f50ce9ad9d3be14e71ec0ee8e43f`. Recheck if either moved.
4. Once the database results, beta build settings and beta-only secrets are confirmed, make the draft **Ready for review** and merge PR #12 into **beta**, preferably with a merge commit to retain its history. Do not merge into main.
5. Keep `beta` as the long-lived testing branch. Keep `codex/secure-workspace-preview` while the existing test Worker tracks it; do not delete it as part of this merge. A future production release should use a separate beta → main PR after final testing.
6. Confirm the new beta build logs execute `npm run build:cloudflare`, then `npm run preview:shares:beta`, with the merge SHA. Confirm both GitHub CI and the Cloudflare build succeed. Deploy the cleanup Worker from that same beta commit.

If available for the account, protect `beta` and `main` with pull requests and the **Install, test, and build** check, and block force pushes/deletion. Do not add a required second-person approval when no second reviewer is available. Branch protection is optional setup advice, not a reason to bypass current merge checks.

## 6. Final beta acceptance

Copy the actual **beta Preview URL** from Cloudflare. It is normally `https://beta-ntec3dpo-m3dv.x-panda.workers.dev/`; use the displayed address rather than the production Visit link. New beta shares use this beta origin; production-prefix links require a later main release.

Open `/api/shares/config` in a new Private/Incognito window. Require JSON with **`enabled: true` and `historyEnabled: true`**; an HTML viewer page is not a passing API check. Then confirm beta's effective **SHARES_DB binding, beta scope and two secret names** in Cloudflare. A successful build alone does not prove runtime configuration.

1. Open `/admin/shares` on the beta origin with the beta admin password. Create a beta sharing user with a different password. No test user accounts are copied automatically.
2. Use de-identified Dropbox STL, multi-mesh 3MF and self-contained GLB. Check local file loading too. Confirm guest QR/copy sharing conceals the source, and signed-in workspace sharing restores mesh visibility/opacity plus supported analytic objects and annotations.
3. In Analytic Tools, check matching headings, Revision Name prompt, no heading version badge, pin/expand controls, 300ms animations and the 10-second collapse delay on desktop. Check touch behavior, scrolling and portrait/landscape on real mobile devices.
4. Open a workspace in two recipient browsers without login. Explicitly save different named revisions from the same base; both must receive separate increasing version numbers and timestamps. Select each revision and confirm automatic restore. Unsaved changes must not publish merely by changing tools or selection.
5. Test admin view-only permission, expiry changes within 180 days of creation, individual/batch revocation, credential changes and source-unavailable errors. Verify affected model, metadata, history and save requests are denied.
6. Create a **disposable beta share**. Mark only that selected row expired in beta D1, verify it is immediately unavailable, then confirm its deletion by the cleanup Worker's successful Cron invocation. Inspect only necessary metadata; do not post source URLs, tokens or workspace data.
7. Check actual 3D Slicer import/export consistency for representative supported objects/coordinates and real iOS/Android memory/GPU behavior. Automated synthetic tests do not close these acceptance gates.

## Rollback and later main release

Keep a known-good beta deployment. For a problem after merge, roll back the **beta Preview's** deployment and revert the merge in a new beta fix PR as needed. Keep the beta D1 database, encryption key and cleanup binding; do not drop tables or copy another tier's database. If recipient access must stop, revoke the affected beta links and verify API denial.

Main remains unchanged during this procedure. A later release needs owner acceptance, a separate `med3dviewer-shares-main` database and main-scoped keys, main build variables, and `npm run deploy:shares:main`. Do not promote test/beta records or passwords. Schema/settings names migrate; existing links and encrypted records do not move between origins/environments automatically.
