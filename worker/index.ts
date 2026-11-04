import { validateSharedWorkspace } from '../src/lib/planningData';
import { cleanupExpiredShares, databaseScopeMatches } from './cleanup';

// Local interfaces keep the browser's dependency graph free of Workers SDKs.
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface ShareDatabase {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ meta?: { changes?: number } }[]>;
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
  return env.SHARES_ENABLED === 'true' && ['test','beta','main'].includes(env.SHARES_ENVIRONMENT || '') && !!env.SHARES_DB
    && typeof env.SHARES_CREATE_KEY === 'string' && env.SHARES_CREATE_KEY.length >= 32 && env.SHARES_CREATE_KEY.length <= 256
    && typeof env.SHARES_ENCRYPTION_KEY === 'string' && env.SHARES_ENCRYPTION_KEY.length >= 32 && env.SHARES_ENCRYPTION_KEY.length <= 256;
}
async function environmentReady(env: ShareEnvironment): Promise<boolean> {
  if (!ready(env)) return false;
  return databaseScopeMatches(env);
}
function hex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer as ArrayBuffer), value => value.toString(16).padStart(2, '0')).join('');
}
export async function hashToken(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function authenticate(request: Request, env: ShareEnvironment): Promise<string> {
  const provided = request.headers.get('Authorization') || '';
  if (!provided.startsWith('Bearer ') || provided.length > 1024) throw new ShareError(401, 'UNAUTHORIZED', 'Share creation requires the creator access key.');
  const actual = await hashToken(provided.slice(7));
  const expected = await hashToken(env.SHARES_CREATE_KEY!);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference) throw new ShareError(401, 'UNAUTHORIZED', 'The creator access key was not accepted.');
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
  try { name = decodeURIComponent(url.pathname.split('/').pop() || ''); } catch { throw new ShareError(400, 'FORMAT_UNSUPPORTED', 'Protected sharing currently supports self-contained STL models only.'); }
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  if (!['stl'].includes(ext || '')) throw new ShareError(400, 'FORMAT_UNSUPPORTED', 'Protected sharing currently supports self-contained STL models only.');
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
  await authenticate(request, env);
  const owner = `creator:${env.SHARES_ENVIRONMENT}`;
  const body = await readJson(request) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['workspace', 'sourceUrl', 'modelIdentity'].includes(key))) throw new ShareError(400, 'INVALID_WORKSPACE', 'The share request is invalid.');
  const source = validateSource(body.sourceUrl, env, new URL(request.url).origin, true);
  const ext = extension(source);
  if (typeof body.modelIdentity !== 'string' || !TOKEN.test(body.modelIdentity)) throw new ShareError(400, 'MODEL_IDENTITY_INVALID', 'A model SHA-256 fingerprint is required.');
  let workspace: unknown;
  try { workspace = validateSharedWorkspace(body.workspace); }
  catch { throw new ShareError(400, 'INVALID_WORKSPACE', 'The workspace contains unsupported, invalid or local-only data.'); }
  const snapshot = JSON.stringify(workspace);
  if (encoder.encode(snapshot).length > MAX_WORKSPACE_BYTES) throw new ShareError(413, 'WORKSPACE_TOO_LARGE', 'The workspace metadata is too large to share.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await hashToken(token);
  const ciphertext = await encryptSource(source.href, hash, env);
  const expires = now + SHARE_LIFETIME_MS;
  const daily = `create:${Math.floor(now / DAY)}`;
  const limit = integerSetting(env.SHARES_MAX_RECORDS, 500, 5000);
  const dailyLimit = integerSetting(env.SHARES_DAILY_CREATE_LIMIT, 50, 1000);
  // D1 batch is transactional: the daily counter and record limit cannot race.
  const results = await env.SHARES_DB!.batch([
    env.SHARES_DB!.prepare(`INSERT INTO shares(token_hash,source_ciphertext,model_extension,model_identity,workspace_json,owner_ref,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM shares) < ?
      AND COALESCE((SELECT count FROM share_rate_limits WHERE bucket=?),0) < ?`)
      .bind(hash,ciphertext,ext,body.modelIdentity,snapshot,owner,now,expires,limit,daily,dailyLimit),
    env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at)
      SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM shares WHERE token_hash=?)
      ON CONFLICT(bucket) DO UPDATE SET count=count+1`).bind(daily,now + 2 * DAY,hash),
  ]);
  if (!results[0]?.meta?.changes) throw new ShareError(429, 'SHARE_LIMIT', 'The share creation quota is full. Try later or contact the platform owner.');
  return json({ url: new URL(`/s/${token}`, request.url).href, token, expiresAt: new Date(expires).toISOString() }, 201);
}
async function loadRecord(token: string, env: ShareEnvironment, now: number): Promise<ShareRecord> {
  const result = await env.SHARES_DB!.prepare('SELECT * FROM shares WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(await hashToken(token),now).first<ShareRecord>();
  if (!result || !Number.isSafeInteger(result.created_at) || result.created_at < 0
    || !Number.isSafeInteger(result.expires_at) || result.expires_at !== result.created_at + SHARE_LIFETIME_MS
    || result.model_extension !== 'stl' || !TOKEN.test(result.model_identity)) {
    throw new ShareError(404, 'SHARE_UNAVAILABLE', 'This share is unavailable or has expired.');
  }
  return result;
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
      upstream = await upstreamFetch(source.href, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers, redirect: 'manual', signal: controller.signal, cache: 'no-store',
        ...({ cf: { cacheTtl: 0, cacheEverything: false } } as unknown as RequestInit),
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
        if (url.search) throw new ShareError(400,'REQUEST_INVALID','Share endpoints do not accept query parameters.');
        if (url.pathname === '/api/shares/config' && request.method === 'GET') return json({ enabled: await environmentReady(env) });
        if (url.pathname === '/api/shares' && request.method === 'POST') {
          if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
          return await createShare(request,env,now());
        }
        const path = /^\/api\/shares\/([a-f0-9]{64})(?:\/model\.(stl|glb|3mf))?$/.exec(url.pathname);
        if (!path || !TOKEN.test(path[1])) throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
        if (!['GET','HEAD','DELETE'].includes(request.method)) throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
        if (request.method === 'DELETE' && path[2]) throw new ShareError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
        if (!await environmentReady(env)) throw new ShareError(503,'SHARING_DISABLED','Protected sharing is not configured on this environment.');
        const token = path[1];
        if (request.method === 'DELETE') {
          // This version has one environment-scoped staff credential, not user accounts.
          // Rotating that credential must not orphan existing shares.
          await authenticate(request,env);
          await env.SHARES_DB!.prepare('UPDATE shares SET revoked_at=? WHERE token_hash=?').bind(now(),await hashToken(token)).run();
          return new Response(null,{ status:204,headers:protectedHeaders });
        }
        const record = await loadRecord(token,env,now());
        if (path[2] && path[2] !== record.model_extension) throw new ShareError(404,'SHARE_UNAVAILABLE','This share is unavailable or has expired.');
        // Invalid, expired and revoked tokens must never allocate limiter rows.
        await rateLimit(request,env,now());
        if (path[2]) {
          return await streamModel(request,record,env,upstreamFetch);
        }
        if (request.method === 'HEAD') return new Response(null,{ headers:protectedHeaders });
        // Validate stored state again: a malformed or restored record must fail closed.
        const workspace = validateSharedWorkspace(JSON.parse(record.workspace_json));
        return json({ workspace,modelIdentity:record.model_identity,modelUrl:`/api/shares/${token}/model.${record.model_extension}`,expiresAt:new Date(record.expires_at).toISOString() });
      } catch (error) {
        if (error instanceof ShareError) return json({ error: { code:error.code,message:error.message } },error.status);
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
