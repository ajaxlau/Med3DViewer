# Box-test baseline acceptance

Date: 7 November 2026 (Asia/Hong_Kong).

Environment: `ntec3dpo-m3dv-box-test`; D1 `med3dviewer-shares-box-test` (`4d01c6ac-bcf3-4b71-8448-c5d8b8956a34`).

Code checkpoint under test: `c0eaad20a4a7b4e32d674db9f98952258a44272d` on `codex/box-workspace-upload-preview`, draft PR #13. The deployed version was not independently mapped to a Cloudflare version ID.

## Evidence

The live `/api/shares/config` endpoint returned HTTP 200 with `enabled`, `editingEnabled`, and `historyEnabled` all true. GitHub Build run `42321794982` passed for the code checkpoint above.

The owner reported **“Steps 1–6 passed”** after the guided manual test:

1. Test administrator access and a Sharing user.
2. Load a working Dropbox STL or multi-mesh 3MF model.
3. Login, adjust analytics/mesh state and create a protected workspace link.
4. Open the workspace as a recipient without login and check state/editing access.
5. Explicitly save a named revision, refresh and restore an earlier revision.
6. Revoke the disposable workspace and confirm it becomes unavailable.

These are owner-reported acceptance results, not an automated browser run. The exact device/browser, model format, model size and individual measurements were not supplied. This result does not establish that both STL and 3MF, large mobile models or concurrent saves were manually tested.

## Remaining work

The isolated baseline is accepted for continuing implementation. Box OAuth, uploads, uploaded-model selection and model-specific revision binding remain unimplemented. Scheduled cleanup execution, Box failure/reconnect cases, physical-device performance and Slicer compatibility require their own evidence. This acceptance does not authorize merging the unfinished PR or deploying to beta/main.

Next prerequisite: confirm department access to the Box Developer Console and permission to create/authorize an OAuth application. Keep application secrets and account passwords out of GitHub and chat. A dedicated disposable Box test folder will be used; callback URLs and exact scopes will be provided with the connection implementation.
