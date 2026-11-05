# Protected sharing: testing and promotion

This draft adds D1 metadata and a streaming Worker, **not model storage**. Start on the test Worker below. Do not change the existing production Worker or merge the PR to beta until acceptance is reviewed. The ordinary root configuration leaves protected sharing disabled.

The approved test policy is Dropbox-only, one private creator password, separate view/edit links, and a maximum of 180 days from creation. Protected sharing supports self-contained STL, 3MF and GLB files; local custom meshes cannot be included in shared JSON. Editing, per-mesh state, the admin page and the additive D1 upgrade are covered in [EDITABLE_WORKSPACES.md](EDITABLE_WORKSPACES.md). Large-model reduction is still a feasibility gate, not enabled automatically.

## Resource map

| Target | Database | Scope marker | Deployment |
| --- | --- | --- | --- |
| Test PR | `med3dviewer-shares-test` | `test` | Dedicated Worker `ntec3dpo-m3dv-sharing-test` |
| Beta after approval | `med3dviewer-shares-beta` | `beta` | Existing `ntec3dpo-m3dv` Worker Preview for beta |
| Main after release approval | `med3dviewer-shares-main` | `main` | Existing `ntec3dpo-m3dv` production Worker |

Each database gets the same schema, a different UUID, and its own scope row. Both script validation and runtime checks reject a mismatched tier. Do not copy test/beta share rows, encrypted sources, secrets or token URLs into production. Migrate code/schema and settings names; create new shares in each tier.

## Phone/tablet setup for the test PR

### 1. Create only the test database

Cloudflare dashboard → **Storage & databases → D1 → Create database** (labels can vary). Name it `med3dviewer-shares-test`. Copy its **Database ID**, a UUID. The ID is not a secret and may be shared for configuration checking. The owner-provided test ID `5645e9dd-918f-4bbc-a0d6-9e1c315c27ca` is recorded in [config/shares.test.json](../config/shares.test.json). It is used only by the dedicated test target. Beta/main have no database defaults. Do not send any password/API token in chat.

For a new database, open its **Console** and execute [0001_shares.sql](../migrations/0001_shares.sql), followed by [0002_editable_workspaces.sql](../migrations/0002_editable_workspaces.sql), then run:

```sql
INSERT INTO share_environment (id, scope) VALUES (1, 'test');
SELECT scope FROM share_environment WHERE id = 1;
```

The result must be `test`. The migration creates empty tables and indexes; it contains no patient data and no model files. If the INSERT reports an existing row, inspect its scope instead of replacing it. A database with a different scope must not be reused.

For an existing working test database, follow the one-time upgrade and dashboard migration bookkeeping in [EDITABLE_WORKSPACES.md](EDITABLE_WORKSPACES.md); do not recreate the database or insert its scope again.

### 2. Add a separate test Worker connected to the PR branch

Workers & Pages → Create application → import `ajaxlau/Med3DViewer` from GitHub as a **Worker**. Use:

| Setting | Value |
| --- | --- |
| Worker/project name | `ntec3dpo-m3dv-sharing-test` |
| Tracking/production branch of this test Worker | `codex/secure-workspace-preview` |
| Root | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:shares:test` |
| Build variable `NODE_VERSION` | `22` |
| Test database | Committed test profile; no additional database build variables required |

This is the production slot **of the new test Worker**, not production of your existing app. Cloudflare's Git import may add a commit renaming the root `wrangler.jsonc` to the test Worker. Keep that change on this draft test branch only. Before a beta/main merge, restore the root name to `ntec3dpo-m3dv`; the explicit generated test configuration still uses `ntec3dpo-m3dv-sharing-test`. Do not promote a root test-Worker name into the existing service. Disable extra preview branches on this test Worker initially. If the first automatic build starts before settings are saved, save them and start a new build; do not repeatedly retry a build with obsolete commands.

If old `SHARES_DB_NAME`, `SHARES_DB_ID` or `SHARES_RESOURCE_TIER` build variables already exist on this test Worker, they override the profile and must match the test name, UUID and `test` tier above. Remove obsolete overrides instead of copying beta/main values.

The script generates an ignored `.share-config/test.json` declaring the `SHARES_DB` D1 binding, `ASSETS`, `SHARES_ENABLED=true`, `SHARES_ENVIRONMENT=test` and an hourly cleanup schedule. Do not put secrets in this build configuration. After deployment, inspect **Bindings** and verify `SHARES_DB` points to `med3dviewer-shares-test`; the Wrangler-generated configuration is authoritative. A manual dashboard binding alone will not replace this build configuration.

Keep a working Workers Builds deployment token selected. If deployment reports a permission failure, inspect its exact operation; remote CLI database migrations additionally require D1 permissions. The dashboard SQL route above does not require exposing a token to the app or this chat.

### 3. Add two runtime secrets to the test Worker

Test Worker → Settings → **Variables and Secrets → Add → Secret**. Use your device's password manager to generate two **different, random passwords of at least 32 characters** (maximum 256). Save them securely:

| Secret | Purpose |
| --- | --- |
| `SHARES_CREATE_KEY` | Authorizes creation and revocation; enter this in the app Share dialog only when needed. It is a staff-wide test credential, not per-person login. |
| `SHARES_ENCRYPTION_KEY` | Encrypts private Dropbox source references in D1. Never enter it in the viewer. Losing/changing it makes existing encrypted source records unreadable. |

These are application secrets, **not your Cloudflare API/build token**. Do not use `VITE_*`, GitHub source files, D1 SQL or chat to store/generate them. The Worker derives an encryption key from the random secret; existing 64-character hexadecimal keys are also supported.

Anyone holding the current creator key can revoke any share in that environment. Rotating that key does not create individual accounts; all current key holders have staff-wide authority. Keep the encryption secret stable unless records are deliberately migrated or revoked.

Deploy/save the secret changes. Check the test Worker URL shown by Cloudflare, normally `https://ntec3dpo-m3dv-sharing-test.x-panda.workers.dev`. Open `/api/shares/config` on it. Expected result after schema, binding, scope and both secrets are ready:

```json
{"enabled":true,"editingEnabled":true,"formats":["stl","3mf","glb"]}
```

`false` means sharing stays disabled. Verify the binding/UUID, scope row, runtime variables and secret names/lengths. It intentionally does not reveal secrets or database internals. Never turn on production sharing just to troubleshoot test configuration.

### Successful deployment but no visible URL

The dedicated test configuration explicitly sets `workers_dev=true`. Deploy the latest PR commit so that setting takes effect. In **Workers & Pages → ntec3dpo-m3dv-sharing-test → Domains**, check the `workers.dev` entry and select **Enable** if it is disabled. Older dashboard layouts place this under **Settings → Domains & Routes**. No custom domain or DNS record is needed for this test address.

With the existing account subdomain, expect `https://ntec3dpo-m3dv-sharing-test.x-panda.workers.dev/`. Copy the actual URL shown on the Domains tab and append `/api/shares/config`. A response of `{"enabled":false}` means the HTTP address works but the D1 scope/binding or runtime secrets still need checking; a missing address is a separate routing/deployment issue. Check the latest deployment log for **Deployed** and the printed URL, rather than treating a successful build or version upload alone as a public deployment.

This flag is added only to the dedicated test target. Beta/main routing configuration is preserved. [Cloudflare Domains tab](https://developers.cloudflare.com/changelog/post/2026-05-14-domains-tab/)

### Viewer appears instead of JSON at the API address

The PWA must not serve its offline app shell for `/api` navigation requests. The build now excludes API paths from Workbox's navigation fallback. Deploy the latest PR commit, then test the endpoint in a **new Private/Incognito window** to avoid an older installed service worker. No database reinitialization is needed for this routing fix.

If a fresh private window shows JSON, the address/backend route is reachable. `{"enabled":false}` then means the binding/scope/runtime variables or secrets still need checking. If the app page still appears even in a fresh private window, inspect the deployed commit and confirm the deploy command is `npm run deploy:shares:test`, with a Worker entry point and `assets.run_worker_first` covering `/api/shares/*`. Do not treat an HTML app-shell response as a database or secret failure.

### Build fails with `EMFILE: too many open files`

This error means bundling exceeded the build machine's file-descriptor limit, for example while reading the Lucide icon modules. Vite's Rollup configuration limits parallel file operations to 32. CI builds the complete app and PWA with a 256-file soft limit to guard against this failure. Keep the Cloudflare build command `npm run build:cloudflare`; the limit is in the repository configuration and requires no dashboard variable or database changes.

### 4. Test the existing Share workflow

Use a synthetic/de-identified **Dropbox STL, 3MF or GLB**. Load it through the existing URL dialog; wait for ready. Set mesh visibility/opacity, create analytic objects and annotations, transform/group them, then open Share. Enter only `SHARES_CREATE_KEY` and create a protected view link.

Open the new `/s/<opaque-token>` address in a fresh browser/device. Confirm meshes, visibility, opacity, annotations and analytic objects restore; copied/QR addresses contain no Dropbox URL. View recipients cannot save to D1. Use **Authorize sharing an edit link…**, enter the creator password again, then test explicit Save, conflicts and the admin page as described in [EDITABLE_WORKSPACES.md](EDITABLE_WORKSPACES.md). Verify refresh, early revocation, mobile orientation, cancellation and source-unavailable behavior using [TESTING.md](TESTING.md).

The creator key is memory-only and cleared when the dialog closes; shared snapshots are not auto-saved to recipient localStorage. A bearer link can be forwarded. Expiry cannot recall already downloaded/rendered data. The model must remain available at Dropbox; a changed file is rejected before its old workspace is applied, although changed bytes may already have been streamed to the browser.

### Dropbox downloads but the protected link fails

The Worker uses `cache: 'no-store'` alone for source downloads. Combining it with `cf.cacheTtl: 0` makes the Workers runtime throw before contacting Dropbox, producing `SOURCE_FETCH_FAILED` even when the file is available. An offline workerd regression now exercises the actual download handler with GET, HEAD, Range and redirects. Run it locally with `node scripts/test-worker-runtime.mjs`; CI runs it too. This fix needs no D1 migration or secret changes.

The Worker follows Dropbox's documented `/s/dl` and `/s/raw` redirects on Dropbox-owned HTTPS hosts, plus its approved download-content hosts. Each redirect is checked before fetching; login pages, unrelated hosts, credentials and non-default ports are rejected. No recipient cookies or creator credentials are forwarded to Dropbox. See [Dropbox's download-redirect documentation](https://help.dropbox.com/share/force-download).

The viewer shows a fixed diagnostic code instead of exposing Dropbox's response, source address or access parameters. After the latest test deployment, reopen the protected link in a new Private/Incognito window. If it fails, report only the displayed error code and message:

| Code | Check |
| --- | --- |
| `SOURCE_REDIRECT_UNSUPPORTED` | A redirect fell outside the approved Dropbox download routes or exceeded the redirect limit. Report the code; do not post its private target URL. |
| `SOURCE_ACCESS_DENIED` / `SOURCE_NOT_FOUND` | Dropbox rejected the server request or could not find the file. Verify the original file's sharing permissions; a browser download may use a signed-in Dropbox session that the Worker does not have. |
| `SOURCE_FORMAT` | Dropbox returned a web page/unsupported content rather than the model. Check the source link's sharing permissions. |
| `SOURCE_RATE_LIMITED` / `SOURCE_TIMEOUT` / `SOURCE_FETCH_FAILED` | Retry later; Dropbox or the server download path is temporarily unavailable. |
| `SOURCE_DECRYPTION_FAILED` | The saved source cannot be decrypted, for example after an encryption-secret change. Keep the current secret stable and create a new disposable test link; do not reset D1 or post secret values. |

`/api/shares/config` returning `true` checks configuration readiness; it does not prove that an older record remains decryptable or that Dropbox permits a server download. An existing link needs no recreation for the redirect fix when its encryption secret is unchanged.

### 5. Check cleanup without waiting 180 days

Use **only a disposable synthetic test share**. In the test D1 console, inspect recent timestamps and hashes without exposing source references or workspace content:

```sql
SELECT token_hash, created_at, expires_at, revoked_at FROM shares ORDER BY created_at DESC LIMIT 5;
```

After choosing the exact disposable row, use its hash in this bounded test-only statement:

```sql
UPDATE shares SET expires_at = 0 WHERE token_hash = 'EXACT_DISPOSABLE_TEST_ROW_HASH';
```

The corresponding workspace **and model** endpoints must immediately become unavailable. The scheduled cleanup at minute 17 UTC each hour removes expired/revoked rows in bounded batches. Inspect its invocation in Cloudflare and confirm the selected row is gone. Access expiry does not depend on this job completing.

Do not promise immediate backup erasure: D1 recovery history is separately retained (currently 7 days Free / 30 days Paid). After a database restore, reconcile revocations or invalidate affected tokens before reopening shares.

## Optional terminal commands

Use Node 22, `npm ci`, and authenticated Wrangler on your own machine. These commands target the selected test database, not production:

```sh
export SHARES_DB_NAME=med3dviewer-shares-test
export SHARES_DB_ID=5645e9dd-918f-4bbc-a0d6-9e1c315c27ca
export SHARES_RESOURCE_TIER=test
npm run configure:shares -- test configure
node node_modules/wrangler/bin/wrangler.js d1 migrations apply SHARES_DB --remote --config .share-config/test.json
```

Initialize the scope via the dashboard SQL above. After building, `npm run check:shares:test` validates packaging without publishing; `npm run deploy:shares:test` publishes the dedicated test Worker. Never run a `migrate` or deploy command against a database whose UUID/tier has not been checked.

## Promotion to beta (requires test review)

1. Create `med3dviewer-shares-beta`, apply the same migration, and initialize `share_environment` with `beta`. Keep test rows in test.
2. Set the existing Worker's **beta Preview build variables** to this beta database name/UUID and `SHARES_RESOURCE_TIER=beta`; keep `NODE_VERSION=22` and `npm run build:cloudflare`. Use Preview command `npm run preview:shares:beta`. Do not change Production deploy settings.
3. Generated `.share-config/beta.json` explicitly repeats D1 and runtime variables under `previews`, because Worker Previews do not inherit these top-level bindings. Its top-level D1 declaration exists for migrations only. Verify the active Preview binding before opening a share.
4. Set separate secrets on the **existing beta Preview**. Base secret changes affect new Previews only. If the phone dashboard does not expose the individual Preview's secret editor, use a trusted terminal rather than pasting secrets in chat:

```sh
# First set beta's three non-secret build variables locally and generate config:
npm run configure:shares -- beta configure
npx wrangler preview secret put SHARES_CREATE_KEY --name beta --config .share-config/beta.json
npx wrangler preview secret put SHARES_ENCRYPTION_KEY --name beta --config .share-config/beta.json
```

5. Worker Previews do not run Cron Triggers. Deploy a scheduled-only beta cleanup Worker with the beta binding: `node scripts/share-cloudflare.mjs beta cleanup`. It is named `ntec3dpo-m3dv-sharing-beta-cleanup`, has no public cleanup API or creator/encryption secrets, and rejects a non-beta scope. On a phone, create this separate Worker through the GitHub import flow: same repository and reviewed beta branch, build `npm run build:cloudflare`, deploy `node scripts/share-cloudflare.mjs beta cleanup`, and the three **beta** build variables from step 2. No runtime secrets are required for cleanup. Do not skip cleanup and call beta retention complete.
6. Merge the tested PR into beta only after approval. Run the complete preview acceptance matrix again. Retain the known-good prior deployment for rollback.

## Promotion to main (separate release approval)

Create `med3dviewer-shares-main` and initialize its scope with `main`, using the same migration. Set Production build variables to the main name/UUID and `SHARES_RESOURCE_TIER=main`; set Production runtime secrets separately. The production deploy command becomes `npm run deploy:shares:main`. The ordinary build command stays unchanged. Production's generated configuration includes its own cleanup Cron Trigger.

Promote reviewed code through a release PR; do not copy generated test configs, test rows or keys. Check `/api/shares/config`, opaque-link creation/open/revocation, model and JSON expiry, scheduled deletion, assets and existing Analytic Tools on the live production URL. Main share links then use `https://ntec3dpo-m3dv.x-panda.workers.dev/s/...`.

Until this explicit promotion, `npm run deploy:cloudflare` retains sharing disabled and requires no database. If sharing is already enabled and needs an emergency stop, disable it at runtime and verify both APIs reject reads. Keep the cleanup schedule/database binding available until expired data is removed. Roll back UI/code without dropping or overwriting database tables.

References checked 4 November 2026: [Preview binding isolation](https://developers.cloudflare.com/workers/previews/resources/), [Preview variables/secrets and Cron limitations](https://developers.cloudflare.com/workers/previews/configuration/), [D1 limits/backup retention](https://developers.cloudflare.com/d1/platform/limits/).
