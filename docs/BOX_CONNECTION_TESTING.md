# Connect the Box test account

> Superseded for the active test: the owner switched to Dropbox personal. Follow [Dropbox workflow plan](DROPBOX_WORKFLOW_PLAN.md) and [Dropbox setup/test guide](DROPBOX_TEST_SETUP.md). Retain the existing test Worker/D1/scope; these Box-specific instructions are historical.


**Account requirement:** read the account correction below before continuing if you use a free personal/Individual account.

This checkpoint adds administrator OAuth connection, read/upload-folder permission checks, encrypted tokens, refresh coordination and scheduled connection upkeep. **Model uploads and model-aware workspace revisions are still pending.** Use only draft PR #13's branch and the existing isolated Box-test Worker/database.

## 1. Update the test Codespace

In the same Codespace used for Box-test setup, check:

```bash
git branch --show-current
git status --short
```

The branch must be `codex/box-workspace-upload-preview`; if there are local changes, preserve them and stop before updating. With a clean branch:

```bash
git pull --ff-only
npm ci
node scripts/share-cloudflare.mjs box-test configure
```

Authenticate Cloudflare privately again if your temporary token has expired or was unset. Follow [Box test setup step 3](BOX_TEST_SETUP.md#3-authenticate-cloudflare-privately); never paste tokens in chat.

## 2. Apply the new migration and deploy

```bash
node scripts/share-cloudflare.mjs box-test migrate
```

Confirm the target is `med3dviewer-shares-box-test`. Wrangler applies only unapplied migrations. Migration 0005 creates `box_connection` and `box_oauth_states`, storing metadata/encrypted credentials, and advances the schema marker to 5. Existing shares/users and the environment marker are retained.

Verify separately:

```bash
npx wrangler d1 execute SHARES_DB --remote --config .share-config/box-test.json --command "SELECT (SELECT scope FROM share_environment WHERE id=1) AS environment,(SELECT version FROM share_schema_version WHERE id=1) AS schema_version;"
```

Expected: **`box-test | 5`**. Then deploy:

```bash
npm run build:cloudflare
node scripts/share-cloudflare.mjs box-test deploy
```

Generated runtime variables enable Box only on this test scope, pin the test origin and select folder `435218173835`. Existing beta/main/test profiles do not enable Box. The application's API routes already send `/api/shares/*` to the Worker before static assets.

## 3. Set three runtime secrets on the Box-test Worker

Keep the existing `SHARES_CREATE_KEY` and `SHARES_ENCRYPTION_KEY` unchanged. Run each command individually and paste its value only into Wrangler's private prompt:

```bash
npx wrangler secret put BOX_CLIENT_ID --config .share-config/box-test.json
```

Value: Client ID from the Box application's Configuration page.

```bash
npx wrangler secret put BOX_CLIENT_SECRET --config .share-config/box-test.json
```

Value: Client Secret from that same Box application. Do not use its temporary Developer Token.

```bash
npx wrangler secret put BOX_CREDENTIALS_KEY --config .share-config/box-test.json
```

Value: a new password-manager-generated random 32–256-character secret, different from both existing sharing secrets. Keep it permanently with this test environment; replacing it requires Box reconnection. It encrypts provider tokens, not model files.

The Cloudflare dashboard's runtime Secret editor is also suitable for this regular Worker. These are not GitHub secrets or build variables. No value should appear in chat, source, screenshots or shell arguments.

## 4. Configure the Box application

In Box Developer Console → `Med3DViewer Box Test` → Configuration:

- Authentication: User / OAuth 2.0.
- Keep content read and write scopes selected. Leave administrative/developer scopes and the as-user option off.
- Replace the placeholder `https://app.box.com` redirect with exactly:

```text
https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/api/shares/box/callback
```

- Keep CORS Allowed Origins empty for this Worker relay design.
- Save configuration. Keep the folder private; no public Box link is needed.

Do not open the callback address manually to start authorization: it requires a short-lived browser-bound state created by the administrator action.

## 5. Connect and verify

1. Open `https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/admin/shares` in a new private tab.
2. Unlock with this Worker's existing administrator password, not a Sharing user's password.
3. Find **Box connection**. If it says setup is incomplete, check migration 0005, runtime secrets and the latest deployment/profile.
4. Click **Connect Box**. This navigates to Box's official authorization page.
5. Sign in to the personal account that owns/has read/upload access to test folder `435218173835`, and grant access.
6. Box returns to the administrator page. Unlock the manager again: its admin password was deliberately held only in page memory.
7. Expect status **connected**, the authorized account name and folder name. Click **Test connection**; expect **Box account and folder access verified.**

The connection checks both download and upload folder permissions without creating or downloading a model. This does not prove actual model upload/streaming, which belongs to the next implementation phase. Recipient APIs never expose Box tokens, account listings or this admin metadata.

The first successful account is pinned for this test environment. A different account is rejected on reconnection to avoid silently changing historical model access. A controlled account migration/reset procedure is a separate implementation task; disconnect is not account reassignment. Changing the initial folder currently requires updating the deployment profile and reconnecting, rather than an administrator folder browser.

## 6. Failure/reset checks

- Declining Box consent should return an authorization-failed message; it must not create a connected state.
- An expired or reused callback should fail. Restart with **Connect Box**, rather than retrying the callback URL.
- **Disconnect… → Confirm disconnect** removes stored credentials locally, invalidates pending callbacks and stops platform access. It does not delete Box files, workspace history or revoke the application grant inside Box. To remove the grant itself, use Box's account security/application settings.
- Reconnect the same account and run **Test connection** again.
- A lost/ambiguous token refresh requires reconnection; the platform does not retry a potentially consumed single-use refresh token.

The existing hourly Cron performs connection upkeep, attempting rotation at a ten-day interval to avoid Box refresh-token inactivity expiry. Provider errors and crashes can still require administrator reconnection. Actual live Cron behavior must be verified independently; a configured schedule or a unit test is not proof of scheduled execution.

Report only **connected / test passed**, or the visible error text. Never share a full OAuth callback URL, authorization code, client secret, token or encryption key.

## Account prerequisite — correction after live console testing

A standard free personal/Individual Box account can display the Developer Console but cannot necessarily save OAuth redirect settings. The owner encountered “Some changes on the Configuration Page could not be saved,” followed by `redirect_uri_mismatch`. Box staff document this exact account-type restriction in [the configuration-save support thread](https://community.box.com/sdks-and-tools-7/box-developers-page-can-t-save-any-configuration-35195). Access to the console alone is not proof of full developer eligibility.

For isolated testing, use a separate [free Box Developer account](https://app.box.com/signup/developer), with an email not already associated with Box, following [Box's Developer account guide](https://community.box.com/developer-experience-12/how-to-get-a-box-developer-account-free-developer-plan-35161). Use a private window to avoid reusing the personal-account session. Create a new User/OAuth application there; apps cannot be transferred between these account contexts. Verify that saving the exact callback survives a page reload before attempting authorization.

For the simplest initial test, create a disposable model folder in the Developer account and give the developer only its folder ID. The current configured folder `435218173835` belongs to the personal-account setup; do not assume the new account can access it. Update/review the test deployment profile before switching folders. Replace only `BOX_CLIENT_ID` and `BOX_CLIENT_SECRET` with the new application's credentials privately; preserve all sharing secrets and `BOX_CREDENTIALS_KEY`. Do not delete/reset D1 or change beta/main. No successful OAuth connection/account pin has been reported yet; check before attempting any reassignment.

The personal account and its existing folder need not be deleted. Developer account creation is an owner task; no account or paid subscription is created by the agent. If a verified Developer account still cannot save configuration, escalate the visible error to Box support rather than changing the callback to bypass validation.
