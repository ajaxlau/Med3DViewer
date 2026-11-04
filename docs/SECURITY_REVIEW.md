# Security review for the isolated sharing test PR

Reviewed 4 November 2026. This is a focused source review and local test record,
not a security certification or approval to deploy patient-identifying data.
Keep the PR in draft until the Cloudflare, source-host and device checks in
[TESTING.md](TESTING.md) and [SHARING_SETUP.md](SHARING_SETUP.md) are complete.

## Reviewed boundaries

- Creation/revocation uses the approved single environment-wide staff key. The
  server compares SHA-256 digests and accepts no key in URLs or JSON. This is not
  per-person authorization; any holder of the current key can revoke a share in
  that database scope. Rotating it retains that authority.
- Recipient tokens have 256 random bits; D1 stores only their SHA-256 hashes.
  Private source references are AES-GCM encrypted with random IVs and the token
  hash as authenticated context. Workspace text is ordinary D1 metadata and can
  contain identifying information; reviewers must not mistake encrypted source
  URLs for encryption of every workspace field.
- The approved source policy is Dropbox content hosts over HTTPS. Every redirect
  hop is checked. The gateway accepts no public destination parameter, visitor
  authorization/cookies or arbitrary request headers. Source redirects, cookies,
  filenames, error bodies and unsafe headers are not relayed to recipients.
- Version 1 sharing accepts remote STL only. Client SHA-256 verification occurs
  before importing/restoring the workspace; a changed origin file is rejected.
  Changed bytes may already have been delivered before the browser detects this.
  This is source-address concealment, not immutable delivery or download DRM.
- JSON is bounded and allowlisted; the server rejects custom-model geometry,
  DataURLs and unknown fields. Procedural planning coordinates are retained.
  Tooltip labels/descriptions use text nodes rather than HTML interpolation.
- Share data requires a matching physical-database scope marker and runtime
  scope. Wrong/missing bindings fail closed. Every protected read rechecks expiry
  and revocation. Cleanup uses the same scope check and has no public HTTP trigger.
- API responses use no-store, no-referrer, same-origin resource policy, noindex
  and nosniff. Source fetches bypass the platform cache. Share landing addresses
  also need no-store/noindex headers; verify those on the deployed response.
  Third-party analytics was removed from the entry page to avoid link/token
  disclosure. This does not remove the required external engine/CDN trust boundary.
- Shared recipient sessions skip owner-workspace localStorage hydration and
  autosave. The source model is streamed rather than stored by the platform.
  Rendering still requires transient memory, and recipients can save received data.

## Findings raised during independent review

1. **Invalid-token requests must not create D1 rate-limit rows.** The original
   draft called the D1-writing read limiter before checking whether the share
   existed. Distributed random-token requests could grow the rate table faster
   than bounded cleanup. Validate the share first, then apply the read limiter;
   require a regression that invalid tokens leave that table unchanged. The
   backend was changed during review to perform the authoritative token lookup
   first; two added regressions cover invalid-token writes and malformed routes
   performing no database access.
2. **Apply noindex/no-store to `/s/*`, not just the JSON/model API.** Otherwise a
   crawler following a forwarded bearer address can receive the viewer shell and
   load planning data. A `/s/*` header rule was added during review; verify its
   actual behavior through Workers Assets/SPA routing in the test deployment.
3. **ZIP header sizes alone do not bound decompression.** A locally reproduced
   10,315-byte ZIP claimed a one-byte uncompressed entry but emitted 10 MiB before
   JSZip reported its size mismatch. Incoming planning ZIP reads now use
   `readArchiveEntry`, which counts actual emitted bytes against one cumulative
   archive budget, pauses the stream and releases retained chunks when exceeded.
   Limit errors propagate instead of continuing fallback imports. Three added
   tests cover the forged-header case, cumulative limits and normal UTF-8/binary
   recovery. Header checks remain an early rejection layer, not the only limit.

The review did not identify another concrete source-URL leak or script execution
path in the new share service at the reviewed revision. That statement is limited
to this review, not proof that no such path exists.

## Dependency audit and relevance

The local lockfile audit recorded **0 critical, 28 high, 8 moderate and 75 low**
findings after unused Express, GenAI, dotenv and Express types were removed.
Counts are a dated snapshot and can change with registry advisories.

- The audited client packages React/ReactDOM, JSZip, QRCode.react, Lucide, Motion
  and React Markdown were not individually listed in that report. Absence from
  this scan is not proof of safety.
- The remaining high chains include Vite/its development-server/editor paths,
  PostCSS/source-map processing, Babel/Workbox build dependencies, and
  Wrangler/Miniflare's undici/sharp chains. These need patch/compatibility triage
  before production promotion; this PR does not claim an audit-clean lockfile.
- The deployed Worker imports the pure planning validator and Web APIs, not
  Express, Miniflare, undici or sharp. Tooling findings should not be presented as
  an established remotely exploitable production Worker path. Conversely, build
  and local-development exposure still matter: do not expose Vite/Miniflare
  publicly or build untrusted source with valuable secrets while triage remains.
- Example advisory references from the audit: [Vite middleware cross-origin script
  execution](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [PostCSS source-map
  file disclosure](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), and [Babel
  sourceMappingURL file read](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8).

## Local evidence and remaining release checks

Direct execution of `tests/shareWorker.test.ts` ran 18 SQLite-backed cases with
zero failures at the time of this review. They cover encrypted/hash-only source
storage, scopes, source policy, expiry on JSON/HEAD/Range/model reads, revocation,
creation/storage quotas, header stripping, redirects/HTML, cancellation, body
limits, scoped cleanup, key rotation and malformed restored records. The
invalid-token-write regressions are included in that 18-case count. The three
archive extraction regressions also passed by direct execution. Final PR
evidence must use the later complete test count.

Before beta/main promotion, verify deployed headers, no persistent model caches,
real Dropbox redirects, source URL/key absence from browser network/error/log
surfaces, request cancellation and resource ceilings. Review Cloudflare logging
settings and third-party engine behavior, not just application console calls.
The per-IP read limiter does not establish a complete distributed-abuse or
billing budget; use an appropriate deployment-level budget/rate strategy for a
public release. Keep keys in a password manager/runtime secrets and use synthetic
data in the test deployment. D1 active-row cleanup does not erase already
downloaded copies, the origin-host file or recovery history immediately.
