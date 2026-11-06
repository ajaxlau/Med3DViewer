import { useEffect, useId, useRef, useState } from 'react';
import { listWorkspaceHistory, loadWorkspaceVersion, saveProtectedWorkspace, type WorkspaceHistoryItem } from '../lib/sharedWorkspace';
import type { ViewerManager } from '../lib/ViewerManager';

export interface SharedWorkspaceSession {
  token: string;
  role: 'view' | 'edit';
  revision: number;
  modelIdentity: string;
  requestId: string;
  expiresAt: string;
  historyEnabled?: boolean;
  includeWorkspace?: boolean;
  editingEnabled?: boolean;
  workspaceVersion?: number;
  workspaceName?: string;
}
export function SharedWorkspaceBar({ session, manager, onSaved }: {
  session: SharedWorkspaceSession;
  manager: ViewerManager;
  onSaved: (revision: number, expiresAt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [author, setAuthor] = useState('');
  const [items, setItems] = useState<WorkspaceHistoryItem[]>([]);
  const [selected, setSelected] = useState(session.workspaceVersion || 1);
  const [viewing, setViewing] = useState(session.workspaceVersion || 1);
  const [focusAuthor, setFocusAuthor] = useState(false);
  const request = useRef<AbortController | null>(null);
  const authorInput = useRef<HTMLInputElement | null>(null);
  const detailsId = useId();
  const modelMatches = () => manager.modelLoadState.requestId === session.requestId && manager.modelLoadState.phase === 'ready' && manager.loadedModelIdentity === session.modelIdentity;
  useEffect(() => {
    setAuthor(''); setItems([]); setExpanded(false); setBusy(false); setStatus(''); setFocusAuthor(false);
    setViewing(session.workspaceVersion || 1); setSelected(session.workspaceVersion || 1);
    return () => request.current?.abort();
  }, [session.token, session.requestId]);
  useEffect(() => {
    if (expanded && focusAuthor && !busy) { authorInput.current?.focus(); setFocusAuthor(false); }
  }, [expanded, focusAuthor, busy]);
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (busy) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setStatus('');
    try { await operation(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) setStatus(reason instanceof Error ? reason.message : 'Workspace request failed.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const refresh = () => run(async signal => {
    const history = await listWorkspaceHistory(session.token, signal);
    if (!signal.aborted && modelMatches()) setItems(history.items);
  });
  useEffect(() => {
    if (expanded && session.historyEnabled && !items.length && !busy) void refresh();
  }, [expanded, session.token]);
  if (!modelMatches()) return null;
  const expired = Date.parse(session.expiresAt) <= Date.now();
  const canSave = session.historyEnabled ? session.editingEnabled : session.role === 'edit';
  const button = 'min-h-11 rounded border border-blue-400 px-3 text-sm disabled:opacity-50';
  if (session.includeWorkspace === false) return <p className="bg-blue-50 px-4 py-2 text-xs text-blue-950 dark:bg-blue-950/40 dark:text-blue-200">Public model · expires {new Date(session.expiresAt).toLocaleDateString()}</p>;
  return <section aria-label="Workspace controls" className="max-h-[40dvh] overflow-y-auto bg-blue-50 px-3 py-1 text-sm text-blue-950 dark:bg-blue-950/40 dark:text-blue-200">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <button type="button" aria-label={`Workspace revisions: ${session.workspaceName || 'Workspace'}, revision ${session.historyEnabled ? viewing : session.revision}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => {
        setExpanded(!expanded);
      }} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" title="Workspace revisions and details">
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="min-w-0 truncate" title={session.workspaceName || 'Workspace'}>{session.workspaceName || 'Workspace'}</span>
        <span className="shrink-0 text-xs">v{session.historyEnabled ? viewing : session.revision}</span>
        {expired ? <span className="text-xs">Expired</span> : !canSave && <span className="whitespace-nowrap text-xs">View only</span>}
      </button>
      {canSave && <button disabled={busy || expired} className={`${button} bg-blue-600 font-semibold text-white`} onClick={() => {
        if (session.historyEnabled && !author.trim()) {
          setExpanded(true); setFocusAuthor(true); setStatus('Enter a display name, then Save Workspace.');
          return;
        }
        void run(async signal => {
          if (!modelMatches()) throw new Error('A different model is open. Reload this workspace before saving.');
          const result = await saveProtectedWorkspace(session.token, { workspace: manager.exportShareWorkspace(), modelIdentity: session.modelIdentity, revision: session.revision, ...(session.historyEnabled ? { author } : {}) }, signal);
          if (signal.aborted || !modelMatches()) return;
          onSaved(result.revision, result.expiresAt);
          if (result.workspaceVersion) { setViewing(result.workspaceVersion); setSelected(result.workspaceVersion); }
          setStatus(`Saved${result.workspaceVersion ? ` as revision ${result.workspaceVersion}` : ''}.`);
          if (session.historyEnabled) {
            const history = await listWorkspaceHistory(session.token, signal);
            if (!signal.aborted && modelMatches()) setItems(history.items);
          }
        });
      }}>{busy ? 'Working…' : 'Save Workspace'}</button>}
    </div>
    {expanded && <div id={detailsId} className="space-y-2 border-t border-blue-200 py-2 dark:border-blue-900">
      {session.historyEnabled && session.includeWorkspace && <>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">Workspace Revision<select aria-label="Workspace Revision" disabled={busy || !items.length} className="mt-1 block min-h-11 w-full max-w-full rounded border bg-white px-2 text-zinc-900" value={selected} onChange={event => setSelected(Number(event.target.value))}>
            {!items.length && <option value={selected}>{busy ? 'Loading…' : `Revision ${viewing}`}</option>}
            {items.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.author} · {new Date(item.savedAt).toLocaleString()}</option>)}
          </select></label>
          <button className={button} disabled={busy || expired || !items.length} onClick={() => {
            if (!window.confirm('Load this revision? Unsaved changes will be replaced.')) return;
            void run(async signal => {
              const data = await loadWorkspaceVersion(session.token, selected, session.modelIdentity, signal);
              if (signal.aborted || !modelMatches()) return;
              await manager.restoreShareWorkspace(data.workspace);
              if (signal.aborted || !modelMatches()) return;
              setViewing(selected); onSaved(data.revision, session.expiresAt); setStatus(`Viewing revision ${selected}. Save creates a new revision.`);
            });
          }}>Load revision</button>
          <button className={button} disabled={busy || expired} onClick={() => void refresh()}>Refresh</button>
        </div>
        {canSave && <label className="block">Display name<input ref={authorInput} aria-label="Revision display name" maxLength={80} value={author} onChange={event => setAuthor(event.target.value)} className="ml-2 min-h-11 max-w-full rounded border bg-white px-2 text-zinc-900"/></label>}
      </>}
      <p className="text-xs">Expires {new Date(session.expiresAt).toLocaleString()}. {canSave ? 'Changes are saved only when you click Save Workspace.' : 'Editing is disabled by the administrator.'}</p>
      {session.historyEnabled && <p className="text-xs">Latest 20 revisions retained. Display names are self-reported.</p>}
    </div>}
    {status && <p role="status" className="py-1 text-xs">{status}</p>}
  </section>;
}
