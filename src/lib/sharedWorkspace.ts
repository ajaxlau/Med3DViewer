import { getDeviceLoadProfile } from './modelLoading';
import { validateSharedWorkspace, type SharedPlanningWorkspace } from './planningData';
import type { GpuCapabilities } from './gpuDetection';

const TOKEN = /^[a-f0-9]{64}$/;
const IDENTITY = /^[a-f0-9]{64}$/;
const METADATA_LIMIT = 270 * 1024;

export interface SharedWorkspaceResponse {
  workspace: SharedPlanningWorkspace;
  modelIdentity: string;
  modelUrl: string;
  expiresAt: string;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Loading cancelled.', 'AbortError');
}

/** A protected address never contains the original host or access key. */
export function tokenFromSharePath(path: string): string | null {
  const match = /^\/s\/([a-f0-9]{64})\/?$/.exec(path);
  return match ? match[1] : null;
}

export function protectedModelPath(token: string, candidate: unknown, origin: string): string {
  if (!TOKEN.test(token) || typeof candidate !== 'string') throw new Error('The shared model reference is invalid.');
  const url = new URL(candidate, origin);
  if (url.origin !== origin || url.search || url.hash || url.username || url.password
    || !new RegExp(`^/api/shares/${token}/model\\.(stl)$`).test(url.pathname)) {
    throw new Error('The shared model reference is invalid.');
  }
  return url.href;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readBoundedBytes(
  response: Response,
  limit: number,
  signal?: AbortSignal,
  onProgress?: (received: number, total: number | null) => void
): Promise<ArrayBuffer> {
  abortIfNeeded(signal);
  const length = Number(response.headers.get('content-length')) || null;
  if (length !== null && length > limit) {
    await response.body?.cancel();
    throw new Error('This shared model exceeds this device’s loading limit. Try a desktop browser.');
  }
  if (!response.body) throw new Error('The model download was empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      abortIfNeeded(signal);
      const { done, value } = await reader.read();
      abortIfNeeded(signal);
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel();
        throw new Error('This shared model exceeds this device’s loading limit. Try a desktop browser.');
      }
      chunks.push(value);
      onProgress?.(received, length);
    }
    if (!received) throw new Error('The model download was empty.');
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    chunks.length = 0;
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    chunks.length = 0;
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function validateShareResponse(value: unknown, token: string, origin: string, now = Date.now()): SharedWorkspaceResponse {
  const data = value as Partial<SharedWorkspaceResponse>;
  if (!data || typeof data !== 'object' || !IDENTITY.test(data.modelIdentity || '')
    || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))
    || Date.parse(data.expiresAt) <= now) throw new Error('This share is unavailable or expired. Ask its owner for a new link.');
  return {
    workspace: validateSharedWorkspace(data.workspace),
    modelIdentity: data.modelIdentity!,
    modelUrl: protectedModelPath(token, data.modelUrl, origin),
    expiresAt: data.expiresAt
  };
}

export async function loadSharedModel(
  token: string,
  options: { signal: AbortSignal; capabilities: GpuCapabilities | null; safeMode: boolean; origin?: string; onProgress?: (received: number, total: number | null) => void }
): Promise<{ metadata: SharedWorkspaceResponse; file: File }> {
  if (!TOKEN.test(token)) throw new Error('This share address is invalid.');
  const origin = options.origin ?? window.location.origin;
  const response = await fetch(new URL(`/api/shares/${token}`, origin), { signal: options.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 503 ? 'Shared workspaces are temporarily unavailable. Try again later.' : 'This share is unavailable or expired. Ask its owner for a new link.');
  const bytes = await readBoundedBytes(response, METADATA_LIMIT, options.signal);
  let metadata: SharedWorkspaceResponse;
  try { metadata = validateShareResponse(JSON.parse(new TextDecoder().decode(bytes)), token, origin); }
  catch { throw new Error('This shared workspace is invalid, expired, or unsupported. Ask its owner to create a new link.'); }
  const profile = getDeviceLoadProfile(options.capabilities, options.safeMode);
  const model = await fetch(metadata.modelUrl, { signal: options.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!model.ok) throw new Error('The shared model is unavailable. Its original host may no longer provide access.');
  const modelBytes = await readBoundedBytes(model, profile.hardLimitBytes, options.signal, options.onProgress);
  abortIfNeeded(options.signal);
  if (await sha256Hex(modelBytes) !== metadata.modelIdentity) {
    throw new Error('The source model has changed. Saved planning data was not applied. Ask its owner for a new link.');
  }
  abortIfNeeded(options.signal);
  const extension = new URL(metadata.modelUrl).pathname.split('.').pop();
  return { metadata, file: new File([modelBytes], `shared-model.${extension}`, { type: 'application/octet-stream' }) };
}

export async function createProtectedShare(input: { sourceUrl: string; workspace: unknown; modelIdentity: string }, creatorKey: string, signal: AbortSignal): Promise<{ url: string; token: string; expiresAt: string }> {
  if (!IDENTITY.test(input.modelIdentity)) throw new Error('Reload this model from its original URL before creating a protected share.');
  if (creatorKey.length < 32) throw new Error('Enter the authorized share-creation key.');
  const workspace = validateSharedWorkspace(input.workspace);
  const response = await fetch('/api/shares', {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creatorKey}` },
    body: JSON.stringify({ sourceUrl: input.sourceUrl, workspace, modelIdentity: input.modelIdentity })
  });
  if (!response.ok) {
    const errors: Record<number, string> = {
      400: 'This source or workspace is not supported for protected sharing. Use a supported external STL without local custom meshes.',
      401: 'The share-creation key was not accepted.', 403: 'Share creation is not permitted.',
      413: 'The planning workspace is too large to share as metadata.', 429: 'The sharing limit was reached. Try again later.',
      503: 'Protected sharing has not been configured for this environment.'
    };
    throw new Error(errors[response.status] || 'The protected link could not be created. Try again later.');
  }
  const data = await response.json();
  if (!TOKEN.test(data.token) || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error('The share service returned an invalid response.');
  const expected = `${window.location.origin}/s/${data.token}`;
  if (data.url !== expected) throw new Error('The share service returned an invalid address.');
  return data;
}

/** Await only this import; a newer user action must never receive the old snapshot. */
export async function waitForSharedModelReady(manager: any, requestId: string, signal: AbortSignal, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (true) {
    abortIfNeeded(signal);
    const state = manager.modelLoadState;
    if (state.requestId !== requestId) throw new Error('A newer model load replaced this shared workspace.');
    if (state.phase === 'ready') return;
    if (state.phase === 'cancelled') throw new DOMException('Loading cancelled.', 'AbortError');
    if (state.phase === 'failed') throw new Error('The shared model could not be parsed. Try a desktop browser or ask its owner to check the file.');
    if (Date.now() - start > timeoutMs) throw new Error('The shared model took too long to open. Try a desktop browser.');
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
}

export function captureModelLoad(manager: any): { requestId: string | null; phase: string } {
  return { requestId: manager.modelLoadState.requestId, phase: manager.modelLoadState.phase };
}

/** Capture our import ID before asynchronous validation can yield to a newer load. */
export function beginSharedModelImport(manager: any, file: File, checkpoint: ReturnType<typeof captureModelLoad>, signal: AbortSignal): { requestId: string; completion: Promise<void> } {
  abortIfNeeded(signal);
  const current = captureModelLoad(manager);
  if (current.requestId !== checkpoint.requestId || current.phase !== checkpoint.phase) {
    throw new Error('A newer model load replaced this shared workspace.');
  }
  const pending = manager.loadFiles([file], { shared: true });
  const requestId = manager.modelLoadState.requestId;
  if (typeof requestId !== 'string' || !requestId || requestId === checkpoint.requestId) {
    throw new Error('The shared model import could not be started.');
  }
  return {
    requestId,
    completion: Promise.resolve(pending).then(() => {
      abortIfNeeded(signal);
      if (manager.modelLoadState.requestId !== requestId) throw new Error('A newer model load replaced this shared workspace.');
    })
  };
}
