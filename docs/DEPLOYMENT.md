# Cloudflare Workers build and preview runbook

This client-only Vite app publishes static assets to the existing Worker
`ntec3dpo-m3dv`. `wrangler.jsonc` is the only deployment configuration. It declares
`assets.directory = "./dist"` and SPA navigation fallback; no Worker script entry
point, application secret, or database is required.

## Confirmed failure and repair

The supplied 2026-10-05 log shows installation and Vite/PWA generation succeeding.
The subsequent `npx wrangler deploy` reads a Pages configuration and fails with
`Missing entry-point to Worker script or to assets directory`. The 838 kB chunk
warning is advisory, not the deployment failure.

The owner confirmed this Worker has already switched to **Worker Previews**.
The repair therefore pins Wrangler 4.135.0 (supports Worker Previews), aligns all
Node pins and CI to Node 22 (required by that CLI), and adds the required empty
`previews` configuration. Assets remain at the top level. Production uses
`wrangler deploy`; previews use `wrangler preview` with the branch name selected
by Cloudflare/Wrangler. Previews do not promote a build to production.

`build:cloudflare` validates npm manifests and the built HTML, PWA files, local
asset references, and manifest icons. GitHub Actions installs, type-checks,
tests, builds, and validates packaging without publishing. Cloudflare's Git
integration owns actual deployment. Do not merge PR #9's alternative Pages
configuration over this Workers setup.

## Manual settings in the existing Worker

Open **Workers & Pages > ntec3dpo-m3dv > Settings > Build**. Keep the existing
Worker and domains; do not create a replacement Worker or a Pages project.

| Setting | Value |
| --- | --- |
| Repository | `ajaxlau/Med3DViewer` |
| Root directory | `/` (repository root in Workers Builds) |
| Production branch | `main` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Preview command (Previews Base) | `npx wrangler preview --config ./wrangler.jsonc` |
| Preview builds | Enabled for all non-production branches, including `beta` and feature branches |
| Build variable | `NODE_VERSION=22` (replace the old value of `20`) |
| Preview model | Worker Previews (already enabled by the owner) |

Set the Preview command under **Builds > Previews Base**. Keep the production
Deploy command under **Builds > Production**. The dashboard preview command uses
Wrangler directly; `preview:cloudflare` remains an npm script for local use.
The build command already runs artifact validation before the preview upload.

Workers Builds has no output-directory field: `./dist` is declared in source.
Keep development dependencies installed during the build so Vite, TypeScript,
and the pinned Wrangler CLI are available. No application runtime secrets or
bindings are needed in Production or Previews Base for this static app.

The owner-selected `med3dviewer build token` successfully uploaded a preview on
2026-10-26. The two previously bound deployment-token references returned
`Invalid access token [9109]`. If authentication fails again, verify the token
reference on the actual branch trigger, access to the correct account/Worker,
and validity of its credential. Replace an invalid token through the dashboard
API-token selector. Never paste
token values into chat, source, or browser-exposed `VITE_*` variables.

## Existing branch trigger commands

On 2026-10-26, authenticated API inspection found a dedicated build trigger for
`codex/review-beta-branch-for-conflicts-and-bugs`. Its branch include list contained
only that exact feature branch. It still stored `npx wrangler preview:cloudflare`
after the owner saved a different command in Previews Base and cycled previews.
Updating that trigger's `deploy_command` through the Builds API and reading it
back confirmed the native command was retained and used by the next build.

When displayed settings and executed commands differ, inspect the existing
branch trigger through the [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
Verify the Worker, repository, and branch filters before updating only its
command. Do not infer the selected branch from the dashboard's Production
breadcrumb; check the build source commit and its recorded settings.

The same branch-specific record retained the old token after the owner selected
`med3dviewer build token` in the dashboard. Updating only its `build_token_uuid`
to the exact registered token selected by the owner, then verifying readback,
produced successful preview build `a5df33e2-b974-4745-aaf8-b8d5c89c8e7c` for commit
`c5afb62055129f876a116a476b8498b68df33ff6`. No build-variable override was present.

An API `10429` / HTTP 429 error after Wrangler starts is a separate rate-limit
failure. Stop concurrent retries and honor `Retry-After` where available. See
[Cloudflare API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/).

## Verified preview on 2026-10-26

The [PR #10 branch preview](https://codex-review-beta-branch-for-conflicts-and-bugs-ntec3dpo-m3dv.x-panda.workers.dev)
successfully deployed using the corrected native command and the owner-selected
`med3dviewer build token`. The initial successful upload was build
`a5df33e2-b974-4745-aaf8-b8d5c89c8e7c` at commit `c5afb620`. A subsequent ordinary
Git push at commit `e00613be` passed both GitHub CI and Cloudflare build
`a63bb0dd-07e5-4e89-afc5-1d7b1f2ab979`, without an API-triggered build.

Live checks confirmed successful responses and expected content types for HTML,
hashed JavaScript/CSS, icons, manifest, registration script, and service worker.
A browser navigation received the SPA fallback; a missing JavaScript asset
returned HTTP 404. Chromium loaded the external 3D
engine, imported a synthetic STL through Browse Files, reached the ready state,
and accepted camera shortcuts with no JavaScript page errors. A fresh mobile
viewport also initialized successfully. Physical-device performance and full
planning workflows remain manual acceptance checks.

The temporary API repair workflow, helper, and repair-specific tests have been
removed. Native Cloudflare Git integration now handles previews. The owner can
delete the temporary `CF_BUILDS_REPAIR_TOKEN` GitHub Actions secret and revoke the
`Med3DViewer temporary preview repair` Cloudflare profile token. Keep the working
`med3dviewer build token` selected for deployment.

## Acceptance: run a new non-production build

The beta deployment also succeeded on 2026-10-26: Cloudflare build
`c7e6c034-1e7b-48b0-940e-c71e985a3748` deployed commit `3d7bbb964` at 15:37 UTC.
Its existing branch-specific trigger retained an old deployment-token reference
and a preview command containing a long dash (`—config`). The Builds API
correction selected the owner-approved `med3dviewer build token` and the ASCII
command `npx wrangler preview --config ./wrangler.jsonc`, with readback.

The upload completed after a long Cloudflare queue delay. The temporary repair
monitor timed out before the upload completed; that timeout was not an app build
failure. Account build minutes remained available. A token selector on the
individual beta page was not verified; do not assume that UI exists.

The privileged beta repair workflow, helper, and repair-specific tests are
removed. The temporary public-preview smoke check uses no credentials and only
reads deployed assets. Delete `CF_BUILDS_REPAIR_TOKEN` from GitHub Actions secrets
and revoke its separate temporary Cloudflare profile token after verification.
Keep the working `med3dviewer build token` selected for deployment.


1. Save those settings, then start a fresh non-production build. PR #10 is merged
   into `beta`; verify the logged commit matches the intended beta or feature
   branch head. Keep production on `main` until the release PR is reviewed.
2. Confirm installation, build, artifact validation, and `wrangler preview`
   succeed. The build must report `ntec3dpo-m3dv` and a Preview URL. Use the URL
   printed in the log or dashboard, rather than assuming a Pages-style hostname.
3. Open the Preview URL on desktop and mobile. Check HTML, hashed JS/CSS, icons,
   manifest, and service-worker files return successful responses and appropriate
   content types. Missing JavaScript must not silently return HTML. Check browser
   console errors for the external 3D engine/CDN scripts and PWA registration.
4. Test refresh, local STL/GLB import, remote model loading, cancellation, basic
   measurement, clipping, and planning export/import. Use a fresh browser profile
   to distinguish a new build from a cached service worker.
5. Verify the active production deployment and production domain did not change
   after the preview build. Record the build URL, commit SHA, and Preview URL.

Local checks cannot verify Cloudflare authentication or a live Preview. The repair
is operationally complete only after this dashboard acceptance passes.

## Local and CI validation

Use Node 22 and npm 10.9.2 with the checked-in lockfile:

```bash
npm run check:manifests
npm ci
npm run lint
npm test
npm run build:cloudflare
npm run check:cloudflare
npm run preview -- --host 127.0.0.1
```

`check:cloudflare` validates packaging without uploading. The npm command
`preview` starts Vite locally; `preview:cloudflare` publishes a Worker Preview and
requires Cloudflare authorization. `deploy:cloudflare` changes production and
must not be used as a local check.

GitHub Actions needs only repository read permission. No Cloudflare API token is
needed in GitHub secrets for native Git integration. Require the GitHub build
check and Cloudflare preview before merging into `beta`; release through a
reviewed PR from `beta` into `main`.

## Troubleshooting and rollback

- **Pages warning or missing assets:** confirm the build uses this commit, the
  repository root, `wrangler.jsonc`, and the npm commands above. Do not add a fake
  `src/index.ts` entry point to a static app.
- **`Unknown argument: preview:cloudflare`:** the build log is executing
  `npx wrangler preview:cloudflare`, which treats an npm script name as a Wrangler
  command. If the dashboard shows an npm script but the log still shows this
  command, replace the entire Previews Base Preview command with
  `npx wrangler preview --config ./wrangler.jsonc`. Save and use a fresh build.
  Confirm the command in the new log; the cause of a saved-setting/log mismatch
  cannot be determined from the GitHub check alone.
- **Unknown preview command / unsupported engine:** ensure `npm ci` installs the
  pinned Wrangler, and Cloudflare uses Node 22 rather than the previous Node 20.
- **No preview build:** check repository access for the Cloudflare GitHub App,
  branch controls, and CI-skip markers in the commit message.
- **Manifest/lock drift:** update the manifest and lock together with the pinned
  toolchain and commit both. Do not automate unreviewed lockfile pushes.
- **Blank page after upload:** check asset responses and external Three.js/Online
  3D Viewer scripts. A successful build does not guarantee CDN availability.
- **Rollback:** previews do not replace production. If a later production release
  fails, restore the last known-good deployment in this Worker's dashboard, then
  revert the faulty Git change before the next production build.

Official references: [Worker Previews setup](https://developers.cloudflare.com/workers/previews/get-started/),
[Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/),
[Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
