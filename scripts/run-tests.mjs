import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Import each file in its own process. Node 24 + this pinned tsx version can
// report only file-level passes under --test without registering inner tests.
// Direct imports run node:test's harness on Node 22 and 24, with isolation.
for (const name of readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort()) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `tests/${name}`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
