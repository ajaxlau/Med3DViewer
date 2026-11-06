import { readBoundedBytes, shareDownloadError } from './sharedWorkspace';

export interface SignedInUser {
  id: string;
  username: string;
  permissions: string[];
  expiresAt: string;
}
export interface SessionStatus { enabled: boolean; user: SignedInUser | null }
export function validateUserSession(value: unknown, now=Date.now()): SessionStatus {
  const data=value as any;
  if(!data || typeof data.authenticated!=='boolean' || typeof data.enabled!=='boolean')throw new Error('The login service returned an invalid response.');
  if(!data.authenticated)return {enabled:data.enabled,user:null};
  const user=data.user;
  if(!data.enabled || !user || typeof user.id!=='string' || typeof user.username!=='string' || !/^[a-f0-9]{64}$/.test(user.id) || !/^[a-z][a-z0-9._-]{2,63}$/.test(user.username)
    || !Array.isArray(user.permissions) || user.permissions.length>32 || new Set(user.permissions).size!==user.permissions.length
    || user.permissions.some((permission:unknown)=>typeof permission!=='string'||!/^[-a-z0-9]{1,32}:[-a-z0-9]{1,32}$/.test(permission))
    || typeof user.expiresAt!=='string' || !Number.isFinite(Date.parse(user.expiresAt)) || Date.parse(user.expiresAt)<=now)throw new Error('Your login session is unavailable or expired.');
  return {enabled:true,user:{id:user.id,username:user.username,permissions:[...user.permissions],expiresAt:user.expiresAt}};
}
async function sessionRequest(action:'login'|'logout'|'session',signal:AbortSignal,credentials?:{username:string;password:string}):Promise<SessionStatus> {
  const controller=new AbortController();
  const cancel=()=>controller.abort(signal.reason);
  if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('The login request timed out. Try again.')),20_000);
  try {
    const response=await fetch(`/api/shares/${action}`,{method:action==='session'?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
      ...(credentials?{headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)}:{})});
    if(!response.ok)throw await shareDownloadError(response,controller.signal);
    const data=JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,8192,controller.signal)));
    if(action==='logout')return {enabled:true,user:null};
    return validateUserSession(data);
  } finally {clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
export function getUserSession(signal:AbortSignal):Promise<SessionStatus> {return sessionRequest('session',signal);}
export function loginUser(username:string,password:string,signal:AbortSignal):Promise<SessionStatus> {
  if(!/^[a-z][a-z0-9._-]{2,63}$/.test(username)||password.length<12||password.length>128)throw new Error('Enter your assigned sharing username and password.');
  return sessionRequest('login',signal,{username,password});
}
export async function logoutUser(signal:AbortSignal):Promise<void> {await sessionRequest('logout',signal);}
