# Dropbox personal setup and first test run

This is the active provider guide, replacing Box setup. Use draft PR #13 on `codex/box-workspace-upload-preview`. Keep the existing Worker `ntec3dpo-m3dv-box-test` and D1 `med3dviewer-shares-box-test` (`4d01c6ac-bcf3-4b71-8448-c5d8b8956a34`). The old names are intentional; do not recreate/rename the database or change its `box-test` marker.

This checkpoint supports administrator Dropbox connection and a small diagnostic upload/download. **The viewer's general STL/3MF upload interface and model-bound revisions are still pending.** Existing Dropbox-link sharing remains available.

## 1. Create a Dropbox API app

Sign in to the personal account intended for testing and open [Dropbox App Console](https://www.dropbox.com/developers/apps). Create an app:

| Option | Selection |
| --- | --- |
| API | Scoped access |
| Access type | **App folder** |
| App name | A unique name such as `Med3DViewer-Workspace-Test-YourSuffix` |

Do not choose Full Dropbox. No Dropbox Business team account or separate Box-style Developer account is needed for this account API workflow. Dropbox creates the dedicated folder under `Apps/<app-folder-name>`; no numeric folder ID is required. Do not create public sharing links.

In **Permissions**, select these scopes and save changes:

- `account_info.read`
- `files.metadata.read`
- `files.content.read`
- `files.content.write`

In **Settings → OAuth 2 → Redirect URIs**, add this exact address, click **Add** if shown, and save:

```text
https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/api/shares/dropbox/callback
```

Reload the Settings page to verify it remains saved. Do not paste the former Box callback. Leave implicit/public-client access off for this confidential server-side flow if that setting is shown. Do not generate/use a short-lived manual access token as the persistent connection.

Keep the **App key** and **App secret** private. A development app connected to its owning account is sufficient for this initial single-account test; additional linked accounts/general distribution require review of Dropbox's production rules. Recipients of platform workspace links are not individually connecting Dropbox accounts.

## 2. Update the existing test Codespace

In the same Codespace used for the test Worker:

```bash
git branch --show-current
git status --short
```

Expect `codex/box-workspace-upload-preview` and a clean worktree. Preserve local changes if present; do not reset them. Then:

```bash
git pull --ff-only
npm ci
node scripts/share-cloudflare.mjs box-test configure
```

The generated profile now sets `BOX_ENABLED=false`, `DROPBOX_ENABLED=true`, the existing test origin and the empty logical path representing the app root. Do not manually enable both providers. It does not change the physical database or sharing keys.

## 3. Authenticate Cloudflare privately if needed

Use a valid temporary Cloudflare API token with D1 Edit and Workers Scripts Edit permissions for the intended account. If Codespaces browser login times out, run this single command, paste only the token at the hidden prompt, and press Enter:

```bash
read -rsp 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN
```

After the ordinary prompt returns, run:

```bash
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID=9653dc93bd5d739089edd92b89aded14
```

Do not paste additional commands into the hidden token prompt. No token belongs in chat, source, screenshots or command-line arguments.

## 4. Apply migration 0006 and deploy

```bash
node scripts/share-cloudflare.mjs box-test migrate
```

Verify the database is `med3dviewer-shares-box-test`. Wrangler applies outstanding migrations, including 0005 if it was never applied, before 0006. Do not remove/rewrite old migrations, copy Box tokens into Dropbox tables, or run SQL manually repeatedly.

In D1 Console, run this verification query separately:

```sql
SELECT
 (SELECT scope FROM share_environment WHERE id=1) AS environment,
 (SELECT version FROM share_schema_version WHERE id=1) AS schema_version;
```

Expected: **`box-test | 6`**. Stop if the scope differs. Then deploy from Codespaces:

```bash
npm run lint
npm test
npm run build:cloudflare
node scripts/share-cloudflare.mjs box-test check
node scripts/share-cloudflare.mjs box-test deploy
```

The existing test URL remains the same. No new Worker, cleanup Worker or database is required. The existing hourly Cron also expires OAuth state and maintains offline authorization. Actual scheduled execution still needs independent live acceptance.

## 5. Add three Dropbox runtime secrets

Keep `SHARES_CREATE_KEY` and `SHARES_ENCRYPTION_KEY` unchanged. In this test Worker's runtime Secrets editor, add:

| Secret | Value |
| --- | --- |
| `DROPBOX_APP_KEY` | App key from Dropbox App Console |
| `DROPBOX_APP_SECRET` | App secret from the same Dropbox app |
| `DROPBOX_CREDENTIALS_KEY` | A new random 32–256-character password-manager value, different from sharing secrets; retain it securely |

Or run each command individually and enter the value at its private prompt:

```bash
npx wrangler secret put DROPBOX_APP_KEY --config .share-config/box-test.json
```

```bash
npx wrangler secret put DROPBOX_APP_SECRET --config .share-config/box-test.json
```

```bash
npx wrangler secret put DROPBOX_CREDENTIALS_KEY --config .share-config/box-test.json
```

Box secrets may remain unused during the switch; do not reuse them as Dropbox credentials. Once the Dropbox flow is accepted, obsolete Box secrets/app grants can be removed separately. Do not rotate the existing sharing encryption key or reset D1 to fix provider authentication.

## 6. First live test

1. In a new private browser tab, open [the test administrator page](https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/admin/shares).
2. Unlock with the existing test administrator password.
3. Find **Dropbox connection**, then click **Connect Dropbox**.
4. Sign in on Dropbox's official site with the test account and grant the requested permissions.
5. After returning, unlock the manager again. Expect **connected** and the account name. The callback removes the authorization code from the final browser address; never share a callback URL or token.
6. Click **Test connection**. Expect **Dropbox account and app-folder metadata access verified.**
7. Click **Test upload/download**. This explicitly creates a small randomly named text file in the app folder, verifies its bytes by downloading it, and removes only that diagnostic file. Expect **Dropbox upload, download and test-file cleanup passed.**
8. Confirm existing Dropbox model/workspace links still open and their revisions save correctly, as in the earlier baseline acceptance. This does not mean a new model-upload feature is available yet.

Report `connected / metadata passed / transfer passed`, or the first visible error. Do not send your app secret, refresh token, account password, credential key or OAuth URL.

## 7. Reset and failure checks

- Wrong scopes: select/save the four scopes, then start a fresh Connect action; existing tokens do not gain new permissions automatically.
- Redirect mismatch: compare the exact saved Dropbox URI above with the deployed provider's callback. Start from Connect Dropbox again after correcting it.
- Expired/reused callback: restart authorization from the admin page; do not refresh the old callback URL.
- Metadata passed but transfer failed: scope or storage/quota/API issues may still prevent file operations. Report the visible error. If cleanup failed, remove only the small `med3dviewer-connection-test-*.txt` diagnostic file in the app folder; never remove models to debug the connection.
- Disconnect removes stored Dropbox tokens locally, invalidates pending callbacks/refreshes and retains the account pin. It does not delete model files or revoke the app grant on Dropbox's side. Reconnect the same account for this test. A controlled account reassignment needs a separate migration/review.
- Once terminal setup is complete, `unset CLOUDFLARE_API_TOKEN` and revoke the temporary token if no longer needed. Keep the permanent runtime app/encryption secrets.

The 180-day expiry belongs to the platform workspace, not the provider token. Provider revocation, deleted files or account/storage restrictions can still make models unavailable. [Dropbox OAuth](https://developers.dropbox.com/oauth-guide) and [App folder permissions](https://www.dropbox.com/developers/reference/developer-guide).


## Authorization failure diagnostics (no additional migration)

The reconnect message alone does not identify the failure. Update this branch and deploy the current artifact to show a fixed diagnostic stage/code. Keep schema 6 and all existing secrets unchanged while diagnosing. From the existing authenticated Codespaces terminal:

```bash
git pull --ff-only
npm run build:cloudflare
node scripts/share-cloudflare.mjs box-test deploy
```

Start a new Connect Dropbox attempt; an old failure URL cannot acquire a new diagnosis retroactively. The final administrator page displays only fixed stage/code labels, not provider descriptions, tokens or authorization codes. Report only that red diagnostic line.

- `DROPBOX_CLIENT_REJECTED`: privately verify App key and App secret are from the same Dropbox app and were saved as runtime secrets without extra whitespace.
- `DROPBOX_GRANT_REJECTED`: restart Connect Dropbox; do not reuse an earlier callback/code. Check the exact registered redirect URI.
- `DROPBOX_SCOPE_REQUIRED`: enable/save the four required permissions and reconnect. An explicitly reduced scope is rejected. A valid OAuth response may omit the scope field when unchanged, which is now accepted per [RFC 6749 section 5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1).
- `DROPBOX_HTTP_400`, `DROPBOX_HTTP_401`, or similar: report the accompanying fixed stage (token exchange/account check/app-folder check). Do not paste raw provider responses.
- `DROPBOX_INTERNAL_FAILED` at saving the connection: report the label; do not reset D1 or rotate working sharing keys.

An example diagnostic is `Dropbox authorization failed at token exchange (DROPBOX_CLIENT_REJECTED).` This is illustrative, not a diagnosis of the owner's original failure. Live provider access has not been independently confirmed.
