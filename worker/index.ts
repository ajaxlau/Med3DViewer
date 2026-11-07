import { createUserSession, readUserSession, requireUserPermission, revokeUserSession, publicUserSession, userSessionCookie, SessionError, type SharingIdentity } from './userSessions';
import { validateSharedWorkspace } from '../src/lib/planningData';
import { HISTORY_BYTE_LIMIT, HISTORY_VERSION_LIMIT, equalDigest, modelShareKey, passwordDigest, randomToken, revisionAuthor, validWorkspacePassword } from './workspaceAccess';
import { cleanupExpiredShares, databaseScopeMatches } from './cleanup';

// Local interfaces keep the browser's dependency graph free of Workers SDKs.
interface D1Result { meta?: { changes?: number }; results?: unknown[] }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
export interface ShareDatabase {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
export interface ShareEnvironment {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SHARES_DB?: ShareDatabase;
  SHARES_ENABLED?: string;
  SHARES_ENVIRONMENT?: string;
  SHARES_CREATE_KEY?: string;
  SHARES_ENCRYPTION_KEY?: string;
  SHARES_MAX_RECORDS?: string;
  SHARES_DAILY_CREATE_LIMIT?: string;
}
interface ShareRecord {
  token_hash: string;
  source_ciphertext: string;
  model_extension: string;
  model_identity: string;
  workspace_json: string;
  owner_ref: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  revision?: number;
  updated_at?: number | null;
  label?: string;
  edit_token_hash?: string | null;
  view_token_ciphertext?: string | null;
  edit_token_ciphertext?: string | null;
  role?: 'view' | 'edit';
  include_workspace?: number; editing_enabled?: number; auth_epoch?: number; workspace_version?: number;
}
interface Dependencies { now?: () => number; fetch?: typeof fetch }
const DAY = 86_400_000;
export const SHARE_LIFETIME_MS = 180 * DAY;
export const MAX_WORKSPACE_BYTES = 256 * 1024;
const MAX_BODY_BYTES = MAX_WORKSPACE_BYTES + 8192;
const MAX_MODEL_BYTES = 150 * 1024 * 1024;
const TOKEN = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const protectedHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
class ShareError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...protectedHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}
function ready(env: ShareEnvironment): boolean {
  return env.SHARES_ENABLED === 'true' && ['test','beta','main','box-test'].includes(env.SHARES_ENVIRONMENT || '') && !!env.SHARES_DB
    && typeof env.SHARES_CREATE_KEY === 'string' && env.SHARES_CREATE_KEY.length >= 32 && env.SHARES_CREATE_KEY.length <= 256
    && typeof env.SHARES_ENCRYPTION_KEY === 'string' && env.SHARES_ENCRYPTION_KEY.length >= 32 && env.SHARES_ENCRYPTION_KEY.length <= 256;
}
async function environmentReady(env: ShareEnvironment): Promise<boolean> {
  if (!ready(env)) return false;
  return databaseScopeMatches(env);
}
async function editableSchemaReady(env: ShareEnvironment): Promise<boolean> {
  try {
    return ((await env.SHARES_DB!.prepare('SELECT version FROM share_schema_version WHERE id=1').first<{version:number}>())?.version || 0) >= 2;
  } catch { return false; }
}
async function requireEditableSchema(env: ShareEnvironment): Promise<void> {
  if (!await editableSchemaReady(env)) throw new ShareError(503,'UPGRADE_REQUIRED','Apply the editable-workspace database migration before using this feature.');
}
async function historySchemaReady(env: ShareEnvironment): Promise<boolean> {
  try { return ((await env.SHARES_DB!.prepare('SELECT version FROM share_schema_version WHERE id=1').first<{version:number}>())?.version || 0) >= 3; } catch { return false; }
}
async function requireHistorySchema(env: ShareEnvironment): Promise<void> {
  if (!await historySchemaReady(env)) throw new ShareError(503,'UPGRADE_REQUIRED','Apply migration 0003 before using public workspace history.');
}
function hex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer as ArrayBuffer), value => value.toString(16).padStart(2, '0')).join('');
}
export async function hashToken(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function authenticate(request: Request, env: ShareEnvironment): Promise<string> {
  const provided = request.headers.get('Authorization') || '';
  if (!provided.startsWith('Bearer ') || provided.length > 1024) throw new ShareError(401, 'UNAUTHORIZED', 'Administrator authorization is required.');
  const actual = await hashToken(provided.slice(7));
  const expected = await hashToken(env.SHARES_CREATE_KEY!);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference) throw new ShareError(401, 'UNAUTHORIZED', 'The administrator password was not accepted.');
  return expected;
}
async function aesKey(env: ShareEnvironment): Promise<CryptoKey> {
  const secret = env.SHARES_ENCRYPTION_KEY!;
  // Password-manager-generated random 32+ character secrets work on mobile.
  // Hashing is key formatting, not password hardening: predictable phrases are unsafe.
  // Preserve the 32-byte hex format for operators already using it.
  const material = /^[a-fA-F0-9]{64}$/.test(secret)
    ? new Uint8Array(secret.match(/../g)!.map(value => parseInt(value, 16)))
    : await crypto.subtle.digest('SHA-256', encoder.encode(`Med3DViewer share source key v1\0${secret}`));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptSource(source: string, hash: string, env: ShareEnvironment): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(hash) }, await aesKey(env), encoder.encode(source));
  return `${hex(iv)}.${hex(encrypted)}`;
}
async function decryptSource(value: string, hash: string, env: ShareEnvironment): Promise<string> {
  const [ivHex, ciphertext] = value.split('.');
  if (!/^[a-f0-9]{24}$/.test(ivHex || '') || !/^[a-f0-9]+$/.test(ciphertext || '') || ciphertext.length % 2) throw new Error('Invalid encrypted source');
  const bytes = (input: string) => new Uint8Array(input.match(/../g)!.map(item => parseInt(item, 16)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(ivHex), additionalData: encoder.encode(hash) }, await aesKey(env), bytes(ciphertext)));
}
function sourceUrl(raw: unknown, origin: string): URL {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\u0000-\u0020\u007f]/.test(raw)) throw new ShareError(400, 'SOURCE_INVALID', 'Use an approved HTTPS model URL.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new ShareError(400, 'SOURCE_INVALID', 'Use an approved HTTPS model URL.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.origin === origin) throw new ShareError(400, 'SOURCE_INVALID', 'Use an approved HTTPS model URL.');
  url.hash = '';
  return url;
}
function isDropboxContentHost(hostname: string): boolean {
  return hostname === 'dl.dropboxusercontent.com' || hostname.endsWith('.dl.dropboxusercontent.com');
}
export function validateSource(raw: unknown, env: ShareEnvironment, origin: string, normalize = false): URL {
  const url = sourceUrl(raw, origin);
  if (normalize && ['dropbox.com', 'www.dropbox.com'].includes(url.hostname) && /^\/(?:s\/[^/]+\/|scl\/fi\/[^/]+\/)/.test(url.pathname)) {
    url.hostname = 'dl.dropboxusercontent.com';
    url.searchParams.delete('dl');
    url.searchParams.delete('raw');
  }
  if (!isDropboxContentHost(url.hostname)) throw new ShareError(400, 'SOURCE_HOST_UNSUPPORTED', 'Protected sharing currently requires a Dropbox file-sharing link.');
  return url;
}
function downloadRedirect(raw: string, origin: string): URL {
  try {
    const url = sourceUrl(raw, origin);
    // Dropbox documents /s/dl and /s/raw redirects on its own subdomains.
    // Allow only these download routes, not arbitrary Dropbox web/login pages.
    const downloadRoute = (url.hostname === 'dropbox.com' || url.hostname.endsWith('.dropbox.com'))
      && /^\/s\/(?:dl|raw)(?:\/|$)/.test(url.pathname);
    if (isDropboxContentHost(url.hostname) || downloadRoute) return url;
  } catch { /* Never expose a rejected Location header. */ }
  throw new ShareError(502, 'SOURCE_REDIRECT_UNSUPPORTED', 'Dropbox redirected the download to an unsupported destination.');
}
function extension(url: URL): string {
  let name: string;
  try { name = decodeURIComponent(url.pathname.split('/').pop() || ''); } catch { throw new ShareError(400, 'FORMAT_UNSUPPORTED', 'Protected sharing supports self-contained STL, 3MF and GLB models.'); }
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  if (!['stl','3mf','glb'].includes(ext || '')) throw new ShareError(400, 'FORMAT_UNSUPPORTED', 'Protected sharing supports self-contained STL, 3MF and GLB models.');
  return ext!;
}
async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new ShareError(415, 'CONTENT_TYPE', 'Send workspace metadata as JSON.');
  const length = Number(request.headers.get('Content-Length'));
  if (length > MAX_BODY_BYTES) throw new ShareError(413, 'WORKSPACE_TOO_LARGE', 'The workspace metadata is too large to share.');
  if (!request.body) throw new ShareError(400, 'INVALID_JSON', 'Workspace metadata is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) { await reader.cancel(); throw new ShareError(413, 'WORKSPACE_TOO_LARGE', 'The workspace metadata is too large to share.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ShareError(400, 'INVALID_JSON', 'The workspace metadata is invalid.'); }
  } finally { reader.releaseLock(); }
}
function integerSetting(value: string | undefined, defaultValue: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : defaultValue;
}
async function rateLimit(request: Request, env: ShareEnvironment, now: number): Promise<void> {
  // CF supplies this header. Persist only a salted, short-lived hash, never the address.
  const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').slice(0,64);
  const scope = await hashToken(`${env.SHARES_CREATE_KEY}:${ip}`);
  const minute = Math.floor(now / 60_000);
  const result = await env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`).bind(`read:${scope}:${minute}`, (minute + 2) * 60_000).first<{ count: number }>();
  if (!result || result.count > 120) throw new ShareError(429, 'RATE_LIMITED', 'Too many share requests. Try again shortly.');
}
async function createShare(request: Request, env: ShareEnvironment, now: number): Promise<Response> {
  const history = await historySchemaReady(env);
  let owner = `creator:${env.SHARES_ENVIRONMENT}`;
  const body = await readJson(request) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['workspace', 'sourceUrl', 'sourceShareToken', 'modelIdentity','label','includeWorkspace','sharingUsername','sharingPassword','expiresAt'].includes(key))) throw new ShareError(400, 'INVALID_WORKSPACE', 'The share request is invalid.');
  const includeWorkspace = body.includeWorkspace !== false;
  if (body.includeWorkspace !== undefined && typeof body.includeWorkspace !== 'boolean') throw new ShareError(400,'REQUEST_INVALID','Choose model-only or workspace sharing.');
  if(history && includeWorkspace) owner=`sharer:${(await authorizeWorkspaceSharing(request,env,now,body.sharingUsername,body.sharingPassword)).id}`;
  else if(!history) await authenticate(request,env);
  else {owner='public-model';await limitedAttempts(request,env,now,'model-link',120);}
  if (!includeWorkspace && !history) throw new ShareError(503,'UPGRADE_REQUIRED','Apply migration 0003 for model-only public sharing.');
  const label = workspaceLabel(includeWorkspace?body.label??'':'');
  if(history && includeWorkspace && !label)throw new ShareError(400,'LABEL_INVALID','Enter a workspace name.');
  const editable = await editableSchemaReady(env);
  if((body.sourceUrl!==undefined)===(body.sourceShareToken!==undefined))throw new ShareError(400,'SOURCE_INVALID','Provide one model source.');
  let sourceReference=body.sourceUrl;
  let parentHash:string|undefined,parentExpiry:number|undefined;
  if(body.sourceShareToken!==undefined) {
    if(typeof body.sourceShareToken!=='string'||!TOKEN.test(body.sourceShareToken))throw new ShareError(400,'SOURCE_INVALID','A valid existing model link is required.');
    const original=await loadRecord(body.sourceShareToken,env,now);
    if(!includeWorkspace){parentHash=/^model-from:([a-f0-9]{64}):[a-f0-9]{64}$/.exec(original.owner_ref)?.[1]||original.token_hash;parentExpiry=original.expires_at;}
    if(body.modelIdentity!==original.model_identity)throw new ShareError(409,'MODEL_CHANGED','The model identity does not match this source.');
    try{sourceReference=await decryptSource(original.source_ciphertext,original.token_hash,env);}
    catch{throw new ShareError(502,'SOURCE_DECRYPTION_FAILED','The existing model source could not be recovered.');}
  }
  const source = validateSource(sourceReference, env, new URL(request.url).origin, true);
  const ext = extension(source);
  if (typeof body.modelIdentity !== 'string' || !TOKEN.test(body.modelIdentity)) throw new ShareError(400, 'MODEL_IDENTITY_INVALID', 'A model SHA-256 fingerprint is required.');
  let workspace: unknown;
  try { workspace = validateSharedWorkspace(body.workspace); }
  catch { throw new ShareError(400, 'INVALID_WORKSPACE', 'The workspace contains unsupported, invalid or local-only data.'); }
  if (!includeWorkspace) {
    const state = workspace as any;
    workspace = {schemaVersion:1,modelMatrix:state.modelMatrix,coordinateSystem:state.coordinateSystem,objects:[],groups:[]};
  }
  const snapshot = JSON.stringify(workspace);
  if (encoder.encode(snapshot).length > MAX_WORKSPACE_BYTES) throw new ShareError(413, 'WORKSPACE_TOO_LARGE', 'The workspace metadata is too large to share.');
  if(history&&!includeWorkspace) {
    const key=await modelShareKey(source.href,body.modelIdentity,snapshot,env.SHARES_ENCRYPTION_KEY!);
    owner=parentHash?`model-from:${parentHash}:${key}`:`public-model:${key}`;
    const existing=await reusableModelLink(request,owner,env,now);
    if(existing)return existing;
    await limitedAttempts(request,env,now,'public-create',5,DAY);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await hashToken(token);
  const ciphertext = await encryptSource(source.href, hash, env);
  let expires = Math.min(now + SHARE_LIFETIME_MS,parentExpiry??Infinity);
  if (body.expiresAt !== undefined) {
    if(!includeWorkspace)throw new ShareError(400,'REQUEST_INVALID','Custom expiry is available for workspace sharing.');
    expires = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
    if(!Number.isSafeInteger(expires)||expires<=now||expires>now+SHARE_LIFETIME_MS)throw new ShareError(400,'EXPIRY_INVALID','Expiry must be in the future and within 180 days from creation.');
  }
  const daily = `create:${Math.floor(now / DAY)}`;
  const limit = integerSetting(env.SHARES_MAX_RECORDS, 500, 5000);
  const dailyLimit = integerSetting(env.SHARES_DAILY_CREATE_LIMIT, 50, 1000);
  // D1 batch is transactional: the daily counter and record limit cannot race.
  const viewCiphertext = editable ? await encryptSource(token,`view-token:${hash}`,env) : null;
  const results = await env.SHARES_DB!.batch([
    env.SHARES_DB!.prepare(`INSERT INTO shares(token_hash,source_ciphertext,model_extension,model_identity,workspace_json,owner_ref,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM shares) < ?
      AND COALESCE((SELECT count FROM share_rate_limits WHERE bucket=?),0) < ?
      ${history&&!includeWorkspace?'AND NOT EXISTS(SELECT 1 FROM shares WHERE owner_ref=? AND expires_at>? AND revoked_at IS NULL)':''}`)
      .bind(hash,ciphertext,ext,body.modelIdentity,snapshot,owner,now,expires,limit,daily,dailyLimit,...(history&&!includeWorkspace?[owner,now]:[])),
    env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at)
      SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM shares WHERE token_hash=?)
      ON CONFLICT(bucket) DO UPDATE SET count=count+1`).bind(daily,now + 2 * DAY,hash),
    ...(editable ? [env.SHARES_DB!.prepare('UPDATE shares SET label=?,updated_at=?,view_token_ciphertext=? WHERE token_hash=?').bind(label,now,viewCiphertext,hash)] : []),
    ...(history ? [env.SHARES_DB!.prepare('UPDATE shares SET include_workspace=?,editing_enabled=? WHERE token_hash=?').bind(includeWorkspace?1:0,includeWorkspace?1:0,hash)] : []),
  ]);
  if(!results[0]?.meta?.changes&&history&&!includeWorkspace){const existing=await reusableModelLink(request,owner,env,now);if(existing)return existing;}
  if (!results[0]?.meta?.changes) throw new ShareError(429, 'SHARE_LIMIT', 'The share creation quota is full. Try later or contact the platform owner.');
  return json({ url: new URL(`/s/${token}`, request.url).href, token, expiresAt: new Date(expires).toISOString(),revision:1,editingAvailable:editable }, 201);
}
async function reusableModelLink(request:Request,owner:string,env:ShareEnvironment,now:number):Promise<Response|null> {
  const row=await env.SHARES_DB!.prepare('SELECT token_hash,view_token_ciphertext FROM shares WHERE owner_ref=? AND expires_at>? AND revoked_at IS NULL AND view_token_ciphertext IS NOT NULL ORDER BY created_at DESC LIMIT 1').bind(owner,now).first<{token_hash:string;view_token_ciphertext:string}>();
  if(!row)return null;
  let token:string;
  try{token=await decryptSource(row.view_token_ciphertext,`view-token:${row.token_hash}`,env);}
  catch{throw new ShareError(502,'SOURCE_DECRYPTION_FAILED','The model share could not be recovered.');}
  if(!TOKEN.test(token)||await hashToken(token)!==row.token_hash)throw new ShareError(503,'SHARING_UNAVAILABLE','The model share is unavailable.');
  const record=await loadRecord(token,env,now);
  return json({url:new URL(`/s/${token}`,request.url).href,token,expiresAt:new Date(record.expires_at).toISOString(),revision:record.revision??1,editingAvailable:true});
}
function validShareRecord(result:ShareRecord|null):result is ShareRecord {
  return !!result&&Number.isSafeInteger(result.created_at)&&result.created_at>=0&&Number.isSafeInteger(result.expires_at)
    &&result.expires_at>result.created_at&&result.expires_at<=result.created_at+SHARE_LIFETIME_MS
    &&['stl','3mf','glb'].includes(result.model_extension)&&TOKEN.test(result.model_identity);
}
async function loadRecord(token: string, env: ShareEnvironment, now: number): Promise<ShareRecord> {
  const hash = await hashToken(token);
  const editable = await editableSchemaReady(env);
  const result = editable
    ? await env.SHARES_DB!.prepare('SELECT * FROM shares WHERE (token_hash=? OR edit_token_hash=?) AND expires_at>? AND revoked_at IS NULL').bind(hash,hash,now).first<ShareRecord>()
    : await env.SHARES_DB!.prepare('SELECT * FROM shares WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(hash,now).first<ShareRecord>();
  if(!validShareRecord(result))throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
  const parentHash=/^model-from:([a-f0-9]{64}):[a-f0-9]{64}$/.exec(result.owner_ref)?.[1];
  if(parentHash){
    const parent=await env.SHARES_DB!.prepare('SELECT * FROM shares WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(parentHash,now).first<ShareRecord>();
    if(!validShareRecord(parent)||parent.owner_ref.startsWith('model-from:')||parent.model_identity!==result.model_identity||parent.model_extension!==result.model_extension)throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
    result.expires_at=Math.min(result.expires_at,parent.expires_at);
  }
  return {...result,role:result.token_hash===hash||result.auth_epoch!==undefined?'view':'edit'};
}
function workspaceLabel(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw new ShareError(400,'LABEL_INVALID','Use a workspace label of at most 128 characters.');
  return value.trim();
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_646) throw new ShareError(400,'REVISION_INVALID','A valid workspace revision is required.');
  return value as number;
}
function requestFields(body: any, allowed: string[]): void {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key=>!allowed.includes(key))) throw new ShareError(400,'REQUEST_INVALID','This workspace request contains unsupported fields.');
}
async function saveWorkspace(request: Request, record: ShareRecord, env: ShareEnvironment, now: number): Promise<Response> {
  await requireEditableSchema(env);
  if (await historySchemaReady(env)) return saveHistory(request,record,env,now);
  if (record.role !== 'edit') throw new ShareError(403,'VIEW_ONLY','This is a view-only link. Ask its owner for an authorized edit link.');
  const body = await readJson(request) as any;
  requestFields(body,['workspace','modelIdentity','revision']);
  const expected = revision(body.revision);
  if (body.modelIdentity !== record.model_identity) throw new ShareError(409,'MODEL_CHANGED','The model identity does not match this workspace. Reload before saving.');
  let workspace: unknown;
  try { workspace = validateSharedWorkspace(body.workspace); }
  catch { throw new ShareError(400,'INVALID_WORKSPACE','The workspace contains invalid or unsupported model/planning state.'); }
  const result = await env.SHARES_DB!.prepare(`UPDATE shares SET workspace_json=?,revision=revision+1,updated_at=?
    WHERE token_hash=? AND revision=? AND expires_at>? AND revoked_at IS NULL`)
    .bind(JSON.stringify(workspace),now,record.token_hash,expected,now).run();
  if (!result.meta?.changes) throw new ShareError(409,'WORKSPACE_CONFLICT','This workspace changed or expired. Reload its latest version before saving.');
  return json({revision:expected+1,updatedAt:new Date(now).toISOString(),expiresAt:new Date(record.expires_at).toISOString()});
}
async function adminRecord(id: string, env: ShareEnvironment, now: number): Promise<ShareRecord> {
  const record = await env.SHARES_DB!.prepare('SELECT * FROM shares WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(id,now).first<ShareRecord>();
  if (!record || record.expires_at <= record.created_at || record.expires_at > record.created_at + SHARE_LIFETIME_MS) throw new ShareError(404,'SHARE_UNAVAILABLE','This workspace is unavailable, revoked or expired.');
  return record;
}
async function issueEditLink(request: Request, record: ShareRecord, env: ShareEnvironment, now: number, knownViewToken?: string): Promise<Response> {
  if (await historySchemaReady(env)) throw new ShareError(409,'EDIT_LINK_RETIRED','Use the public workspace URL. Editing is controlled by its administrator.');
  // Caller must authenticate the creator password for each issuance/retrieval.
  let token: string;
  if (record.edit_token_ciphertext && record.edit_token_hash) {
    try { token = await decryptSource(record.edit_token_ciphertext,`edit-token:${record.token_hash}`,env); }
    catch { throw new ShareError(502,'SOURCE_DECRYPTION_FAILED','This workspace cannot recover its edit link with the current encryption key.'); }
    if (!TOKEN.test(token) || await hashToken(token) !== record.edit_token_hash) throw new ShareError(503,'SHARING_UNAVAILABLE','The saved edit link is invalid.');
  } else {
    token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const cipher = await encryptSource(token,`edit-token:${record.token_hash}`,env);
    const viewCipher = knownViewToken ? await encryptSource(knownViewToken,`view-token:${record.token_hash}`,env) : null;
    const result = await env.SHARES_DB!.prepare(`UPDATE shares SET edit_token_hash=?,edit_token_ciphertext=?,view_token_ciphertext=COALESCE(view_token_ciphertext,?)
      WHERE token_hash=? AND edit_token_hash IS NULL AND expires_at>? AND revoked_at IS NULL`)
      .bind(await hashToken(token),cipher,viewCipher,record.token_hash,now).run();
    if (!result.meta?.changes) throw new ShareError(409,'WORKSPACE_CONFLICT','The link changed or expired. Retry after refreshing the workspace.');
  }
  return json({url:new URL(`/s/${token}`,request.url).href,expiresAt:new Date(record.expires_at).toISOString(),role:'edit'});
}
async function listWorkspaces(request: Request, env: ShareEnvironment): Promise<Response> {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key=>key!=='before') || url.searchParams.getAll('before').length>1) throw new ShareError(400,'REQUEST_INVALID','Unsupported management filter.');
  const cursor = url.searchParams.get('before');
  const match = cursor ? /^(\d{1,16})\.([a-f0-9]{64})$/.exec(cursor) : null;
  if (cursor && (!match || !Number.isSafeInteger(Number(match[1])))) throw new ShareError(400,'REQUEST_INVALID','Invalid management cursor.');
  const before = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  const afterId = match?.[2] || '';
  const history = await historySchemaReady(env);
  const accessFields = history ? ",'includeWorkspace',include_workspace,'editingEnabled',editing_enabled,'workspaceVersion',workspace_version" : '';
  const result = await env.SHARES_DB!.prepare(`SELECT json_group_array(json_object(
    'id',token_hash,'label',label,'format',model_extension,'createdAt',created_at,'updatedAt',COALESCE(updated_at,created_at),
    'expiresAt',expires_at,'revokedAt',revoked_at,'revision',revision,'viewCiphertext',view_token_ciphertext${accessFields})) AS items
    FROM (SELECT * FROM shares WHERE created_at<? OR (created_at=? AND token_hash>?) ORDER BY created_at DESC,token_hash ASC LIMIT 26)`)
    .bind(before,before,afterId).first<{items:string}>();
  const rows = JSON.parse(result?.items || '[]') as any[];
  const items = [];
  for (const row of rows.slice(0,25)) {
    let viewUrl: string|null = null;
    if (row.viewCiphertext) try {
      const token = await decryptSource(row.viewCiphertext,`view-token:${row.id}`,env);
      if (TOKEN.test(token) && await hashToken(token) === row.id) viewUrl = new URL(`/s/${token}`,request.url).href;
    } catch { /* Listing/revocation stay available if old token encryption is unreadable. */ }
    const {viewCiphertext:_cipher,...metadata} = row;
    items.push({...metadata,viewUrl,maxExpiresAt:row.createdAt+SHARE_LIFETIME_MS});
  }
  const last = items.at(-1);
  return json({items,nextCursor:rows.length>25&&last?`${last.createdAt}.${last.id}`:null});
}
async function updateWorkspaceSettings(request: Request, id: string, env: ShareEnvironment, now: number): Promise<Response> {
  const record = await adminRecord(id,env,now);
  const body = await readJson(request) as any;
  requestFields(body,['revision','label','expiresAt','editingEnabled']);
  const history = await historySchemaReady(env);
  if ((body.editingEnabled !== undefined) && !history) await requireHistorySchema(env);
  if (body.editingEnabled !== undefined && typeof body.editingEnabled !== 'boolean') throw new ShareError(400,'REQUEST_INVALID','Choose public viewing or public editing.');
  const expected = revision(body.revision);
  if (body.label === undefined && body.expiresAt === undefined && body.editingEnabled === undefined) throw new ShareError(400,'REQUEST_INVALID','Provide a label or expiry change.');
  const label = body.label === undefined ? record.label || '' : workspaceLabel(body.label);
  let expiry = record.expires_at;
  if (body.expiresAt !== undefined) {
    expiry = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
    if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > record.created_at+SHARE_LIFETIME_MS) throw new ShareError(400,'EXPIRY_INVALID','Expiry must be in the future and within 180 days of creation.');
  }
  let securityFields = ''; const securityValues: unknown[] = [];
  if(history && (body.editingEnabled !== undefined)) {
    const enabled = body.editingEnabled ?? record.editing_enabled === 1;
    if(enabled && !record.include_workspace) throw new ShareError(400,'REQUEST_INVALID','Model-only links cannot enable workspace editing.');
    securityFields=',editing_enabled=?,auth_epoch=auth_epoch+1'; securityValues.push(enabled?1:0);
  }
  const result = await env.SHARES_DB!.prepare(`UPDATE shares SET label=?,expires_at=?,updated_at=?,revision=revision+1${securityFields}
    WHERE token_hash=? AND revision=? AND expires_at>? AND revoked_at IS NULL`).bind(label,expiry,now,...securityValues,id,expected,now).run();
  if (!result.meta?.changes) throw new ShareError(409,'WORKSPACE_CONFLICT','The workspace changed or expired. Refresh before changing its settings.');
  return json({revision:expected+1,label,expiresAt:new Date(expiry).toISOString()});
}
async function limitedAttempts(request: Request, env: ShareEnvironment, now: number, purpose: string, limit: number, windowMs = 60_000): Promise<void> {
  const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').slice(0,64);
  const key = await hashToken(`${env.SHARES_CREATE_KEY}:${purpose}:${ip}`);
  const window = Math.floor(now/windowMs);
  const result = await env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`).bind(`access:${key}:${window}`,(window+2)*windowMs).first<{count:number}>();
  if(!result || result.count>limit)throw new ShareError(429,'RATE_LIMITED','Too many attempts. Try again later.');
}
function sharingUsername(value: unknown): string {
  if(typeof value!=='string'||!/^[a-z][a-z0-9._-]{2,63}$/.test(value))throw new ShareError(400,'USERNAME_INVALID','Use a username of 3–64 lowercase letters, digits, dots, hyphens or underscores, starting with a letter.');
  return value;
}
async function authenticateSharingUser(request: Request, name: unknown, password: unknown, env: ShareEnvironment, now: number): Promise<SharingIdentity> {
  await limitedAttempts(request,env,now,'sharing-login',5);
  // Use a fixed response for unknown, disabled and incorrect credentials.
  const username=typeof name==='string'&&/^[a-z][a-z0-9._-]{2,63}$/.test(name)?name:'';
  const user=username?await env.SHARES_DB!.prepare('SELECT id,username,password_salt,password_hash,active,updated_at FROM share_users WHERE username=?').bind(username).first<{id:string;username:string;password_salt:string;password_hash:string;active:number;updated_at:number}>():null;
  if(user) {
    const bucket=`sharer-login:${user.id}:${Math.floor(now/3_600_000)}`;
    const result=await env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at) VALUES(?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`).bind(bucket,now+7_200_000).first<{count:number}>();
    if(!result||result.count>60)throw new ShareError(429,'RATE_LIMITED','Too many sharing sign-in attempts. Try later.');
  }
  // Do the same KDF for unknown users, limiting username timing disclosure.
  const digest=await passwordDigest(validWorkspacePassword(password)?password:'invalid-password-placeholder',user?.password_salt||'invalid-user-salt',env.SHARES_ENCRYPTION_KEY!);
  if(!user||!user.active||!validWorkspacePassword(password)||!equalDigest(digest,user.password_hash))throw new ShareError(401,'SHARE_PASSWORD_INVALID','The sharing username or password was not accepted.');
  return {id:user.id,username:user.username,version:user.updated_at};
}
async function authorizeWorkspaceSharing(request:Request,env:ShareEnvironment,now:number,username?:unknown,password?:unknown):Promise<SharingIdentity> {
  const session=await readUserSession(request,env,now);
  if(session){requireUserPermission(session,'workspace:share');return session;}
  // Preserve the existing per-share credential API for already-open clients.
  if(username!==undefined||password!==undefined)return authenticateSharingUser(request,username,password,env,now);
  throw new SessionError(401,'LOGIN_REQUIRED','Log in to share a workspace.');
}
async function manageSharingUsers(request: Request, env: ShareEnvironment, now: number, id?: string): Promise<Response> {
  if(!id&&request.method==='GET') {
    const result=await env.SHARES_DB!.prepare(`SELECT json_group_array(json_object('id',id,'username',username,'active',active,'createdAt',created_at,'updatedAt',updated_at)) AS items
      FROM (SELECT id,username,active,created_at,updated_at FROM share_users ORDER BY username LIMIT 50)`).first<{items:string}>();
    return json({items:JSON.parse(result?.items||'[]')});
  }
  if((!id&&request.method==='POST')||(id&&request.method==='PATCH')) {
    const body=await readJson(request) as any;requestFields(body,id?['password','active','updatedAt']:['username','password']);
    if((!id||body.password!==undefined)&&!validWorkspacePassword(body.password))throw new ShareError(400,'PASSWORD_INVALID','Assign a sharing password of 12–128 characters.');
    if(body.password!==undefined&&equalDigest(await hashToken(body.password),await hashToken(env.SHARES_CREATE_KEY!)))throw new ShareError(400,'PASSWORD_INVALID','Assign a sharing password different from the administrator password.');
    if(body.active!==undefined&&typeof body.active!=='boolean')throw new ShareError(400,'REQUEST_INVALID','Choose active or disabled sharing access.');
    const salt=body.password!==undefined?randomToken():null;
    const digest=salt?await passwordDigest(body.password,salt,env.SHARES_ENCRYPTION_KEY!):null;
    if(!id){
      const username=sharingUsername(body.username),newId=randomToken();
      const result=await env.SHARES_DB!.prepare(`INSERT INTO share_users(id,username,password_salt,password_hash,created_at,updated_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM share_users)<50 AND NOT EXISTS(SELECT 1 FROM share_users WHERE username=?)`)
        .bind(newId,username,salt,digest,now,now,username).run();
      if(!result.meta?.changes)throw new ShareError(409,'USER_CONFLICT','That username exists or the 50-user limit is full.');
      return json({id:newId},201);
    }
    if(!Number.isSafeInteger(body.updatedAt)||body.updatedAt<0||(body.password===undefined&&body.active===undefined))throw new ShareError(400,'REQUEST_INVALID','Provide a password or permission change and the current update time.');
    const result=await env.SHARES_DB!.prepare(`UPDATE share_users SET password_salt=COALESCE(?,password_salt),password_hash=COALESCE(?,password_hash),active=COALESCE(?,active),updated_at=MAX(?,updated_at+1) WHERE id=? AND updated_at=?`)
      .bind(salt,digest,body.active===undefined?null:body.active?1:0,now,id,body.updatedAt).run();
    if(!result.meta?.changes)throw new ShareError(409,'USER_CONFLICT','Sharing access changed. Refresh the user list before saving.');
    return json({saved:true});
  }
  throw new ShareError(405,'METHOD_NOT_ALLOWED','This user management method is not supported.');
}
async function authorizePublicShare(request: Request, record: ShareRecord, env: ShareEnvironment, now: number, knownToken: string): Promise<Response> {
  const body=await readJson(request) as any;requestFields(body,['username','password']);
  await authorizeWorkspaceSharing(request,env,now,body.username,body.password);
  let token=knownToken;
  if(await hashToken(token)!==record.token_hash) {
    if(!record.view_token_ciphertext)throw new ShareError(404,'SHARE_UNAVAILABLE','This older public address could not be recovered.');
    token=await decryptSource(record.view_token_ciphertext,`view-token:${record.token_hash}`,env);
    if(!TOKEN.test(token)||await hashToken(token)!==record.token_hash)throw new ShareError(404,'SHARE_UNAVAILABLE','The public address is unavailable.');
  }
  return json({url:new URL(`/s/${token}`,request.url).href});
}
async function saveHistory(request: Request, record: ShareRecord, env: ShareEnvironment, now: number): Promise<Response> {
  if(!record.include_workspace || !record.editing_enabled)throw new ShareError(403,'VIEW_ONLY','Editing is disabled for this public workspace.');
  await limitedAttempts(request,env,now,`save:${record.token_hash}`,30);
  const body=await readJson(request) as any;requestFields(body,['workspace','modelIdentity','revision','author']);
  revision(body.revision); // The client's base may be old: each explicit save appends its own snapshot.
  const author=revisionAuthor(body.author);
  if(!author)throw new ShareError(400,'AUTHOR_INVALID','Enter a revision name of 1–80 characters.');
  if(body.modelIdentity!==record.model_identity)throw new ShareError(409,'MODEL_CHANGED','The model identity changed. Reload before saving.');
  let snapshot:string;
  try{snapshot=JSON.stringify(validateSharedWorkspace(body.workspace));}catch{throw new ShareError(400,'INVALID_WORKSPACE','The workspace contains unsupported model/planning state.');}
  const bytes=encoder.encode(snapshot).length,saveId=randomToken();
  const valid=`token_hash=? AND include_workspace=1 AND editing_enabled=1 AND auth_epoch=? AND model_identity=? AND expires_at>? AND revoked_at IS NULL`;
  const args=[record.token_hash,record.auth_epoch,record.model_identity,now];
  // D1 serializes this entire batch. Allocate from the current row inside the
  // transaction, never from the recipient's potentially stale revision number.
  // A monotonic server timestamp also orders saves that arrive in the same ms.
  const results=await env.SHARES_DB!.batch([
    env.SHARES_DB!.prepare(`INSERT INTO share_revisions(token_hash,version,workspace_json,byte_count,author,saved_at,save_id)
      SELECT token_hash,workspace_version,workspace_json,length(CAST(workspace_json AS BLOB)),'Previous saved state',COALESCE(updated_at,created_at),'baseline'
      FROM shares WHERE ${valid} AND NOT EXISTS(SELECT 1 FROM share_revisions WHERE token_hash=?)
      AND COALESCE((SELECT SUM(byte_count) FROM share_revisions),0)+length(CAST(workspace_json AS BLOB))+?<=?`)
      .bind(...args,record.token_hash,bytes,HISTORY_BYTE_LIMIT),
    env.SHARES_DB!.prepare(`INSERT INTO share_revisions(token_hash,version,workspace_json,byte_count,author,saved_at,save_id)
      SELECT token_hash,workspace_version+1,?,?,?,MAX(?,COALESCE(updated_at,created_at)+1),? FROM shares WHERE ${valid}
      AND EXISTS(SELECT 1 FROM share_revisions h WHERE h.token_hash=shares.token_hash AND h.version=shares.workspace_version)
      AND COALESCE((SELECT SUM(byte_count) FROM share_revisions),0)+?<=?`)
      .bind(snapshot,bytes,author,now,saveId,...args,bytes,HISTORY_BYTE_LIMIT),
    env.SHARES_DB!.prepare(`UPDATE shares SET workspace_json=?,workspace_version=workspace_version+1,revision=revision+1,
      updated_at=(SELECT saved_at FROM share_revisions WHERE token_hash=? AND save_id=?)
      WHERE ${valid} AND EXISTS(SELECT 1 FROM share_revisions WHERE token_hash=? AND save_id=?)
      RETURNING revision,workspace_version,updated_at,expires_at`)
      .bind(snapshot,record.token_hash,saveId,...args,record.token_hash,saveId),
    env.SHARES_DB!.prepare(`DELETE FROM share_revisions WHERE token_hash=? AND version<=(SELECT workspace_version FROM shares WHERE token_hash=?)-?
      AND EXISTS(SELECT 1 FROM share_revisions WHERE token_hash=? AND save_id=?)`).bind(record.token_hash,record.token_hash,HISTORY_VERSION_LIMIT,record.token_hash,saveId),
  ]);
  if(!results[2]?.meta?.changes) {
    const current=await adminRecord(record.token_hash,env,now);
    if(!current.editing_enabled || current.auth_epoch!==record.auth_epoch)throw new ShareError(403,'VIEW_ONLY','Workspace permissions changed. Reload before saving.');
    if(current.model_identity!==record.model_identity)throw new ShareError(409,'MODEL_CHANGED','The model identity changed. Reload before saving.');
    throw new ShareError(507,'HISTORY_FULL','Workspace history storage is full. Contact the administrator. Your changes are still on this device.');
  }
  // RETURNING captures this save's allocation before another batch can advance
  // the current row or prune it. A follow-up SELECT could report a different save.
  const saved=results[2].results?.[0] as {revision:number;workspace_version:number;updated_at:number;expires_at:number};
  return json({revision:saved.revision,workspaceVersion:saved.workspace_version,updatedAt:new Date(saved.updated_at).toISOString(),expiresAt:new Date(saved.expires_at).toISOString()});
}
async function revisionHistory(record: ShareRecord, env: ShareEnvironment, version?: number): Promise<Response> {
  if(!record.include_workspace)throw new ShareError(404,'HISTORY_UNAVAILABLE','Model-only links have no workspace history.');
  const currentVersion=record.workspace_version||1;
  if(version!==undefined) {
    const row=await env.SHARES_DB!.prepare('SELECT workspace_json,author,saved_at FROM share_revisions WHERE token_hash=? AND version=?').bind(record.token_hash,version).first<{workspace_json:string;author:string;saved_at:number}>();
    const snapshot=row?.workspace_json || (version===currentVersion?record.workspace_json:null);
    if(!snapshot)throw new ShareError(404,'REVISION_UNAVAILABLE','This version is unavailable or has been removed from history.');
    return json({version,workspace:validateSharedWorkspace(JSON.parse(snapshot)),modelIdentity:record.model_identity,revision:record.revision,currentVersion,author:row?.author||'Original workspace',savedAt:row?.saved_at||record.updated_at||record.created_at});
  }
  // Read the history and its current counters in one SQLite snapshot. A save
  // may have committed since loadRecord(), so its counters can already be old.
  const result=await env.SHARES_DB!.prepare(`SELECT workspace_version,revision,updated_at,created_at,
    (SELECT json_group_array(json_object('version',version,'author',author,'savedAt',saved_at))
      FROM (SELECT version,author,saved_at FROM share_revisions WHERE token_hash=s.token_hash ORDER BY version DESC LIMIT 20)) AS items
    FROM shares s WHERE token_hash=? AND revoked_at IS NULL`).bind(record.token_hash).first<{items:string;workspace_version:number;revision:number;updated_at:number;created_at:number}>();
  if(!result)throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
  const items=JSON.parse(result?.items||'[]');
  if(!items.length)items.push({version:result.workspace_version,author:'Original workspace',savedAt:result.updated_at||result.created_at});
  return json({items,currentVersion:result.workspace_version,revision:result.revision,maxVersions:HISTORY_VERSION_LIMIT});
}
function safeModelHeaders(upstream: Response, ext: string): Headers {
  const headers = new Headers(protectedHeaders);
  headers.set('Content-Type', ext === 'glb' ? 'model/gltf-binary' : ext === '3mf' ? 'model/3mf' : 'model/stl');
  headers.set('Content-Disposition', `inline; filename="model.${ext}"`);
  const length = upstream.headers.get('Content-Length');
  if (length && /^\d+$/.test(length) && Number(length) <= MAX_MODEL_BYTES && !upstream.headers.has('Content-Encoding')) headers.set('Content-Length',length);
  const range = upstream.headers.get('Content-Range');
  if (range && /^bytes \d+-\d+\/(?:\d+|\*)$/.test(range)) headers.set('Content-Range',range);
  const accepts = upstream.headers.get('Accept-Ranges');
  if (accepts === 'bytes' || accepts === 'none') headers.set('Accept-Ranges',accepts);
  return headers;
}
async function streamModel(request: Request, record: ShareRecord, env: ShareEnvironment, upstreamFetch: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const cancelled = () => controller.abort();
  const requestSignal = request.signal;
  requestSignal?.addEventListener('abort', cancelled, { once: true });
  if (requestSignal?.aborted) controller.abort();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let pendingBody: ReadableStream<Uint8Array> | null | undefined;
  const clear = () => { if (timeout) clearTimeout(timeout); requestSignal?.removeEventListener('abort',cancelled); };
  try {
    let decrypted: string;
    try { decrypted = await decryptSource(record.source_ciphertext,record.token_hash,env); }
    catch { throw new ShareError(502,'SOURCE_DECRYPTION_FAILED','This link cannot be read with the current sharing configuration. Ask its owner to create a new link.'); }
    let source = validateSource(decrypted,env,new URL(request.url).origin);
    const headers = new Headers({ 'Accept-Encoding': 'identity', 'Cache-Control': 'no-store' });
    const range = request.headers.get('Range');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = Number(match?.[1]);
      const end = match?.[2] ? Number(match[2]) : undefined;
      if (range.length > 80 || !match || !Number.isSafeInteger(start) || start >= MAX_MODEL_BYTES
        || (end !== undefined && (!Number.isSafeInteger(end) || end < start || end >= MAX_MODEL_BYTES))) {
        throw new ShareError(416, 'RANGE_INVALID', 'Only a single bounded or start-byte range within the model size limit is supported.');
      }
      headers.set('Range',range);
    }
    timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000);
    let upstream: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      // no-store already bypasses Cloudflare caching. A conflicting cf.cacheTtl
      // (including 0) throws in workerd before any request reaches Dropbox.
      upstream = await upstreamFetch(source.href, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers, redirect: 'manual', signal: controller.signal, cache: 'no-store',
      });
      pendingBody = upstream.body;
      if (![301,302,303,307,308].includes(upstream.status)) break;
      const target = upstream.headers.get('Location');
      await upstream.body?.cancel();
      if (!target || redirects === 3) throw new ShareError(502,'SOURCE_REDIRECT_UNSUPPORTED','Dropbox returned too many or incomplete download redirects.');
      let resolved: string;
      try { resolved = new URL(target,source.href).href; }
      catch { throw new ShareError(502,'SOURCE_REDIRECT_UNSUPPORTED','Dropbox returned an invalid download redirect.'); }
      source = downloadRedirect(resolved,new URL(request.url).origin);
    }
    if (upstream?.status === 401 || upstream?.status === 403) throw new ShareError(502,'SOURCE_ACCESS_DENIED','Dropbox refused the server download. Check the source sharing permissions.');
    if (upstream?.status === 404 || upstream?.status === 410) throw new ShareError(502,'SOURCE_NOT_FOUND','Dropbox could not find the source file. Ask its owner to check the original link.');
    if (upstream?.status === 429) throw new ShareError(502,'SOURCE_RATE_LIMITED','Dropbox temporarily limited downloads. Try again later.');
    if (!upstream || ![200,206].includes(upstream.status)) throw new ShareError(502,'SOURCE_UNAVAILABLE','The source model is unavailable. It may have expired at its original host.');
    if (/text\/html|application\/(?:json|xhtml\+xml)/i.test(upstream.headers.get('Content-Type') || '')) throw new ShareError(502,'SOURCE_FORMAT','The source did not return a supported model.');
    const declared = Number(upstream.headers.get('Content-Length'));
    const rangeTotal = /\/(\d+)$/.exec(upstream.headers.get('Content-Range') || '')?.[1];
    if (declared > MAX_MODEL_BYTES || Number(rangeTotal) > MAX_MODEL_BYTES) throw new ShareError(413,'MODEL_TOO_LARGE','The source model exceeds the protected-sharing size limit.');
    const responseHeaders = safeModelHeaders(upstream,record.model_extension);
    if (request.method === 'HEAD') { await upstream.body?.cancel(); clear(); return new Response(null,{ status: upstream.status,headers: responseHeaders }); }
    if (!upstream.body) throw new ShareError(502,'SOURCE_UNAVAILABLE','The source model did not contain file data.');
    reader = upstream.body.getReader();
    pendingBody = undefined;
    let received = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const item = await reader!.read();
          if (item.done) { clear(); output.close(); return; }
          received += item.value.byteLength;
          if (received > MAX_MODEL_BYTES) throw new Error('Model limit');
          output.enqueue(item.value);
        } catch {
          controller.abort(); await reader!.cancel().catch(() => {}); clear();
          output.error(new Error('The source model stream was interrupted.'));
        }
      },
      async cancel() { controller.abort(); await reader!.cancel().catch(() => {}); clear(); },
    });
    return new Response(stream,{ status: upstream.status, headers: responseHeaders });
  } catch (error) {
    controller.abort(); await reader?.cancel().catch(() => {}); await pendingBody?.cancel().catch(() => {}); clear();
    if (error instanceof ShareError) throw error;
    if (timedOut) throw new ShareError(504,'SOURCE_TIMEOUT','Dropbox took too long to respond. Try again later.');
    throw new ShareError(502,'SOURCE_FETCH_FAILED','The server could not download the model from Dropbox. Try again later.');
  }
}
export function createShareWorker(dependencies: Dependencies = {}) {
  const now = dependencies.now || Date.now;
  const upstreamFetch = dependencies.fetch || fetch;
  return {
    async fetch(request: Request, env: ShareEnvironment): Promise<Response> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/shares')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{ status: 404 });
      try {
        if (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) throw new ShareError(403,'ORIGIN_INVALID','Cross-origin share requests are not allowed.');
        if (url.search && url.pathname !== '/api/shares/admin') throw new ShareError(400,'REQUEST_INVALID','Share endpoints do not accept query parameters.');
        if (url.pathname === '/api/shares/config' && request.method === 'GET') {
          const enabled = await environmentReady(env);
          return json(enabled ? {enabled:true,editingEnabled:await editableSchemaReady(env),...(await historySchemaReady(env)?{historyEnabled:true}:{}),formats:['stl','3mf','glb']} : {enabled:false});
        }
        if(['/api/shares/login','/api/shares/logout','/api/shares/session'].includes(url.pathname)) {
          const sessionPath=url.pathname.endsWith('/session');
          if(request.method!==(sessionPath?'GET':'POST'))throw new ShareError(405,'METHOD_NOT_ALLOWED','This authentication method is not supported.');
          if(!await environmentReady(env)) {
            if(sessionPath)return json({authenticated:false,enabled:false});
            throw new ShareError(503,'SHARING_DISABLED','User login is not configured on this environment.');
          }
          await requireHistorySchema(env);
          if(url.pathname.endsWith('/logout')) {
            await revokeUserSession(request,env);
            const response=json({authenticated:false});response.headers.set('Set-Cookie',userSessionCookie('',0));return response;
          }
          if(sessionPath) {
            const user=await readUserSession(request,env,now());
            const response=json(user?{authenticated:true,user:publicUserSession(user),enabled:true}:{authenticated:false,enabled:true});
            return response;
          }
          const body=await readJson(request) as any;requestFields(body,['username','password']);
          const user=await authenticateSharingUser(request,body.username,body.password,env,now());
          const session=await createUserSession(user,request,env,now());
          const response=json({authenticated:true,user:publicUserSession(session.user),enabled:true});response.headers.set('Set-Cookie',session.cookie);return response;
        }
        if(url.pathname==='/api/shares/admin/users/disable-batch') {
          if(request.method!=='POST')throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
          await authenticate(request,env);
          if(!await environmentReady(env))throw new ShareError(503,'SHARING_DISABLED','Sharing is not configured.');
          await requireHistorySchema(env);
          const body=await readJson(request) as any;requestFields(body,['ids']);
          if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>50||body.ids.some((id:unknown)=>typeof id!=='string'||!TOKEN.test(id))||new Set(body.ids).size!==body.ids.length)throw new ShareError(400,'REQUEST_INVALID','Select 1–50 different sharing users.');
          await env.SHARES_DB!.batch(body.ids.map((id:string)=>env.SHARES_DB!.prepare('UPDATE share_users SET active=0,updated_at=MAX(?,updated_at+1) WHERE id=?').bind(now(),id)));
          return json({disabled:body.ids.length});
        }
        const userAdmin=/^\/api\/shares\/admin\/users(?:\/([a-f0-9]{64}))?$/.exec(url.pathname);
        if(userAdmin){
          await authenticate(request,env);
          if(!await environmentReady(env))throw new ShareError(503,'SHARING_DISABLED','Sharing is not configured.');
          await requireHistorySchema(env);
          return await manageSharingUsers(request,env,now(),userAdmin[1]);
        }
        if(url.pathname === '/api/shares/admin/revoke-batch') {
          if(request.method!=='POST') throw new ShareError(405,'METHOD_NOT_ALLOWED','This management method is not supported.');
          await authenticate(request,env);
          if(!await environmentReady(env))throw new ShareError(503,'SHARING_DISABLED','Sharing is not configured.');
          await requireHistorySchema(env);
          const body=await readJson(request) as any;requestFields(body,['ids']);
          if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>50||body.ids.some((id:unknown)=>typeof id!=='string'||!TOKEN.test(id))||new Set(body.ids).size!==body.ids.length)throw new ShareError(400,'REQUEST_INVALID','Select 1–50 different workspaces.');
          await env.SHARES_DB!.batch(body.ids.map((id:string)=>env.SHARES_DB!.prepare('UPDATE shares SET revoked_at=?,revision=revision+1,auth_epoch=auth_epoch+1 WHERE token_hash=? AND revoked_at IS NULL').bind(now(),id)));
          return json({revoked:body.ids.length});
        }
        const historyRoute=/^\/api\/shares\/([a-f0-9]{64})\/(share-link|revisions)(?:\/([1-9][0-9]{0,9}))?$/.exec(url.pathname);
        if(historyRoute) {
          if((historyRoute[2]==='share-link' && (request.method!=='POST'||historyRoute[3]))||(historyRoute[2]==='revisions'&&request.method!=='GET'))throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
          if(!await environmentReady(env))throw new ShareError(503,'SHARING_DISABLED','Sharing is not configured.');
          await requireHistorySchema(env);
          const record=await loadRecord(historyRoute[1],env,now());
          await rateLimit(request,env,now());
          if(historyRoute[2]==='share-link')return await authorizePublicShare(request,record,env,now(),historyRoute[1]);
          return await revisionHistory(record,env,historyRoute[3]?Number(historyRoute[3]):undefined);
        }
        const admin = /^\/api\/shares\/admin(?:\/([a-f0-9]{64})(?:\/(edit-link))?)?$/.exec(url.pathname);
        if (admin) {
          await authenticate(request,env);
          if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
          await requireEditableSchema(env);
          if (!admin[1] && request.method === 'GET') return await listWorkspaces(request,env);
          if (admin[1] && admin[2] === 'edit-link' && request.method === 'POST') return await issueEditLink(request,await adminRecord(admin[1],env,now()),env,now());
          if (admin[1] && !admin[2] && request.method === 'PATCH') return await updateWorkspaceSettings(request,admin[1],env,now());
          if (admin[1] && !admin[2] && request.method === 'DELETE') {
            await env.SHARES_DB!.prepare('UPDATE shares SET revoked_at=?,revision=revision+1 WHERE token_hash=? AND revoked_at IS NULL').bind(now(),admin[1]).run();
            return new Response(null,{status:204,headers:protectedHeaders});
          }
          throw new ShareError(405,'METHOD_NOT_ALLOWED','This management method is not supported.');
        }
        const editLink = /^\/api\/shares\/([a-f0-9]{64})\/edit-link$/.exec(url.pathname);
        if (editLink) {
          if (request.method !== 'POST') throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
          await authenticate(request,env);
          if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
          await requireEditableSchema(env);
          const record = await loadRecord(editLink[1],env,now());
          return await issueEditLink(request,record,env,now(),record.role==='view'?editLink[1]:undefined);
        }
        if (url.pathname === '/api/shares' && request.method === 'POST') {
          if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
          return await createShare(request,env,now());
        }
        const path = /^\/api\/shares\/([a-f0-9]{64})(?:\/model\.(stl|glb|3mf))?$/.exec(url.pathname);
        if (!path || !TOKEN.test(path[1])) throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
        if (!['GET','HEAD','DELETE','PUT'].includes(request.method)) throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
        if (['DELETE','PUT'].includes(request.method) && path[2]) throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
        if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
        const token = path[1];
        if (request.method === 'DELETE') {
          // This version has one environment-scoped staff credential, not user accounts.
          // Rotating that credential must not orphan existing shares.
          await authenticate(request,env);
          const hash = await hashToken(token);
          if (await editableSchemaReady(env)) await env.SHARES_DB!.prepare('UPDATE shares SET revoked_at=?,revision=revision+1 WHERE token_hash=? OR edit_token_hash=?').bind(now(),hash,hash).run();
          else await env.SHARES_DB!.prepare('UPDATE shares SET revoked_at=? WHERE token_hash=?').bind(now(),hash).run();
          return new Response(null,{ status:204,headers:protectedHeaders });
        }
        const record = await loadRecord(token,env,now());
        if (path[2] && path[2] !== record.model_extension) throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
        // Invalid, expired and revoked tokens must never allocate limiter rows.
        await rateLimit(request,env,now());
        if (request.method === 'PUT') return await saveWorkspace(request,record,env,now());
        if (path[2]) {
          return await streamModel(request,record,env,upstreamFetch);
        }
        if (request.method === 'HEAD') return new Response(null,{ headers:protectedHeaders });
        // Validate stored state again: a malformed or restored record must fail closed.
        const workspace = validateSharedWorkspace(JSON.parse(record.workspace_json));
        let viewUrl: string|undefined;
        if (record.role==='edit' && record.view_token_ciphertext) try {
          const viewToken=await decryptSource(record.view_token_ciphertext,`view-token:${record.token_hash}`,env);
          if(TOKEN.test(viewToken)&&await hashToken(viewToken)===record.token_hash)viewUrl=new URL(`/s/${viewToken}`,request.url).href;
        } catch { /* A missing old view address does not grant or remove edit access. */ }
        return json({ workspace,modelIdentity:record.model_identity,modelUrl:`/api/shares/${token}/model.${record.model_extension}`,expiresAt:new Date(record.expires_at).toISOString(),workspaceName:record.label||'',role:record.role,revision:record.revision??1,...(record.auth_epoch!==undefined?{historyEnabled:true,includeWorkspace:!!record.include_workspace,editingEnabled:!!record.editing_enabled,workspaceVersion:record.workspace_version??1}:{}),...(viewUrl?{viewUrl}:{}) });
      } catch (error) {
        if (error instanceof ShareError || error instanceof SessionError) return json({ error: { code:error.code,message:error.message } },error.status);
        // Never echo SQL, secrets, user annotations or upstream URL/error bodies.
        return json({ error: { code:'SHARING_UNAVAILABLE',message:'Protected sharing is temporarily unavailable.' } },503);
      }
    },
    async scheduled(_controller: unknown, env: ShareEnvironment): Promise<void> {
      await cleanupExpiredShares(env,now());
    },
  };
}
export default createShareWorker();
