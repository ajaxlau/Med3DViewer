# Med3DViewer implementation plan for review

Revised: 4 November 2026. Status: proposal only; this commit changes documentation.

Review basis: beta [`be43218913e1`](https://github.com/ajaxlau/Med3DViewer/commit/be43218913e19bee94978cc4215fe1bbaa34332f), whose application code is unchanged from `582176940cd6`. The README synchronized from main is preserved.

## Objectives and limits

1. Keep the existing platform simple, lightweight and usable on phones/tablets, with conservative CPU, memory and GPU use. For models beyond a device's capacity, investigate automatic reduction with clear notice; otherwise give a useful desktop-browser recommendation before an avoidable failure.
2. Review and harden the security of the current application, imports, dependencies, local storage, remote loading and deployment.
3. Improve and debug existing features only. Do not expand the product.
4. Make the existing Analytic Tools reliable and verify consistent object import/export, including actual interoperability with 3D Slicer.

This revision supersedes the previous proposals for new quality modes, mesh search/filter controls, camera-sharing options, a new mobile tool-sheet design and full undo/redo. Those additions are removed from scope. Internal changes such as worker parsing, deferred imports or binary storage are justified only by a demonstrated defect or performance bottleneck in an existing workflow. Avoid a framework/renderer rewrite, new backend/proxy, new formats, new analytics tools, cloud storage or additional user accounts.

Automatic model reduction is a narrowly scoped feasibility investigation requested for oversized mobile models. It is not an approved general editing/export feature or a promise that every large model can be made safe for mobile.

## Current state and evidence

- Beta already has Safe Mode, load limits, loading stages, Cancel, request IDs, URL/header validation, Dropbox direct-content conversion, scene disposal, GPU probing and context-loss notices. Improve these paths rather than duplicating them.
- Safe Mode's DPR cap already survives embedded-viewer resize calls. Normal automatic resolution still uses GPU-tier caps independently of the mobile/low-memory load profile.
- Existing Analytic Tools include distance/angle measurements, planes, cylinders, curves, points, annotations, transform gizmos, groups, duplication, custom STL overlays and submesh duplication. STL, ZIP/metadata and Slicer markups paths exist but require broader correctness tests.
- Historical release checks recorded 16 passing automated tests plus pre-release browser checks. They do not establish complete Analytic Tools correctness, physical-device performance, security assurance or full 3D Slicer compatibility. No new runtime tests or security audit are claimed by this documentation revision.
- Cloudflare delivery has working build/artifact checks and static-assets configuration. Production release deployment succeeded previously, but the subsequent live browser acceptance was not completed. Keep delivery configuration stable; see the [deployment runbook](DEPLOYMENT.md).

## Code findings to address first

| Priority | Observed code | Required improvement |
| --- | --- | --- |
| P0: untrusted tooltip content | `ViewerManager.showCardTooltip` interpolates object name/text/description and style data into `innerHTML`; these values can originate in imported planning data. | Replace unsafe interpolation with text nodes and validated style values; test hostile imported labels/descriptions. Treat this as a concrete security finding to fix, without claiming a completed exploit assessment. |
| P0: saved-workspace loss | `resetWorkspace` removes every `3dpo_planning_*` key, and normal model-loading calls reset. | Separate disposing the current scene from deleting saved records. Loading B must preserve A; existing reset controls must state their exact scope. |
| P1: inconsistent import boundaries | Primary URL loading has validation and credential omission; custom-model restoration can fetch imported `fileDataURL` values through a different path. ZIP/JSON import also has separate validation. | Apply appropriate schema, URL, size and resource limits consistently to every entry path. Do not let imported metadata initiate arbitrary unvalidated network requests. |
| P1: interchange transforms | Export/import mixes model-local coordinates, mesh world matrices, LPS/RAS conversion and app-specific metadata. The Slicer importer calls `toUpperCase()` on the supplied coordinate-system value. | Define and test one coordinate/unit contract; validate field types and supported coordinate representations, transforms and schema variants before reconstruction. |
| P1: mobile workload | Load profiles specify conservative DPR limits, but normal rendering can use higher tier-based limits; remote buffers, DataURLs and synchronous localStorage serialization add memory/work. | Enforce one conservative policy through the existing controls and remove redundant representations based on profiling. |
| P2: idle/startup/capture work | Continuous application RAF, broad context updates, complete mounted lists, blocking CDN dependencies and retained snapshot DataURLs. | Reduce unnecessary work behind the current interface; keep only changes supported by measurement and regression evidence. |
| P2: misleading status | GPU probe results and unconditional WASM/BVH/offline badges can imply active functionality not established by the renderer/storage path. | Make existing labels reflect detected capabilities and actual operation. Correct unsupported README claims in a later approved implementation/documentation PR. |

Primary references: [ViewerManager](../src/lib/ViewerManager.ts), [loading policy](../src/lib/modelLoading.ts), [DPR enforcement](../src/lib/renderResolution.ts), [GPU detection](../src/lib/gpuDetection.ts), [GPU status card](../src/components/GpuCapabilityCard.tsx), [utility/disposal helpers](../src/lib/utils.ts), [ViewerContext](../src/context/ViewerContext.tsx), [Analytic Tools UI](../src/components/PlanningMenu.tsx), [modals](../src/components/Modals.tsx), and [engine entry page](../index.html).

## Workstream A — lightweight mobile operation and oversized models

### Improve the existing load/render paths

- Base load limits on available signals, file format, estimated decoded geometry/texture cost and measured device behavior. Input file size alone is insufficient; device memory and GPU budgets are estimates, especially on iOS.
- Unify the automatic DPR limit with the existing mobile/low-memory profile and Safe Mode, including resize/orientation changes. Do not add quality-mode controls.
- Dispose owned geometries, materials, textures, listeners, temporary URLs and stale import results correctly without damaging resources shared by duplicates.
- Avoid retaining download chunks, Blob/File copies, base64 and decoded geometry simultaneously when unnecessary. Move large binary persistence off synchronous localStorage only if measurements justify it; preserve legacy records and recovery.
- Reduce idle overlay work, isolate rapidly changing endoscopy HUD state, pause hidden-page work and defer heavy code/panel content. Preserve the current layout, tool state, touch access and keyboard behavior.
- Investigate OV completion/error callbacks and interruptible STL worker parsing before changing importer integration. Preserve existing format/companion handling and prevent superseded imports from mutating the scene.
- Bound existing snapshot/orbit-capture resolution and temporary memory; preserve camera/render state after failure. Improve existing progress/error feedback without adding capture modes.

### Oversized-model decision policy to evaluate

| Condition | Proposed behavior using existing loading/error UI |
| --- | --- |
| Fits the measured device budget | Load the original with conservative rendering and existing progress/Cancel feedback. |
| Near the budget | Notify the user that the model is large, apply existing Safe Mode protections as appropriate, and explain that a desktop browser may be needed. |
| Over budget, with a reduction method proven feasible and safe for this workflow | Investigate automatically preparing a lighter working copy, with notice before processing and a persistent indication that it is reduced. Show what changed and retain the source file unchanged. Enable only after the review gate below. |
| Over budget and reduction is unavailable, unsafe, fails, or needs too much memory itself | Stop before expensive allocation where possible. State that this device cannot safely open the model and recommend a desktop browser with more available memory, or an externally simplified copy. |
| Desktop also exceeds its budget | Keep bounded limits and recovery guidance; do not imply desktop hardware has unlimited capacity. |

The feasibility report must distinguish smaller download bytes from lower runtime memory/GPU cost. Compression or binary STL encoding may reduce file size without reducing triangles or GPU buffers. Start with representations that preserve geometry; do not strip meaningful vertex colors, textures or anatomical content blindly.

If geometric decimation is needed, evaluate a bounded-memory worker approach on synthetic/de-identified fixtures. Record input/output triangles, peak memory, processing/cancel time, surface deviation, bounds, scale, thin structures and boundaries. Reduction cannot rescue a model if fully decoding it already exceeds the budget; such cases need the desktop/external-simplification route.

Do not silently replace the geometry used for measurements, surface picking, clipping, planning or export. Retaining an original analysis mesh plus a lighter display mesh may itself exceed memory and can produce visible/picked-surface mismatches. If consistency of the current Analytic Tools cannot be demonstrated within the device budget, do not enable reduction for that workflow; recommend desktop instead. Defining acceptable deviation and workflow limits is part of owner review, not an assumed clinical tolerance.

Exit evidence: physical iPhone/iPad and constrained Android tests where available; stable resources across repeated loads; cancellation stays responsive; no source overwrite; visible reduction notice; existing analytics/exports remain consistent, or the model is rejected with clear desktop guidance.

## Workstream B — security of the current platform

Review actual data flow and fix findings; do not describe a static review or dependency scan as a guarantee of security.

| Surface | Review/fix scope | Acceptance evidence |
| --- | --- | --- |
| Imported text and DOM | Audit names, annotations, descriptions, tooltips and imported style fields. Use text rendering for user content and validated color/style values; keep Markdown rendering free of executable imported HTML. | Hostile strings render as text; no script/event handler executes when importing, hovering, editing, saving or reloading. |
| Files, ZIP and JSON | Validate structure, finite numeric coordinates, dimensions, transforms, array lengths, nesting, object counts and supported object types. Limit actual expanded archive bytes/entries, texture/geometry allocation and processing time; reject ambiguous/duplicate asset references safely. | Malformed, truncated, oversized and highly compressed archive fixtures fail without a tab crash or partial workspace corruption. Limits also cover custom STL and planning imports. |
| URL and companion fetches | Review every fetch, redirect and format-loader dependency, including imported `fileDataURL`, glTF buffers and OBJ textures. Preserve legitimate Dropbox/signed links, scheme/mixed-content restrictions and credential omission; validate final use, not only the initial URL. Prefer bundled/validated local assets for workspace restoration. | Unsafe schemes/credentials and unexpected metadata fetches are blocked; supported public models and companions still load; no CORS-bypass proxy is introduced. |
| Dependencies and executable assets | Review lockfile advisories and exploitability, remove unused packages where verified, retain compatible pinned engine assets/SRI, and test any patch. Avoid adding a large dependency for a small fix. | Findings record severity, relevance, remediation and residual risk; no unresolved critical/high issue relevant to the supported runtime/deployment path is released without resolution or a documented owner decision. |
| Browser and deployment protections | Review HTTPS, CSP, content-type handling, referrer policy, external-window isolation and build-secret exposure. Test compatible script/worker/connect rules and headers against existing CDN/import/PWA behavior before enforcement. Keep secrets out of client bundles and logs. | Beta header/network checks, expected asset types, no secret values in artifacts, and functional imports/workers/PWA/sharing under the chosen policy. Any necessary Cloudflare change is specified for separate review. |
| Data privacy and local state | Inspect analytics, diagnostics, URLs, browser storage and service-worker caches for model links, access keys, annotations or identifying filenames. Existing `gtag` page tracking and `?url=` entry links need a leakage check. Redact sensitive values; do not persist/cache private remote models by default or upload files outside explicit existing sharing actions. | Network inspection with synthetic tagged data confirms no unintended disclosure; rejected imports preserve previous work; storage/quota errors are visible and recoverable through existing export. |

Security regression tests should cover the concrete boundaries above. No production model or private access token is needed in fixtures, logs, CI or this plan.

## Workstream C — Analytic Tools debugging and reliable exchange

Test each existing tool through create, edit, transform, duplicate/group, save/reload and the formats that can represent it. A visible object or successful JSON parse is insufficient.

| Existing object/tool | Required correctness checks | Existing exchange contract to verify |
| --- | --- | --- |
| Distance and angle | Known 10 mm distance and 90-degree fixtures; correct angle vertex, pick coordinates, labels and results after transforms; invalid/degenerate picks handled. | Slicer Line/Angle control points and values; app ZIP/metadata restores measurements. Do not require an STL surface for a non-surface measurement. |
| Point and annotation | Surface position, diameter/pin size, text, leader/card position and repositioning; Unicode and hostile labels. | Fiducial/annotation semantics in Slicer, labels/descriptions and coordinates; app-only layout data remains in app metadata. |
| Plane | Non-collinear picks, center, normal, extents, thickness and gizmo transforms; zero/default values round-trip correctly. | Plane markup and exported surface alignment; validate the released Slicer schema's control-point/orientation representation. |
| Cylinder | Endpoints/axis, radius versus diameter, extension, rotation/scale and duplication. | STL carries the cylinder surface; Slicer Line can carry its axis. Radius/extension custom properties are app metadata, not a native Slicer cylinder object. |
| Curve | Control-point order, interpolation/path length, thickness, transforms and duplicate behavior. | Slicer Curve control points and interpolation conventions; quantify differences rather than assuming identical sampled paths. |
| Custom STL/submesh | Placement, geometry, normals/winding, model-root transform, scale, duplicates and resource ownership. | Individual/group/all-object STL and ZIP restoration; verify overlap with the reference anatomy in Slicer. |
| Groups and styling | Membership, names, visibility, color, opacity, group duplication and removal without unrelated data loss. | Full fidelity in app ZIP/metadata; explicitly document fields that plain STL or native Slicer markups cannot carry. |
| Clipping, spline sections and endoscopy | Axes/inversion, 0.6 mm navigation steps, camera lock/zoom, FOV/look/path offsets, pause/reverse/loop and mode exit restore camera/input state. | Existing model/planning coordinates stay unchanged by viewing operations. The step interval is not an accuracy claim or a new surgical-cut export function. |

### Coordinate and round-trip contract

- Establish a documented boundary between loaded-model coordinates, Three.js world transforms and exported coordinates. Apply model-root and object transforms exactly once. Test translated/rotated/scaled roots and nested objects, not just identity transforms.
- Test LPS and RAS with asymmetric landmarks on all axes to detect sign flips, mirroring and double conversion. Handle the coordinate-system representations supported by the chosen released Slicer version without assuming every value is a string.
- Treat STL as unitless geometry: an STL comment stating LPS/millimeters does not make an arbitrary input anatomically oriented. Confirm the source-unit/orientation assumption with fixtures; preserve scale and document ambiguity rather than inventing medical orientation.
- Validate units, finite coordinates, matrix/quaternion data, normals, plane orientation and control-point definitions against known reference data. Agree numeric tolerances appropriate to encoding and precision before changes; rounded UI labels must not replace stored precision.
- Test standalone `.mrk.json`, plain Slicer files without `appMetaData`, app JSON/ZIP with metadata, group/all-object exports, custom mesh bundles, legacy bundles and repeated export/import cycles. Detect missing/duplicate assets and stale blob references.
- Exercise **viewer → viewer**, **viewer → 3D Slicer**, **3D Slicer → viewer** and **viewer → Slicer → viewer** on a documented released Slicer version and its schema. Open results in Slicer and compare geometry, landmarks, measurements and orientation; schema validation alone is insufficient.
- Separate geometry/coordinate fidelity from metadata fidelity. Plain STL cannot preserve groups/labels; Slicer may ignore app extensions. Do not report lossless interoperability for unsupported fields, silently reinterpret unsupported markup types or add a new format to work around a bug.

Exit evidence: a per-object/format compatibility matrix with fixture results, numerical differences/tolerances and known limitations; no unexplained coordinate, unit, dimension or transform mismatch. Security validation must also apply to all interchange paths.

## Existing-feature regression coverage

The work preserves current intake formats/routes, mesh visibility/highlight/opacity, ghosting/explosion, camera presets/orbit/reset/fullscreen/auto-rotation, rulers/background image/theme, planning tools/groups, clipping/spline/endoscopy, persistence, STL/ZIP/Slicer interchange, snapshots/QR/WhatsApp/native-share fallbacks, diagnostics and PWA behavior.

Improve touch targets, accessible labels, numeric validation, focus and error messages within these existing controls. Do not add screens or unrelated workflows. Optimize list rendering internally if needed without introducing search/filter features. Bound captures and archive exports without new capture modes. Verify the currently advertised offline scope and service-worker updates; do not expand private-model caching.

## Delivery order and review gates

| Stage | Deliverable | Gate before continuing |
| --- | --- | --- |
| 0 — reproduce and baseline | Focused bug list, security findings, synthetic fixtures, current feature/format matrix and mobile/desktop measurements. Record startup, first interactive model, peak allocations/resources, orbit/clipping/playback frame times, idle work, cancel, save and export. | Reproducible issues and agreed performance/precision budgets. Report hardware/browser, cold/warm cache and repeated runs; no invented speedup or memory guarantees. |
| 1 — urgent security and data retention | Fix unsafe tooltip rendering/import boundaries and unintended saved-workspace deletion first, with narrow regression tests. Review remaining security findings. | Malicious imports cannot execute content or trigger unvalidated fetches; switching/resetting models preserves the intended records; no unresolved release-blocking security finding. |
| 2 — Analytic Tools and Slicer consistency | Debug the per-object workflows and transform/unit/schema issues; produce bidirectional Slicer results and app round-trip coverage. | Known fixtures pass in the viewer and actual Slicer; documented unsupported fields; no unexplained geometry/measurement loss. |
| 3 — mobile memory/GPU and loading | Unify existing DPR/Safe Mode policy, reduce allocations/idle/UI work and fix cancel/resource ownership. Investigate workers/storage changes only where justified. Produce the oversized-model reduction feasibility report. | Physical-device improvement against baseline with Stages 1–2 still passing. Enable no geometry reduction until its accuracy, notice, memory and workflow gates are reviewed; retain desktop fallback. |
| 4 — startup and full regression | Defer existing optional code, remove proven unused dependencies and address measured dependency/offline/capture bottlenecks. Keep engine versions/integration compatible. | No feature regressions; complete beta acceptance, then production checks against the deployed commit and assets. |

Keep PRs small and tied to a reproduced defect or measured bottleneck; do not combine all work into a broad rewrite. Establish effort estimates after Stage 0. Use beta previews for each fix, then a reviewed release to main. Build/deploy success and live acceptance are separate gates; retain a known-good release for rollback.

For owner review: confirm the bounded scope, priority of security/data retention and Analytic Tools consistency, the device/Slicer test matrix, and the oversized-model decision policy. This document authorizes no implementation or Cloudflare settings change by itself. The next step is review of this revised plan.
