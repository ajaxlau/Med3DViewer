# Med3DViewer implementation plan for review

Updated: 4 November 2026. Status: proposed work; this update changes documentation only.

Reviewed beta application source: [`582176940cd6`](https://github.com/ajaxlau/Med3DViewer/commit/582176940cd6713db64798c335fda725140c0d20).
README source: main at [`123a5edc76c2`](https://github.com/ajaxlau/Med3DViewer/commit/123a5edc76c2f50ce9ad9d3be14e71ec0ee8e43f).
The README is copied verbatim from main. Its feature descriptions are not a substitute for the implementation evidence and qualification below.

The priority is reliable planning and responsive viewing of large models on phones and tablets. Preserve all existing workflows while reducing peak memory, unnecessary rendering, and startup work. Review this plan before implementing it; no application, dependency, workflow, or Cloudflare configuration changes are included in this documentation update.

## Current implementation and validation status

| Area | Already present in beta | Remaining work |
| --- | --- | --- |
| Cloudflare delivery | Workers static-assets configuration; Node 22; pinned Wrangler; manifest/artifact checks; GitHub type check, tests, build, and packaging dry run. Cloudflare Git integration owns deployment. | Keep configuration stable. Add repeatable public acceptance checks; distinguish platform initialization/authentication failures from application failures. See [deployment details](DEPLOYMENT.md). |
| Remote loading repair | Dropbox file-sharing links are converted to the direct-content host while retaining access keys; unrelated hosts and signed URLs are preserved. | Expand regression coverage without storing real model links. Other hosts still need to permit CORS; no proxy is proposed. |
| Safe Mode resolution repair | The renderer-boundary DPR limit survives embedded-viewer resize calls; repeat installation updates the policy. | Normal automatic mode still applies GPU-tier limits independently of the mobile/low-memory load profile. Unify these policies. |
| Loading feedback | Validation, download/parse states, warnings, Cancel, request IDs, size limits, timeouts, header checks, and actionable failures. | Parsing is not fully interruptible; completion detection polls scene mesh counts; parse percentages are estimated. Improve existing controls. |
| Validation evidence | The release work recorded 16 passing automated tests and pre-release desktop/mobile-emulation checks covering loading, cancellation, camera, clipping, measurement, ZIP round-trip, snapshot, theme, Dropbox, and Safe Mode orientation changes. Production deployment of main merge `867e242e` succeeded. | These are historical results, not a new test run for this documentation change. Post-deployment browser acceptance for that release was not completed. Physical-device performance and comprehensive format/planning checks remain pending. |

The existing automated suite covers loading helpers, artifact integrity, and the DPR wrapper. It does not yet prove every supported format, clinical coordinate convention, planning operation, endoscopy control, or offline workflow.

## Beta feature inventory and proposed improvements

“Present” means a code path or control exists; device compatibility and numerical correctness still require the acceptance checks.

| Feature area | Present in beta | Proposed improvement and acceptance focus |
| --- | --- | --- |
| Model intake | Browse and drag/drop; local companion files; URL loading; Dropbox conversion; model/camera deep-link parsing; validation permits STL, OBJ/MTL, 3MF, GLTF/GLB, PLY, 3DM, STEP/STP, IGES, 3DS, FBX, DAE, OFF, DXF and companion assets. ZIP/project imports have separate handling. | Maintain an explicit tested-format matrix, including textures/buffers and archive dispatch. Prioritize STL, GLB, 3MF and OBJ first; test CAD loaders and their external libraries separately. Preserve current limits and local-file recovery. |
| Model inspection | Mesh visibility, selection/highlight, individual/global opacity, explosion, ghosting, model statistics and dimensions. | Search/filter and virtualize large lists; clarify selection versus visibility; profile transparent assemblies and explosion. Verify hidden meshes and planning overlays follow the intended picking rules. |
| Camera and presentation | Free orbit/pan/zoom, six preset views, reset, auto-rotate, fullscreen, viewport rulers, background image and opacity, light/dark themes. | One coherent render-quality policy, event-driven overlays, stable resize/orientation behavior and accessible controls. Rulers and labels must remain aligned after every camera/viewport change. Reference images remain visual aids unless explicit calibration is added. |
| Planning and metrology | Surface-picked planes, cylinders, curves, points, distance/angle measurements, annotations with movable cards/leader lines and pin repositioning; point-picking undo and transform gizmos with visual cues. | Clear active tool, required picks, units and exit action; separate view settings from geometry parameters. Verify measurements and transforms against known fixtures. Point-picking undo is present; full edit-history undo/redo would be a separate later feature. |
| Planning objects and groups | Naming, visibility, styling, duplication, grouping/reassignment, group operations, custom STL overlays and duplication of a model submesh into planning. | Preserve editing state when panels close; avoid serializing large meshes on every interaction; verify duplicate/group world transforms and shared-resource ownership. |
| Orthogonal clipping | X/Y/Z clipping with inversion, slider position and camera alignment controls. | Profile clipping while orbiting large models; consistent axis/direction labels; verify picking/measurement behavior at clipped surfaces. This is viewport clipping, not an exported surgical cut operation. |
| Spline cross-sections | Curve selection/sample-curve generation, distance/progress controls, 0.6 mm stepping, invert, camera lock, cross-section zoom and HUD. | Cache reusable curve/frame calculations where profiling supports it; preserve path distance, tangent orientation and camera restoration when exiting. A 0.6 mm step is a navigation increment, not a guarantee of anatomical accuracy. |
| Virtual endoscopy | Curve-guided playback, pause/resume, speed, direction/loop, distance/progress, FOV, reticle, look trim, lateral/elevation offsets and keyboard stepping. | Keep camera animation smooth while isolating HUD updates from the full interface. Pause when hidden; make active mode and exit unambiguous; verify controls and camera restoration on physical mobile devices. |
| Workspace persistence | Filename-keyed localStorage records include object/group metadata, transforms and base64 custom meshes. | Fix model-switch/reset deletion first; then migrate to asynchronous binary storage with explicit save state, collision-safe workspace identity and recovery/export. Existing persistence is not currently a durable-save guarantee. |
| Interoperability | Individual STL, group/all-object ZIP export/import, metadata reconstruction and 3D Slicer markups JSON import/export. | Golden-fixture round-trips for units, axes, world matrices, groups, annotations and geometry. Document supported Slicer types and coordinate conversions; reject unsupported data clearly. |
| Snapshots and sharing | PNG preview/custom resolution/transparency/watermark, six-view orbit captures, individual/ZIP download, native sharing/WhatsApp fallback, remote-model link and QR code. Local files cannot be shared by URL. | Bound capture memory; use Blobs where possible; make long captures cancellable; restore camera/render state after success or failure. Deep-link camera input exists, but the share modal currently constructs a model-only link: propose an explicit “include current view” option. |
| PWA, diagnostics and guidance | Install/online-state handling, generated service worker, local asset precache, GPU probing/re-probe, context-loss notices, model status and large-model guidance. | Test complete offline dependencies, honest capability/save indicators and context recovery. Keep technical diagnostics secondary to opening a model and recovering from errors. |

Primary implementation references: [ViewerManager](../src/lib/ViewerManager.ts), [ViewerContext](../src/context/ViewerContext.tsx), [loading helpers](../src/lib/modelLoading.ts), [Sidebar](../src/components/Sidebar.tsx), [PlanningMenu](../src/components/PlanningMenu.tsx), [Modals](../src/components/Modals.tsx), [ViewerCanvas](../src/components/ViewerCanvas.tsx), [endoscopy HUD](../src/components/EndoscopyFlyThroughHUD.tsx), and [spline clipping HUD](../src/components/SplineClippingHUD.tsx).

## Findings that determine priority

| Priority | Code evidence | Consequence and proposed response |
| --- | --- | --- |
| P0: workspace retention | `ViewerManager.resetWorkspace` removes every `3dpo_planning_*` key; both local and remote model-load paths call it. | Opening another model can erase saved workspaces. Separate scene disposal, reset-current-session and explicit saved-workspace deletion before extending storage. |
| P1: automatic render resolution | `getDeviceLoadProfile` specifies mobile/conservative DPR 1 and legacy 0.75; `applyGpuTierSettings` instead uses tier caps up to 2, except Safe Mode. Diagnostics show a recommended DPR rather than the applied value. | High-DPI mobile devices can render substantially more pixels than the load policy intends. Use one policy and display the actual renderer setting. The Safe Mode resize bug is already fixed. |
| P1: binary storage and allocations | Custom STL import reads both DataURL and ArrayBuffer; localStorage writes stringify base64 assets synchronously. Remote download retains a chunk array before Blob/File import. | Large temporary allocations, UI stalls and quota failures. Measure peak memory, remove redundant representations and store binaries asynchronously. |
| P1: parser cancellation and completion | `LoadModelFromFileList` delegates import; Cancel aborts fetch/clears polling but does not terminate importer work. Readiness uses repeated scene traversal and stable mesh counts. | Cancellation may leave parsing running; partial/stale scenes need stronger isolation. Prefer importer completion/error callbacks where available, plus owned worker jobs and stale-result disposal. Existing request-ID guards must be retained and extended. |
| P1: capability claims | `gpuDetection.ts` probes a temporary WebGPU device and destroys it; the app initializes an OV embedded viewer, with WebGL context listeners. `GpuCapabilityCard` displays unconditional WASM/BVH/offline badges. | A successful WebGPU probe does not establish native WebGPU rendering or active WGSL compute. Report detected capability separately from the actual renderer and verified parser/picking/storage features. |
| P2: idle and React work | `domUpdateLoop` reschedules RAF continuously. Endoscopy publishes state through the broad ViewerContext while playing. Panels remain mounted and render complete lists. | Idle CPU use and unrelated rerenders compete with navigation. Invalidate overlays on changes; isolate fast state; defer heavy panel content and virtualize lists. |
| P2: picking cost | `setupRaycaster` recursively intersects scene children, then filters results. | Profile many-mesh/high-triangle selection; restrict candidates before evaluating a compatible BVH implementation. A badge is not evidence that BVH is enabled. |
| P2: startup/offline dependencies | `index.html` has four blocking external engine/control/loader scripts and external fonts. OV also loads format libraries from a CDN. Optional tools and JSZip are eagerly imported. | Slow/fragile startup and incomplete offline dependencies. Split optional code and package a compatible pinned engine/dependency set. |
| P2: capture workload | Snapshot paths use data URLs; orbit capture retains six images before ZIP/share conversion. | Peak memory and synchronous capture work can stall phones. Sequence captures with resource limits and observable progress. |

README qualifications to resolve in a future, separately reviewed documentation change: native WebGPU use, automatic low-memory DPR, full offline readiness, automatic scene reconstruction after context loss, and a primary-model direct-STL fallback are not established by the reviewed code. The direct STLLoader path found here is for planning meshes/restoration. The load profile currently gives mobile parsing up to 180 seconds, rather than the README's 300-second claim. This request preserves main's README exactly; these gaps are recorded here instead of silently rewriting it.

## Proposed delivery sequence

Each phase should produce a small set of reviewable PRs. Effort ratings are relative: small = isolated logic/UI change; medium = several components plus regression coverage; large = storage/importer/engine integration. Calendar estimates follow the baseline and compatibility spike.

### Phase 0 — baseline and release acceptance (medium)

1. Create synthetic or de-identified fixtures: binary STL around 10/50/100 MB, ASCII STL, GLB, 3MF, OBJ with material/texture companions, many-mesh assembly, long curve, dense planning session and ZIP containing a custom mesh. Include corrupt, missing-companion and over-limit inputs.
2. Record desktop Chrome, physical iOS Safari/iPadOS and a constrained Android browser where available. Log viewport/DPR, device profile, triangle/mesh counts, browser version, cold/warm cache and network conditions; use three comparable runs per scenario.
3. Measure app startup, import to first interactive frame, fetch/parse/upload stages, long tasks, orbit/clipping/playback frame times, selection latency, cancel response, save/export/capture duration and repeated load/unload resource counts. Use React Profiler for interface updates; distinguish heap metrics, renderer resources and unavailable GPU-memory estimates.
4. Establish numerical budgets from measurements and owner review. Historical release output was approximately 840 kB application JS (228 kB gzip) plus 103 kB CSS (15 kB gzip), excluding external engine payloads. This is a size reference, not a measured mobile performance result.
5. Make public HTTP/browser acceptance repeatable on beta, then production: expected assets and content types, missing-script 404, SPA refresh, engine availability, local/remote import, basic planning and service-worker update. Verify deployed commit identity.

Exit gate: a baseline report and tested-format matrix with explicit unknowns; current production acceptance recorded separately from build/deploy success. No hardware support or speedup guarantee without measurements.

### Phase 1 — workspace safety and truthful status (medium; first implementation priority)

- Separate unload/dispose from saved-data deletion. Loading B must preserve A; reset must explain its precise scope; deleting a saved workspace targets only that record.
- Keep legacy records readable. Add visible save success/failure and an export recovery action; do not silently treat a caught storage exception as a successful save.
- Show actual renderer/context, applied DPR and verified storage status. Label WebGPU as detected capability until an active renderer/compute implementation is proven; remove unsupported BVH/WASM readiness claims.
- Align loading feedback with observable stages. Show indeterminate parsing when true progress is unavailable; classify generic fetch failures as possible network/CORS failures rather than asserting CORS as the sole cause.
- Define context-loss behavior and provide a recovery action that preserves planning data; verify restoration rather than assuming a Render call reconstructs the scene.

Exit gate: save A with custom mesh, load B, reopen A with matching transforms/groups; reset/delete affects only the intended scope; quota denial is visible; diagnostics match runtime state. Unit and browser tests cover these behaviors.

### Phase 2 — rendering, picking and interface workload (medium)

- Combine device profile, Safe Mode and supported renderer capabilities into one tested DPR policy; install it at the existing renderer boundary. Offer Auto, Battery saver and High quality with clear limits. Quality controls change resolution; source geometry and planning dimensions remain unchanged.
- Replace continuously scheduled overlay work with invalidation on camera, scene, viewport, label and tool changes. Run continuous updates only for active animation/drag. Pause background playback and resume without a large time jump.
- Keep fast camera state outside the broad React provider; subscribe HUDs narrowly and throttle text updates independently of camera motion.
- Profile picking, cache eligible visible candidates and exclude helpers appropriately. Add BVH only if traces show meaningful benefit and compatibility with the current Three.js/OV integration is demonstrated.
- Lazy-mount expensive panel sections while preserving drafts and selections. Add mesh/object search and group/type filters; virtualize long lists without losing keyboard focus.

Exit gate: resize/orientation and quality changes retain the selected limit; no recurring application overlay RAF when idle; no full-panel rerender on each playback frame; rulers/cards track the camera; all planning picks, gizmos and measured/exported coordinates match fixtures. Compare interaction and battery-related idle work with Phase 0.

### Phase 3 — responsive loading and bounded import jobs (large)

- First investigate supported OV completion/error callbacks and resource ownership. Replace mesh-count polling where possible; avoid declaring a partially loaded multi-mesh scene ready.
- Implement binary STL parsing in a dedicated worker first, transferring ArrayBuffers and parsed attributes with explicit ownership. Preserve ASCII and other-format paths until equivalent behavior is proven; model and custom-planning imports need separate integration checks.
- Abort downloads and terminate owned parsing workers on Cancel. Check request identity after every await and before scene mutation; dispose late results from superseded jobs. Do not imply a UI cancel flag alone stops an external importer.
- Profile/download with bounded retained representations; release chunks and temporary URLs promptly. Retain streaming size enforcement, header checks, timeouts, Dropbox conversion and companion-file warnings.
- Ensure limits cover expanded archive/geometry cost as well as input byte size; provide local-download or simplified-model recovery without automatic geometry modification.

Exit gate: cancel during validation, fetch and parsing; immediately load another model; corrupt/oversized/archive/companion cases fail clearly; no stale model replaces the newer one; resources stabilize across repeated cycles. Worker and main-thread paths produce equivalent geometry/units.

### Phase 4 — durable asynchronous planning storage (large; depends on Phase 1)

- Introduce a workspace repository with IndexedDB metadata and binary Blobs; keep heavy asset serialization out of edit/drag events. Debounce metadata writes and flush completed edits with observable saving/saved/failed state.
- Use persistent workspace IDs and a model identity strategy that handles same-name files; avoid assuming a filename uniquely identifies anatomy. Decide model-source retention separately from planning storage.
- Migrate legacy localStorage transactionally. Verify new records before offering removal of the originals; failed/interrupted migration must remain recoverable.
- Preserve transforms, object/group IDs, annotation positions and custom mesh bytes. Keep ZIP import/export as a portable recovery path.
- Handle storage denial, quota, schema upgrades and interrupted writes. Do not depend on asynchronous work completing during page unload; show unsaved state and offer export when necessary.

Exit gate: reload/reopen, duplicate filenames, migration rollback, quota failure and custom-mesh restoration pass; existing ZIP and Slicer interchange remain compatible; no binary asset is rewritten on every small edit. Compare save latency and long tasks with baseline.

### Phase 5 — startup, dependency integrity and offline use (large)

- Split optional planning/export, snapshot/QR and guide content with loading feedback; audit unused dependencies before removal. Keep model-open controls and essential failure recovery available early.
- Package compatible pinned Three.js, controls, STL loader, OV engine and required format libraries. Preserve `window.THREE`/`window.OV` integration contracts before any engine upgrade; investigate the current global-engine version boundary rather than adding another duplicate engine.
- Include required fonts/icons/engine/parser assets in a defined offline policy. Test service-worker upgrade and cache cleanup; defer forced reloads while planning work is unsaved.
- Define offline support precisely: opening previously available local data is distinct from downloading a new remote model. Do not cache private remote model responses by default or promise all formats offline without their parser dependencies.
- Validate actual startup request/transfer costs and failures with CDN/network unavailable.

Exit gate: offline relaunch loads a local fixture for every advertised offline format; startup no longer depends on undeclared external scripts; update does not discard work; bundle/request costs improve against baseline with no importer regressions.

### Phase 6 — mobile workflows, capture and exchange polish (medium to large)

- Organize tools around Open, View, Plan and Export/Share. Use a mobile tool sheet with one visible active mode, remaining picks and an obvious Done/Cancel/Exit action; keep the viewport usable with the keyboard open and in landscape.
- Replace hover-only discovery with explicit controls. Provide at least 44 CSS pixel touch targets for primary actions, accessible names/pressed states, focus handling for dialogs and keyboard-safe shortcuts. Preserve existing point-pick undo; consider full undo/redo only as a separately scoped follow-up.
- Add reusable numeric-input validation and unit labels for geometry, offsets, FOV and snapshot sizes. Explain that display quality does not alter model geometry.
- Sequence six-view capture with progress/cancellation, safe resolution limits and Blob-based results where supported. Release previews/URLs on replacement/close; preserve camera, clipping, background and renderer settings after cancellation or errors.
- Make sharing scope explicit: a model URL may grant access to the recipient, local files require an explicit file export/share, and camera sharing is optional. Preserve user-initiated native/WhatsApp fallbacks.
- Expand exchange acceptance for every planning type, groups, custom meshes and annotations. Document tested coordinate systems and unit assumptions; do not infer clinical accuracy from successful import.

Exit gate: phone/tablet users can open, inspect, measure, annotate, create a curve, enter/exit endoscopy or cross-section mode, save and export without hover or horizontal overflow. High-resolution capture fails safely, cancel restores view state, and exchange fixtures retain coordinates and metadata.

## Cross-feature acceptance matrix

| Scenario | Required evidence |
| --- | --- |
| Every intake route | File picker, drag/drop, URL and deep-link route to the correct importer; common formats/companions, malformed headers, expired link, offline, large download and repeated cancel/retry covered. |
| Visualization | Mesh selection/visibility/opacity, ghosting, explosion, six camera views, auto-rotation, rulers and background image work across resize, themes and quality changes. |
| Planning | Known-distance/angle fixtures; plane/cylinder/curve/point/annotation creation; pin repositioning; gizmos, duplication/grouping and visibility preserve world coordinates and styling. |
| Spline modes | Forward/reverse/loop/FOV/look/path offsets, 0.6 mm stepping, cross-section invert/lock/zoom and keyboard controls; leaving modes restores camera and input state. |
| Data retention and exchange | Model A/B switching, reload, explicit reset/delete, migration/quota recovery, ZIP/custom mesh and Slicer round-trips; unsupported schemas are reported. |
| Snapshot and sharing | Single/six-view PNG, transparent background and watermark, dimensions, ZIP, QR/link, native-share unavailable/cancelled and WhatsApp fallback; no unintended model upload. |
| PWA and deployment | Fresh and updated service worker, offline scope, deployed commit/assets, navigation refresh and missing-asset behavior; desktop and physical mobile smoke checks after promotion. |
| Performance stability | Baseline comparisons for startup, load, idle work, orbit/clipping/playback, picking, save/export/capture and repeated lifecycle resource counts; report regressions as well as improvements. |

## Review decisions and rollout

Recommended first approval: Phase 0 plus Phase 1, then Phase 2 based on the baseline. Phases 3–6 follow after importer/storage compatibility findings and can be split into smaller PRs; mobile accessibility work can proceed earlier where independent.

The owner should review the supported device/format matrix, numerical performance budgets, reset/delete semantics, local storage policy, default quality controls and offline scope before those behaviors are implemented. These are review items, not a request to change Cloudflare settings now.

Use feature branches into beta for each focused change, test the preview and compare the same fixtures, then promote a reviewed beta release to main. Keep build checks separate from live acceptance and record both. Run meaningful unit tests for policy/storage/worker/format logic and browser tests for affected workflows; physical iOS/Android checks remain necessary for memory, touch and GPU behavior.

Do not introduce automatic decimation, lossy coordinates, new backend model proxies, a native WebGPU engine rewrite or a full editor undo stack in the initial performance work. Geometry-changing features and engine replacement require their own precision/compatibility review. Use synthetic/de-identified fixtures and never commit private model URLs or access keys.
