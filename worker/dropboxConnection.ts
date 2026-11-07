import type { ShareEnvironment } from './index';
import { randomToken } from './workspaceAccess';
import { databaseScopeMatches } from './cleanup';

export interface DropboxEnvironment {
  DROPBOX_ENABLED?: string;
  DROPBOX_ORIGIN?: string;
  DROPBOX_FOLDER_PATH?: string;
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  DROPBOX_CREDENTIALS_KEY?: string;
}
type Env = ShareEnvironment & DropboxEnvironment;
type ProviderFetch = typeof fetch;
interface Connection {
  epoch: number; status: string; account_id: string | null; account_name: string | null;
  folder_id: string | null; folder_name: string | null; credentials: string | null;
  access_expires_at: number | null; refresh_due_at: number | null; lock_id: string | null; lock_at: number | null;
}
interface Credentials { access_token: string; refresh_token: string; expires_in: number }
const COOKIE = '__Host-med3d_dropbox_oauth';
const CALLBACK = '/api/shares/dropbox/callback';
const TOKEN = /^[a-f0-9]{64}$/;
const ID = /^dbid:[A-Za-z0-9_-]{1,128}$/;
const SCOPES = ['account_info.read', 'files.metadata.read', 'files.content.read', 'files.content.write'];
const STATE_MS = 10 * 60_000;
const enc = new TextEncoder();
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
export class DropboxError extends Error {
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
  return env.DROPBOX_ENABLED === 'true' && env.BOX_ENABLED !== 'true' && env.SHARES_ENVIRONMENT === 'box-test'
    && env.DROPBOX_ORIGIN === 'https://ntec3dpo-m3dv-box-test.x-panda.workers.dev'
    && env.DROPBOX_FOLDER_PATH === ''
    && /^[A-Za-z0-9_-]{8,128}$/.test(env.DROPBOX_APP_KEY || '')
    && typeof env.DROPBOX_APP_SECRET === 'string' && env.DROPBOX_APP_SECRET.length >= 8 && env.DROPBOX_APP_SECRET.length <= 512
    && typeof env.DROPBOX_CREDENTIALS_KEY === 'string' && env.DROPBOX_CREDENTIALS_KEY.length >= 32 && env.DROPBOX_CREDENTIALS_KEY.length <= 256
    && env.DROPBOX_CREDENTIALS_KEY !== env.SHARES_ENCRYPTION_KEY && env.DROPBOX_CREDENTIALS_KEY !== env.SHARES_CREATE_KEY;
}
async function supported(env: Env) {
  if (!configuration(env) || !await databaseScopeMatches(env)) return false;
  try { return ((await env.SHARES_DB!.prepare('SELECT version FROM share_schema_version WHERE id=1').first<{ version: number }>())?.version || 0) >= 6; }
  catch { return false; }
}
async function connection(env: Env) { return env.SHARES_DB!.prepare('SELECT * FROM dropbox_connection WHERE id=1').first<Connection>(); }
async function key(env: Env) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(`Med3D Dropbox credentials v1\0${env.DROPBOX_CREDENTIALS_KEY}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function context(env: Env, row: Connection) { return enc.encode(`${env.SHARES_ENVIRONMENT}\0${env.DROPBOX_ORIGIN}\0${env.DROPBOX_APP_KEY}\0${row.epoch}\0${row.account_id}\0${row.folder_id}`); }
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
async function provider(url: string, init: RequestInit, upstream: ProviderFetch, raw = false): Promise<any> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await upstream(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel(); throw new DropboxError(502, 'DROPBOX_REQUEST_FAILED', 'Dropbox did not accept the request. Check app permissions or reconnect.'); }
    reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 64 * 1024) throw new Error('Large response'); chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return raw ? bytes : JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (error instanceof DropboxError) throw error;
    throw new DropboxError(502, 'DROPBOX_REQUEST_FAILED', 'Dropbox could not complete the request. Try reconnecting.');
  } finally { clearTimeout(timer); }
}
async function tokens(env: Env, grant: Record<string, string>, upstream: ProviderFetch): Promise<Credentials> {
  const result = await provider('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...grant, client_id: env.DROPBOX_APP_KEY!, client_secret: env.DROPBOX_APP_SECRET! }).toString() }, upstream);
  const valid = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9._~+/=-]{1,8192}$/.test(s);
  if (grant.grant_type === 'authorization_code' && (typeof result.scope !== 'string' || !SCOPES.every(s => result.scope.split(' ').includes(s)))) throw new DropboxError(403, 'DROPBOX_SCOPE_REQUIRED', 'Enable the four required Dropbox permissions and reconnect.');
  if (grant.grant_type === 'refresh_token' && !result.refresh_token) result.refresh_token = grant.refresh_token;
  if (!valid(result.access_token) || !valid(result.refresh_token) || !Number.isSafeInteger(result.expires_in) || result.expires_in < 120 || result.expires_in > 86400) throw new DropboxError(502, 'DROPBOX_TOKEN_INVALID', 'Dropbox returned an invalid authorization response.');
  return { access_token: result.access_token, refresh_token: result.refresh_token, expires_in: result.expires_in };
}
async function checkFolder(env: Env, access: string, expectedAccount: string | null, upstream: ProviderFetch) {
  const auth = { Authorization: `Bearer ${access}` };
  const user = await provider('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: auth }, upstream);
  if (!ID.test(user.account_id || '') || typeof user.name?.display_name !== 'string' || user.name.display_name.length > 256 || user.disabled === true || (expectedAccount && user.account_id !== expectedAccount)) throw new DropboxError(409, 'DROPBOX_ACCOUNT_MISMATCH', 'Reconnect the original Dropbox account.');
  // Never send directory entries or cursors to the browser. This confirms metadata
  // access only; the explicit transfer test proves read/write access separately.
  const folder = await provider('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '', limit: 1, recursive: false }) }, upstream);
  if (!Array.isArray(folder.entries)) throw new DropboxError(502, 'DROPBOX_FOLDER_PERMISSION', 'The Dropbox app folder is unavailable.');
  return { account_id: user.account_id as string, account_name: user.name.display_name as string, folder_id: '', folder_name: 'App folder' };
}
// This explicit administrator diagnostic creates and removes only a tiny,
// randomly named text file. It never accepts a path, filename or model from a client.
async function transferTest(env: Env, upstream: ProviderFetch, now: number) {
  const access = await dropboxAccessToken(env, upstream, now), start = await connection(env);
  const auth = { Authorization: `Bearer ${access}` }, path = `/med3dviewer-connection-test-${randomToken()}.txt`;
  const contents = enc.encode('Med3DViewer Dropbox connection test. No model or patient data.');
  let created = false, failure: unknown, cleanup = true;
  try {
    const meta = await provider('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: false, mute: true, strict_conflict: true }) }, body: contents,
    }, upstream);
    created = true;
    if (meta.path_lower !== path || meta.size !== contents.length) throw new DropboxError(502, 'DROPBOX_TEST_FAILED', 'Dropbox upload verification failed.');
    const bytes: Uint8Array = await provider('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { ...auth, 'Dropbox-API-Arg': JSON.stringify({ path }) } }, upstream, true);
    if (bytes.length !== contents.length || bytes.some((b, i) => b !== contents[i])) throw new DropboxError(502, 'DROPBOX_TEST_FAILED', 'Dropbox download verification failed.');
  } catch (error) { failure = error; }
  // Attempt cleanup even after an ambiguous upload response. Only this request's
  // unguessable, application-generated diagnostic path may be removed.
  try { await provider('https://api.dropboxapi.com/2/files/delete_v2', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }, upstream); }
  catch { cleanup = false; }
  const current = await connection(env);
  if (!current || current.epoch !== start?.epoch || current.status !== 'connected') throw new DropboxError(409, 'DROPBOX_CONNECTION_CHANGED', 'The Dropbox connection changed during the test.');
  if (failure) throw new DropboxError(502, 'DROPBOX_TEST_FAILED', `Dropbox transfer test failed.${cleanup ? '' : ' A small connection-test text file may remain in the app folder.'}`);
  if (!created || !cleanup) throw new DropboxError(502, 'DROPBOX_TEST_CLEANUP', 'Transfer passed, but the small connection-test text file could not be removed. Remove only that test text file manually.');
  return json({ ok: true });
}
async function failConnection(env: Env, epoch: number) {
  await env.SHARES_DB!.prepare("UPDATE dropbox_connection SET status='reconnect',credentials=NULL,lock_id=NULL,lock_at=NULL WHERE id=1 AND epoch=?").bind(epoch).run();
}
// Exported only to server modules; never returned by an HTTP endpoint.
export async function dropboxAccessToken(env: Env, upstream: ProviderFetch = fetch, now = Date.now()): Promise<string> {
  if (!await supported(env)) throw new DropboxError(503, 'DROPBOX_SETUP_REQUIRED', 'Complete the Dropbox test setup first.');
  let row = await connection(env);
  if (!row) throw new DropboxError(503, 'DROPBOX_SETUP_REQUIRED', 'Apply the Dropbox connection migration.');
  if (row.status === 'refreshing') {
    // Dropbox refresh tokens may be reused; nevertheless a lost operation must
    // not overwrite a newer connection. Fail closed after a crashed lock.
    if ((row.lock_at || 0) < now - 60_000) await failConnection(env, row.epoch);
    throw new DropboxError(409, 'DROPBOX_REFRESH_BUSY', 'Dropbox authorization is refreshing. Retry shortly; reconnect if it remains unavailable.');
  }
  if (row.status !== 'connected' || !row.credentials) throw new DropboxError(409, 'DROPBOX_RECONNECT_REQUIRED', 'Connect the Dropbox account.');
  if (row.folder_id !== env.DROPBOX_FOLDER_PATH) throw new DropboxError(409, 'DROPBOX_RECONNECT_REQUIRED', 'Reconnect to validate the configured Dropbox folder.');
  let current: Credentials;
  try { current = await unseal(env, row); } catch { await failConnection(env, row.epoch); throw new DropboxError(409, 'DROPBOX_RECONNECT_REQUIRED', 'Reconnect after the Dropbox credential configuration changed.'); }
  if ((row.access_expires_at || 0) > now + 60_000 && (row.refresh_due_at || 0) > now) return current.access_token;
  const lock = randomToken();
  const claimed = await env.SHARES_DB!.prepare("UPDATE dropbox_connection SET status='refreshing',lock_id=?,lock_at=? WHERE id=1 AND epoch=? AND status='connected' RETURNING epoch").bind(lock, now, row.epoch).first();
  if (!claimed) throw new DropboxError(409, 'DROPBOX_REFRESH_BUSY', 'Dropbox authorization is refreshing. Try again shortly.');
  try {
    const fresh = await tokens(env, { grant_type: 'refresh_token', refresh_token: current.refresh_token }, upstream);
    const result = await env.SHARES_DB!.prepare("UPDATE dropbox_connection SET credentials=?,access_expires_at=?,refresh_due_at=?,status='connected',lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1 AND epoch=? AND lock_id=? AND status='refreshing'")
      .bind(await seal(fresh, env, row), now + fresh.expires_in * 1000, now + 10 * 86400_000, now, row.epoch, lock).run();
    if (!result.meta?.changes) throw new DropboxError(409, 'DROPBOX_CONNECTION_CHANGED', 'The Dropbox connection changed. Refresh its status.');
    return fresh.access_token;
  } catch (error) { await failConnection(env, row.epoch); throw error; }
}
export async function maintainDropboxConnection(env: Env, upstream: ProviderFetch = fetch, now = Date.now()) {
  if (!await supported(env)) return;
  await env.SHARES_DB!.prepare('DELETE FROM dropbox_oauth_states WHERE expires_at<=?').bind(now).run();
  const row = await connection(env);
  // Periodic upkeep checks that offline authorization remains usable.
  if (row && (row.status === 'refreshing' || (row.status === 'connected' && (row.refresh_due_at || 0) <= now))) {
    try { await dropboxAccessToken(env, upstream, now); } catch { /* No tokens or provider errors in logs. Admin status reports reconnect. */ }
  }
}

export async function handleDropboxConnection(request: Request, env: Env, upstream: ProviderFetch = fetch, now = Date.now()): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    const ready = await supported(env);
    if (path === '/api/shares/admin/dropbox' && request.method === 'GET') {
      const row = ready ? await connection(env) : null;
      return json({ available: env.SHARES_ENVIRONMENT === 'box-test', enabled: ready, status: row?.status || 'not-configured', accountName: row?.account_name || null, folderId: row?.folder_id || env.DROPBOX_FOLDER_PATH || null, folderName: row?.folder_name || null });
    }
    if (!ready) throw new DropboxError(503, 'DROPBOX_SETUP_REQUIRED', 'Apply migration 0006 and configure the Dropbox runtime secrets.');
    if (new URL(request.url).origin !== env.DROPBOX_ORIGIN) throw new DropboxError(403, 'DROPBOX_ORIGIN_INVALID', 'Use the configured Dropbox test address.');
    if (path === '/api/shares/admin/dropbox/connect' && request.method === 'POST') {
      const row = await env.SHARES_DB!.prepare("UPDATE dropbox_connection SET epoch=epoch+1,status='connecting',folder_id=?,folder_name=NULL,credentials=NULL,lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1 RETURNING *").bind(env.DROPBOX_FOLDER_PATH, now).first<Connection>();
      if (!row) throw new DropboxError(503, 'DROPBOX_SETUP_REQUIRED', 'Apply the Dropbox connection migration.');
      const state = randomToken(), browser = randomToken();
      await env.SHARES_DB!.prepare('DELETE FROM dropbox_oauth_states WHERE expires_at<=? OR epoch<?').bind(now, row.epoch).run();
      const inserted = await env.SHARES_DB!.prepare("INSERT INTO dropbox_oauth_states(state_hash,browser_hash,epoch,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM dropbox_connection WHERE id=1 AND epoch=? AND status='connecting')").bind(await digest(state), await digest(browser), row.epoch, now + STATE_MS, row.epoch).run();
      if (!inserted.meta?.changes) throw new DropboxError(409, 'DROPBOX_CONNECTION_CHANGED', 'Another administrator changed the connection.');
      const target = new URL('https://www.dropbox.com/oauth2/authorize');
      target.search = new URLSearchParams({ response_type: 'code', client_id: env.DROPBOX_APP_KEY!, redirect_uri: env.DROPBOX_ORIGIN + CALLBACK, state, token_access_type: 'offline', scope: SCOPES.join(' ') }).toString();
      const response = json({ authorizationUrl: target.toString() }); response.headers.set('Set-Cookie', cookie(browser)); return response;
    }
    if (path === CALLBACK && request.method === 'GET') {
      const url = new URL(request.url), state = url.searchParams.get('state') || '', browser = cookieValue(request);
      if (!TOKEN.test(state) || !browser || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length > 1) throw new DropboxError(400, 'DROPBOX_STATE_INVALID', 'Restart the Dropbox connection from the administrator page.');
      const pending = await env.SHARES_DB!.prepare("DELETE FROM dropbox_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? AND epoch=(SELECT epoch FROM dropbox_connection WHERE id=1 AND status='connecting') RETURNING epoch").bind(await digest(state), await digest(browser), now).first<{epoch:number}>();
      if (!pending) throw new DropboxError(400, 'DROPBOX_STATE_INVALID', 'This Dropbox authorization expired or was already used.');
      let success = false;
      try {
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || code.length > 2048 || !/^[\x21-\x7E]+$/.test(code)) throw new DropboxError(400, 'DROPBOX_DENIED', 'Dropbox authorization was not completed.');
        const fresh = await tokens(env, { grant_type: 'authorization_code', code, redirect_uri: env.DROPBOX_ORIGIN + CALLBACK }, upstream);
        const row = await connection(env);
        if (!row || row.epoch !== pending.epoch || row.status !== 'connecting') throw new Error('Stale connection');
        const identity = await checkFolder(env, fresh.access_token, row.account_id, upstream);
        const result = await env.SHARES_DB!.prepare("UPDATE dropbox_connection SET status='connected',account_id=?,account_name=?,folder_id=?,folder_name=?,credentials=?,access_expires_at=?,refresh_due_at=?,updated_at=? WHERE id=1 AND epoch=? AND status='connecting'")
          .bind(identity.account_id, identity.account_name, identity.folder_id, identity.folder_name, await seal(fresh, env, { ...row, ...identity }), now + fresh.expires_in * 1000, now + 10 * 86400_000, now, row.epoch).run();
        success = !!result.meta?.changes;
      } catch { /* Callback redirect never contains provider codes, tokens or errors. */ }
      if (!success) await failConnection(env, pending.epoch);
      return new Response(null, { status: 303, headers: { ...headers, Location: `/admin/shares?dropbox=${success ? 'connected' : 'failed'}`, 'Set-Cookie': cookie('', 0) } });
    }
    if (path === '/api/shares/admin/dropbox/check' && request.method === 'POST') {
      const access = await dropboxAccessToken(env, upstream, now), row = await connection(env);
      await checkFolder(env, access, row!.account_id, upstream);
      return json({ ok: true });
    }
    if (path === '/api/shares/admin/dropbox/transfer-test' && request.method === 'POST') return await transferTest(env, upstream, now);
    if (path === '/api/shares/admin/dropbox/disconnect' && request.method === 'POST') {
      // Local reset invalidates pending callbacks/refreshes and deletes tokens.
      // The Dropbox account pin remains, so reconnect cannot silently swap accounts.
      await env.SHARES_DB!.batch([
        env.SHARES_DB!.prepare("UPDATE dropbox_connection SET epoch=epoch+1,status='disconnected',credentials=NULL,access_expires_at=NULL,refresh_due_at=NULL,lock_id=NULL,lock_at=NULL,updated_at=? WHERE id=1").bind(now),
        env.SHARES_DB!.prepare('DELETE FROM dropbox_oauth_states'),
      ]);
      return json({ disconnected: true });
    }
    throw new DropboxError(405, 'METHOD_NOT_ALLOWED', 'This Dropbox connection action is not supported.');
  } catch (error) {
    return error instanceof DropboxError ? json({ error: { code: error.code, message: error.message } }, error.status) : json({ error: { code: 'DROPBOX_UNAVAILABLE', message: 'Dropbox connection is unavailable. Refresh the status or reconnect.' } }, 503);
  }
}
