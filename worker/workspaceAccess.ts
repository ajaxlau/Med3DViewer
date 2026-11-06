// Human passwords are salted, peppered and stretched; never store passwords or sessions in plaintext.
export const HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;
export const HISTORY_VERSION_LIMIT = 20;
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes as ArrayBuffer), b => b.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function modelShareKey(source:string,identity:string,snapshot:string,secret:string):Promise<string> {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(`Med3D model share v1\0${source}\0${identity}\0${snapshot}`)));
}
export function validWorkspacePassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}
export async function passwordDigest(password: string, salt: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const input = await crypto.subtle.sign('HMAC',key,encoder.encode(`Med3D workspace password v1\0${password}`));
  const material = await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:encoder.encode(salt)},material,256));
}
export function equalDigest(a: string,b: string): boolean {
  if(a.length!==64||b.length!==64)return false;
  let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export function revisionAuthor(value: unknown): string | null {
  return typeof value==='string' && value.trim().length>=1 && value.trim().length<=80 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
