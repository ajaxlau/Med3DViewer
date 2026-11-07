# Department Box uploads and model-aware workspace revisions

Status: **implementation authorized; isolated deployment groundwork is in progress**. See the [Box test setup guide](BOX_TEST_SETUP.md). Box connection, upload and model-aware revision features remain to be implemented and tested before promotion.

Review baseline: beta commit [`9dec4176`](https://github.com/ajaxlau/Med3DViewer/commit/9dec4176cb95f92e2818e73200c6c198c55814ad), including merged PR #12. This document extends the existing [platform improvement plan](PERFORMANCE_PLAN.md) with the upload/model-version workflow discussed with the owner. The previous limits on unrelated features, memory/GPU use, security and Slicer correctness still apply. Direct uploads are a newly requested addition, not an existing capability.

## 1. Branch and testing environment

Create branch **`codex/box-workspace-upload-preview` from current beta**, and open a new draft PR targeting beta. Do not continue development on the old `codex/secure-workspace-preview` branch or retarget its working test Worker.

Proposed resources, to provision only during implementation/setup after plan review:

| Resource | Box workflow test target |
| --- | --- |
| Git branch | `codex/box-workspace-upload-preview` |
| Worker | `ntec3dpo-m3dv-box-test` |
| Expected address, once created/enabled | `https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/` |
| D1 database | `med3dviewer-shares-box-test`, new UUID |
| Environment scope | `box-test`, requiring explicit code/schema support |
| Box content | Dedicated disposable testing folder in the department-managed account |
| Box authorization | Separate test application/connection and environment-scoped credentials |
| Deployment model | Dedicated regular Worker, with its own hourly Cron cleanup |

Use a regular test Worker to simplify runtime-secret administration and scheduled cleanup. Preserve the existing beta Preview, beta cleanup Worker, test Worker, their databases, credentials and shared URLs. Main is unchanged. A branch creation may trigger existing ordinary Git integration previews; that is not provisioning or configuring the proposed Box test target.

Current deployment scripts/runtime only recognize `test`, `beta`, and `main`; the scope-marker table also constrains its values. Implementation must explicitly add `box-test` to validation and isolate its database UUID, bindings, branches, signing/encryption context and migration target. Do not rename an existing scope marker or reuse another environment's D1 database. Root Wrangler must retain the existing application Worker identity and default sharing-disabled behavior; generate a separate Box-test profile.

The initial implementation checkpoint adds the Box-test deployment profile and environment-scope migration. Database UUID and app settings must be supplied/verified at the relevant implementation milestone; code changes alone do not provision live resources.

## 2. Agreed user workflow

### Start with an empty viewer

1. Log in to the platform with an administrator-assigned sharing account.
2. Choose **Upload Model** and select an STL or a self-contained multi-mesh 3MF from the device. No Dropbox/Box URL is required.
3. Upload to the department's selected Box folder, showing progress, cancellation and retry feedback; open the model for review.
4. Adjust meshes, visibility, opacity, annotations and supported analytical objects.
5. Enter workspace name, expiry and **Revision Name**, then explicitly click **Save Workspace**.
6. Receive the same style of protected workspace URL and legacy QR/copy/WhatsApp screen. The Box file remains private; a public Box sharing link is unnecessary.

Uploading makes a model available to the draft workspace. **Uploading, selecting a model, opening a revision or adjusting tools must not publish a workspace revision.** Only the explicit Save action publishes it.

### Change models or open older revisions

- Place **Workspace Model** above **Mesh Visibility** in Visualization Tools. List only ready uploads attached to this workspace/draft, with model name and upload time. Do not expose the department's whole Box folder to recipients.
- Selecting a model loads it locally for review. A 3MF is one selectable file; its internal meshes remain controlled by Mesh Visibility.
- Retain **Workspace Revision** inside Analytic Tools, below Analytics and above Project IO. Selecting a saved revision loads its exact model and saved analytics/mesh state automatically.
- Save appends a new revision binding the selected model to the current workspace JSON; the stable workspace URL opens the latest saved revision by default. Concurrent recipients get distinct revisions and server-ordered timestamps.
- Recipients of an editable workspace URL can select its already-attached models and explicitly save without platform login. New uploads and attaching external models require an authorized logged-in account. Admin view-only settings remain enforced.

**Proposed initial boundary for review:** one uploaded file per saved revision; that file may contain multiple meshes. Selecting several independent files together is not yet agreed and must not be silently added. Keep existing GLB/link-based behavior compatible; new upload UI initially targets STL and 3MF.

## 3. Administrator connection and permissions

Add **Box Connection** to the existing administrator page:

- Connect using Box's official OAuth authorization page. The platform never asks for or stores the department's Box login password.
- Display connection health/account identity, choose and validate an upload folder, test access, reconnect and disconnect.
- Configure Box app client ID/secret and a separate credential-encryption key as environment-scoped runtime settings/secrets. Admin enters authorization on Box; refresh/access tokens are kept encrypted server-side and never returned through public APIs, URLs, localStorage or client bundles.
- Handle short-lived tokens, rotating refresh tokens and concurrent refresh requests without overwriting a newer token. Fail safely after ambiguous failures and offer reconnection rather than repeated invalid refresh attempts.
- Restrict app/account privileges and enforce approved folder/file access at the Worker. Do not assume an OAuth scope alone limits access to the selected folder.
- Bind a connection to the verified department account. Changing the upload folder affects future uploads only; existing revision references retain their original authorized source association. Switching accounts must not silently relink old models.
- Disconnect stops new Box access; it does not delete model files or workspace history. Privately stored revisions may be unavailable until access to the original account is restored.

Use the existing server-side permission framework. Proposed capabilities are `model:upload` and `workspace:share`; administration remains protected by the admin credential. Merely being signed in is not sufficient when the server has revoked the relevant capability. Upload sessions remain bound to their creator and draft/workspace, including after account disable/logout.

The department account's Box application permissions, folder access and organizational approval requirements must be verified with the owner. No password or refresh token belongs in chat or source control.

## 4. Upload/download architecture and performance

Recommended first implementation:

**Browser → same-origin authenticated Cloudflare Worker → Box API**

- Add a small storage-provider boundary for upload-session operations, metadata validation and streamed downloads. Keep the existing approved Dropbox-link reader intact for old workspaces. Do not simply expand its public-host allowlist into an unrestricted proxy.
- Use bounded streaming or bounded chunks, not a complete multipart/model body held in Worker memory. Avoid browser base64 copies and duplicate parses. Hash/validate incrementally with bounded memory and verify completed file identity before it becomes selectable.
- Respect Box's direct/chunked upload requirements and server-provided part sizes, account limits, Cloudflare body/time/memory limits and the viewer's device-dependent limits. Existing protected downloads are capped at 150 MiB; do not silently raise that limit. A successful cloud upload does not mean a phone can render the model safely.
- Authenticate/authorize before accepting bytes. Validate declared/actual length, type, STL/3MF content, ZIP expansion limits, external references and completion state. Preserve multi-mesh 3MF structure and units; do not convert it automatically to STL or reduce clinical geometry silently.
- Use bounded upload concurrency, quotas, checksums, finite session lifetimes, cancel/abort, resume where supported, and idempotent chunk/finalization requests. An incomplete/repeated/failed upload must not advance the workspace revision.
- Handle Box finalization that is not immediately complete before marking an asset ready. A completed upload whose D1 write fails needs reconciliation; retries must not create duplicate model files or duplicate revisions.
- Stream private model downloads through the same-origin Worker, checking workspace/model membership, expiry and revocation on every request. Retain cancellation, size/range bounds and no-cache privacy rules. Never pass a Box access token to an arbitrary redirect host.
- Never create a persistent model copy in D1, KV, R2 or the application's service-worker cache. D1 holds metadata only; transfer buffers are temporary and bounded.

Box CORS applies to browser-to-Box API calls, not server-to-server requests. The relay design does not need Box CORS to grant recipients access. If direct browser uploads are later justified by measured performance, that is a separately reviewed design using exact allowed origins and narrowly scoped short-lived credentials—not a department-wide token in the browser. CORS is not authorization.

## 5. Model-aware data and revision consistency

Design an additive migration, with backups/recovery notes and tests on populated schema-3 fixtures. Suggested metadata entities:

| Entity | Purpose |
| --- | --- |
| Storage connection | Provider/account identity, encrypted credentials, approved folder association, status and token/connection generation |
| Model asset | Immutable internal asset ID, workspace/draft membership, uploader, Box file/version IDs, original display filename, format, byte size, fingerprint and ready/error state |
| Upload session | Creator/draft identity, expected size/format, provider session reference, bounded progress, expiry, idempotency and cancellation state |
| Workspace revision | Existing JSON/name/time plus the immutable model-asset reference and that model's verified fingerprint |

No geometry or plaintext cloud credential is stored in these records. Public metadata must omit Box source references and departmental file listings.

Each upload should create a **separate Box file**, with a recorded content/version identity. This avoids depending solely on a Box plan's historical-version retention. Do not overwrite the source file of an older workspace revision. If an externally modified/deleted file no longer matches, report that revision unavailable rather than applying its old analytics to different geometry.

Model and JSON selection must be one consistent saved revision. Version the download route or bind its authorization to the selected revision; a "latest model" stream must not race with a newly saved revision while an older snapshot is loading. A superseding model/revision request must never receive an older asynchronous result.

Preserve the existing 256 KiB snapshot bound, 20-version history retention, 64 MiB history budget and server-ordered atomic append semantics unless separately reviewed. Never renumber retained history after pruning. Apply explicit quotas to attached assets, unfinished uploads and departmental storage before enabling uploads; final values require the owner/account-capacity review.

Existing Dropbox revisions must continue loading their original source. Backfill compatible legacy asset references without downloading/copying models, moving accounts, changing source fingerprints or resetting expiry. Keep old exports/imports and existing links readable; make new exports describe the model identity/coordinate frame without exporting credentials or private source addresses.

### Analytics when geometry changes

Do not silently carry measurements or mesh-index references onto a different model. Detect model changes and make the user choose to start compatible analytical state afresh or explicitly review/rebind supported objects. Preserve the original snapshot until that decision succeeds. Verify units, coordinate frame, mesh identities and object transforms before restoration. Selecting an old revision must restore its own compatible model/settings without overwriting local owner workspaces.

## 6. Expiry, privacy and cleanup

- Keep the maximum workspace lifetime at 180 days from original creation. Uploading/selecting/saving a model does not extend it.
- Scheduled cleanup removes expired/revoked workspace metadata, revision associations and expired upload/session metadata in the correct environment. Preserve the working beta cleanup Worker; a regular Box-test Worker can run its own Cron.
- Box files are **not automatically deleted** by D1 expiry, history pruning, connection reset or cancelled workspace publication. Retain completed models until an administrator follows an approved file-retention policy.
- Abort unfinished provider upload sessions where appropriate; completed but unattached files need an administrator-visible reconciliation/cleanup policy. Do not introduce automatic Box deletion without separate owner approval, checks for other revision references and a tested recovery path.
- Public recipient links grant access only to their authorized workspace assets/history; disabling editing, expiry and revocation must also block pending saves and model access. Provider outages and permission loss get useful errors without source/token disclosure.

## 7. Implementation phases and acceptance gates

| Phase | Deliverable | Required evidence before proceeding |
| --- | --- | --- |
| A — isolation and provider proof | Dedicated deployment profile, Box-test scope/migrations, bounded private API proof | Owner-confirmed D1 UUID and Box test folder/app authorization; no beta/main/test resource reuse; token/folder/read/upload checks |
| B — admin connection | OAuth, health/folder controls, reconnect/disconnect, refresh coordination | Invalid/replayed OAuth state rejected; concurrent refresh and reset/revocation tests; no browser/log credential exposure |
| C — upload from empty viewer | Authorized STL/3MF upload, progress/cancel/retry, draft catalog | Large/chunked uploads, aborted/repeated/failed finalization, quotas and memory tests; multi-mesh/units preserved; no implicit workspace save |
| D — model-bound revisions | Additive data migration and version-bound streaming | Populated legacy fixtures; each old/new revision loads its own model; concurrent saves and switching races; expiry remains fixed |
| E — concise interface | Upload action, Workspace Model selector, reviewed analytical reset/rebind, existing Save/share UI | Same typography/pin controls and 300ms/10-second behavior; required Revision Name; no source URLs; editable/view-only recipient tests |
| F — final testing | Isolated live test deployment and owner review | Real iOS/Android and desktop memory/GPU measurements; representative multi-mesh 3MF and Slicer round trips; Box disconnect/deletion/outage; real scheduled metadata cleanup |
| G — promotion | Reviewed PR into beta, then separate main release | Owner acceptance, green exact-commit checks, separate provider resources/keys per environment and rollback verification |

Implement through a new draft PR and test Worker first. Feature flags default off until the required environment is configured. Keep this work in draft PR #13 until the Box workflow is implemented and accepted; no beta merge or main deployment is included in this setup checkpoint.

## 8. Owner decisions and manual setup

Needed during review/setup, not secret values in chat:

1. Confirm Box is the provider for new uploads; retain existing Dropbox-linked workspace support.
2. Confirm the proposed **one uploaded file per revision** boundary versus several independent files loaded together.
3. Confirm the dedicated department Box test folder, app approval/access and account upload/storage limits; decide upload/asset quotas.
4. Confirm how model-change analytics should be reviewed/rebound. Default: no silent cross-model reuse.
5. Review the proposed separate Box-test Worker/D1 environment. Supply its non-secret UUID only when provisioning starts. Existing admin/sharing-user accounts do not automatically migrate into the new test database; bootstrap test-only accounts there.
6. Keep completed Box files until a separately approved retention/deletion policy exists. Confirm any later file-deletion policy explicitly.

Once the plan is approved, prepare a phone/tablet runbook for creating the Box application, exact OAuth redirect URI, runtime secrets, D1 migrations/bindings and administrator connection. Include a Codespaces terminal route where Cloudflare's UI cannot manage secrets; never require passwords or API tokens in chat. No CORS entry or OAuth callback should point at a Worker that has not been created and verified.

## References

The provider API design must be verified again against the chosen Box app/account during implementation:

- [Box CORS](https://developer.box.com/guides/security/cors): browser-origin rules; not a substitute for authentication.
- [Box direct upload](https://developer.box.com/guides/uploads/direct/file): upload format and direct-upload limits.
- [Box chunked uploads](https://developer.box.com/guides/uploads/chunked): session/part/commit workflow.
- [Box refresh tokens](https://developer.box.com/guides/authentication/tokens/refresh): token rotation and reconnect requirements.
- [Current beta setup](BETA_FINAL_TESTING.md), [existing sharing behavior](EDITABLE_WORKSPACES.md), and [validation limitations](LOCAL_VALIDATION.md).
