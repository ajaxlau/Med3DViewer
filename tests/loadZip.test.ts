import assert from 'node:assert/strict';
import test from 'node:test';
import { loadZip } from '../src/lib/loadZip.ts';

test('deferred ZIP module is shared and preserves archive import/export data', async () => {
  const pendingExport = loadZip();
  const pendingImport = loadZip();
  assert.equal(pendingExport, pendingImport);
  const Zip = await pendingExport;
  const archive = new Zip();
  archive.file('metadata.json', JSON.stringify({ group: 'Fixture', points: [{ x: 1.25, y: -2, z: 3 }] }));
  archive.file('surface.stl', new Uint8Array([0, 1, 2, 255]));
  const bytes = await archive.generateAsync({ type: 'uint8array' });
  const restored = await (await loadZip()).loadAsync(bytes);
  assert.deepEqual(JSON.parse(await restored.file('metadata.json')!.async('string')), {
    group: 'Fixture', points: [{ x: 1.25, y: -2, z: 3 }],
  });
  assert.deepEqual(Array.from(await restored.file('surface.stl')!.async('uint8array')), [0, 1, 2, 255]);
});
