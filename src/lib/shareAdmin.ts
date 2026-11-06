import { protectedWorkspaceUrl, readBoundedBytes, shareDownloadError } from './sharedWorkspace';
export interface ManagedWorkspace {
    id: string;
    label: string;
    format: 'stl' | '3mf' | 'glb';
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    revokedAt: number | null;
    revision: number;
    viewUrl: string | null;
    maxExpiresAt: number;
    includeWorkspace?: boolean;
    editingEnabled?: boolean;
    workspaceVersion?: number;
}
async function adminRequest(path: string, password: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<any> {
    if (password.length < 32 || password.length > 256)
        throw new Error('Enter the authorized administrator password.');
    const response = await fetch(path, { method, signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Authorization: `Bearer ${password}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 409) {
        await response.body?.cancel();
        throw new Error('The record changed or already exists. Refresh the relevant list before saving settings.');
    }
    if (!response.ok)
        throw await shareDownloadError(response, signal);
    if (response.status === 204)
        return null;
    return JSON.parse(new TextDecoder().decode(await readBoundedBytes(response, 256 * 1024, signal)));
}
export async function listManagedWorkspaces(password: string, signal: AbortSignal, cursor?: string): Promise<{
    items: ManagedWorkspace[];
    nextCursor: string | null;
}> {
    if (cursor && !/^\d{1,16}\.[a-f0-9]{64}$/.test(cursor))
        throw new Error('Invalid workspace page.');
    const data = await adminRequest(`/api/shares/admin${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`, password, signal);
    if (!Array.isArray(data.items) || data.items.length > 25 || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !/^\d{1,16}\.[a-f0-9]{64}$/.test(data.nextCursor))))
        throw new Error('Invalid workspace list.');
    const items = data.items.map((row: any) => {
        if (!row || !/^[a-f0-9]{64}$/.test(row.id) || typeof row.label !== 'string' || row.label.length > 128 || !['stl', '3mf', 'glb'].includes(row.format)
            || !['createdAt', 'updatedAt', 'expiresAt', 'maxExpiresAt', 'revision'].every(key => Number.isSafeInteger(row[key])) || row.revision < 1
            || !['createdAt', 'updatedAt', 'expiresAt', 'maxExpiresAt'].every(key => row[key] >= 0 && Number.isFinite(new Date(row[key]).getTime()))
            || (row.revokedAt !== null && !Number.isSafeInteger(row.revokedAt)))
            throw new Error('Invalid workspace metadata.');
        return { ...row, ...(row.includeWorkspace !== undefined ? {includeWorkspace:row.includeWorkspace===1,editingEnabled:row.editingEnabled===1}:{}), viewUrl: row.viewUrl === null ? null : protectedWorkspaceUrl(row.viewUrl) };
    });
    return { items, nextCursor: data.nextCursor };
}
export async function updateManagedWorkspace(id: string, password: string, data: {
    revision: number;
    label: string;
    expiresAt: string;
    editingEnabled?: boolean;
}, signal: AbortSignal): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error('Invalid workspace identifier.');
    await adminRequest(`/api/shares/admin/${id}`, password, signal, 'PATCH', data);
}
export async function revokeManagedWorkspaces(ids:string[],password:string,signal:AbortSignal):Promise<void> {
    if(ids.length<1||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw new Error('Select 1–50 different workspaces.');
    await adminRequest('/api/shares/admin/revoke-batch',password,signal,'POST',{ids});
}
export async function revokeManagedWorkspace(id: string, password: string, signal: AbortSignal): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error('Invalid workspace identifier.');
    await adminRequest(`/api/shares/admin/${id}`, password, signal, 'DELETE');
}

export interface SharingUser {id:string;username:string;active:boolean;createdAt:number;updatedAt:number}
export async function listSharingUsers(password:string,signal:AbortSignal):Promise<SharingUser[]> {
  const data=await adminRequest('/api/shares/admin/users',password,signal);
  if(!Array.isArray(data.items)||data.items.length>50||data.items.some((row:any)=>!row||!/^[a-f0-9]{64}$/.test(row.id)||!/^[a-z][a-z0-9._-]{2,63}$/.test(row.username)||![0,1].includes(row.active)||!Number.isSafeInteger(row.createdAt)||!Number.isSafeInteger(row.updatedAt)))throw new Error('Invalid sharing-user list.');
  return data.items.map((row:any)=>({...row,active:row.active===1}));
}
export async function createSharingUser(adminPassword:string,username:string,password:string,signal:AbortSignal):Promise<void> {
  await adminRequest('/api/shares/admin/users',adminPassword,signal,'POST',{username,password});
}
export async function updateSharingUser(adminPassword:string,user:SharingUser,data:{password?:string;active?:boolean},signal:AbortSignal):Promise<void> {
  if(!/^[a-f0-9]{64}$/.test(user.id))throw new Error('Invalid sharing user.');
  await adminRequest(`/api/shares/admin/users/${user.id}`,adminPassword,signal,'PATCH',{...data,updatedAt:user.updatedAt});
}
export async function disableSharingUsers(adminPassword:string,ids:string[],signal:AbortSignal):Promise<void> {
  if(ids.length<1||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw new Error('Select 1–50 sharing users.');
  await adminRequest('/api/shares/admin/users/disable-batch',adminPassword,signal,'POST',{ids});
}
