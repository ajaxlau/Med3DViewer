import { useEffect, useRef, useState } from 'react';
import { listWorkspaceHistory, loadWorkspaceVersion, saveProtectedWorkspace, type WorkspaceHistoryItem } from '../lib/sharedWorkspace';
import type { ViewerManager } from '../lib/ViewerManager';
export interface SharedWorkspaceSession {
  token:string; role:'view'|'edit'; revision:number; modelIdentity:string; requestId:string; expiresAt:string;
  historyEnabled?:boolean; includeWorkspace?:boolean; editingEnabled?:boolean; workspaceVersion?:number;
}
export function SharedWorkspaceBar({session,manager,onSaved}:{session:SharedWorkspaceSession;manager:ViewerManager;onSaved:(revision:number,expiresAt:string)=>void}) {
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[author,setAuthor]=useState('');
  const [items,setItems]=useState<WorkspaceHistoryItem[]>([]),[selected,setSelected]=useState(session.workspaceVersion||1),[viewing,setViewing]=useState(session.workspaceVersion||1);
  const request=useRef<AbortController|null>(null);
  const modelMatches=()=>manager.modelLoadState.requestId===session.requestId && manager.modelLoadState.phase==='ready' && manager.loadedModelIdentity===session.modelIdentity;
  useEffect(()=>{
    setAuthor('');setItems([]);setViewing(session.workspaceVersion||1);setSelected(session.workspaceVersion||1);
    const controller=new AbortController();
    if(session.historyEnabled&&session.includeWorkspace)void listWorkspaceHistory(session.token,controller.signal).then(data=>{if(!controller.signal.aborted)setItems(data.items);}).catch(()=>{});
    return()=>{controller.abort();request.current?.abort();};
  },[session.token,session.requestId]);
  const run=async(operation:(signal:AbortSignal)=>Promise<void>)=>{
    if(busy)return;const controller=new AbortController();request.current=controller;setBusy(true);setStatus('');
    try{await operation(controller.signal);}catch(reason){if(!controller.signal.aborted)setStatus(reason instanceof Error?reason.message:'The workspace request failed.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  if(!modelMatches())return null;
  const expired=Date.parse(session.expiresAt)<=Date.now();
  const canSave=session.historyEnabled?session.editingEnabled:session.role==='edit';
  const button='min-h-11 rounded border border-blue-400 px-3 text-sm disabled:opacity-50';
  return <div className="flex max-h-[40dvh] flex-wrap items-center gap-2 overflow-y-auto bg-blue-50 px-4 py-2 text-sm text-blue-950 dark:bg-blue-950/40 dark:text-blue-200">
    <p className="w-full">Public {session.includeWorkspace===false?'model link':'workspace'} · {session.historyEnabled?`viewing version ${viewing}`:`revision ${session.revision}`} · expires {new Date(session.expiresAt).toLocaleDateString()}. {session.includeWorkspace===false?'Changes stay on this device.':'Changes stay on this device until you click Save workspace.'}</p>
    {session.historyEnabled&&session.includeWorkspace&&<>
      <label>Saved version <select aria-label="Saved workspace version" disabled={busy} className="min-h-11 max-w-[60vw] rounded border bg-white px-2 text-zinc-900" value={selected} onChange={event=>setSelected(Number(event.target.value))}>
        {items.map(item=><option key={item.version} value={item.version}>v{item.version} · {item.author} · {new Date(item.savedAt).toLocaleString()}</option>)}
      </select></label>
      <button className={button} disabled={busy||expired||!items.length} onClick={()=>{
        if(!window.confirm('Load this saved version? Unsaved changes on this device will be replaced.'))return;
        void run(async signal=>{const data=await loadWorkspaceVersion(session.token,selected,session.modelIdentity,signal);if(signal.aborted||!modelMatches())return;
          await manager.restoreShareWorkspace(data.workspace);if(signal.aborted||!modelMatches())return;
          setViewing(selected);onSaved(data.revision,session.expiresAt);setStatus(`Viewing version ${selected}. Saving creates a new version; this saved version is preserved.`);
        });
      }}>Load selected version</button>
      <button className={button} disabled={busy||expired} onClick={()=>void run(async signal=>{const data=await listWorkspaceHistory(session.token,signal);if(!signal.aborted){setItems(data.items);setStatus('History refreshed. Load the latest version before saving after a conflict.');}})}>Refresh history</button>
      <p className="w-full text-xs">The latest 20 saved versions are retained. Display names are supplied by editors.</p>
      {session.editingEnabled&&<label>Display name<input aria-label="Revision display name" maxLength={80} value={author} onChange={event=>setAuthor(event.target.value)} className="ml-2 min-h-11 rounded border bg-white px-2 text-zinc-900"/></label>}
      {!session.editingEnabled&&<p>Editing is disabled by the administrator.</p>}
    </>}
    {canSave&&<button disabled={busy||expired||(session.historyEnabled&&!author.trim())} className={`${button} bg-blue-600 font-semibold text-white`} onClick={()=>void run(async signal=>{
      if(!modelMatches())throw new Error('A different model is open. Reload the workspace before saving.');
      const result=await saveProtectedWorkspace(session.token,{workspace:manager.exportShareWorkspace(),modelIdentity:session.modelIdentity,revision:session.revision,...(session.historyEnabled?{author}: {})},signal);
      if(signal.aborted||!modelMatches())return;
      onSaved(result.revision,result.expiresAt);if(result.workspaceVersion){setViewing(result.workspaceVersion);setSelected(result.workspaceVersion);}
      setStatus('Workspace saved. Everyone using this public URL can view the saved version.');
      if(session.historyEnabled){const history=await listWorkspaceHistory(session.token,signal);if(!signal.aborted)setItems(history.items);}
    })}>{busy?'Working…':'Save workspace'}</button>}
    {status&&<p role="status" className="w-full">{status}</p>}
  </div>;
}
