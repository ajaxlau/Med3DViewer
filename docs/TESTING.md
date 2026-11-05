# Testing the implementation PR

This document defines acceptance for the draft PR before it is merged into beta.
A successful build is one gate; it is not evidence that a deployed share, physical
phone, or 3D Slicer workflow has passed. Record results against the exact PR
commit, database environment and deployment URL being tested.

Use synthetic or de-identified data only. Do not put a real model URL, access key,
patient name, share token or creator secret in an issue, screenshot, fixture or
CI log. The public share address is itself a bearer credential.

## Local verification

Use the repository's supported Node version and a clean dependency install:

```sh
npm ci
npm run lint
npm test
npm run build:cloudflare
npm run check:cloudflare
```

The last command checks Worker packaging without publishing. Tests must use an
isolated local/test database; do not run destructive expiry/revocation tests
against beta or production. See [implementation status](IMPLEMENTATION_STATUS.md)
for recorded evidence and incomplete checks.

The automated suite should demonstrate policy and format boundaries, including
DPR after resize, schema rejection, request supersession, source URL validation,
workspace preservation and expiry. Passing helper tests alone does not establish
an entire importer or rendered planning workflow.

## Minimal fixture set

Create a small asymmetric model with explicit millimeter assumptions and a known
orientation. Include landmark coordinates that differ on every axis. An STL does
not intrinsically encode units or anatomical orientation.

| Fixture | Definition / expected result |
| --- | --- |
| Distance | Points `(0,0,0)` and `(10,0,0)` give 10 mm. Repeat on Y/Z and with a translated/rotated model root. |
| Angle | Points `(10,0,0)`, `(0,0,0)`, `(0,10,0)`, with the middle point as vertex, give 90 degrees. |
| Orientation | Landmark LPS `(10,20,30)` corresponds to RAS `(-10,-20,30)`; use further asymmetric points to expose mirroring and double conversion. |
| Transforms | A non-identity model root, translated/rotated planning object, nonuniform scale and duplicate/group operation; record final world and exported model coordinates. |
| Procedural objects | One plane with finite extents/thickness, cylinder with known diameter/extension, ordered curve, point, measurement, angle and Unicode annotation. |
| Local custom mesh | Custom STL plus duplicated submesh for ZIP restoration. Protected sharing must explain the unsupported asset rather than drop it or store mesh bytes. |
| Malformed input | Invalid JSON types, nonfinite/oversized coordinates, missing control points, unsafe text/style, embedded remote asset URL and an oversized metadata body. |
| Model identity | Two valid but different STL byte streams. Changing the hosted source after sharing must prevent the old planning snapshot from being applied to the replacement model. |
| Large input | Synthetic 10/50/100 MB binary STL where practical, high mesh count, compressed/missing-companion inputs, and a model beyond the current device limit. |

Agree tolerances from source encoding and numeric precision before comparing
results. Record full values and coordinate errors, not only rounded UI labels.
The navigation step of 0.6 mm in spline modes is not an accuracy guarantee.

## Existing viewer and Analytic Tools

Run on a desktop browser first and then on physical mobile devices.

1. Open a local fixture, orbit/pan/zoom, select each preset view, reset the camera,
   toggle visibility/opacity, explosion, ghosting, rulers and background image.
   Check theme, fullscreen and resizing without a stale overlay or horizontal
   overflow.
2. Create every procedural object above. Change names, style and dimensions; move,
   rotate and scale with the gizmos; duplicate an object/group, change membership
   and visibility, and reposition an annotation pin. Confirm that entering and
   leaving a tool does not leave picking or camera controls stuck.
3. Export an individual supported STL, group ZIP and all-object ZIP. Reopen the
   same source model and import each applicable artifact. Compare positions,
   normals, dimensions, labels, groups, visibility and transforms. Verify that
   opening model B and then A preserves A's intended saved workspace.
4. Exercise orthogonal clipping and spline clipping: axis direction, inversion,
   lock/unlock, zoom, progress and keyboard stepping. Exercise endoscopy
   play/pause, reverse, loop, FOV, look/path offsets and exit. The camera and input
   mode must restore correctly after exit.
5. Cancel model loading during download and parsing where supported, immediately
   open another model, and wait. A stale result must not replace the newer model.
   Loading errors and storage failures must leave a usable recovery path.
6. Capture a normal and transparent PNG and the six-view sequence; verify image
   dimensions and view restoration after success/failure. Check existing QR,
   clipboard, native sharing and WhatsApp fallback without sending private data.

## Actual 3D Slicer interoperability

Record the released 3D Slicer version, operating system and schema used. Import
artifacts into Slicer itself; validating JSON or running a coordinate helper is
not sufficient.

| Direction | Required checks |
| --- | --- |
| Viewer → viewer | ZIP and standalone metadata restore all representable fields and custom assets; repeated cycles do not drift. |
| Viewer → Slicer | Markups and surfaces align with the same reference model; compare asymmetric landmarks, known distances/angles, curve control-point order and plane orientation. |
| Slicer → viewer | Plain `.mrk.json` without app metadata works for supported types. Test string and supported numeric coordinate-system declarations, LPS/RAS and documented unit handling. |
| Viewer → Slicer → viewer | Export through Slicer, reopen in the viewer and compare coordinates and measurements; identify app-specific fields that Slicer legitimately does not preserve. |

A cylinder's STL is its surface; a Slicer Line may represent its axis. Plain STL
cannot retain annotations, groups or dimensions. Unsupported fields/types must be
reported rather than silently interpreted as equivalent. Model-space comments
in an STL do not override the actual source coordinate convention.

## Protected-share preview acceptance

Complete [Cloudflare database/binding setup](SHARING_SETUP.md) before this
section. Use the dedicated test database and test keys. Keep beta/main promotion blocked until
the required runtime checks pass.

| Test | Expected result |
| --- | --- |
| Fresh open and refresh | Open `/s/<token>` in a fresh profile and refresh. App JS/CSS/PWA assets resolve correctly; only platform API/model addresses appear in recipient traffic. |
| Supported source | Share synthetic, approved-source STL, multi-object 3MF and self-contained GLB files. Recipients receive the same model identity, mesh visibility/opacity, groups and planning coordinates. |
| Editing authorization | View links cannot write to D1. Issuing/retrieving edit links requires the creator password; view JSON must not disclose edit tokens. Edit recipients can explicitly Save; password/token values are not persisted in browser storage. |
| Concurrent edits | Two saves of the same revision produce one success and one conflict. Admin settings changes also invalidate an editor's stale revision. No automatic retry may overwrite a newer save. |
| Administration | Test password login, fresh-password edit-link sharing, labels, exact expiry preservation on label-only updates, bounded pagination, mobile scrolling and revocation of both capabilities. Expiry changes remain within 180 days of creation. |
| Upgrade compatibility | Old view links and creation work before the additive migration; edit/admin operations remain disabled. Apply migration 0002, preserve records/scope/keys, then verify editing becomes available. |
| Local-only assets | A local main model or custom mesh gives an explicit limitation. No file bytes, base64, DataURL or model vertex arrays enter D1. |
| Creation authorization | No/wrong key and cross-origin requests fail. The creator key stays out of persisted browser storage, URLs, source bundles and logs. |
| Environment isolation | Test Worker plus a beta/main-scoped database fails closed; missing configuration/database also fails closed. |
| Source protection | Tagged source hostname, URL query/access key and upstream filenames do not appear in public JSON, HTML, redirects, headers, errors, QR data, analytics or diagnostic output. |
| Redirect / destination controls | Disallowed host, private/IP/local target, excessive redirects and caller-supplied arbitrary destination are rejected. Valid approved-source redirects still work. |
| Expiry | With a controllable clock, new JSON/model/HEAD/Range requests fail at the exact 180-day boundary, even if cleanup is deliberately delayed. |
| Revocation | Revoke an active test link; metadata and model access fail. A previously loaded/downloaded model is not claimed to be recalled. |
| Cache and conditional requests | `no-store`, service-worker exclusion and protected API routing do not allow cached, conditional or byte-range requests to bypass validity checks. |
| Source unavailable/changed | Removal, expiry, denied access or changed model bytes cause a safe error; the browser does not receive the origin URL and does not apply stale analytics to changed anatomy. |
| Bounded resources | Large/slow/no-length downloads, declared oversize, client cancellation, invalid JSON and metadata beyond the configured budget terminate without continuing an orphaned fetch or storing model data. |
| Cleanup / restore | Scheduled cleanup removes expired/revoked test metadata as specified; backup-restoration procedure does not reactivate expired/revoked links. Record provider backup retention separately. |

Record the exact request status, sanitized error and behavior for failures. Never
copy raw private request headers or response bodies into the report. Inspect the
database schema/rows and cache/storage use to verify that no model copy is kept;
"no R2 binding" alone does not prove that JSON contains no geometry.

## Physical mobile performance and reduction feasibility

Use a physical iPhone/iPad with Safari and a constrained Android device where
available, plus desktop Chrome. Browser emulation checks layout/DPR but does not
reproduce mobile memory pressure, GPU drivers, thermal throttling or tab eviction.

For three comparable cold/warm runs record browser/device, viewport/DPR, load
profile, fixture bytes/triangles/mesh count, import-to-interactive time, orbit and
clipping frame times, selection latency, cancel response and save/export/capture
latency. Repeat load/unload cycles and distinguish JS heap, renderer resource
counts and unavailable GPU-memory figures. Compare the same workflow/fixture
before and after; no numerical improvement is claimed without a baseline.

Rotate the device and resize panels while Safe Mode is active. Confirm the actual
renderer DPR remains capped. Verify low-memory profiles, smooth endoscopy and
responsive current controls, and check that opening panels does not lose drafts.
Oversized models must stop with usable desktop/external-simplification guidance.

No automatic geometry decimator is approved solely because file compression or
binary STL encoding makes a download smaller. Those changes may leave triangle
count and GPU buffers unchanged. A reduction feasibility report must cover its
own peak memory, processing/cancel time, surface deviation, bounds, scale, thin
structures, picking and every affected Analytic Tool/export. Do not ship reduction
if loading the source already exceeds the device budget or if analytical
consistency cannot be demonstrated. Desktop guidance remains the fallback.

## Promotion record

Before beta merge, attach local check results and the test preview results with
uncompleted matrix rows clearly marked. Keep the PR draft while deployment,
physical-device or Slicer correctness gates remain unresolved. After an approved
promotion, verify beta and then production at their actual URLs and deployed
commit IDs, including assets, fresh profile, import, measurement, share and expiry.
Do not count the previous release's results as a new deployment verification.
