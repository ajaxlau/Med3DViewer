# Med3DViewer: performance and usability proposal for review

Priority: large models on constrained mobile devices. This is a proposal, not an
implementation included in the deployment repair. Findings come from a static
review of PR #10's app code; runtime/device timings have not been measured yet.
The verified Cloudflare builds produce approximately 839 kB application JavaScript
(228 kB gzip), plus 103 kB CSS (15 kB gzip); external 3D engine scripts are additional.

## Findings that drive the order

| Priority | Observed code behavior | User impact / next change |
| --- | --- | --- |
| P1 | `src/lib/modelLoading.ts:85` defines mobile DPR 1, but `src/lib/ViewerManager.ts:413` applies capability-based DPR up to 2. | A capable mobile GPU can render four times the intended pixel count. Unify device-profile and renderer policy. |
| P1 | `ViewerManager.ts:838–845` removes all `3dpo_planning_*` keys; model-load paths call reset at 1469 and 1549. | Loading a model can erase saved workspaces. Separate unloading from explicit deletion before expanding persistence features. |
| P1 | Custom STL import reads DataURL plus ArrayBuffer (4659 onward), and persistence serializes embedded base64 into localStorage (1048–1160). | Multiple large allocations, synchronous storage stalls, and quota failures. Store binary assets asynchronously. |
| P1 | Remote loading retains downloaded chunks before constructing Blob/File (1513–1556); importer work runs on the main thread. | High peak memory and stalled cancellation during parsing. Profile copies and move STL parsing off the UI thread first. |
| P2 | Overlay loop schedules RAF continuously (171–326); fly-through updates broad React context every frame (`ViewerContext.tsx:449`). | Idle work and panel rerenders compete with interaction. Schedule overlays on changes and isolate HUD state. |
| P2 | Picking recursively raycasts scene children (`ViewerManager.ts:1906`). | Large scenes may pause during selection. Profile and restrict picking candidates before considering acceleration structures. |
| P2 | Panels stay mounted and render whole mesh/object lists (`Sidebar.tsx`, `PlanningMenu.tsx`). | Closed panels and large lists add UI work. Lazy-mount heavy content and virtualize lists. |
| P2 | Four blocking CDN scripts in `index.html`; eager app imports. Supplied build log reports 838 kB application JS, excluding external engine payloads. | Slow startup and fragile offline use. Split optional tools and package compatible pinned engine assets. |

Cancellation, Safe Mode, loading stages, and actionable loading failures already
exist. Improve those controls rather than duplicating them. Geometry precision,
model coordinate systems, measurement results, and existing exchange formats must
remain unchanged.

## Phase 1: reproducible baseline and data safety

- Create synthetic/de-identified fixtures: binary STL at roughly 10/50/100 MB,
  equivalent GLB where supported, a many-mesh assembly, and a planning bundle
  containing a custom mesh. Include a model rejected by the current safety limit.
- Run three repetitions per case on desktop Chrome, a physical constrained
  Android device, and iOS Safari where available. Record device, browser, triangle
  count, cold/warm cache, network conditions, and safety profile.
- Measure startup-to-ready, model-to-first-interactive-frame, long tasks, frame
  times during orbit/clipping, cancellation latency, and repeated load/unload
  memory. Use renderer resource counts and heap metrics where supported; do not
  equate JavaScript heap with total GPU memory.
- Fix reset semantics: scene disposal preserves saved workspaces; explicit delete
  targets only the chosen workspace. Keep legacy filename-keyed workspaces
  readable. Regression: save A, load B, reopen A, verify transforms and custom mesh.
- Deliver a baseline report and agree numerical budgets from these measurements.
  No unmeasured speedup claims or device-support guarantees.

## Phase 2: rendering and interface workload

- Combine GPU and device-profile limits into one Auto DPR policy; add Auto,
  Battery saver, and High quality controls. Change render resolution only, never
  source geometry. Keep existing Safe Mode as the conservative recovery action.
- Invalidate overlays on camera, scene, viewport, or label changes. Run animation
  continuously only during playback, drag, or rotation, and stop it when hidden.
- Isolate rapidly changing HUD state from the sidebar/planning provider. Preserve
  smooth camera movement while throttling textual progress updates.
- Mount expensive panel content when opened, preserve edits outside lazy content,
  and virtualize large mesh/planning lists. Add mesh search and group filtering.
- Validate no idle overlay loop, correct rulers/labels after camera changes, no
  animation-frequency full-panel rerenders, and matching measurement/export data.

## Phase 3: responsive loading and bounded allocations

- Move binary STL parsing to a dedicated worker first, using transferable buffers
  and explicit ownership. Preserve existing format loaders for the other formats
  until equivalent parsing and rendering have been verified.
- Abort fetch and terminate a parsing worker on cancellation. Use a request ID on
  every asynchronous completion; dispose results from superseded requests.
- Remove redundant retained download copies after profiling. Report measured
  loading stages honestly; retain existing size-limit checks and recovery advice.
- Test corrupt/oversized files, cancel during fetch and parse, immediately load a
  second model, context loss, and repeated load/unload. No stale load may replace a
  newer one; owned buffers/geometries/listeners must not accumulate.

## Phase 4: durable planning storage

- Introduce an async workspace repository: IndexedDB stores binary Blobs and
  metadata; React exposes saving/saved/failed state. Debounce edits and flush at
  edit completion rather than serializing large geometry on every change.
- Read legacy localStorage workspaces, migrate transactionally, and retain the
  original until the new record is verified. Use a durable model/workspace ID
  rather than filename alone to avoid same-name collisions.
- Handle quota denial, private browsing/storage failures, and interrupted writes
  with clear recovery and existing ZIP export. Do not claim a save succeeded
  until storage confirms it.
- Verify reload/reopen, migration rollback, duplicate filenames, custom-model
  restoration, and ZIP/Slicer-markup interchange compatibility.

## Phase 5: startup and mobile usability

- Split optional planning/modals/export code with explicit loading feedback.
  Package compatible pinned Three.js/Online 3D Viewer dependencies, retaining
  their current integration contracts before considering an engine upgrade.
- Verify cold startup and a second offline launch. PWA tests must account for
  engine assets rather than assuming external CDN scripts are precached.
- Use a mobile bottom sheet for tools, sufficient touch targets, visible active
  tool and exit action, and a prominent loading Cancel action. Explain quality
  controls in terms of smoothness and battery use rather than graphics jargon.
- Improve model-load error recovery in the existing UI; preserve cancellation,
  Safe Mode, orientation controls, and fullscreen accessibility.

## Rollout and review gates

Keep each phase in a separate PR, validate on the repaired Cloudflare preview,
and compare against the Phase 1 fixtures before promotion through beta to main.
Avoid automatic geometry decimation; it can affect surface picking, measurement,
and exported planning results. Evaluate BVH picking only if profiling shows a
material bottleneck and engine compatibility is proven.

Acceptance combines baseline improvement with correctness: equivalent measurement
coordinates and exported geometry, preserved workspaces, no stale loading results,
stable resource ownership across repeated cycles, and responsive mobile controls.
The owner reviews baseline budgets and each phase before production release.
