import { useEffect,useRef,useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useViewer } from '../context/ViewerContext';
import { useUserSession } from '../context/UserSessionContext';
import { createProtectedShare,protectedWorkspaceUrl,shareWorkspaceWithSession } from '../lib/sharedWorkspace';
import { modelOnlySnapshot,modelShareLinks,type ModelShareLink } from '../lib/modelShareLinks';
import { defaultWorkspaceName,localDateTime,workspaceExpiry,WORKSPACE_MAX_AGE_MS } from '../lib/workspaceSharing';
import { dataURIToBlob,safeOpenWindow } from '../lib/utils';
import logoImg from '../assets/logo.png';

export function ModelShareDialog({onClose}:{onClose:()=>void}) {
  const {loadedUrl,filename,isEmpty}=useViewer();
  const auth=useUserSession(),canShare=auth.hasPermission('workspace:share');
  const manager=window._viewerManagerInstance;
  const [modelLink,setModelLink]=useState<ModelShareLink|null>(null),[workspaceLink,setWorkspaceLink]=useState('');
  const [workspace,setWorkspace]=useState(false),[name,setName]=useState(()=>defaultWorkspaceName(filename));
  const [expiry,setExpiry]=useState(()=>localDateTime(Date.now()+WORKSPACE_MAX_AGE_MS));
  const [preparing,setPreparing]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const [retry,setRetry]=useState(0);
  const operation=useRef<AbortController|null>(null);
  const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  let sourceToken:string|undefined;
  if(loadedUrl){const source=new URL(loadedUrl,window.location.origin);if(source.origin===window.location.origin)sourceToken=/^\/api\/shares\/([a-f0-9]{64})\/model\.(?:stl|3mf|glb)$/.exec(source.pathname)?.[1];}
  const existingWorkspace=!!sourceToken&&manager?.sharedWorkspaceIncludesPlanning!==false;
  const identity=manager?.loadedModelIdentity||'';
  const modelPhase=manager?.modelLoadState?.phase;
  const activeLink=workspace&&canShare?workspaceLink:modelLink?.url||'';
  useEffect(()=>{
    let current=true;
    operation.current?.abort();setBusy(false);setWorkspace(false);setWorkspaceLink('');setName(defaultWorkspaceName(filename));setExpiry(localDateTime(Date.now()+WORKSPACE_MAX_AGE_MS));
    setPreparing(true);setError('');setModelLink(null);
    if(!manager||isEmpty||!loadedUrl){setPreparing(false);return;}
    if(modelPhase&&modelPhase!=='ready')return;
    if(manager.loadedModelShareable===false){setError('Use a self-contained STL, 3MF or GLB model.');setPreparing(false);return;}
    if(sourceToken&&!existingWorkspace){
      const link={token:sourceToken,url:protectedWorkspaceUrl(`/s/${sourceToken}`),expiresAt:manager.sharedWorkspaceExpiresAt||new Date(Date.now()+WORKSPACE_MAX_AGE_MS).toISOString()};
      if(Date.parse(link.expiresAt)>Date.now())setModelLink(link);else setError('This model link has expired.');setPreparing(false);return;
    }
    // Metadata-only provisioning finishes once and survives closing/reopening the dialog.
    void modelShareLinks(manager).get(`${loadedUrl}\n${identity}`,async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('The sharing request timed out.')),20_000);
      try{return await createProtectedShare({...(sourceToken?{sourceShareToken:sourceToken}:{sourceUrl:loadedUrl}),workspace:modelOnlySnapshot(manager),modelIdentity:identity,includeWorkspace:false},'',controller.signal);}finally{clearTimeout(timer);}
    }).then(link=>{if(current)setModelLink(link);}).catch(reason=>{if(current)setError(reason instanceof Error?reason.message:'The link could not be prepared.');}).finally(()=>{if(current)setPreparing(false);});
    return()=>{current=false;};
  },[manager,loadedUrl,identity,modelPhase,isEmpty,retry]);
  useEffect(()=>()=>{operation.current?.abort();if(feedbackTimer.current)clearTimeout(feedbackTimer.current);},[]);
  useEffect(()=>{if(!canShare){operation.current?.abort();setBusy(false);setWorkspace(false);setWorkspaceLink('');}},[canShare]);
  const createWorkspace=async()=>{
    if(busy)return;
    if(!canShare){auth.openLogin();return;}
    const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try{
      if(existingWorkspace){const url=await shareWorkspaceWithSession(sourceToken!,controller.signal);if(!controller.signal.aborted)setWorkspaceLink(url);return;}
      if(!name.trim())throw new Error('Enter a workspace name.');
      if(manager?.loadedModelShareable===false)throw new Error('Export a self-contained STL, 3MF or GLB before sharing this workspace.');
      const result=await createProtectedShare({...(sourceToken?{sourceShareToken:sourceToken}:{sourceUrl:loadedUrl!}),workspace:manager.exportShareWorkspace(),modelIdentity:identity,includeWorkspace:true,label:name.trim(),expiresAt:workspaceExpiry(expiry)},'',controller.signal);
      if(!controller.signal.aborted)setWorkspaceLink(result.url);
    }catch(reason){if(!controller.signal.aborted){if(reason instanceof Error&&reason.name==='LoginRequiredError')auth.requireLogin();else setError(reason instanceof Error?reason.message:'The workspace link could not be created.');}}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const copy=async()=>{
    if(!activeLink)return;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(activeLink);
      else{const field=document.createElement('textarea');field.value=activeLink;field.style.position='fixed';field.style.top='-9999px';document.body.appendChild(field);field.select();try{if(!document.execCommand('copy'))throw new Error('Copy failed.');}finally{field.remove();}}
      setCopied(true);feedbackTimer.current=setTimeout(()=>setCopied(false),2000);
    }catch{setError('Select and copy the link above.');}
  };
  const whatsapp=async()=>{
    if(!activeLink)return;
    try{
      const data=manager?.captureSnapshot?.(1920,1080,false);
      if(data&&navigator.canShare){const file=new File([dataURIToBlob(data)],`${(filename||'snapshot').replace(/\.[^/.]+$/,'')}_snapshot.png`,{type:'image/png'});if(navigator.canShare({files:[file]})){await navigator.share({title:'3D Model',text:activeLink,files:[file]});return;}}
    }catch(reason){if(reason instanceof Error&&reason.name==='AbortError')return;}
    safeOpenWindow(`https://wa.me/?text=${encodeURIComponent(activeLink)}`);
  };
  return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-zinc-900/60 p-4" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="share-model-title" className="max-h-[90dvh] w-[450px] max-w-full overflow-y-auto rounded-sm border border-zinc-200 bg-white p-5 shadow-xl sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 id="share-model-title" className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-800 dark:text-zinc-200">Share Model</h3>
      <p className="mb-5 font-mono text-xs text-zinc-500 dark:text-zinc-400">Scan the QR code or copy the link below to share this model:</p>
      <div className="mb-6 flex flex-col gap-4">
        <div className="mx-auto flex h-[202px] w-[202px] items-center justify-center rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800">
          {activeLink?<QRCodeSVG value={activeLink} size={168} level="H" imageSettings={{src:logoImg,height:38,width:38,excavate:true}}/>:<span role="status" className="text-center text-xs text-zinc-500">{preparing?'Preparing link…':workspace?'Enter workspace details.':'Link unavailable.'}</span>}
        </div>
        <input aria-label="Share link" readOnly value={activeLink} onFocus={event=>event.target.select()} className="w-full rounded-sm border border-zinc-300 bg-zinc-50 p-3 font-mono text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"/>
      </div>
      {canShare&&loadedUrl&&<label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"><input type="checkbox" checked={workspace} disabled={busy} onChange={event=>{const checked=event.target.checked;setWorkspace(checked);setError('');setCopied(false);if(checked&&existingWorkspace)void createWorkspace();}}/>Share workspace</label>}
      {workspace&&canShare&&!existingWorkspace&&!workspaceLink&&<form className="mb-4 space-y-3" onSubmit={event=>{event.preventDefault();void createWorkspace();}}>
        <label className="block text-sm">Workspace name<input aria-label="Workspace name" required maxLength={128} value={name} onChange={event=>setName(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        <label className="block text-sm">Expiry Date<input aria-label="Workspace sharing expiry" type="datetime-local" required min={localDateTime(Date.now()+60_000)} max={localDateTime(Date.now()+WORKSPACE_MAX_AGE_MS)} value={expiry} onChange={event=>setExpiry(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        <button disabled={busy||!name.trim()} className="min-h-11 rounded bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?'Creating…':'Create workspace link'}</button>
      </form>}
      {(!loadedUrl||isEmpty)&&<p role="alert" className="text-xs text-red-600">Load a model from a URL before sharing.</p>}
      {error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}{!workspace&&loadedUrl&&<button className="ml-2 underline" onClick={()=>setRetry(value=>value+1)}>Retry</button>}</p>}
      <div className="mt-6 flex w-full items-center justify-end gap-3">
        <button onClick={onClose} className="flex h-10 max-w-[120px] flex-1 items-center justify-center rounded-sm border border-zinc-300 px-2 text-[10px] font-bold uppercase tracking-wide sm:px-3 sm:text-xs sm:tracking-widest text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Close</button>
        <button disabled={!activeLink} onClick={()=>void whatsapp()} className="flex h-10 max-w-[130px] flex-1 items-center justify-center gap-1.5 rounded-sm bg-green-600 px-2 text-[10px] font-bold uppercase tracking-wide sm:px-3 sm:text-xs sm:tracking-widest text-white hover:bg-green-700 disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><span className="truncate">WhatsApp</span>
        </button>
        <button disabled={!activeLink} onClick={()=>void copy()} className="flex h-10 max-w-[130px] flex-1 items-center justify-center rounded-sm bg-blue-600 px-2 text-[10px] font-bold uppercase tracking-wide sm:px-3 sm:text-xs sm:tracking-widest text-white hover:bg-blue-700 disabled:opacity-50"><span className="truncate">{copied?'Copied!':'Copy Link'}</span></button>
      </div>
    </div>
  </div>;
}
