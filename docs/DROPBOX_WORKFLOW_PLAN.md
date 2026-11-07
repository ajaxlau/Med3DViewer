# Dropbox personal: uploads and model-aware workspace revisions

Status: owner selected Dropbox personal in place of Box. This plan supersedes the Box-provider setup assumptions while retaining the agreed lightweight viewer/workspace behavior. Implementation remains in draft PR #13, targeting beta; no beta/main merge is included.

## Resources and migration

Keep the existing isolated branch `codex/box-workspace-upload-preview`, Worker `ntec3dpo-m3dv-box-test`, URL `https://ntec3dpo-m3dv-box-test.x-panda.workers.dev`, D1 database `med3dviewer-shares-box-test` (`4d01c6ac-bcf3-4b71-8448-c5d8b8956a34`), and immutable `box-test` scope. Their names are historical technical labels, not the selected provider. Do not rename the physical database or environment marker, copy credentials across environments, reset tables, or create another Worker to switch provider.

Keep migrations 0001–0005 immutable. Migration **0006** adds separate Dropbox OAuth connection/state tables and advances the schema marker to 6, preserving sharing users, legacy links, revisions, and any historical Box metadata. The test profile disables Box and enables Dropbox. Old Box secrets are not reused; existing sharing/encryption secrets remain unchanged. Box code is retained but inactive in this profile. Beta/main/previous test profiles do not enable Dropbox account integration.

## Department account and permissions

One personal Dropbox account is connected for initial testing. The administrator creates a **Scoped access → App folder** API application and authorizes it using Dropbox's own OAuth page. No account password is collected by the viewer. The connected account is pinned; reconnecting cannot silently change account ownership. A later move to a department-owned account requires a controlled migration and explicit live acceptance.

Request only `account_info.read`, `files.metadata.read`, `files.content.read`, and `files.content.write`, with offline access. Do not request team permissions, Full Dropbox access, or shared-link creation permissions. All new models remain private inside the dedicated app folder. This differs from the earlier arbitrary-folder chooser: app-folder confinement is the initial boundary. A configurable subfolder inside that app folder may be added only as part of the approved upload implementation.

Dropbox enforces the app's configured content-access type. The operator must confirm App folder at creation; scopes alone do not prove App folder confinement. The connection verifies the account, granted scopes and metadata access, without returning directory listings to recipients. Encrypted provider tokens remain server-side, scoped to the environment/app/account/generation. Short-lived tokens are refreshed using the offline refresh token; Dropbox refresh responses can omit a replacement refresh token, so the stored token must be preserved. Concurrent refreshes and stale callbacks must not overwrite a newer connection. Ambiguous failures require reconnection in the initial implementation.

## User workflow retained

1. A logged-in, authorized platform user starts from an empty viewer and uploads an STL or self-contained multi-mesh 3MF, without pasting a storage URL or logging into Dropbox individually.
2. Upload through bounded Worker streaming/chunks into the connected account's app folder. Show progress/cancel/retry and mark an asset ready only after provider completion and identity checks.
3. Select an available uploaded model under **Workspace Model** in Visualization Tools, above mesh visibility. A multi-mesh 3MF is one selectable file; its individual meshes retain show/hide/opacity controls. Initially bind one model file per revision, not several independent files together.
4. Set analytics, objects and visualization state. Share through the existing legacy QR/copy/WhatsApp screen; only logged-in users see the workspace checkbox/name/expiry fields. Guest model-only sharing retains its existing layout.
5. Explicitly click **Save Workspace** with a required Revision Name. Uploading, selecting or modifying a model must not publish a workspace revision automatically.
6. Recipients need no Dropbox or platform login to open a protected workspace URL. When administrator editing permission is enabled, they may select already-attached models and explicitly save analytics/visibility/opacity changes. New uploads/asset attachment still require an authorized platform login.
7. **Workspace Revision** stays inside Analytic Tools between Analytics and Project IO. Choosing a revision automatically loads its exact model and saved JSON. Keep the common typography, pin/expand controls, 300ms transitions and 10-second collapse behavior.

## Immutable model/revision association

D1 stores metadata only: provider/connection identity, immutable internal asset ID, Dropbox file ID and `rev`, size/content fingerprint, workspace membership, creator, completion state, revision JSON/name/timestamp and existing expiry. Do not store model bytes or plaintext access tokens. Do not store a newly generated public Dropbox sharing link; private file references are sufficient.

Each new model upload creates a distinct file rather than overwriting the source of an older workspace revision. Native Dropbox version history is not the application's retention mechanism. Match the recorded file identity/revision when streaming; if it has changed or disappeared, fail clearly rather than apply analytics to different geometry. Bind download authorization to the selected saved revision to prevent latest-model/older-JSON races. Suppress stale asynchronous loads.

Add asset/revision tables and compatible backfills in a later reviewed migration; migration 0006 does not implement these entities. Preserve existing URL-based Dropbox workspaces and imports/exports without downloading/copying their source models, changing fingerprints or extending expiry. Retain GLB/link loading already supported; the first direct-upload UI targets STL and 3MF.

Concurrent saves append distinct monotonically numbered revisions ordered by the server, with atomic publication of model identity and workspace JSON. Preserve current 256 KiB snapshots, 20-version retention and the 64 MiB history budget pending separate quota review. Never silently reuse or renumber older revisions.

## Analytics, mobile use and security

Keep the platform simple and focus on existing tools. Preserve multi-mesh structure, units, transforms and stable mesh references. Do not silently restore measurements or index-bound objects onto different geometry: ask for explicit reset/review/rebinding before publication. Test supported analytics and Slicer import/export round trips with representative models.

Use bounded upload chunks/concurrency, cancellation and retries; avoid base64 copies, full Worker multipart buffering and duplicate model parses. Respect Dropbox/account limits, Cloudflare request limits and the viewer's existing 150 MiB protected-download limit. A cloud upload does not establish renderability on a phone. Preflight estimated memory/geometry budgets and inform the user when a desktop is required. Explore optional preview reduction with notice only where it can preserve analytical correctness; never silently simplify clinical geometry or replace the original model.

Validate file structure, 3MF ZIP expansion, self-contained references and actual byte limits. Authenticate before accepting bytes; bind upload sessions to the active user/draft/workspace, with quotas, expiry, idempotency and provider/D1 reconciliation. Only workspace-attached assets may be downloaded through a recipient token. Keep credentials and source references out of public JSON, logs, client bundles and service-worker caches. Protected URLs conceal the storage source; recipients still receive viewable model data.

## Expiry and cleanup

Keep the 180-day maximum from original workspace creation; uploads/saves never extend it. The existing test Worker's hourly Cron handles metadata cleanup and connection upkeep; keep the separate beta cleanup Worker unchanged. Expiry/revocation blocks model access and writes through the platform. It does not delete provider files automatically.

Retain completed Dropbox model files until a separate owner-approved deletion policy exists. Abort unfinished uploads and reconcile completed-but-unattached files without deleting potentially referenced models. The administrator's explicit diagnostic transfer test is an exception limited to its own randomly named small text file: it uploads, verifies download bytes and removes only that file, reporting cleanup failure.

## Delivery and acceptance

| Milestone | Status / acceptance |
| --- | --- |
| Existing sharing baseline | Owner reported test steps 1–6 passed on the isolated Worker; retain this regression baseline. |
| Dropbox connection switch | Implemented for isolated testing: OAuth callback, encrypted offline tokens, account pin, scope/metadata check, local disconnect and diagnostic upload/download. Requires live owner authorization and transfer-test evidence. |
| Full model uploads | Pending: authorized STL/3MF uploads, bounded progress/cancel/retry, completion verification, quotas and reconciliation. |
| Model catalog and revisions | Pending: workspace-owned model selector, immutable asset references, atomic model/JSON revision binding and migration of old workspaces. |
| Existing tool correctness | Pending final acceptance: analytics, visibility/opacity restoration, coordinate/units checks, Slicer round trips, concurrent recipients and older-model restoration. |
| Promotion | Only after exact-commit CI, owner mobile/desktop acceptance, real cleanup/refresh checks and reviewed rollback. Separate environment credentials/resources for beta/main; no automatic account/data migration. |

The current setup test is **not** a full STL/3MF upload test. Follow [Dropbox setup and test run](DROPBOX_TEST_SETUP.md), then report the connection and diagnostic transfer results. Credentials are entered privately in Cloudflare/Codespaces, never chat.

## References

- [Dropbox account/API support](https://www.dropbox.com/developers/support).
- [App folder and scope design](https://www.dropbox.com/developers/reference/developer-guide).
- [OAuth and offline access](https://developers.dropbox.com/oauth-guide).
- [Upload API](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload).
