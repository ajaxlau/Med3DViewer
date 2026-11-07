import { useEffect, useRef, useState } from 'react';
import { readBoundedBytes, shareDownloadError } from '../lib/sharedWorkspace';
interface Status { available: boolean; enabled: boolean; status: string; accountName: string | null; folderId: string | null; folderName: string | null }
export default function DropboxConnectionPanel({ adminPassword }: { adminPassword: string }) {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pending = useRef<AbortController | null>(null), active = useRef(false);
  async function call(action = '', signal: AbortSignal) {
    const response = await fetch(`/api/shares/admin/dropbox${action}`, { method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Authorization: `Bearer ${adminPassword}` } });
    if (!response.ok) throw await shareDownloadError(response, signal);
    return JSON.parse(new TextDecoder().decode(await readBoundedBytes(response, 16 * 1024, signal)));
  }
  async function run(action = '') {
    if (active.current) return;
    active.current = true; const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try {
      const result = await call(action, controller.signal);
      if (controller.signal.aborted) return;
      if (action === '/connect') {
        const target = new URL(result.authorizationUrl);
        if (target.origin !== 'https://www.dropbox.com' || target.pathname !== '/oauth2/authorize') throw new Error('Invalid Dropbox authorization address.');
        window.location.assign(target.toString()); return;
      }
      const current = action ? await call('', controller.signal) : result;
      if (controller.signal.aborted) return;
      setStatus(current);
      if (action === '/check') setMessage('Dropbox account and app-folder metadata access verified.');
      if (action === '/transfer-test') setMessage('Dropbox upload, download and test-file cleanup passed.');
      if (action === '/disconnect') { setConfirmDisconnect(false); setMessage('Disconnected locally. Files and workspaces were not deleted.'); }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : 'Dropbox connection failed.');
        if (action) try { const current = await call('', controller.signal); if (!controller.signal.aborted) setStatus(current); } catch { /* Keep original error. */ }
      }
    } finally { if (pending.current === controller) { active.current = false; if (!controller.signal.aborted) setBusy(false); } }
  }
  useEffect(() => { void run(); return () => { pending.current?.abort(); active.current = false; }; }, [adminPassword]);
  if (status && !status.available) return null;
  return <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="Dropbox connection">
    <h2 className="text-lg font-semibold">Dropbox connection</h2>
    {status && <p className="text-sm">Status: {status.status}{status.accountName ? ` · ${status.accountName}` : ''}</p>}
    {status?.folderName && <p className="break-words text-sm">Upload folder: {status.folderName || status.folderId}</p>}
    {status && !status.enabled && <p className="text-sm">Complete the Dropbox runtime secrets and migration 0006 using the test setup guide.</p>}
    {new URLSearchParams(window.location.search).get('dropbox') === 'failed' && <p role="alert" className="text-sm text-red-700">Dropbox authorization was not completed. Check app settings, the original account and folder permissions, then reconnect.</p>}
    <p className="text-sm">The transfer test creates and removes a small text file in the app folder.</p>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void run()} className="min-h-11 rounded border px-3 text-sm">Refresh status</button>
      <button disabled={busy || !status?.enabled} onClick={() => void run('/connect')} className="min-h-11 rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50">{status?.status === 'connected' ? 'Reconnect Dropbox' : 'Connect Dropbox'}</button>
      <button disabled={busy || status?.status !== 'connected'} onClick={() => void run('/check')} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50">Test connection</button>
      <button disabled={busy || status?.status !== 'connected'} onClick={() => void run('/transfer-test')} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50">Test upload/download</button>
      <button disabled={busy || !status?.enabled || status.status === 'disconnected'} onClick={() => setConfirmDisconnect(true)} className="min-h-11 rounded border px-3 text-sm disabled:opacity-50">Disconnect…</button>
    </div>
    {confirmDisconnect && <div className="flex flex-wrap items-center gap-2"><p className="text-sm">Stop platform access to Dropbox? Saved files remain in Dropbox. The original account is required to reconnect.</p><button disabled={busy} onClick={() => void run('/disconnect')} className="min-h-11 rounded bg-red-700 px-3 text-sm text-white">Confirm disconnect</button><button onClick={() => setConfirmDisconnect(false)} className="min-h-11 px-3 text-sm underline">Cancel</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
