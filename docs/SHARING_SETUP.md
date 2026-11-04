# Protected sharing: testing and promotion

This draft adds D1 metadata and a streaming Worker, **not model storage**. Start on the test Worker below. Do not change the existing production Worker or merge the PR to beta until acceptance is reviewed. The ordinary root configuration leaves protected sharing disabled.

The approved test policy is Dropbox-only, one private creator key, read-only recipients, and 180-day links. This first test version accepts externally hosted STL only; normal model viewing still supports other formats. Local custom meshes cannot be included in shared JSON. Large-model reduction is still a feasibility gate, not enabled automatically.

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

Open this database's **Console**. Copy and execute the SQL in [0001_shares.sql](../migrations/0001_shares.sql), then run:

```sql
INSERT INTO share_environment (id, scope) VALUES (1, 'test');
SELECT scope FROM share_environment WHERE id = 1;
```

The result must be `test`. The migration creates empty tables and indexes; it contains no patient data and no model files. If the INSERT reports an existing row, inspect its scope instead of replacing it. A database with a different scope must not be reused.

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

This is the production slot **of the new test Worker**, not production of your existing app. Disable extra preview branches on this test Worker initially. If the first automatic build starts before settings are saved, save them and start a new build; do not repeatedly retry a build with obsolete commands.

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
{"enabled":true}
```

`false` means sharing stays disabled. Verify the binding/UUID, scope row, runtime variables and secret names/lengths. It intentionally does not reveal secrets or database internals. Never turn on production sharing just to troubleshoot test configuration.

### 4. Test the existing Share workflow

Use a synthetic/de-identified **Dropbox STL** first. Load it through the existing URL dialog; wait for ready. Create a distance, angle, point, plane/curve and annotation, transform/group them, then open Share. Enter only `SHARES_CREATE_KEY` and create a protected link.

Open the new `/s/<opaque-token>` address in a fresh browser/device. Confirm the model, annotations and analytic objects restore; copied/QR addresses contain no Dropbox URL. The recipient does not need the creator key. Verify refresh, early revocation, mobile orientation, cancellation and source-unavailable behavior using [TESTING.md](TESTING.md).

The creator key is memory-only and cleared when the dialog closes; shared snapshots are not auto-saved to recipient localStorage. A bearer link can be forwarded. Expiry cannot recall already downloaded/rendered data. The model must remain available at Dropbox; a changed file is rejected before its old workspace is applied, although changed bytes may already have been streamed to the browser.

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
