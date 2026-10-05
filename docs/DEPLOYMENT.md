# GitHub and Cloudflare Pages deployment runbook

This repository is a client-only Vite application. Cloudflare Pages should build
and publish `dist`; there is no Worker entry point, server process, runtime
secret, or database migration.

This runbook follows Cloudflare's official documentation for [Pages build
configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[build images and runtime pins](https://developers.cloudflare.com/pages/configuration/build-image/),
and [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/),
plus GitHub's official guidance for [repository
rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

## Current beta audit

| Check | Result | Deployment impact |
| --- | --- | --- |
| Git conflict markers | None found | No unresolved merge text is shipped. |
| npm manifest/lock consistency | Passes `npm run check:manifests` | `npm ci` can install reproducibly. |
| Type check and unit tests | Pass | No known compile/test blocker. |
| Production build | Pass | Vite produces the `dist` directory Pages expects. |
| PWA assets | Fixed | References to the missing `apple-touch-icon.png` and `masked-icon.svg` were removed from the precache list. |
| Built artifact completeness | Guard added | `npm run build:cloudflare` now fails if the HTML, PWA files, local assets, or manifest icons are absent/empty. |
| Bundle size | Warning only | The main JavaScript chunk exceeds 500 kB; it can slow previews but does not fail deployment. |
| Runtime CDN dependencies | Operational risk | Three.js and Online 3D Viewer load from public CDNs, so a CDN/network outage can leave the deployed viewer unusable even when Pages succeeds. |

## Problems found in the beta code

The deployment failure had several independent configuration conflicts:

1. `package.json` was invalid JSON because the Wrangler dependency key was
   missing its closing quote. Every npm command therefore stopped before install.
2. `package-lock.json` still contained Wrangler while the intended Pages setup
   did not need it. The manifest and lockfile were not a reliable `npm ci` pair.
3. Two Wrangler configuration files described different applications. The
   removed `wrangler.jsonc` selected a nonexistent `src/index.ts` Worker entry
   point, while `wrangler.toml` correctly describes a Pages static output.
4. GitHub Actions deployed the artifact to **GitHub Pages**, although the
   repository documentation called for **Cloudflare Pages**. That workflow did
   not validate pull requests or pushes to `beta`.
5. The lockfile-update workflow could directly rewrite and push dependency
   resolution from Node 24 without review, while the deployment workflow used
   Node 20.
6. `.env.example` claimed that unused server-side Gemini and Cloud Run variables
   were required. This app has no server-side runtime; browser-exposed Vite
   variables must never contain secrets.

The repository now has one Pages configuration, a pinned Node major, a clean
lockfile, and a GitHub build check. A dependency-free manifest preflight reports
invalid JSON or root lockfile drift before dependency installation. Cloudflare's
Git integration owns deployment; GitHub Actions only validates the exact
install/test/build path.

## One-time GitHub repository setup

1. In **Settings > General > Default branch**, keep `main` as the production
   branch. Use `beta` as the integration/preview branch.
2. In **Settings > Actions > General**, allow GitHub Actions and permit the
   official `actions/checkout` and `actions/setup-node` actions. The workflow
   needs only read access to repository contents.
3. Push this branch once and confirm the check named
   **Build / Install, test, and build** succeeds.
4. In **Settings > Rules > Rulesets** (or **Branches > Branch protection**), add
   rules for `main` and `beta`:
   - require pull requests before merge;
   - require at least one approval;
   - require conversation resolution;
   - require **Build / Install, test, and build**;
   - optionally require the Cloudflare Pages deployment check after it has run
     once (GitHub only offers checks it has already observed);
   - block force pushes and branch deletion.
5. Do not add Cloudflare account tokens, API tokens, or account IDs as GitHub
   secrets for this setup. Native Git integration authenticates through the
   Cloudflare GitHub App.

## One-time Cloudflare Pages setup

1. Open **Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to
   Git**.
2. Select GitHub, install/authorize the Cloudflare GitHub App, and grant it
   access to this repository.
3. Select the repository and enter these build settings exactly:

   | Cloudflare setting | Value |
   | --- | --- |
   | Project name | `med3dviewer` (or an available name) |
   | Production branch | `main` |
   | Framework preset | `Vite` (or `None`; explicit values below win) |
   | Root directory | Leave blank (the repository root) |
   | Build command | `npm run build:cloudflare` |
   | Build output directory | `dist` |

4. Under **Settings > Environment variables**, set `NODE_VERSION` to `20` for
   both Production and Preview. `.node-version` and `.nvmrc` provide the same pin
   in source for build systems that recognize either convention. No application
   secrets are required. Never place a private key in a `VITE_*` variable because
   Vite makes it public in the generated JavaScript.
5. Under **Settings > Builds > Branch control**:
   - enable automatic production deployments for `main`;
   - select **All non-production branches** for previews, or select custom
     branches and include `beta` plus the team's feature-branch patterns;
   - do not exclude `beta`.
6. Save and deploy. A push to `beta` should get a branch preview URL; a pull
   request from a branch in the same repository should get a PR preview and a
   Cloudflare status check. Pull requests from forks do not receive preview URLs.
7. After the first successful production deployment, add any custom domain under
   **Custom domains** and follow Cloudflare's DNS prompts. Test the generated
   `*.pages.dev` URL before changing production DNS.

> **Important:** leaving Root directory blank is the documented way to use the
> repository root. Enter a relative folder only for a monorepo. Do not enter a
> filesystem-style `/`, which can be interpreted differently from an unset root.

The checked-in `wrangler.toml` is a single source of truth for the project name
and static output directory when using Wrangler locally. It does not replace the
dashboard's Git build settings, and Wrangler is deliberately not a project
dependency for native Git deployments.

## Release flow

1. Create a feature branch from `beta`, then open a pull request into `beta`.
2. Require the GitHub build check and Cloudflare preview to pass. Exercise model
   loading, PWA registration, browser refresh, and the preview on desktop and a
   mobile device.
3. Merge into `beta` and use its stable branch preview for acceptance testing.
4. Open a pull request from `beta` to `main`. Review and merge only after all
   required checks pass. Cloudflare then creates the production deployment.

## Local reproduction

Use the same clean-install sequence as CI and Cloudflare:

```bash
rm -rf node_modules dist
node scripts/validate-manifests.mjs
npm ci
npm run lint
npm test
npm run build:cloudflare
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite and verify that direct navigation, asset loading,
PWA registration, and model import work. A large-bundle warning is advisory; a
nonzero command exit is a deployment blocker.

`build:cloudflare` deliberately validates the npm manifests before Vite and the
generated artifact after Vite. The final success line should say
`Cloudflare artifact is complete`.

## Troubleshooting and rollback

- **`EJSONPARSE`**: run `node scripts/validate-manifests.mjs` and inspect the
  exact line reported. If Cloudflare still shows the old malformed line 45,
  verify that its deployment commit includes this fix and that the Pages project
  is connected to the intended repository and branch.
- **`npm ci` says the lock is out of sync**: use the pinned Node major, run
  `npm install` intentionally, review both manifest and lockfile, then commit
  them together. Do not have automation push an unreviewed lockfile.
- **Cloudflare builds the wrong code or no preview appears**: verify repository
  access in the Cloudflare GitHub App, the connected repository, branch controls,
  and that the commit message does not contain a Cloudflare CI-skip marker.
- **Worker entry-point error**: make sure only `wrangler.toml` exists and that it
  contains `pages_build_output_dir`; this static app must not have a `main`
  Worker entry point.
- **Successful build but a blank site**: inspect browser console/network errors,
  confirm Cloudflare publishes `dist`, and verify that hashed files under
  `dist/assets` return HTTP 200.
- **Rollback**: in **Workers & Pages > med3dviewer > Deployments**, select the
  last known-good production deployment and choose **Rollback**. Then revert the
  faulty Git commit so the next automatic deployment does not reintroduce it.
