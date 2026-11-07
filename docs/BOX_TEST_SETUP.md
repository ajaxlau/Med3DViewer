# Isolated Box workflow test setup

> Superseded for the active test: the owner switched to Dropbox personal. Follow [Dropbox workflow plan](DROPBOX_WORKFLOW_PLAN.md) and [Dropbox setup/test guide](DROPBOX_TEST_SETUP.md). Retain the existing test Worker/D1/scope; these Box-specific instructions are historical.


**OAuth connection checkpoint:** after baseline setup, follow [Connect the Box test account](BOX_CONNECTION_TESTING.md) for migration 0005, runtime secrets, the exact callback and administrator connection. The earlier steps below document the original baseline checkpoint.

Branch: `codex/box-workspace-upload-preview`, draft PR #13, targeting beta.

This checkpoint deploys the existing viewer/sharing backend with an isolated database and hourly cleanup. **Box OAuth, model uploads and model-aware revisions are not implemented at this checkpoint.** An enabled sharing API confirms only the existing backend. Follow the [workflow plan](BOX_WORKFLOW_PLAN.md) for the remaining implementation phases. Do not merge to beta/main for this setup.

## 1. Create only the new database first

On your phone/tablet, open Cloudflare → Storage & databases → D1 → Create database:

- Name: **`med3dviewer-shares-box-test`**.
- Leave it empty. Do not copy or change the test/beta databases.
- Record its Database ID (UUID). This ID is safe to share with the developer; passwords and tokens are not.

Owner-confirmed database ID: `4d01c6ac-bcf3-4b71-8448-c5d8b8956a34` (recorded in `config/shares.box-test.json`). The script refuses the existing test/beta UUIDs and prevents those environments from using this Box-test database. This database has separate administrator/sharing accounts; existing passwords are not copied.

## 2. Prepare a browser terminal

Use a fresh GitHub Codespace on the new branch (repository → Code → Codespaces → New with options → select `codex/box-workspace-upload-preview`). Use Node 22. In a fresh Codespace, verify the branch and install dependencies:

```bash
git branch --show-current
npm ci
```

The branch must print `codex/box-workspace-upload-preview`. Keep any existing Codespace with uncommitted work unchanged.

Generate the configuration using the recorded database UUID:

```bash
node scripts/share-cloudflare.mjs box-test configure
```

This generates `.share-config/box-test.json`. It declares:

| Setting | Value |
| --- | --- |
| Worker name | `ntec3dpo-m3dv-box-test` |
| Runtime code | `worker/entry.ts` |
| Assets | `dist`, binding `ASSETS` |
| D1 binding | `SHARES_DB` → the new UUID |
| Runtime scope | `SHARES_ENVIRONMENT=box-test` |
| Cleanup | Cron `17 * * * *` on this Worker |

There is no additional Box-test cleanup Worker. Keep the existing beta cleanup Worker.

## 3. Authenticate Cloudflare privately

Use a temporary Cloudflare API token authorized for this account: Workers Scripts Edit, Workers Routes Edit and D1 Edit. Follow organizational approval rules. Set the token only in Codespaces, never GitHub source or chat.

Run this single line, then paste the token at its hidden prompt:

```bash
read -rsp 'Temporary Cloudflare API token: ' CLOUDFLARE_API_TOKEN; export CLOUDFLARE_API_TOKEN
```

After the prompt finishes, run these separately:

```bash
export CLOUDFLARE_ACCOUNT_ID=9653dc93bd5d739089edd92b89aded14
```

```bash
npx wrangler whoami
```

Verify the intended account. Do not paste token values in screenshots. If authorization fails, stop and report only the error text.

## 4. Initialize the new empty database

Run migrations through the generated configuration:

```bash
node scripts/share-cloudflare.mjs box-test migrate
```

Confirm the displayed target is `med3dviewer-shares-box-test`. Wrangler tracks applied migrations. Migration 0004 adds the `box-test` scope and advances the schema marker to 4; it does not implement Box storage. Do not paste old migration SQL repeatedly into a populated database.

Initialize the environment marker:

```bash
npx wrangler d1 execute SHARES_DB --remote --config .share-config/box-test.json --command "INSERT INTO share_environment(id,scope) VALUES(1,'box-test') ON CONFLICT(id) DO NOTHING;"
```

Verify with a separate command:

```bash
npx wrangler d1 execute SHARES_DB --remote --config .share-config/box-test.json --command "SELECT (SELECT scope FROM share_environment WHERE id=1) AS environment,(SELECT version FROM share_schema_version WHERE id=1) AS schema_version,(SELECT COUNT(*) FROM shares) AS shares,(SELECT COUNT(*) FROM share_users) AS users;"
```

For a new database expect **`box-test | 4 | 0 | 0`**. If the scope differs, stop; do not overwrite it. These commands also work in D1 Console by copying only the SQL inside the `--command` quotes and executing each separately.

## 5. Build and create the Worker

```bash
npm run lint
npm test
npm run build:cloudflare
node scripts/share-cloudflare.mjs box-test check
node scripts/share-cloudflare.mjs box-test deploy
```

The final command creates/deploys the regular Worker `ntec3dpo-m3dv-box-test`, its D1 binding and hourly Cron. Check the Worker name before approving any Wrangler prompt. It does not replace the main Worker or beta Preview.

Expected address after successful deployment (if the account's existing subdomain remains enabled):

`https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/`

If no address appears, open this **new Worker** → Settings → Domains & Routes and enable its `workers.dev` address. Do not create an unrelated static-assets-only Worker or reuse the old test Worker.

## 6. Set this Worker's two runtime secrets

Generate and keep **two different random 32–256-character values** in your password manager. Use new test-only values, separate from beta/main. The first is the test administrator password; the second is an encryption secret, not a login password.

Execute each command separately; Wrangler privately prompts for its value:

```bash
npx wrangler secret put SHARES_CREATE_KEY --config .share-config/box-test.json
```

```bash
npx wrangler secret put SHARES_ENCRYPTION_KEY --config .share-config/box-test.json
```

Alternatively, after the backend is deployed, use this regular Worker's Settings → Variables and Secrets → Add → Secret. These are **runtime secrets**, not build variables. Never commit them or send them in chat. Preserve the encryption key once data exists.

## 7. Verify the baseline before Box integration

Open in a new private browser tab:

`https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/api/shares/config`

Expect JSON with `enabled: true`, `editingEnabled: true`, and `historyEnabled: true`. If it shows the viewer, use a private tab to exclude an old service worker; verify deployed config routes `/api/shares/*` to the Worker before assets.

Open `/admin/shares` on that host. Log in with this test Worker's `SHARES_CREATE_KEY`, then create a test Sharing user with a different password. The application login uses that Sharing user's credentials. Test with synthetic/non-sensitive models and metadata.

Check Cloudflare → this Worker → Settings → Bindings for the correct D1 UUID; check Cron `17 * * * *`. Actual scheduled cleanup still needs a disposable expired-record acceptance test; configuration alone does not prove the job ran.

After terminal setup, unset the temporary token and revoke it if no longer needed:

```bash
unset CLOUDFLARE_API_TOKEN
```

## 8. Optional automatic Git builds after initial setup

After verifying the manual deployment, connect this existing new Worker to `ajaxlau/Med3DViewer`. Use these settings:

| Field | Value |
| --- | --- |
| Production/tracking branch for this test Worker | `codex/box-workspace-upload-preview` |
| Root | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `node scripts/share-cloudflare.mjs box-test deploy` |
| Build variable `SHARES_DB_ID` | `4d01c6ac-bcf3-4b71-8448-c5d8b8956a34` (optional override; already recorded) |

The script supplies the Box-test database name and tier. Keep branch Preview builds disabled for this dedicated test Worker; its publishing branch guard rejects other branches. Use Cloudflare's managed build token with the required Worker permissions. Do not copy an old `preview:cloudflare` command or use `wrangler preview` here. A build variable does not replace the runtime secrets or the D1 binding.

## 9. Box setup gate

While the backend is being implemented, prepare a dedicated disposable folder in the department-managed Box account and confirm you can create/authorize a Box application. Do not enter the Box account password into the viewer/admin page. The future connection will redirect to Box's official authorization page.

The exact OAuth callback, required application scopes and encrypted token-storage migration will be provided with the Box connection implementation. Do not invent callback URLs or create public Box sharing links. A Box developer token is not a permanent department connection. Existing Dropbox handling remains the only storage reader at this checkpoint.


## Confirmed Box application and folder

Owner-confirmed test folder ID: **`435218173835`**, expected account path `https://app.box.com/folder/435218173835`.

The owner is using a personal Box account for initial testing and has created the `Med3DViewer Box Test` OAuth/User application. Console screenshots show both content read and write scopes selected. Administrative/developer privileges and the as-user setting are not required for this workflow. This records configuration evidence; it does not establish successful API access.

The folder is the proposed upload destination, not permission to expose its entire contents to workspace recipients. The connection implementation must verify the authorized account's folder access and enforce workspace/file membership server-side. Do not make the folder public or migrate this personal-account folder ID into beta/main automatically.

Client credentials remain private. The OAuth callback and token-storage backend are still pending; the current `https://app.box.com` redirect entry is not the final application callback. Do not attempt connection or use a temporary developer token as a permanent connection yet.

Implementation references: [Box OAuth without SDKs](https://developer.box.com/guides/authentication/oauth2/without-sdk) and [refresh-token rotation](https://developer.box.com/guides/authentication/tokens/refresh). Box refresh tokens expire after inactivity and rotate on use; implementation must coordinate refreshes and maintain/reconnect the connection before expiry rather than assume a workspace's 180-day lifetime keeps Box authorization valid.
