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
}
async function adminRequest(path: string, password: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<any> {
    if (password.length < 32 || password.length > 256)
        throw new Error('Enter the authorized creator password.');
    const response = await fetch(path, { method, signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Authorization: `Bearer ${password}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 409) {
        await response.body?.cancel();
        throw new Error('Another user changed this workspace. Refresh the list before saving settings.');
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
        return { ...row, viewUrl: row.viewUrl === null ? null : protectedWorkspaceUrl(row.viewUrl) };
    });
    return { items, nextCursor: data.nextCursor };
}
export async function updateManagedWorkspace(id: string, password: string, data: {
    revision: number;
    label: string;
    expiresAt: string;
}, signal: AbortSignal): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error('Invalid workspace identifier.');
    await adminRequest(`/api/shares/admin/${id}`, password, signal, 'PATCH', data);
}
export async function revokeManagedWorkspace(id: string, password: string, signal: AbortSignal): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error('Invalid workspace identifier.');
    await adminRequest(`/api/shares/admin/${id}`, password, signal, 'DELETE');
}
