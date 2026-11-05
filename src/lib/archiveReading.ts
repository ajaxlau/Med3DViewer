// ZIP headers are untrusted: enforce the budget while DEFLATE emits bytes,
// before JSZip's async() can accumulate an entire forged/bomb entry in memory.
export class ArchiveLimitError extends Error {
  constructor() { super('Expanded planning archive exceeds this device limit.'); this.name = 'ArchiveLimitError'; }
}
interface Budget { consumed: number; limit: number; failed: boolean }
const budgets = new WeakMap<object, Budget>();

export async function scanArchiveEntry(archive: object, entry: any, maxBytes: number, onChunk: (chunk: Uint8Array) => void): Promise<void> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !entry?.internalStream) throw new Error('Invalid planning archive reader.');
  let budget = budgets.get(archive);
  if (!budget) { budget = { consumed: 0, limit: maxBytes, failed: false }; budgets.set(archive, budget); }
  budget.limit = Math.min(budget.limit, maxBytes);
  if (budget.failed) throw new ArchiveLimitError();
  const state = budget;
  await new Promise<void>((resolve, reject) => {
    const stream = entry.internalStream('uint8array');
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      state.failed = true;
      // pause propagates through JSZip's inflate worker, stopping further input.
      stream.pause();
      reject(error);
    };
    stream.on('data', (chunk: Uint8Array) => {
      if (settled) return;
      if (!(chunk instanceof Uint8Array)) { fail(new Error('Invalid archive data.')); return; }
      if (state.failed || state.consumed + chunk.byteLength > state.limit) { fail(new ArchiveLimitError()); return; }
      state.consumed += chunk.byteLength;
      try { onChunk(chunk); } catch (error) { fail(error as Error); }
    });
    stream.on('error', (error: Error) => fail(error));
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    stream.resume();
  });
}

export function readArchiveEntry(archive: object, entry: any, kind: 'arraybuffer', maxBytes: number): Promise<ArrayBuffer>;
export function readArchiveEntry(archive: object, entry: any, kind: 'string', maxBytes: number): Promise<string>;
export async function readArchiveEntry(archive: object, entry: any, kind: 'arraybuffer' | 'string', maxBytes: number): Promise<ArrayBuffer | string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    await scanArchiveEntry(archive, entry, maxBytes, chunk => { chunks.push(chunk); size += chunk.length; });
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return kind === 'string' ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : bytes.buffer as ArrayBuffer;
  } finally { chunks.length = 0; }
}
