import { useEffect, useRef, useState } from 'react';
import { saveProtectedWorkspace } from '../lib/sharedWorkspace';
import type { ViewerManager } from '../lib/ViewerManager';
export interface SharedWorkspaceSession {
    token: string;
    role: 'view' | 'edit';
    revision: number;
    modelIdentity: string;
    requestId: string;
    expiresAt: string;
}
export function SharedWorkspaceBar({ session, manager, onSaved }: {
    session: SharedWorkspaceSession;
    manager: ViewerManager;
    onSaved: (revision: number, expiresAt: string) => void;
}) {
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => { request.current?.abort(); }, [session.token, manager]);
    if (manager.modelLoadState.requestId !== session.requestId || manager.modelLoadState.phase !== 'ready' || manager.loadedModelIdentity !== session.modelIdentity)
        return null;
    const expired = Date.parse(session.expiresAt) <= Date.now();
    return <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50 px-4 py-2 text-sm text-blue-950 dark:bg-blue-950/40 dark:text-blue-200">
    <span>{session.role === 'edit' ? 'Editable workspace' : 'View-only workspace'} · revision {session.revision} · expires {new Date(session.expiresAt).toLocaleDateString()}. {session.role === 'view' ? 'Your changes stay on this device.' : 'Use Save workspace to update the shared version.'}</span>
    {session.role === 'edit' && <button disabled={busy || expired} className="min-h-11 rounded bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
                if (busy)
                    return;
                const controller = new AbortController();
                request.current = controller;
                setBusy(true);
                setStatus('');
                try {
                    if (manager.modelLoadState.requestId !== session.requestId || manager.loadedModelIdentity !== session.modelIdentity)
                        throw new Error('A different model is open. Reload the protected link before saving.');
                    const workspace = manager.exportShareWorkspace();
                    const result = await saveProtectedWorkspace(session.token, { workspace, modelIdentity: session.modelIdentity, revision: session.revision }, controller.signal);
                    if (controller.signal.aborted || manager.modelLoadState.requestId !== session.requestId)
                        return;
                    onSaved(result.revision, result.expiresAt);
                    setStatus('Workspace saved for everyone using this link.');
                }
                catch (reason) {
                    if (!controller.signal.aborted)
                        setStatus(reason instanceof Error ? reason.message : 'The workspace could not be saved.');
                }
                finally {
                    if (!controller.signal.aborted)
                        setBusy(false);
                }
            }}>{busy ? 'Saving…' : 'Save workspace'}</button>}
    {status && <p role="status" className="w-full">{status}</p>}
  </div>;
}
