import { getDeviceLoadProfile } from './modelLoading';
import { validateSharedWorkspace, type SharedPlanningWorkspace } from './planningData';
import type { GpuCapabilities } from './gpuDetection';

const TOKEN = /^[a-f0-9]{64}$/;
const IDENTITY = /^[a-f0-9]{64}$/;
const METADATA_LIMIT = 270 * 1024;
const shareDownloadErrors: Record<string, string> = {
  SOURCE_INVALID: 'Use a valid Dropbox model link or an active model-sharing address.',
  SOURCE_HOST_UNSUPPORTED: 'Workspace sharing currently supports Dropbox file-sharing links.',
  FORMAT_UNSUPPORTED: 'Use a self-contained STL, 3MF or GLB model.',
  WORKSPACE_TOO_LARGE: 'The workspace metadata exceeds the 256 KiB sharing limit.',
  SHARE_LIMIT: 'The share creation limit was reached. Try later or contact the administrator.',
  SOURCE_REDIRECT_UNSUPPORTED: 'Dropbox returned an unsupported download redirect. Ask the platform owner to check Dropbox compatibility.',
  SOURCE_ACCESS_DENIED: 'Dropbox refused the server download. Check the file’s sharing permissions or try a new Dropbox link.',
  SOURCE_NOT_FOUND: 'Dropbox could not find the source file. Ask its owner to check the original link.',
  SOURCE_RATE_LIMITED: 'Dropbox temporarily limited downloads. Try again later.',
  SOURCE_DECRYPTION_FAILED: 'This link cannot be read with the current sharing configuration. Ask its owner to create a new link.',
  SOURCE_TIMEOUT: 'Dropbox took too long to respond. Try again later.',
  SOURCE_FETCH_FAILED: 'The server could not download the model from Dropbox. Try again later.',
  SOURCE_FORMAT: 'Dropbox returned a web page or other unsupported content instead of the model. Check the file’s sharing permissions.',
  SOURCE_UNAVAILABLE: 'Dropbox did not provide the model file. Ask its owner to check the original link.',
  MODEL_TOO_LARGE: 'This model exceeds the protected-sharing size limit. Ask its owner for a smaller model.',
  SHARE_UNAVAILABLE: 'This share is unavailable or expired. Ask its owner for a new link.',
  RATE_LIMITED: 'Too many share requests. Try again shortly.',
  SHARING_DISABLED: 'Shared workspaces are temporarily unavailable. Try again later.',
  SHARING_UNAVAILABLE: 'Shared workspaces are temporarily unavailable. Try again later.',
  VIEW_ONLY: 'Saving changes is disabled for this public workspace by its administrator.',
  WORKSPACE_CONFLICT: 'Someone else changed this workspace, or the link expired. Export your changes as a backup, then reload before saving again.',
  MODEL_CHANGED: 'The model identity does not match this workspace. Reload the protected link before saving.',
  UPGRADE_REQUIRED: 'Editing and management need the editable-workspace database migration. Contact the platform owner.',
  UNAUTHORIZED: 'The administrator password was not accepted.',
  EXPIRY_INVALID: 'Expiry must be in the future and no later than 180 days after creation.',
  LOGIN_REQUIRED: 'Log in to share a workspace.',
  PERMISSION_REQUIRED: 'Your account cannot perform this action.',
  SESSION_LIMIT: 'Sign-in sessions are full or your access changed. Try again later.',
  LABEL_INVALID: 'Enter a workspace name of at most 128 characters.',
  SHARE_PASSWORD_INVALID: 'The sharing username or password was not accepted.',
  EDIT_SESSION_INVALID: 'Your editing session expired or permissions changed. Unlock editing again.',
  PASSWORD_INVALID: 'Choose a sharing password of 12–128 characters.',
  AUTHOR_INVALID: 'Enter a revision name of 1–80 characters.',
  USERNAME_INVALID: 'Use a username of 3–64 lowercase letters, digits, dots, hyphens or underscores, starting with a letter.',
  USER_CONFLICT: 'That sharing user changed or the username already exists. Refresh the sharing user list.',
  HISTORY_FULL: 'History storage is full. Your changes remain on this device; contact the administrator.',
  REVISION_UNAVAILABLE: 'That saved version is no longer available.',
  INVALID_WORKSPACE: 'This workspace contains invalid or unsupported model/planning data.',
};

export interface SharedWorkspaceResponse {
  workspace: SharedPlanningWorkspace;
  modelIdentity: string;
  modelUrl: string;
  expiresAt: string;
  role: 'view' | 'edit';
  revision: number;
  viewUrl?: string;
  workspaceName?: string;
  historyEnabled?: boolean;
  includeWorkspace?: boolean;
  editingEnabled?: boolean;
  workspaceVersion?: number;
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
    || !new RegExp(`^/api/shares/${token}/model\\.(stl|3mf|glb)$`).test(url.pathname)) {
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
  const role = data.role ?? 'view';
  const revision = data.revision ?? 1;
  if (!['view','edit'].includes(role) || !Number.isSafeInteger(revision) || revision < 1 || revision > 2_147_483_646) throw new Error('The shared workspace access state is invalid.');
  return {
    workspace: validateSharedWorkspace(data.workspace),
    modelIdentity: data.modelIdentity!,
    modelUrl: protectedModelPath(token, data.modelUrl, origin),
    expiresAt: data.expiresAt, role, revision,
    ...(typeof data.workspaceName==='string'&&data.workspaceName.length<=128?{workspaceName:data.workspaceName}:{}),
    ...(data.historyEnabled === true ? {historyEnabled:true,includeWorkspace:data.includeWorkspace===true,editingEnabled:data.editingEnabled===true,workspaceVersion:validVersion(data.workspaceVersion)} : {}),
    ...(data.viewUrl !== undefined ? {viewUrl:protectedWorkspaceUrl(data.viewUrl,origin)} : {}),
  };
}

export async function shareDownloadError(response: Response, signal: AbortSignal): Promise<Error> {
  // Treat all server text as untrusted. Only show fixed messages for known codes,
  // with a small read ceiling; a failed upstream must not expose its URL or body.
  let code = '';
  try {
    if (/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
      const bytes = await readBoundedBytes(response, 4096, signal);
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof data?.error?.code === 'string' && Object.hasOwn(shareDownloadErrors, data.error.code)) code = data.error.code;
    } else await response.body?.cancel();
  } catch { /* Malformed, oversized and non-JSON errors use a fixed fallback. */ }
  abortIfNeeded(signal);
  return new Error(code ? `${shareDownloadErrors[code]} (${code})` : `The shared model could not be downloaded. Try again or ask its owner to check the link. (HTTP ${response.status})`);
}

export async function loadSharedModel(
  token: string,
  options: { signal: AbortSignal; capabilities: GpuCapabilities | null; safeMode: boolean; origin?: string; onProgress?: (received: number, total: number | null) => void }
): Promise<{ metadata: SharedWorkspaceResponse; file: File }> {
  if (!TOKEN.test(token)) throw new Error('This share address is invalid.');
  const origin = options.origin ?? window.location.origin;
  const response = await fetch(new URL(`/api/shares/${token}`, origin), { signal: options.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw await shareDownloadError(response, options.signal);
  const bytes = await readBoundedBytes(response, METADATA_LIMIT, options.signal);
  let metadata: SharedWorkspaceResponse;
  try { metadata = validateShareResponse(JSON.parse(new TextDecoder().decode(bytes)), token, origin); }
  catch { throw new Error('This shared workspace is invalid, expired, or unsupported. Ask its owner to create a new link.'); }
  const profile = getDeviceLoadProfile(options.capabilities, options.safeMode);
  const model = await fetch(metadata.modelUrl, { signal: options.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!model.ok) throw await shareDownloadError(model, options.signal);
  const modelBytes = await readBoundedBytes(model, profile.hardLimitBytes, options.signal, options.onProgress);
  abortIfNeeded(options.signal);
  if (await sha256Hex(modelBytes) !== metadata.modelIdentity) {
    throw new Error('The source model has changed. Saved planning data was not applied. Ask its owner for a new link.');
  }
  abortIfNeeded(options.signal);
  const extension = new URL(metadata.modelUrl).pathname.split('.').pop();
  return { metadata, file: new File([modelBytes], `shared-model.${extension}`, { type: 'application/octet-stream' }) };
}

export async function createProtectedShare(input: { sourceUrl?: string; sourceShareToken?: string; workspace: unknown; modelIdentity: string; label?: string; includeWorkspace?: boolean; sharingUsername?: string; expiresAt?: string }, sharingPassword: string, signal: AbortSignal): Promise<{ url: string; token: string; expiresAt: string }> {
  if (!IDENTITY.test(input.modelIdentity)) throw new Error('Reload this model from its original URL before creating a protected share.');
  if (input.includeWorkspace !== false && input.sharingUsername !== undefined && (!input.sharingUsername || sharingPassword.length < 12 || sharingPassword.length>128)) throw new Error('Enter your assigned sharing username and password.');
  const workspace = validateSharedWorkspace(input.workspace);
  const response = await fetch('/api/shares', {
    method: 'POST', credentials: input.includeWorkspace===false?'omit':'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(input.sourceShareToken?{sourceShareToken:input.sourceShareToken}:{sourceUrl:input.sourceUrl}), workspace, modelIdentity: input.modelIdentity, ...(input.label !== undefined ? {label:input.label} : {}),...(input.includeWorkspace !== undefined?{includeWorkspace:input.includeWorkspace}:{}),...(input.includeWorkspace!==false&&input.sharingUsername!==undefined?{sharingUsername:input.sharingUsername,sharingPassword}:{}),...(input.expiresAt!==undefined?{expiresAt:input.expiresAt}:{}) })
  });
  if (!response.ok) {
    const error=await shareDownloadError(response,signal);
    if(response.status===401)error.name='LoginRequiredError';
    throw error;
  }
  const data = await response.json();
  if (!TOKEN.test(data.token) || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error('The share service returned an invalid response.');
  const expected = `${window.location.origin}/s/${data.token}`;
  if (data.url !== expected) throw new Error('The share service returned an invalid address.');
  return data;
}

export function protectedWorkspaceUrl(candidate: unknown, origin = window.location.origin): string {
  if (typeof candidate !== 'string') throw new Error('The workspace address is invalid.');
  const url = new URL(candidate,origin);
  if (url.origin !== origin || url.search || url.hash || !tokenFromSharePath(url.pathname) || url.username || url.password) throw new Error('The workspace address is invalid.');
  return url.href;
}

export async function requestEditWorkspaceLink(path: string, password: string, signal: AbortSignal): Promise<string> {
  if (!/^\/api\/shares\/(?:admin\/)?[a-f0-9]{64}\/edit-link$/.test(path) || password.length < 32 || password.length > 256) throw new Error('Enter the authorized creator password.');
  const response = await fetch(path,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',signal,headers:{Authorization:`Bearer ${password}`}});
  if (!response.ok) throw await shareDownloadError(response,signal);
  const data = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,8192,signal)));
  if (data.role !== 'edit') throw new Error('The service did not return an edit link.');
  return protectedWorkspaceUrl(data.url);
}

export async function saveProtectedWorkspace(token: string, data: {workspace:unknown;modelIdentity:string;revision:number;author?:string}, signal: AbortSignal, editSession?:string): Promise<{revision:number;updatedAt:string;expiresAt:string;workspaceVersion?:number}> {
  if (!TOKEN.test(token) || !IDENTITY.test(data.modelIdentity) || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('The shared workspace save state is invalid.');
  const workspace = validateSharedWorkspace(data.workspace);
  const response = await fetch(`/api/shares/${token}`,{method:'PUT',credentials:'omit',cache:'no-store',redirect:'error',signal,headers:{'Content-Type':'application/json',...(editSession?{Authorization:`Bearer ${editSession}`}:{})},body:JSON.stringify({...data,workspace})});
  if (!response.ok) throw await shareDownloadError(response,signal);
  const result = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,8192,signal)));
  const appendSave = result.workspaceVersion !== undefined;
  if (!Number.isSafeInteger(result.revision) || result.revision < 1
    || (appendSave ? !Number.isSafeInteger(result.workspaceVersion) || result.workspaceVersion < 2 : result.revision !== data.revision+1)
    || !Number.isFinite(Date.parse(result.updatedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('The save service returned invalid revision metadata. Reload before saving again.');
  return result;
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
  const pending = manager.loadFiles([file], { shared: true, signal });
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

function validVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number)<1 || (value as number)>2_147_483_646) throw new Error('Invalid saved workspace version.');
  return value as number;
}
async function historyRequest(token:string,suffix:string,signal:AbortSignal,password?:string,username?:string):Promise<any> {
  if(!TOKEN.test(token))throw new Error('Invalid workspace address.');
  const response=await fetch(`/api/shares/${token}/${suffix}`,{method:password===undefined?'GET':'POST',signal,credentials:'omit',cache:'no-store',redirect:'error',...(password!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}:{})});
  if(!response.ok)throw await shareDownloadError(response,signal);
  return JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,280*1024,signal)));
}
export async function authorizePublicWorkspaceShare(token:string,username:string,password:string,signal:AbortSignal):Promise<string> {
  if(!/^[a-z][a-z0-9._-]{2,63}$/.test(username)||password.length<12||password.length>128)throw new Error('Enter the authorized sharing password.');
  const data=await historyRequest(token,'share-link',signal,password,username);
  return protectedWorkspaceUrl(data.url);
}
export interface WorkspaceHistoryItem {version:number;author:string;savedAt:number}
export async function listWorkspaceHistory(token:string,signal:AbortSignal):Promise<{items:WorkspaceHistoryItem[];currentVersion:number;revision:number}> {
  const data=await historyRequest(token,'revisions',signal);
  validVersion(data.currentVersion);validVersion(data.revision);
  if(!Array.isArray(data.items)||data.items.length>20||data.items.some((item:any)=>!Number.isSafeInteger(item.version)||item.version<1||item.version>data.currentVersion||typeof item.author!=='string'||item.author.length>80||!Number.isSafeInteger(item.savedAt)))throw new Error('Invalid workspace history.');
  return data;
}
export async function loadWorkspaceVersion(token:string,version:number,identity:string,signal:AbortSignal):Promise<{workspace:SharedPlanningWorkspace;revision:number;currentVersion:number}> {
  validVersion(version);
  const data=await historyRequest(token,`revisions/${version}`,signal);
  if(data.version!==version||data.modelIdentity!==identity)throw new Error('This version belongs to a different model.');
  return {workspace:validateSharedWorkspace(data.workspace),revision:validVersion(data.revision),currentVersion:validVersion(data.currentVersion)};
}

export async function shareWorkspaceWithSession(token:string,signal:AbortSignal):Promise<string> {
  if(!TOKEN.test(token))throw new Error('Invalid workspace address.');
  const response=await fetch(`/api/shares/${token}/share-link`,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{'Content-Type':'application/json'},body:'{}'});
  if(!response.ok){const error=await shareDownloadError(response,signal);if(response.status===401)error.name='LoginRequiredError';throw error;}
  const data=JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,8192,signal)));
  return protectedWorkspaceUrl(data.url);
}
