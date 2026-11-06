import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { ArchiveLimitError, readArchiveEntry } from '../src/lib/archiveReading';
import { validatePlanningArchiveEntries } from '../src/lib/planningData';

test('bounded archive reads preserve UTF-8 metadata and binary model bytes', async () => {
  const source = new JSZip();
  source.file('metadata.json', '{"name":"骨"}');
  source.file('model.stl', new Uint8Array([0, 255, 7, 3]));
  const archive = await JSZip.loadAsync(await source.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  assert.equal(await readArchiveEntry(archive, archive.file('metadata.json'), 'string', 1024), '{"name":"骨"}');
  assert.deepEqual(new Uint8Array(await readArchiveEntry(archive, archive.file('model.stl'), 'arraybuffer', 1024)), new Uint8Array([0, 255, 7, 3]));
});

test('actual expanded bytes stop a forged-small ZIP entry before complete inflation', async () => {
  const source = new JSZip();
  source.file('oversized.stl', new Uint8Array(10 * 1024 * 1024));
  const bytes = await source.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Both local and central-directory lengths claim one byte, while the actual
  // DEFLATE stream expands to 10 MiB. Header-only checks accept this fixture.
  for (let offset = 0; offset < bytes.length - 4; offset++) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) view.setUint32(offset + 22, 1, true);
    if (signature === 0x02014b50) view.setUint32(offset + 24, 1, true);
  }
  const archive = await JSZip.loadAsync(bytes);
  validatePlanningArchiveEntries(archive.files, 64 * 1024);
  await assert.rejects(readArchiveEntry(archive, archive.file('oversized.stl'), 'arraybuffer', 64 * 1024), ArchiveLimitError);
  await assert.rejects(readArchiveEntry(archive, archive.file('oversized.stl'), 'arraybuffer', 64 * 1024), ArchiveLimitError);
});

test('the expanded-byte budget applies across entries and never resets on fallback', async () => {
  const source = new JSZip(); source.file('one', new Uint8Array(60)); source.file('two', new Uint8Array(60));
  const archive = await JSZip.loadAsync(await source.generateAsync({ type: 'uint8array' }));
  assert.equal((await readArchiveEntry(archive, archive.file('one'), 'arraybuffer', 100)).byteLength, 60);
  await assert.rejects(readArchiveEntry(archive, archive.file('two'), 'arraybuffer', 100), ArchiveLimitError);
  await assert.rejects(readArchiveEntry(archive, archive.file('one'), 'arraybuffer', 100), ArchiveLimitError);
});
