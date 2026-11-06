import type { ShareEnvironment } from './index';
import { equalDigest, randomToken } from './workspaceAccess';

export const USER_SESSION_COOKIE = '__Host-med3d_session';
export const USER_SESSION_MS = 8 * 60 * 60 * 1000;
export const USER_PERMISSIONS = ['workspace:share'] as const;
export interface SharingIdentity { id: string; username: string; version: number }
export interface UserSession extends SharingIdentity { expiresAt: number; permissions: readonly string[] }
interface SessionClaims { userId: string; version: number; expiresAt: number; nonce: string }
const encoder = new TextEncoder();
const TOKEN = /^[a-f0-9]{64}$/;

export class SessionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2,'0')).join('');
}
async function signature(payload: string, request: Request, env: ShareEnvironment): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(`Med3D user session v1\0${env.SHARES_ENCRYPTION_KEY}`), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${env.SHARES_ENVIRONMENT}\0${new URL(request.url).origin}\0${payload}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
}
function cookieValue(request: Request): string | null {
  const values = (request.headers.get('Cookie') || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${USER_SESSION_COOKIE}=`));
  return values.length === 1 ? values[0].slice(USER_SESSION_COOKIE.length+1) : null;
}
async function sessionClaims(request: Request, env: ShareEnvironment): Promise<SessionClaims | null> {
  const value = cookieValue(request);
  if (!value || value.length > 1024) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !TOKEN.test(parts[1])) return null;
  if (!equalDigest(await signature(parts[0], request, env), parts[1])) return null;
  try {
    const data = JSON.parse(atob(parts[0].replace(/-/g,'+').replace(/_/g,'/'))) as SessionClaims;
    if (!data || typeof data.userId!=='string' || typeof data.nonce!=='string' || !TOKEN.test(data.userId) || !TOKEN.test(data.nonce) || !Number.isSafeInteger(data.version) || data.version < 0 || !Number.isSafeInteger(data.expiresAt)) return null;
    return data;
  } catch { return null; }
}
async function sessionBucket(claims: SessionClaims): Promise<string> {
  return `session:${claims.userId}:${await digest(claims.nonce)}`;
}
export function userSessionCookie(value: string, maxAge: number): string {
  return `${USER_SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}
export async function createUserSession(user: SharingIdentity, request: Request, env: ShareEnvironment, now: number): Promise<{user:UserSession;cookie:string}> {
  const claims: SessionClaims = {userId:user.id,version:user.version,expiresAt:now+USER_SESSION_MS,nonce:randomToken()};
  const prefix = `session:${user.id}:`;
  const bucket = await sessionBucket(claims);
  // Reuse the existing, scheduled-expiry store; no new binding or migration.
  // For session:* entries, count records the user's credential version.
  const result = await env.SHARES_DB!.batch([
    env.SHARES_DB!.prepare("DELETE FROM share_rate_limits WHERE bucket>= 'session:' AND bucket< 'session;' AND expires_at<=?").bind(now),
    env.SHARES_DB!.prepare('DELETE FROM share_rate_limits WHERE bucket>=? AND bucket<? AND count<>?').bind(prefix,prefix+'~',user.version),
    env.SHARES_DB!.prepare(`INSERT INTO share_rate_limits(bucket,count,expires_at)
      SELECT ?,?,? WHERE (SELECT count(*) FROM share_rate_limits WHERE bucket>=? AND bucket<?)<10
      AND (SELECT count(*) FROM share_rate_limits WHERE bucket>='session:' AND bucket<'session;')<500
      AND EXISTS(SELECT 1 FROM share_users WHERE id=? AND active=1 AND updated_at=?)`)
      .bind(bucket,user.version,claims.expiresAt,prefix,prefix+'~',user.id,user.version),
  ]);
  if (!result[2]?.meta?.changes) throw new SessionError(429,'SESSION_LIMIT','Sign-in sessions are full or your access changed. Try again later.');
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return {user:{...user,expiresAt:claims.expiresAt,permissions:USER_PERMISSIONS},cookie:userSessionCookie(`${payload}.${await signature(payload,request,env)}`,USER_SESSION_MS/1000)};
}
export async function readUserSession(request: Request, env: ShareEnvironment, now: number): Promise<UserSession | null> {
  const claims = await sessionClaims(request,env);
  if (!claims || claims.expiresAt<=now || claims.expiresAt>now+USER_SESSION_MS) return null;
  const user = await env.SHARES_DB!.prepare(`SELECT u.id,u.username,u.updated_at FROM share_users u
    JOIN share_rate_limits s ON s.bucket=? WHERE u.id=? AND u.active=1 AND u.updated_at=?
    AND s.count=u.updated_at AND s.expires_at=? AND s.expires_at>?`)
    .bind(await sessionBucket(claims),claims.userId,claims.version,claims.expiresAt,now).first<{id:string;username:string;updated_at:number}>();
  return user ? {id:user.id,username:user.username,version:user.updated_at,expiresAt:claims.expiresAt,permissions:USER_PERMISSIONS} : null;
}
export function requireUserPermission(user: UserSession | null, permission: string): asserts user is UserSession {
  if (!user) throw new SessionError(401,'LOGIN_REQUIRED','Log in to share a workspace.');
  if (!user.permissions.includes(permission)) throw new SessionError(403,'PERMISSION_REQUIRED','Your account does not have permission for this action.');
}
export async function revokeUserSession(request: Request, env: ShareEnvironment): Promise<void> {
  const claims = await sessionClaims(request,env);
  if (claims) await env.SHARES_DB!.prepare('DELETE FROM share_rate_limits WHERE bucket=?').bind(await sessionBucket(claims)).run();
}
export function publicUserSession(user: UserSession): Record<string, unknown> {
  return {id:user.id,username:user.username,permissions:user.permissions,expiresAt:new Date(user.expiresAt).toISOString()};
}
