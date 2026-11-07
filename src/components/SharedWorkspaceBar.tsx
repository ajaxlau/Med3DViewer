import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { SectionControls, SECTION_COLLAPSE_DELAY_MS, SECTION_EXPANSION_CLASS } from './SectionControls';
import { shouldIgnoreHover } from '../lib/utils';
import { listWorkspaceHistory, loadWorkspaceVersion, saveProtectedWorkspace, type WorkspaceHistoryItem } from '../lib/sharedWorkspace';
import type { ViewerManager } from '../lib/ViewerManager';

export interface SharedWorkspaceSession {
  token: string;
  role: 'view' | 'edit';
  revision: number;
  modelIdentity: string;
  modelAssetId?: string|null;
  localDraft?:boolean;
  modelHistoryEnabled?:boolean;
  requestId: string;
  expiresAt: string;
  historyEnabled?: boolean;
  includeWorkspace?: boolean;
  editingEnabled?: boolean;
  workspaceVersion?: number;
  workspaceName?: string;
}
export function SharedWorkspaceBar({ session, manager, onSaved, onLoadRevision, modelControls }: {
  session: SharedWorkspaceSession;
  manager: ViewerManager;
  modelControls?:ReactNode;
  onLoadRevision?: (version:number,signal:AbortSignal)=>Promise<void>;
  onSaved: (revision: number, expiresAt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const container = useRef<HTMLElement | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCollapse = () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
  const [status, setStatus] = useState('');
  const [operation, setOperation] = useState<'save' | 'load' | 'refresh' | null>(null);
  const [author, setAuthor] = useState('');
  const [nameRequired, setNameRequired] = useState(false);
  const [items, setItems] = useState<WorkspaceHistoryItem[]>([]);
  const [selected, setSelected] = useState(session.workspaceVersion || 1);
  const [viewing, setViewing] = useState(session.workspaceVersion || 1);
  const [focusAuthor, setFocusAuthor] = useState(false);
  const request = useRef<AbortController | null>(null);
  const authorInput = useRef<HTMLInputElement | null>(null);
  const detailsId = useId();
  const nameErrorId = useId();
  const modelMatches = () => manager.modelLoadState.requestId === session.requestId && manager.modelLoadState.phase === 'ready' && (session.localDraft||manager.loadedModelIdentity === session.modelIdentity);
  useEffect(() => {
    setAuthor(''); setNameRequired(false); setItems([]); setExpanded(false); setPinned(false); setOperation(null); setStatus(''); setFocusAuthor(false);
    setViewing(session.workspaceVersion || 1); setSelected(session.workspaceVersion || 1);
    return () => { clearCollapse(); request.current?.abort(); request.current = null; };
  }, [session.token, session.requestId]);
  useEffect(() => {
    if (expanded && focusAuthor && !operation) { authorInput.current?.focus(); setFocusAuthor(false); }
  }, [expanded, focusAuthor, operation]);
  const run = async (kind: NonNullable<typeof operation>, action: (signal: AbortSignal) => Promise<void>, supersede = false) => {
    if (request.current && !supersede) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setOperation(kind); setStatus('');
    try { await action(controller.signal); }
    catch (reason) {
      if (!controller.signal.aborted && request.current === controller) {
        setSelected(viewing);
        setStatus(reason instanceof Error ? reason.message : 'Workspace request failed.');
      }
    }
    finally { if (request.current === controller) { request.current = null; setOperation(null); } }
  };
  const refresh = () => run('refresh', async signal => {
    const history = await listWorkspaceHistory(session.token, signal);
    if (!signal.aborted && modelMatches()) setItems(history.items);
  });
  useEffect(() => {
    if (expanded && session.historyEnabled && !items.length && !request.current) void refresh();
  }, [expanded, session.token]);
  const switchRevision = (version: number) => {
    if (operation === 'save' || !Number.isSafeInteger(version)) return;
    setSelected(version);
    void run('load', async signal => {
      if(onLoadRevision){await onLoadRevision(version,signal);if(!signal.aborted){setViewing(version);setSelected(version);}return;}
      const data = await loadWorkspaceVersion(session.token, version, session.modelIdentity, signal);
      if (signal.aborted || !modelMatches()) return;
      await manager.restoreShareWorkspace(data.workspace);
      if (signal.aborted || !modelMatches()) return;
      setViewing(version); onSaved(data.revision, session.expiresAt);
    }, true);
  };
  if (!modelMatches()&&!modelControls) return null;
  const expired = Date.parse(session.expiresAt) <= Date.now();
  const canSave = modelMatches()&&!session.localDraft&&(session.historyEnabled ? session.editingEnabled : session.role === 'edit');
  const field = 'mt-1 block min-h-11 w-full min-w-0 rounded border border-zinc-300 bg-white px-2 text-xs font-normal normal-case tracking-normal text-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';
  if (session.includeWorkspace === false) return null;
  return <section ref={container} aria-label="Workspace controls" onMouseEnter={() => {
    if (shouldIgnoreHover()) return;
    clearCollapse(); setExpanded(true);
  }} onMouseLeave={event => {
    if (shouldIgnoreHover() || pinned || event.buttons !== 0) return;
    clearCollapse(); collapseTimer.current = setTimeout(() => {
      if (container.current?.contains(document.activeElement) || request.current) return;
      setExpanded(false);
    },SECTION_COLLAPSE_DELAY_MS);
  }} className="rounded-lg border border-zinc-200 bg-zinc-50/70 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" aria-label={`Workspace revisions: ${session.workspaceName || 'Workspace'}, revision ${session.historyEnabled ? viewing : session.revision}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => {
        clearCollapse(); setExpanded(!expanded);
      }} className="flex min-h-8 min-w-0 flex-1 items-center text-left text-xs font-bold uppercase tracking-wider text-zinc-700 transition-colors dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" title="Workspace revisions">
        <span className="min-w-0 flex-1 truncate">Workspace Revision</span>
      </button>
      <SectionControls label="workspace revisions" expanded={expanded} pinned={pinned} onPin={() => {
        clearCollapse(); setPinned(!pinned); if (!pinned) setExpanded(true);
      }} onToggle={() => { clearCollapse(); setExpanded(!expanded); }} />
    </div>
    <div id={detailsId} aria-hidden={!expanded} inert={!expanded} className={`${SECTION_EXPANSION_CLASS} ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
    <div className="overflow-hidden"><div className="space-y-3 px-3 pb-3">
      {modelControls}
      {session.localDraft&&<p className="text-xs text-zinc-500">Local model only. Export JSON and STLs to keep your changes.</p>}
      {session.workspaceName && <p className="truncate text-xs" title={session.workspaceName}>{session.workspaceName}</p>}
      {session.historyEnabled && session.includeWorkspace && <>
        <div className="flex items-end gap-1">
          <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Workspace Revision<select aria-label="Workspace Revision" disabled={operation === 'save' || expired || !items.length} className={field} value={selected} onChange={event => switchRevision(Number(event.target.value))}>
            {!items.length && <option value={selected}>{operation ? 'Loading…' : `Revision ${viewing}`}</option>}
            {items.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.author} · {new Date(item.savedAt).toLocaleString()}</option>)}
          </select></label>
          <button aria-label="Refresh revisions" title="Refresh revisions" className="flex min-h-11 min-w-11 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-blue-400" disabled={!!operation || expired} onClick={() => void refresh()}><RotateCw size={15} /></button>
        </div>
        {canSave && <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Revision Name<input ref={authorInput} aria-label="Revision Name" required aria-invalid={nameRequired || undefined} aria-describedby={nameRequired ? nameErrorId : undefined} maxLength={80} value={author} onChange={event => { setAuthor(event.target.value); if (event.target.value.trim()) setNameRequired(false); }} className={field}/>
          {nameRequired && <span id={nameErrorId} role="alert" className="mt-1 block text-xs font-normal normal-case tracking-normal text-red-600 dark:text-red-400">Enter a revision name before saving.</span>}</label>}
      </>}
    </div></div></div>
    <div className="px-3 pb-3">
      {canSave && <button disabled={!!operation || expired} className="min-h-11 w-full rounded bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50" onClick={() => {
        if (session.historyEnabled && !author.trim()) {
          clearCollapse(); setStatus(''); setExpanded(true); setNameRequired(true); setFocusAuthor(true);
          return;
        }
        void run('save', async signal => {
          if (!modelMatches()) throw new Error('A different model is open. Reload this workspace before saving.');
          const result = await saveProtectedWorkspace(session.token, { workspace: manager.exportShareWorkspace(), modelIdentity: session.modelIdentity, ...(session.modelAssetId?{modelAssetId:session.modelAssetId}:{}), revision: session.revision, ...(session.historyEnabled ? { author } : {}) }, signal);
          if (signal.aborted || !modelMatches()) return;
          onSaved(result.revision, result.expiresAt);
          if (result.workspaceVersion) {
            setViewing(result.workspaceVersion); setSelected(result.workspaceVersion);
            setItems(previous=>[{version:result.workspaceVersion!,author:author.trim(),savedAt:Date.parse(result.updatedAt)},...previous.filter(item=>item.version!==result.workspaceVersion)].slice(0,20));
          }
          setStatus(`Saved${result.workspaceVersion ? ` as revision ${result.workspaceVersion}` : ''}.`);
          if (session.historyEnabled) {
            try {
              const history = await listWorkspaceHistory(session.token, signal);
              if (!signal.aborted && modelMatches()) setItems(history.items);
            } catch { /* The save succeeded; Refresh can retry history without duplicating it. */ }
          }
        });
      }}>{operation === 'save' ? 'Saving…' : 'Save Workspace'}</button>}
      {expired ? <p className="pt-2 text-xs text-zinc-500">Workspace unavailable.</p> : !canSave && !session.localDraft && <p className="text-xs text-zinc-500">View only</p>}
      {operation === 'load' && <p role="status" className="pt-2 text-xs text-zinc-500">Loading revision…</p>}
      {status && <p role="status" className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">{status}</p>}
    </div>
  </section>;
}
