# Implementation status for the testing PR

Updated: 6 November 2026. This is a draft implementation for review and isolated
preview testing. It has not been approved for merge into beta or main.

The [implementation plan](PERFORMANCE_PLAN.md) remains the requested scope. The
[testing matrix](TESTING.md) defines evidence required for acceptance. This file
records implementation/evidence separately so an existing code path or a passing
unit test is not described as complete runtime acceptance.

## Protected-workspace extension

The front-page login, named/dated workspace publishing and collapsible recipient controls are described in [USER_LOGIN.md](USER_LOGIN.md). They reuse schema 3 and existing sharing accounts.

The test branch supports self-contained Dropbox STL/3MF/GLB sharing with concealed sources, a model-only/workspace checkbox, named saved versions and explicit public saves that append distinct revisions in server save-time order. Admin credentials are administration-only; admins assign sharing users and individual passwords. `/admin/shares` manages users, public editing permission, expiry and batch link revocation. Schema 3 is required for this flow; prior view addresses remain compatible. See [EDITABLE_WORKSPACES.md](EDITABLE_WORKSPACES.md) for the additive D1 migration and phone setup.

Local SQLite-backed tests cover permissions, save races, migration compatibility, pagination and expiry. A real local Worker/D1/Chromium check covers admin login, login-cookie persistence, password-free recipient saves, concurrent revision allocation, labels, expiry cap, revocation and no persistent credentials. Package tests cover multi-object 3MF, unsafe references/entities and actual expanded-byte limits. Physical-device 3MF rendering/state acceptance and the Slicer gates below remain required.

## Scope represented in this PR

| Area | Implementation intent | Acceptance still required |
| --- | --- | --- |
| Workspace safety and import boundaries | Preserve saved records during model switches; render imported tooltip text safely; validate shared/planning metadata and restrict imported asset fetches. | Full browser round-trip, malformed-input, quota, reset and custom-asset regression checks. |
| Analytic Tools and Slicer | Add strict procedural workspace schema and targeted coordinate-system/unit handling; preserve transforms in protected snapshots. | Every tool and exchange direction in actual 3D Slicer, including non-identity roots, orientations and supported metadata limits. |
| Mobile work | Unify effective device DPR policy, avoid a GPU device allocation for a capability-only probe, reduce hidden-panel work and limit rapid React playback notifications. | Physical iOS/Android measurements, repeated lifecycle resource stability and controls under real memory pressure. |
| Metadata-only protected sharing | A small D1 record and controlled original-host stream; hashed tokens, encrypted source references, bounded JSON, 180-day access checks and scheduled cleanup. No model-file storage service. | Configured isolated Cloudflare preview, approved-host behavior, source concealment, environment isolation, runtime expiry/revocation and database/cache inspection. |

Only claim the rows as implemented after code review and the relevant automated
checks have passed. The recorded checks below must identify any narrower coverage
or unsupported case. This status is not an independent security certification.

## Evidence recorded

The latest local validation records 135 passing direct Node 22 tests (four artifact subprocess tests run separately in CI), type/build/artifact checks, Worker packaging, five real workerd cases and local Worker/D1/Chromium desktop/mobile checks. Workspace controls use the left drawer with a header icon and automatic revision loading; explicit concurrent saves append distinct versions with ordered server timestamps. See [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md) for exact scope and limitations. Cloudflare, physical-device and broader Slicer acceptance remain separate gates; historical release checks are not evidence for this PR.

Independent code review identified and requested fixes for uncancelled rejected
model streams and two shared-load races: a late download replacing a newer manual
load, and capturing a superseding import ID after awaiting validation. The UI
implementation now has cancellation and request-ownership regression cases.
These checks support the specific code boundaries; a real browser acceptance
run remains pending.

The installed Slicer 5.10.0 executable started successfully with an offscreen Qt
platform. No viewer-export fixture was loaded or re-saved in that application,
so this is startup availability evidence only and does not close the Slicer gate.
The attempted browser test-server command was blocked in the execution permission
flow and subsequently aborted; no new end-to-end browser result is claimed.

See [Cloudflare sharing setup](SHARING_SETUP.md) for the isolated database and
binding steps. Test/beta/main resources must remain separate.

## Explicit limits and deferred work

- Protected sharing supports approved, self-contained remote STL/3MF/GLB sources. Local-only
  files and custom/local meshes cannot be reconstructed on another device from
  metadata alone; they must be rejected with a useful explanation. Ordinary
  local-viewer and ZIP workflows retain their existing format support.
- Shared workspace JSON holds procedural parameters/control points and state,
  not STL bytes, base64 file copies or imported model geometry. A model fingerprint
  must match before applying saved planning data.
- The original host must remain reachable and authorized. A 180-day platform
  expiry is not a promise that the source link lasts 180 days, nor does it delete
  the source or recall recipient downloads. D1 backup retention is separate from
  active-table cleanup.
- GPU capability probing does not establish native WebGPU rendering. Labels
  should identify detected capabilities and actual use rather than advertise
  unverified WASM, BVH or offline readiness.
- Automatic model reduction is a feasibility gate, not an implemented decimator.
  Compressed bytes do not by themselves reduce decoded geometry/GPU memory.
  Preserve measurement/export precision and recommend desktop when safe mobile
  operation cannot be demonstrated.
- Physical mobile performance, full offline dependencies, worker-based parsing,
  binary-storage migration, engine packaging and broad startup/capture changes
  must not be described as complete unless separately implemented and measured.
- Actual 3D Slicer application acceptance is pending. Helper-level normalization
  or JSON schema validation cannot prove the full clinical-coordinate workflow.

## Merge and deployment gate

Keep this PR in draft for isolated testing. Apply the documented database
migration/bindings and independent secrets to the test environment; do not point
preview code at production data. Record live acceptance and obtain owner review
before beta merge. Promotion to main needs its own approved release and live
verification; no deployment-provider success alone closes that gate.
