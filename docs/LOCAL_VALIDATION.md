# Local validation of the testing PR

## Extension checks recorded 5 November 2026

- Added SQLite-backed cases for separate view/edit capabilities, authenticated link recovery, atomic revision checks, concurrent editors, source-identity checks, paginated administration, fixed maximum expiry, revocation and migration compatibility.
- Multi-object 3MF package tests cover external resources, XML entities, unsafe paths, actual bounded expansion and cancellation. Mesh-state tests check hidden instances, repeated names, zero opacity, layout mismatch and batched rendering. GLB checks require self-contained resources for protected sharing while retaining ordinary companion-resource loading.
- Both migrations applied to a separate **local** D1 instance with a synthetic UUID. Real Worker/D1/Chromium checks at mobile width passed admin login, a fresh password prompt, rejection of a wrong password, edit-link issuance, saving display state, conflict handling, exact expiry preservation on label-only edits, the expiry maximum and revocation of both capabilities. No real Dropbox model or user secret was used.
- TypeScript and the complete app/PWA artifact build pass with a 256-file soft limit. The manager is a deferred ~9 kB chunk and bypasses viewer initialization; it allocates no viewer/GPU instance in the browser check. This is layout/runtime evidence, not physical-device memory certification.
- The full local Node runner encounters sandbox `EPERM` when artifact tests spawn another Node process. Focused files run directly; full-suite evidence must come from the PR's CI rather than counting that blocked run as a pass.

Real 3MF source/rendering acceptance on the isolated Cloudflare test deployment is pending. The owner has confirmed the prior protected STL flow works. The original initial-stage record follows for historical context.

## Initial implementation record (4 November 2026)

Recorded 4 November 2026. This evidence is for the draft implementation, not a completed Cloudflare deployment or physical-device certification.

- Node **22.23.4**: **70 actual test cases passed, zero failed** using the per-file test runner. This includes 18 SQLite-backed sharing Worker cases, actual bounded ZIP expansion tests, procedural planning/metadata fixtures, URL validation, mobile DPR, UI request races and deployment configuration/artifact tests.
- TypeScript (`npm run lint`), manifest synchronization, production Vite/PWA build and distribution validation passed.
- Default disabled-sharing Worker and configured test-sharing Worker both passed Wrangler packaging dry runs.
- The migration applied successfully to local workerd D1. Actual HTTP requests to the local Worker created a share, returned sanitized JSON without the source URL, revoked the share, and rejected it afterward. These checks used a synthetic source reference; no clinical model was uploaded or fetched.
- The pinned Wrangler runtime supports compatibility dates only through 25 September 2026. Local workerd testing therefore used `--compatibility-date 2026-09-25`; deployed configuration retains the existing 3 October date. Cloudflare preview testing must still verify that actual deployment.
- Initial application JavaScript is about **640 kB / 166 kB gzip**, compared with the historical approximately 840 kB / 228 kB gzip. ZIP and guide code is deferred; PWA precaching still includes these chunks. This is a startup parsing/evaluation improvement, not a measured total-transfer or physical-device speedup.
- Removed unused Express, GenAI, dotenv and Express type dependencies. The remaining dated dependency audit and build/development-tool findings are recorded in [SECURITY_REVIEW.md](SECURITY_REVIEW.md); the draft is not certified vulnerability-free.

Before beta merge, complete the isolated Cloudflare/Dropbox test in [SHARING_SETUP.md](SHARING_SETUP.md), browser and actual 3D Slicer checks in [TESTING.md](TESTING.md), and physical-device acceptance. Any additional application-level Slicer/browser evidence is recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Do not infer those results from helper tests.

At that initial stage, protected sharing was limited to Dropbox STL with procedural planning objects. Custom/local models, full model copies, automatic decimation, interruptible parser workers, wholesale asynchronous storage migration and replacement of the continuous overlay loop remain outside the completed scope.


## Public workspace revisions and assigned sharing users (5 November 2026)

- Node 22 SQLite-backed tests cover model-only sanitization, admin/sharer separation, individual password assignment/rotation, user disable, public recipient saves, immutable named revisions, concurrent-save conflicts, permission changes, bounded history, expiry and batch revocation.
- Actual workerd tests cover GET/HEAD/Range/Dropbox redirects plus salted, peppered PBKDF2 password verification without outbound network access.
- Local Chromium at 390×844 against a real local Worker/D1 passed admin login, sharing-user creation/password rotation/batch disable, public recipient saves without a password, no auto-save, version selection, stale conflicts, exact expiry preservation, expiry maximum, batch link revocation, scrolling and no persistent credentials. The recipient component used a synthetic model-state harness; this did not validate real 3MF parsing, physical device GPU behavior or Slicer interoperability. Service workers were blocked in this isolated browser harness.
- The Vite/PWA artifact builds with a 256 open-file limit. No geometry copies or additional package dependencies were introduced.
- Live Workers requests from the automation runner may still return Cloudflare error 1010; local checks do not establish remote acceptance. Test D1 migration 0003 and owner acceptance are required before beta/main promotion.


## Front-page login and compact workspace controls (6 November 2026)

- SQLite-backed checks cover Secure/HttpOnly/SameSite cookies, server-side logout revocation, cookie tampering, origin/environment isolation, account disable/password rotation, eight-hour expiry, permission profiles and named workspace expiry validation. No schema-4 migration is introduced.
- Actual local Chromium/Worker/D1 passed front-page login, page-reload session persistence, password-free guest model sharing, mobile workspace-name/expiry inputs, and cookie visibility checks. The guest recipient saved measurement definitions and mesh show/hide/opacity after the publisher logged out, then restored an older revision and encountered a stale-save conflict from another tab.
- Recipient controls start collapsed, show the revision number even when the name truncates, and fetch no revision list until expanded. The mobile test verifies scrolling and no horizontal overflow. Sessions/credentials are absent from application localStorage/sessionStorage.
- The model geometry is a synthetic state fixture; real 3MF parsing and physical iOS/Android GPU/Slicer acceptance remain separate checks. Browser service workers were blocked for the isolated harness. The normal API navigation denylist remains covered independently.


## Legacy share screen refinement (6 November 2026)

- The guest share screen retains the legacy instruction, QR, link field and Close/WhatsApp/Copy Link controls. Its protected model address is prepared automatically. Only signed-in users see the workspace checkbox; checking it prompts for new workspace name/expiry as needed.
- The header user icon uses the existing 18 px icon style beside Analytic Tools. Login/account windows have only the relevant fields/actions and error feedback; the explanatory share/login paragraphs and admin link are removed from the share window.
- Real local Chromium/Worker/D1 verified guest and signed-in layouts, desktop/mobile placement, clipboard-ready protected URLs, cached link reuse across dialog reopening/browser reload, expired-session login, name/expiry creation and guest saves. Model-only links projected from workspaces omit analytic/display metadata and inherit expiry/revocation; SQLite tests cover concurrent reuse and cleanup.
- Model-only references capture the model frame without exporting planning objects. The per-viewer in-memory cache is capped at eight entries and stores metadata only. Existing schema 3, bindings and secrets are reused; no migration is added.
- Browser geometry remains a synthetic model-state fixture, with external services blocked and service workers disabled for isolation. Real model/device/Slicer acceptance remains required.


## Workspace drawer and concurrent revision saves (6 November 2026)

- Workspace controls now live inside the existing left Visualization Tools drawer, with matching zinc backgrounds, borders, typography and blue Save action. A matching workspace revisions header icon beside Analytic Tools opens and expands them. Closing the drawer preserves display-name and request state. Expiry and self-reported-name notices are removed from this interface.
- Selecting a revision immediately restores its state without a Load button or additional confirmation. Older in-flight requests are cancelled and checked before restore; changing selection never writes a revision. Save remains explicit and requires a display name when history is enabled.
- The schema-3 saver allocates version numbers within one serialized D1 transaction and assigns strictly increasing server save timestamps. Four simultaneous requests with an identical clock and base each retained their own snapshot and returned their own transaction metadata. Older tabs can append without overwriting retained history. The transaction rechecks permissions, source identity, expiry and revocation; history limits and admin optimistic locking remain enforced. No migration is needed.
- **135 direct Node 22 tests passed locally**, excluding the four artifact tests whose subprocess execution requires the CI environment. TypeScript, the complete Vite/PWA artifact build with a 256-file limit, isolated test-Worker dry packaging, and all five actual workerd download/password/range/redirect cases passed.
- Real local Worker/D1/Chromium checks passed desktop (1280×900), mobile (390×844), light/dark drawer styling, adjacent header icon, state preservation on collapse, explicit password-free guest saves, distinct revisions from older tabs, and immediate history restore. A deliberately delayed older response did not replace a newer selection. Legacy guest sharing, authenticated workspace sharing, source concealment and projected-link revocation regressions also passed.
- These browser checks use synthetic geometry state, local test credentials, a local D1 database and blocked service workers. Physical device GPU behavior, representative real 3MF rendering and actual 3D Slicer exchange remain owner acceptance checks; no remote model or database content was used by this harness.


## Workspace Revision placement and pin (6 November 2026)

- Workspace Revision now sits inside Analytic Tools, below Analytics and above Project IO, rather than inside Visualization Tools. Its rounded section follows the existing menu styling. The separate workspace header icon is removed; the existing Analytic Tools icon is visible on mobile as well as desktop.
- Pinning expands the section and prevents hover minimization. Unpinned desktop sections retract after pointer exit, except while a field is focused or a request is running. Touch users expand/collapse explicitly. Closing Analytic Tools preserves display-name and save state. Automatic revision selection and explicit Save behavior are retained.
- TypeScript and the Vite/PWA artifact build under a 256-file limit passed. Real local Worker/D1/Chromium checked mobile/desktop placement, section ordering, pin/unpin, collapse state, removal of the header icon, automatic revision restore/cancellation, guest saves from older tabs, and legacy share/login/source-concealment regressions. Synthetic geometry was used; physical devices and Slicer remain separate acceptance gates. No database/backend change or migration is required.


## Consistent section controls and collapse timing (6 November 2026)

- Mesh Visibility, Advanced Visual Tools, Analytics, Workspace Revision, Project IO and Object List share one pin/chevron control component, with consistent icon order, sizes, spacing, colors, accessible names and state. Pinning clears pending collapse and expands the section; manual expansion/collapse remains immediate.
- Unpinned hover sections use a common 10-second delay. Pointer re-entry cancels the pending timer; leaving Visualization Tools no longer forces immediate minimization. Focused fields and active workspace requests retain their existing protection; touch expansion remains manual.
- TypeScript and the low-file-limit Vite/PWA build passed. Real local Worker/D1/Chromium checked all six pin/expand control pairs, matching icon sizes/order, pinned retention, visibility at nine seconds and collapse after ten, and restarting the delay on pointer re-entry. Existing mobile/desktop sharing, explicit saves and automatic revision restore/cancellation checks passed with synthetic geometry. No database migration is needed.


## Workspace typography, revision names and expansion animation (6 November 2026)

- Workspace Revision now uses the same 12px bold uppercase heading typography as Analytics and Project IO; the visible version badge is removed. Its labels use consistent 12px text, with normal-case, normal-weight input values.
- Display Name is relabeled Revision Name. Save with an empty/whitespace name expands the section, shows an inline required-name prompt and focuses the field without issuing a save. Existing saved names and the database format remain compatible.
- All six main collapsible sections use one 300ms ease-in-out grid/opacity transition. Workspace content remains mounted to animate in both directions and is inert/hidden from assistive technology while retracted. The independent 10-second pointer-leave delay and pin behavior remain unchanged.
- TypeScript, the low-file-limit Vite/PWA build and 22 workspace API tests passed. Real local Worker/D1/Chromium verified matching computed heading typography, no heading version badge, required Revision Name prompt/focus without a save, and identical computed 300ms easing/properties on all six sections. The existing 10-second/pinning, mobile/desktop, source-concealment and save/restore checks also passed with synthetic geometry. No migration is needed.


## PR #12 beta handoff preparation (6 November 2026)

- Restores the existing root Worker name `ntec3dpo-m3dv`; ordinary sharing remains disabled without D1. Test deployment still uses its dedicated generated configuration.
- Records the owner-confirmed beta D1 UUID `d23f95bc-a6a2-4f43-9fa9-5afaa340f325` in a beta-only profile. Config checks reject known database UUIDs reused across tiers. Beta Preview/cleanup and main publishing reject another source branch; beta publishing explicitly names Preview beta.
- Beta Preview and scheduled-only cleanup packaging pass without publishing, both with a synthetic UUID override and with the recorded beta profile. Cleanup has no public workers.dev/preview URL, assets or privileged secret. CI now checks both generated beta bundles using a synthetic ID; it does not deploy or migrate a remote database.
- All 139 direct Node 22 tests and TypeScript passed locally. The four artifact subprocess checks run separately in CI. The phone runbook's fresh-schema SQL was verified in an in-memory SQLite database, including repeated scope insertion, the result `beta|3|4|2|1` and all three migration bookkeeping rows.
- Remote beta schema, runtime secret names/settings, cleanup scheduling and live acceptance require owner confirmation. Database creation/UUID confirmation is not proof that the schema or runtime binding is ready. PR #12 remains draft pending that handoff; beta/main have not been merged by this preparation.


## Beta runtime-secret bootstrap order (6 November 2026)

- Owner confirmed beta schema result `beta|3|4|2|1` and the beta dashboard notice: Variables cannot be added to a Worker that only has static assets. The current beta commit's Wrangler configuration was inspected and contains assets with no Worker entry point.
- The handoff guide now makes the sequence explicit: after schema/build settings and owner approval, merge/deploy the PR backend to beta first; then add beta-only runtime secrets and check configuration readiness. The existing application rejects protected-sharing operations while either required secret is absent. No database or application-code change is needed for this correction; main remains a separate release.
- A direct Worker check confirmed that when either or both beta runtime secrets are missing, `/api/shares/config` returns `enabled:false` and protected create/read/save/model/history requests return 503 without database access. The existing Worker tests also passed. This verifies the bootstrap boundary, not the remote beta deployment.


## Dropbox uploads and local workspace drafts (7 November 2026)

- Adds migration 0007 with metadata-only upload reservations, private immutable Dropbox asset references, workspace attachment and per-revision model/identity/source backfills. Existing secrets, scope, database UUID and legacy source fingerprints are preserved. Uploads use sequential 4 MiB chunks, bounded quota reservations, active-user checks, completion reconciliation and explicit redirect rejection; model bytes remain in Dropbox.
- Workspace Revision contains model controls inside Analytic Tools. It appears for authenticated users with no model and for protected-workspace recipients. Guests can open a local STL/3MF or personal Dropbox link; cloud upload is shown only for authorized sessions. A local replacement remains a device-only draft and cannot publish an unhosted geometry revision. Existing attached-model saves remain available without login when editing is enabled.
- Guest Project IO produces one Slicer-compatible markup JSON using the existing metadata/coordinate conversion, without generating redundant STL strings or a ZIP. Individual STL object downloads remain available. Invalid 3MF headers now have model-specific download/re-export guidance, while bounded ZIP/self-contained-resource validation remains enforced.
- Automated coverage includes upload authentication/cancellation/offsets/quotas, account reconnect, chunk-boundary content hashes against Dropbox's published reference vector, ambiguous provider completion, private metadata/streaming, attached-model capability checks, concurrent server-numbered model/JSON revisions, valid multi-object 3MF preflight, bad local 3MF rejection before network access, version-bound client downloads and local JSON export. Server-rendered component tests cover guest recipient, logged-in empty draft, local-only draft and in-flight control retention. Native workerd tests additionally exercise authenticated content upload/download Request transport.
- TypeScript, production/PWA artifact generation and isolated Worker dry-run pass. Local synthetic tests do not establish live Dropbox/phone acceptance. The browser interaction run was not completed; step 8 of the Dropbox guide supplies the required owner checks after migration/deployment. No beta/main deployment or database migration is performed here.
