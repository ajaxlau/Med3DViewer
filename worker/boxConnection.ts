import type { ShareEnvironment } from './index';
import { randomToken } from './workspaceAccess';
import { databaseScopeMatches } from './cleanup';

export interface BoxEnvironment {
  BOX_ENABLED?: string;
  BOX_ORIGIN?: string;
  BOX_UPLOAD_FOLDER_ID?: string;
  BOX_CLIENT_ID?: string;
  BOX_CLIENT_SECRET?: string;
  BOX_CREDENTIALS_KEY?: string;
}
type Env = ShareEnvironment & BoxEnvironment;
type ProviderFetch = typeof fetch;
interface Connection {
  epoch: number; status: string; account_id: string | null; account_name: string | null;
  folder_id: string | null; folder_name: string | null; credentials: string | null;
  access_expires_at: number | null; refresh_due_at: number | null; lock_id: string | null; lock_at: number | null;
}
interface Credentials { access_token: string; refresh_token: string; expires_in: number }
const COOKIE = '__Host-med3d_box_oauth';
const CALLBACK = '/api/shares/box/callback';
const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^[1-9][0-9]{0,29}$/;
const STATE_MS = 10 * 60_000;
const enc = new TextEncoder();
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
export class BoxError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json' } }); }
function hex(bytes: ArrayBuffer | Uint8Array) { return Array.from(new Uint8Array(bytes as ArrayBuffer), b => b.toString(16).padStart(2, '0')).join(''); }
async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
function cookie(value: string, age = 600) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function cookieValue(request: Request) {
  const parts = (request.headers.get('Cookie') || '').split(';').map(p => p.trim()).filter(p => p.startsWith(`${COOKIE}=`));
  const value = parts.length === 1 ? parts[0].slice(COOKIE.length + 1) : '';
  return TOKEN.test(value) ? value : '';
}
function configuration(env: Env): boolean {
  // This milestone is intentionally limited to the isolated test environment.
  return env.BOX_ENABLED === 'true' && env.SHARES_ENVIRONMENT === 'box-test'
    && env.BOX_ORIGIN === 'https://ntec3dpo-m3dv-box-test.x-panda.workers.dev'
    && ID.test(env.BOX_UPLOAD_FOLDER_ID || '')
    && /^[A-Za-z0-9_-]{8,128}$/.test(env.BOX_CLIENT_ID || '')
    && typeof env.BOX_CLIENT_SECRET === 'string' && env.BOX_CLIENT_SECRET.length >= 8 && env.BOX_CLIENT_SECRET.length <= 512
    && typeof env.BOX_CREDENTIALS_KEY === 'string' && env.BOX_CREDENTIALS_KEY.length >= 32 && env.BOX_CREDENTIALS_KEY.length <= 256
    && env.BOX_CREDENTIALS_KEY !== env.SHARES_ENCRYPTION_KEY && env.BOX_CREDENTIALS_KEY !== env.SHARES_CREATE_KEY;
}
async function supported(env: Env) {
  if (!configuration(env) || !await databaseScopeMatches(env)) return false;
  try { return ((await env.SHARES_DB!.prepare('SELECT version FROM share_schema_version WHERE id=1').first<{ version: number }>())?.version || 0) >= 5; }
  catch { return false; }
}
async function connection(env: Env) { return env.SHARES_DB!.prepare('SELECT * FROM box_connection WHERE id=1').first<Connection>(); }
async function key(env: Env) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(`Med3D Box credentials v1\0${env.BOX_CREDENTIALS_KEY}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function context(env: Env, row: Connection) { return enc.encode(`${env.SHARES_ENVIRONMENT}\0${env.BOX_ORIGIN}\0${env.BOX_CLIENT_ID}\0${row.epoch}\0${row.account_id}\0${row.folder_id}`); }
async function seal(value: Credentials, env: Env, row: Connection) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `${hex(iv)}.${hex(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(env, row) }, await key(env), enc.encode(JSON.stringify(value))))}`;
}
async function unseal(env: Env, row: Connection): Promise<Credentials> {
  const [iv, bytes] = (row.credentials || '').split('.');
  if (!/^[a-f0-9]{24}$/.test(iv || '') || !/^[a-f0-9]{32,65536}$/.test(bytes || '') || bytes.length % 2) throw new Error('Invalid encrypted credentials');
  const unpack = (s: string) => new Uint8Array(s.match(/../g)!.map(b => parseInt(b, 16)));
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unpack(iv), additionalData: context(env, row) }, await key(env), unpack(bytes))));
}
async function provider(url: string, init: RequestInit, upstream: ProviderFetch): Promise<any> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await upstream(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel(); throw new BoxError(502, 'BOX_REQUEST_FAILED', 'Box did not accept the request. Check app permissions or reconnect.'); }
    reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 64 * 1024) throw new Error('Large response'); chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (error instanceof BoxError) throw error;
    throw new BoxError(502, 'BOX_REQUEST_FAILED', 'Box could not complete the request. Try reconnecting.');
  } finally { clearTimeout(timer); }
}
async function tokens(env: Env, grant: Record<string, string>, upstream: ProviderFetch): Promise<Credentials> {
  const result = await provider('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...grant, client_id: env.BOX_CLIENT_ID!, client_secret: env.BOX_CLIENT_SECRET! }).toString() }, upstream);
  const valid = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9._~+/=-]{1,8192}$/.test(s);
  if (!valid(result.access_token) || !valid(result.refresh_token) || !Number.isSafeInteger(result.expires_in) || result.expires_in < 120 || result.expires_in > 86400) throw new BoxError(502, 'BOX_TOKEN_INVALID', 'Box returned an invalid authorization response.');
  return { access_token: result.access_token, refresh_token: result.refresh_token, expires_in: result.expires_in };
}
async function checkFolder(env: Env, access: string, expectedAccount: string | null, upstream: ProviderFetch) {
  const init = { headers: { Authorization: `Bearer ${access}` } };
  const user = await provider('https://api.box.com/2.0/users/me?fields=id,name', init, upstream);
  if (!ID.test(user.id || '') || typeof user.name !== 'string' || user.name.length > 256 || (expectedAccount && user.id !== expectedAccount)) throw new BoxError(409, 'BOX_ACCOUNT_MISMATCH', 'Reconnect the original Box account.');
  const folder = await provider(`https://api.box.com/2.0/folders/${env.BOX_UPLOAD_FOLDER_ID}?fields=id,name,permissions`, init, upstream);
  if (folder.id !== env.BOX_UPLOAD_FOLDER_ID || typeof folder.name !== 'string' || folder.name.length > 256 || folder.permissions?.can_upload !== true || folder.permissions?.can_download !== true) throw new BoxError(403, 'BOX_FOLDER_PERMISSION', 'The selected Box folder must allow uploads and downloads.');
  return { account_id: user.id as string, account_name: user.name as string, folder_id: folder.id as string, folder_name: folder.name as string };
}
async function failConnection(env: Env, epoch: number) {
  await env.SHARES_DB!.prepare("UPDATE box_connection SET status='reconnect',credentials=NULL,lock_id=NULL,lock_at=NULL WHERE id=1 AND epoch=?").bind(epoch).run();
}
// Exported only to server modules; never returned by an HTTP endpoint.
export async function boxAccessToken(env: Env, upstream: ProviderFetch = fetch, now = Date.now()): Promise<string> {
  if (!await supported(env)) throw new BoxError(503, 'BOX_SETUP_REQUIRED', 'Complete the Box test setup first.');
  let row = await connection(env);
  if (!row) throw new BoxError(503, 'BOX_SETUP_REQUIRED', 'Apply the Box connection migration.');
  if (row.status === 'refreshing') {
    // A lost refresh response may have consumed the single-use refresh token.
    // Never take over the lock and retry that token after a crash.
    if ((row.lock_at || 0) < now - 60_000) await failConnection(env, row.epoch);
    throw new BoxError(409, 'BOX_REFRESH_BUSY', 'Box authorization is refreshing. Retry shortly; reconnect if it remains unavailable.');
  }
  if (row.status !== 'connected' || !row.credentials) throw new BoxError(409, 'BOX_RECONNECT_REQUIRED', 'Connect the Box account.');
  if (row.folder_id !== env.BOX_UPLOAD_FOLDER_ID) throw new BoxError(409, 'BOX_RECONNECT_REQUIRED', 'Reconnect to validate the configured Box folder.');
  let current: Credentials;
  try { current = await unseal(env, row); } catch { await failConnection(env, row.epoch); throw new BoxError(409, 'BOX_RECONNECT_REQUIRED', 'Reconnect after the Box credential configuration changed.'); }
  if ((row.access_expires_at || 0) > now + 60_000 && (row.refresh_due_at || 0) > now) return current.access_token;
  const lock = randomToken();
  const claimed = await env.SHARES_DB!.prepare("UPDATE box_connection SET status='refreshing',lock_id=?,lock_at=? WHERE id=1 AND epoch=? AND status='connected' RETURNING epoch").bind(lock, now, row.epoch).first();
  if (!claimed) throw new BoxError(409, 'BOX_REFRESH_BUSY', 'Box authorization is refreshing. Try again shortly.');
  try {
    const fresh = await tokens(env, { grant_type: 'refresh_token', refresh_token: current.refresh_token }, upstream);
    const result = await env.SHARES_DB!.prepare("UPDATE box_connection SET credentials=?,access_expires_at=?,refresh_due_at=?,status='connected',lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1 AND epoch=? AND lock_id=? AND status='refreshing'")
      .bind(await seal(fresh, env, row), now + fresh.expires_in * 1000, now + 10 * 86400_000, now, row.epoch, lock).run();
    if (!result.meta?.changes) throw new BoxError(409, 'BOX_CONNECTION_CHANGED', 'The Box connection changed. Refresh its status.');
    return fresh.access_token;
  } catch (error) { await failConnection(env, row.epoch); throw error; }
}
export async function maintainBoxConnection(env: Env, upstream: ProviderFetch = fetch, now = Date.now()) {
  if (!await supported(env)) return;
  await env.SHARES_DB!.prepare('DELETE FROM box_oauth_states WHERE expires_at<=?').bind(now).run();
  const row = await connection(env);
  // Refresh periodically even with no traffic, before Box's inactivity expiry.
  if (row && (row.status === 'refreshing' || (row.status === 'connected' && (row.refresh_due_at || 0) <= now))) {
    try { await boxAccessToken(env, upstream, now); } catch { /* No tokens or provider errors in logs. Admin status reports reconnect. */ }
  }
}

export async function handleBoxConnection(request: Request, env: Env, upstream: ProviderFetch = fetch, now = Date.now()): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    const ready = await supported(env);
    if (path === '/api/shares/admin/box' && request.method === 'GET') {
      const row = ready ? await connection(env) : null;
      return json({ available: env.SHARES_ENVIRONMENT === 'box-test', enabled: ready, status: row?.status || 'not-configured', accountName: row?.account_name || null, folderId: row?.folder_id || env.BOX_UPLOAD_FOLDER_ID || null, folderName: row?.folder_name || null });
    }
    if (!ready) throw new BoxError(503, 'BOX_SETUP_REQUIRED', 'Apply migration 0005 and configure the Box runtime secrets.');
    if (new URL(request.url).origin !== env.BOX_ORIGIN) throw new BoxError(403, 'BOX_ORIGIN_INVALID', 'Use the configured Box test address.');
    if (path === '/api/shares/admin/box/connect' && request.method === 'POST') {
      const row = await env.SHARES_DB!.prepare("UPDATE box_connection SET epoch=epoch+1,status='connecting',folder_id=?,folder_name=NULL,credentials=NULL,lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1 RETURNING *").bind(env.BOX_UPLOAD_FOLDER_ID, now).first<Connection>();
      if (!row) throw new BoxError(503, 'BOX_SETUP_REQUIRED', 'Apply the Box connection migration.');
      const state = randomToken(), browser = randomToken();
      await env.SHARES_DB!.prepare('DELETE FROM box_oauth_states WHERE expires_at<=? OR epoch<?').bind(now, row.epoch).run();
      const inserted = await env.SHARES_DB!.prepare("INSERT INTO box_oauth_states(state_hash,browser_hash,epoch,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM box_connection WHERE id=1 AND epoch=? AND status='connecting')").bind(await digest(state), await digest(browser), row.epoch, now + STATE_MS, row.epoch).run();
      if (!inserted.meta?.changes) throw new BoxError(409, 'BOX_CONNECTION_CHANGED', 'Another administrator changed the connection.');
      const target = new URL('https://account.box.com/api/oauth2/authorize');
      target.search = new URLSearchParams({ response_type: 'code', client_id: env.BOX_CLIENT_ID!, redirect_uri: env.BOX_ORIGIN + CALLBACK, state }).toString();
      const response = json({ authorizationUrl: target.toString() }); response.headers.set('Set-Cookie', cookie(browser)); return response;
    }
    if (path === CALLBACK && request.method === 'GET') {
      const url = new URL(request.url), state = url.searchParams.get('state') || '', browser = cookieValue(request);
      if (!TOKEN.test(state) || !browser || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length > 1) throw new BoxError(400, 'BOX_STATE_INVALID', 'Restart the Box connection from the administrator page.');
      const pending = await env.SHARES_DB!.prepare("DELETE FROM box_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? AND epoch=(SELECT epoch FROM box_connection WHERE id=1 AND status='connecting') RETURNING epoch").bind(await digest(state), await digest(browser), now).first<{epoch:number}>();
      if (!pending) throw new BoxError(400, 'BOX_STATE_INVALID', 'This Box authorization expired or was already used.');
      let success = false;
      try {
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || code.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(code)) throw new BoxError(400, 'BOX_DENIED', 'Box authorization was not completed.');
        const fresh = await tokens(env, { grant_type: 'authorization_code', code, redirect_uri: env.BOX_ORIGIN + CALLBACK }, upstream);
        const row = await connection(env);
        if (!row || row.epoch !== pending.epoch || row.status !== 'connecting') throw new Error('Stale connection');
        const identity = await checkFolder(env, fresh.access_token, row.account_id, upstream);
        const result = await env.SHARES_DB!.prepare("UPDATE box_connection SET status='connected',account_id=?,account_name=?,folder_id=?,folder_name=?,credentials=?,access_expires_at=?,refresh_due_at=?,updated_at=? WHERE id=1 AND epoch=? AND status='connecting'")
          .bind(identity.account_id, identity.account_name, identity.folder_id, identity.folder_name, await seal(fresh, env, { ...row, ...identity }), now + fresh.expires_in * 1000, now + 10 * 86400_000, now, row.epoch).run();
        success = !!result.meta?.changes;
      } catch { /* Callback redirect never contains provider codes, tokens or errors. */ }
      if (!success) await failConnection(env, pending.epoch);
      return new Response(null, { status: 303, headers: { ...headers, Location: `/admin/shares?box=${success ? 'connected' : 'failed'}`, 'Set-Cookie': cookie('', 0) } });
    }
    if (path === '/api/shares/admin/box/check' && request.method === 'POST') {
      const access = await boxAccessToken(env, upstream, now), row = await connection(env);
      await checkFolder(env, access, row!.account_id, upstream);
      return json({ ok: true });
    }
    if (path === '/api/shares/admin/box/disconnect' && request.method === 'POST') {
      // Local reset invalidates pending callbacks/refreshes and deletes tokens.
      // The Box account pin remains, so reconnect cannot silently swap accounts.
      await env.SHARES_DB!.batch([
        env.SHARES_DB!.prepare("UPDATE box_connection SET epoch=epoch+1,status='disconnected',credentials=NULL,access_expires_at=NULL,refresh_due_at=NULL,lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1").bind(now),
        env.SHARES_DB!.prepare('DELETE FROM box_oauth_states'),
      ]);
      return json({ disconnected: true });
    }
    throw new BoxError(405, 'METHOD_NOT_ALLOWED', 'This Box connection action is not supported.');
  } catch (error) {
    return error instanceof BoxError ? json({ error: { code: error.code, message: error.message } }, error.status) : json({ error: { code: 'BOX_UNAVAILABLE', message: 'Box connection is unavailable. Refresh the status or reconnect.' } }, 503);
  }
}
