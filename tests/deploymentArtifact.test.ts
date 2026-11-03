import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const validator = fileURLToPath(new URL('../scripts/validate-dist.mjs', import.meta.url));

function fixture(t: { after: (cleanup: () => void) => void }) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'med3d-artifact-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const dist = path.join(cwd, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<script src="./assets/app.js"></script><link rel="icon" href="/icon.png"><script src="https://example.com/engine.js"></script>');
  writeFileSync(path.join(dist, 'assets/app.js'), 'console.log("app");');
  writeFileSync(path.join(dist, 'icon.png'), 'icon');
  writeFileSync(path.join(dist, 'sw.js'), '/* service worker */');
  writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: 'icon.png' }] }));
  const validate = () => {
    const result = spawnSync(process.execPath, [validator], { cwd, encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  };
  return { dist, validate };
}

test('complete local artifact passes without fetching external engine scripts', (t) => {
  const { validate } = fixture(t);
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
});

test('missing hashed JavaScript fails before upload', (t) => {
  const { dist, validate } = fixture(t);
  rmSync(path.join(dist, 'assets/app.js'));
  const result = validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /app\.js/);
});

test('missing PWA icon fails even when not referenced in HTML', (t) => {
  const { dist, validate } = fixture(t);
  writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: 'missing-icon.png' }] }));
  const result = validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing-icon\.png/);
});

test('empty service worker fails before upload', (t) => {
  const { dist, validate } = fixture(t);
  writeFileSync(path.join(dist, 'sw.js'), '');
  const result = validate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sw\.js is empty/);
});
