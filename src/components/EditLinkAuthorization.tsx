import { useEffect, useRef, useState } from 'react';
import { requestEditWorkspaceLink } from '../lib/sharedWorkspace';
/** Each edit-link action requests a fresh password, independently of admin unlock. */
export function EditLinkAuthorization({ path, onAuthorized, onCancel }: {
    path: string;
    onAuthorized: (url: string) => void;
    onCancel: () => void;
}) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => { controller.current?.abort(); }, [path]);
    return <form className="space-y-3 rounded border border-blue-300 p-3" onSubmit={async (event) => {
            event.preventDefault();
            if (busy)
                return;
            const request = new AbortController();
            controller.current = request;
            setBusy(true);
            setError('');
            try {
                const url = await requestEditWorkspaceLink(path, password, request.signal);
                if (!request.signal.aborted) {
                    setPassword('');
                    onAuthorized(url);
                }
            }
            catch (reason) {
                if (!request.signal.aborted)
                    setError(reason instanceof Error ? reason.message : 'The edit link could not be authorized.');
            }
            finally {
                if (!request.signal.aborted)
                    setBusy(false);
            }
        }}>
    <label className="block text-sm">Creator password to share an edit link
      <input aria-label="Creator password for edit link" type="password" autoComplete="off" maxLength={256} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-zinc-400 bg-transparent px-3"/>
    </label>
    <p className="text-xs">Anyone with the resulting edit link can save changes. Share it only with trusted collaborators.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex gap-3"><button disabled={busy || password.length < 32} className="min-h-11 rounded bg-blue-600 px-3 text-sm text-white disabled:opacity-50">{busy ? 'Authorizing…' : 'Authorize edit link'}</button><button type="button" onClick={onCancel} disabled={busy} className="min-h-11 px-3 text-sm underline">Cancel</button></div>
  </form>;
}
