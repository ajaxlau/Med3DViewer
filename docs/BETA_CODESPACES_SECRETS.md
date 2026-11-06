# Set beta Preview secrets from a browser terminal

The beta backend is deployed, but the owner still sees an assets-only restriction in Cloudflare's secret editor. Do not change Production or Previews Base to work around it. Use the supported per-Preview Wrangler command instead. This procedure keeps the existing beta URL and database.

## 1. Open a private Codespace on beta

Open [GitHub Codespaces creation](https://github.com/codespaces/new), choose repository **ajaxlau/Med3DViewer** and branch **beta**, then create the Codespace in the browser. On a phone/tablet, Request Desktop Website may make the controls easier to use. Open **Terminal → New Terminal** from the editor's menu.

Run commands **one at a time**. Finish any password/token prompt before pasting the next command. Do not use the lightweight github.dev editor: this procedure needs a Codespaces terminal.

```sh
git branch --show-current
```

Require `beta`. In the repository terminal, run:

```sh
nvm install 22
```

```sh
nvm use 22
```

```sh
npm ci
```

```sh
npm run configure:shares -- beta configure
```

The last command creates an ignored, non-secret `.share-config/beta.json`. Its Worker is `ntec3dpo-m3dv` and database is `med3dviewer-shares-beta` (`d23f95bc-a6a2-4f43-9fa9-5afaa340f325`). No application source or database migration is changed.

## 2. Authenticate privately

For a browser-hosted terminal, API-token authentication avoids a local-browser OAuth callback. In a separate Cloudflare tab, use **My Profile → API Tokens → Create Token → Edit Cloudflare Workers**. Create a **separate temporary token** limited to the account containing `ntec3dpo-m3dv`; keep the existing working Workers Builds token selected as before. Use a short expiry if offered. Save the new token privately in your password manager.

Back in the Codespaces **Bash** terminal, run this single line:

```sh
read -r -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN
```

At the prompt, paste only the temporary API token and press Enter. Input is hidden. Do not paste it as a shell command, put it in a file, or send it in chat. Then run these commands separately:

```sh
export CLOUDFLARE_API_TOKEN
```

```sh
export CLOUDFLARE_ACCOUNT_ID=9653dc93bd5d739089edd92b89aded14
```

The account ID is non-secret and identifies the existing app account. Authentication is held in this terminal session; no repository/GitHub Actions secret is needed.

## 3. Set the two beta runtime secrets

Generate **two different random values**, each **32–256 characters**, in your password manager. These are application secrets, separate from the temporary Cloudflare API token. If beta already has encrypted share records, retain its existing encryption secret.

Run the first command and wait for **Enter a secret value**:

```sh
npx wrangler preview secret put SHARES_CREATE_KEY --name beta --worker-name ntec3dpo-m3dv --config .share-config/beta.json
```

Paste the beta **admin password**, press Enter and wait for success. Then run:

```sh
npx wrangler preview secret put SHARES_ENCRYPTION_KEY --name beta --worker-name ntec3dpo-m3dv --config .share-config/beta.json
```

Paste the different beta **encryption secret**, press Enter and wait for success. The CLI prompts hide these values; do not add values to the commands. Each operation creates a new deployment of the existing beta Preview with that secret. These commands do not target production or create another Preview.

If either operation fails, share only its error code/message, with credentials omitted. Do not repeat creation of the database or move keys to another environment.

## 4. Verify and finish

List secret names/types without revealing values:

```sh
npx wrangler preview secret list --name beta --worker-name ntec3dpo-m3dv --config .share-config/beta.json
```

Require both `SHARES_CREATE_KEY` and `SHARES_ENCRYPTION_KEY`. Then open [beta configuration](https://beta-ntec3dpo-m3dv.x-panda.workers.dev/api/shares/config) in a new Private/Incognito window. Require JSON with **`enabled: true` and `historyEnabled: true`**.

Report only the success/failure messages and configuration booleans. If configuration still says false, check beta's effective binding and variables from [BETA_FINAL_TESTING.md](BETA_FINAL_TESTING.md); secret names alone do not prove D1/runtime configuration readiness.

After successful verification:

```sh
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
```

Revoke **the separate temporary API token created for this procedure** in Cloudflare. Keep the saved application admin/encryption secrets stable. Stop the Codespace from [Your Codespaces](https://github.com/codespaces) when finished.

Continue with beta admin/sharing-user setup, scheduled cleanup and final acceptance in [BETA_FINAL_TESTING.md](BETA_FINAL_TESTING.md). No model files or test database records are copied.

References: [Cloudflare Preview secrets](https://developers.cloudflare.com/workers/previews/configuration/#secrets), [Wrangler authentication](https://developers.cloudflare.com/workers/wrangler/commands/general/#login), [Cloudflare token authentication](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [creating a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository).
