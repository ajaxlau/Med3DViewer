# Local validation of the testing PR

Recorded 4 November 2026. This evidence is for the draft implementation, not a completed Cloudflare deployment or physical-device certification.

- Node **22.23.4**: **70 actual test cases passed, zero failed** using the per-file test runner. This includes 18 SQLite-backed sharing Worker cases, actual bounded ZIP expansion tests, procedural planning/metadata fixtures, URL validation, mobile DPR, UI request races and deployment configuration/artifact tests.
- TypeScript (`npm run lint`), manifest synchronization, production Vite/PWA build and distribution validation passed.
- Default disabled-sharing Worker and configured test-sharing Worker both passed Wrangler packaging dry runs.
- The migration applied successfully to local workerd D1. Actual HTTP requests to the local Worker created a share, returned sanitized JSON without the source URL, revoked the share, and rejected it afterward. These checks used a synthetic source reference; no clinical model was uploaded or fetched.
- The pinned Wrangler runtime supports compatibility dates only through 25 September 2026. Local workerd testing therefore used `--compatibility-date 2026-09-25`; deployed configuration retains the existing 3 October date. Cloudflare preview testing must still verify that actual deployment.
- Initial application JavaScript is about **640 kB / 166 kB gzip**, compared with the historical approximately 840 kB / 228 kB gzip. ZIP and guide code is deferred; PWA precaching still includes these chunks. This is a startup parsing/evaluation improvement, not a measured total-transfer or physical-device speedup.
- Removed unused Express, GenAI, dotenv and Express type dependencies. The remaining dated dependency audit and build/development-tool findings are recorded in [SECURITY_REVIEW.md](SECURITY_REVIEW.md); the draft is not certified vulnerability-free.

Before beta merge, complete the isolated Cloudflare/Dropbox test in [SHARING_SETUP.md](SHARING_SETUP.md), browser and actual 3D Slicer checks in [TESTING.md](TESTING.md), and physical-device acceptance. Any additional application-level Slicer/browser evidence is recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Do not infer those results from helper tests.

Protected sharing is intentionally limited to Dropbox STL with procedural planning objects. Custom/local models, full model copies, automatic decimation, interruptible parser workers, wholesale asynchronous storage migration and replacement of the continuous overlay loop are not claimed complete by this PR. They remain measured/reviewed follow-up gates in the plan.
