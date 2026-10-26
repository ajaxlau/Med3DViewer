# Temporary repair for a saved-setting/build-trigger mismatch

Fresh PR #10 builds still recorded `npx wrangler preview:cloudflare` after the
owner saved `npx wrangler preview --config ./wrangler.jsonc` in Previews Base and
cycled preview builds off/on. The source, Node runtime, manifest, Vite build, and
artifact checks pass. The precise reason the UI and executed configuration differ
is not established; further unchanged retries cannot diagnose it.

The temporary **Repair Cloudflare preview trigger** GitHub Actions workflow reads
Cloudflare's stored configuration and can repair the exact observed command.
It runs only for the PR #10 branch in `ajaxlau/Med3DViewer`. It does not use fork
pull-request events or pass its credential to the app build.

## Phone setup

1. Open [Cloudflare profile API tokens](https://dash.cloudflare.com/profile/api-tokens).
   Choose **Create Token > Create Custom Token**. Use a user-profile token, not an
   account-owned token or Global API key.
2. Name it `Med3DViewer temporary preview repair`. Grant only
   **Account > Workers Builds Configuration > Edit**. Restrict Account Resources
   to the account containing `ntec3dpo-m3dv`
   (`9653dc93bd5d739089edd92b89aded14`). A short expiry such as one day is sufficient.
   Workers Scripts edit/read permissions are not needed: the repair obtains the
   Worker tag from the known failed build instead of listing Worker scripts.
3. Copy the token into a new
   [GitHub repository Actions secret](https://github.com/ajaxlau/Med3DViewer/settings/secrets/actions/new):
   - Name: `CF_BUILDS_REPAIR_TOKEN`
   - Secret: the token value
4. Save the secret and tell the agent it has been added. Do not paste the token
   into chat, source files, or ordinary build variables. The agent can rerun the
   repair job through GitHub; no terminal or production merge is needed.

This API token is different from the existing Workers Builds deployment token.
The temporary token is used only to inspect/update the build trigger and start
and monitor a preview build. It is not used by Wrangler to publish the app.

## Exact permitted behavior

The script anchors inspection to failed build
`ec406b64-233e-41e8-b1a4-34c206558c32` in this account. It verifies the build belongs
to the expected repository and PR #10 branch, then reads the Worker's triggers.
It reports only selected identifiers, commands, and branch filters; it does not
print environment variables or credential values.

It permits a write only when exactly one active trigger matches all of:

- the same Worker and `ajaxlau/Med3DViewer` repository;
- either branch includes exactly `["*"]` and excludes exactly `["main"]`, or
  includes only the exact PR #10 feature branch with no exclusion (or only `main`
  excluded); both forms cannot match `main`;
- repository root and expected `npm run build:cloudflare` build command;
- the exact bad command, or the already-correct native command.

The initial PATCH changes only `deploy_command` to
`npx wrangler preview --config ./wrangler.jsonc`. It does not alter branch rules,
production configuration, variables, domains, or Worker code. A successful
API readback is required before starting a build of the PR #10 branch and the
workflow's exact commit. An already-correct trigger is a no-op.

The first authenticated inspection found a dedicated trigger named after the
PR #10 branch, including only that branch, with the old invalid command. This
explains why the all-branches-only guard stopped before writing. The guard now
also recognizes this narrower, exact feature-branch filter; it still rejects
`main`, unexcluded wildcard filters, other branches, and mixed branch lists.

If trigger identity, filters, or commands differ, the job fails without a write
and prints the non-secret summaries for review. Do not loosen these checks merely
to make the job pass. If Cloudflare itself does not retain a PATCH, collect that
evidence for Cloudflare support.

The job can monitor the explicitly selected preview trigger, report its actual
command and Preview URL, and print selected error lines on failure. GitHub logs
can then be read by the agent without more phone screenshots.

After the command correction and a rate-limit cooldown, the deployment identity
returned `Invalid access token [code: 9109]`. Read-only `--inspect-tokens` mode
found the branch still referencing the generic `Workers Builds - 2026-10-05 21:31`
token, while a registered user token named `ntec3dpo-m3dv build token` was available.
The GitHub repair token is separate and is already working.

The workflow's explicit `--use-worker-token` mode can replace only that identified
stale token reference with the existing Worker-specific reference. It verifies
the replacement's exact UUID, exact name, and user ownership through the API,
checks the old binding against the two known UUIDs, and verifies readback before
uploading. It never retrieves, creates, modifies, or revokes credential values;
the PATCH changes only the guarded preview trigger's `build_token_uuid` field.

## Validation and cleanup

Run `node --test tests/cloudflarePreviewRepair.test.mjs` to test the safeguards
without credentials. Running the script locally without flags is inspection-only;
the current repair mode explicitly passes
`--apply --use-worker-token --start-build --wait`. `--inspect-tokens` performs only
reads and cannot be combined with write options.

After the native command is used successfully, verify a normal Git push also uses
the corrected preview trigger and complete the app acceptance checks in
`DEPLOYMENT.md`. Remove the temporary workflow, script, and its tests before the
final merge; delete the GitHub secret and revoke the temporary Cloudflare token.

References: [Cloudflare Builds API guide](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
and [Update a build trigger](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/update/).
