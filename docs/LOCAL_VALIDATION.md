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
