import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

await mkdir('.share-config', { recursive: true });
await build({
  entryPoints: ['tests/runtime/shareDownload.worker.ts'],
  outfile: '.share-config/runtime-share-download.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
});

await build({
  entryPoints: ['tests/runtime/dropboxOAuth.worker.ts'],
  outfile: '.share-config/runtime-dropbox-oauth.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
});

if (!process.argv.includes('--bundle-only')) {
  const runtime = createRequire(import.meta.url)('workerd');
  // Match the runtime bundled with pinned Wrangler. This does not change the
  // deployed Worker's compatibility date; no remote services are contacted.
  const result = spawnSync(runtime.default, ['test', 'tests/runtime/share-download.capnp', `--compat-date=${runtime.compatibilityDate}`, '*:*'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
