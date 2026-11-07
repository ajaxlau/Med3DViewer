export type ModelIdentityKind = 'sha256' | 'dropbox-block-sha256';
export const MODEL_BLOCK_BYTES = 4 * 1024 * 1024;
export async function digestHex(bytes: BufferSource): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function combineModelBlocks(blocks: string[]): Promise<string> {
  if (blocks.length > 38 || blocks.some(s => !/^[a-f0-9]{64}$/.test(s))) throw new Error('Invalid model block hashes.');
  const bytes = new Uint8Array(blocks.length * 32);
  blocks.forEach((hash, i) => hash.match(/../g)!.forEach((b, j) => { bytes[i * 32 + j] = parseInt(b, 16); }));
  return digestHex(bytes);
}
export async function modelIdentity(bytes: ArrayBuffer, kind: ModelIdentityKind = 'sha256', signal?: AbortSignal): Promise<string> {
  if (kind === 'sha256') return digestHex(bytes);
  if (kind !== 'dropbox-block-sha256') throw new Error('Unsupported model identity.');
  const blocks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += MODEL_BLOCK_BYTES) {
    signal?.throwIfAborted(); blocks.push(await digestHex(new Uint8Array(bytes, offset, Math.min(MODEL_BLOCK_BYTES, bytes.byteLength - offset))));
  }
  return combineModelBlocks(blocks);
}
