import { useEffect, useRef, useState } from 'react';
import { EditLinkAuthorization } from './EditLinkAuthorization';
import { listManagedWorkspaces, revokeManagedWorkspace, updateManagedWorkspace, type ManagedWorkspace } from '../lib/shareAdmin';
function localDate(value: number): string { const date = new Date(value); return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function WorkspaceRow({ row, busy, onUpdate, onRevoke, onEdit }: {
    row: ManagedWorkspace;
    busy: boolean;
    onUpdate: (label: string, expiry: string) => void;
    onRevoke: () => void;
    onEdit: () => void;
}) {
    const [label, setLabel] = useState(row.label);
    const [expiry, setExpiry] = useState(localDate(row.expiresAt));
    const [confirmRevoke, setConfirmRevoke] = useState(false);
    useEffect(() => { setLabel(row.label); setExpiry(localDate(row.expiresAt)); }, [row.label, row.expiresAt, row.revision]);
    const active = row.revokedAt === null && row.expiresAt > Date.now();
    return <article className="space-y-3 rounded-lg border border-zinc-300 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words font-semibold">{row.label || 'Untitled workspace'}</h2><span className="text-xs">{row.format.toUpperCase()} · {row.revokedAt !== null ? 'Revoked' : active ? 'Active' : 'Expired'} · revision {row.revision}</span></div>
    <p className="text-xs text-zinc-600">Created {new Date(row.createdAt).toLocaleString()} · Updated {new Date(row.updatedAt).toLocaleString()}</p>
    {row.viewUrl ? <label className="block text-sm">View-only link<input aria-label="View-only workspace link" readOnly value={row.viewUrl} className="mt-1 w-full rounded border p-2 font-mono text-xs" onFocus={event => event.target.select()}/></label> : <p className="text-xs">This older workspace has no recoverable view address. Copy its original link from the viewer; an authorized edit link can still be issued.</p>}
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); onUpdate(label, expiry); }}>
      <label className="flex-1 text-sm">Label<input value={label} maxLength={128} disabled={!active || busy} onChange={event => setLabel(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3"/></label>
      <label className="text-sm">Expiry<input aria-label="Workspace expiry" type="datetime-local" value={expiry} max={localDate(row.maxExpiresAt)} disabled={!active || busy} onChange={event => setExpiry(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3" required/></label>
      <button disabled={!active || busy} className="min-h-11 rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50">Save settings</button>
    </form>
    <p className="text-xs text-zinc-600">Latest allowed expiry: {new Date(row.maxExpiresAt).toLocaleString()} (180 days from creation).</p>
    <div className="flex flex-wrap gap-3"><button onClick={onEdit} disabled={!active || busy} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50">Authorize sharing an edit link…</button>
      {!confirmRevoke ? <button onClick={() => setConfirmRevoke(true)} disabled={!active || busy} className="min-h-11 px-3 text-sm text-red-700 disabled:opacity-50">Revoke workspace…</button> : <><span className="self-center text-sm">Disable both view and edit links?</span><button onClick={onRevoke} disabled={busy} className="min-h-11 rounded bg-red-700 px-3 text-sm text-white">Confirm revoke</button><button onClick={() => setConfirmRevoke(false)} className="min-h-11 px-3 text-sm underline">Cancel</button></>}
    </div>
  </article>;
}
export default function ShareAdminPage() {
    const [input, setInput] = useState('');
    const [password, setPassword] = useState('');
    const [rows, setRows] = useState<ManagedWorkspace[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [editId, setEditId] = useState<string | null>(null);
    const [editUrl, setEditUrl] = useState('');
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => { request.current?.abort(); }, []);
    const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
        if (busy)
            return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setMessage('');
        try {
            await operation(controller.signal);
        }
        catch (reason) {
            if (!controller.signal.aborted)
                setMessage(reason instanceof Error ? reason.message : 'The workspace request failed.');
        }
        finally {
            if (!controller.signal.aborted)
                setBusy(false);
        }
    };
    const refresh = async (key: string, signal: AbortSignal, page?: string) => { const data = await listManagedWorkspaces(key, signal, page); if (!signal.aborted) {
        setRows(previous => page ? [...previous, ...data.items] : data.items);
        setCursor(data.nextCursor);
    } };
    return <main className="h-dvh overflow-y-auto overscroll-y-contain bg-zinc-50 p-4 text-zinc-900 sm:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">Protected workspaces</h1><a href="/" className="min-h-11 content-center text-sm text-blue-700 underline">Open viewer / create workspace</a></header>
    <p className="text-sm">Manage workspace labels, expiry and access. Model files remain at Dropbox; this page manages their saved workspace metadata.</p>
    {!password ? <form className="max-w-lg space-y-3 rounded-lg border bg-white p-4" onSubmit={event => { event.preventDefault(); void run(async (signal) => { await refresh(input, signal); if (!signal.aborted) {
            setPassword(input);
            setInput('');
        } }); }}>
      <label className="block text-sm">Creator password<input aria-label="Admin creator password" type="password" autoComplete="off" maxLength={256} value={input} onChange={event => setInput(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3"/></label>
      <p className="text-xs text-zinc-600">Use the same private creator password as the Share dialog. It is kept only in this page’s memory.</p>
      <button disabled={busy || input.length < 32} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">{busy ? 'Opening…' : 'Open workspace manager'}</button>
    </form> : <>
      <div className="flex gap-3"><button disabled={busy} onClick={() => void run(signal => refresh(password, signal))} className="min-h-11 rounded border px-3">Refresh</button><button onClick={() => { request.current?.abort(); setBusy(false); setPassword(''); setInput(''); setRows([]); setCursor(null); setEditId(null); setEditUrl(''); setMessage(''); }} className="min-h-11 px-3 underline">Lock manager</button></div>
      {editId && <EditLinkAuthorization key={editId} path={`/api/shares/admin/${editId}/edit-link`} onCancel={() => setEditId(null)} onAuthorized={url => { setEditUrl(url); setEditId(null); }}/>}
      {editUrl && <section className="space-y-2 rounded border border-blue-300 bg-white p-4"><p className="text-sm font-semibold">Authorized edit link — recipients can save workspace changes.</p><input aria-label="Authorized edit link" readOnly value={editUrl} onFocus={event => event.target.select()} className="w-full rounded border p-2 font-mono text-xs"/><button className="min-h-11 px-3 text-sm underline" onClick={() => setEditUrl('')}>Hide edit link</button></section>}
      {!rows.length && !busy && <p>No workspaces found. Create a protected workspace from a loaded Dropbox model in the viewer.</p>}
      {rows.map(row => <WorkspaceRow key={row.id} row={row} busy={busy} onEdit={() => { setEditUrl(''); setEditId(row.id); }} onUpdate={(label, expiry) => void run(async (signal) => { const parsed = expiry === localDate(row.expiresAt) ? new Date(row.expiresAt) : new Date(expiry); if (!Number.isFinite(parsed.getTime()))
            throw new Error('Enter a valid expiry date and time.'); await updateManagedWorkspace(row.id, password, { revision: row.revision, label, expiresAt: parsed.toISOString() }, signal); await refresh(password, signal); if (!signal.aborted)
            setMessage('Workspace settings saved.'); })} onRevoke={() => void run(async (signal) => { await revokeManagedWorkspace(row.id, password, signal); await refresh(password, signal); if (!signal.aborted)
            setMessage('View and edit links revoked.'); })}/>)}
      {cursor && <button disabled={busy} onClick={() => void run(signal => refresh(password, signal, cursor))} className="min-h-11 rounded border px-4">Load more workspaces</button>}
    </>}
    {message && <p role="status" className="rounded border border-blue-300 bg-white p-3 text-sm">{message}</p>}
  </div></main>;
}
