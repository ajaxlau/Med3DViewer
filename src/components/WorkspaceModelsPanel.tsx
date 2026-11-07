import { useEffect,useRef,useState } from 'react';
import { useViewer } from '../context/ViewerContext';
import { useUserSession } from '../context/UserSessionContext';
import { listModels,uploadModel,completeUpload,cancelUpload,type UploadedModel } from '../lib/modelUploads';
import { SectionControls,SECTION_COLLAPSE_DELAY_MS,SECTION_EXPANSION_CLASS } from './SectionControls';
import { shouldIgnoreHover } from '../lib/utils';
import type { SharedWorkspaceSession } from './SharedWorkspaceBar';
export function WorkspaceModelsPanel({session,onLoad,onLocal,onUrl,embedded=false}:{embedded?:boolean;onLocal:(files:FileList,signal:AbortSignal)=>Promise<void>;onUrl:(url:string,signal:AbortSignal)=>Promise<void>;session:SharedWorkspaceSession|null;onLoad:(asset:UploadedModel,signal:AbortSignal)=>Promise<void>}){
 const {viewerManager}=useViewer(),auth=useUserSession();
 const [open,setOpen]=useState(true),[pinned,setPinned]=useState(false),[items,setItems]=useState<UploadedModel[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(''),[url,setUrl]=useState(''),[showUrl,setShowUrl]=useState(false);
 const controller=useRef<AbortController|null>(null),uploadId=useRef(''),container=useRef<HTMLElement|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const canUpload=auth.hasPermission('workspace:share')&&(!session||!!session.editingEnabled),canCatalog=!!session?.includeWorkspace||auth.hasPermission('workspace:share');
 const clear=()=>{if(timer.current)clearTimeout(timer.current);};
 useEffect(()=>()=>{clear();controller.current?.abort();},[]);
 useEffect(()=>{controller.current?.abort();setItems([]);setError('');setBusy('');setPending('');uploadId.current='';if(canCatalog)void refresh();},[session?.token,auth.user?.id,canCatalog]);
 const run=async(action:(signal:AbortSignal)=>Promise<void>)=>{if(controller.current)return;const request=new AbortController();controller.current=request;setError('');try{await action(request.signal);}catch(reason){if(!request.signal.aborted){if(reason instanceof Error&&reason.name==='LoginRequiredError')auth.requireLogin();setError(reason instanceof Error?reason.message:'Model request failed.');}}finally{if(controller.current===request){controller.current=null;setBusy('');}}};
 async function refresh(){controller.current?.abort();controller.current=null;await run(async signal=>{setBusy('Refreshing…');const assets=await listModels(session?.includeWorkspace?session.token:undefined,signal);if(!signal.aborted)setItems(assets);});}
 const local=()=>{const input=document.createElement('input');input.type='file';input.accept='.stl,.3mf';input.onchange=()=>{if(input.files?.length)void run(async signal=>{setBusy('Opening local model…');await onLocal(input.files!,signal);});};input.click();};
 const upload=()=>{
  if(!canUpload){auth.openLogin();return;}const input=document.createElement('input');input.type='file';input.accept='.stl,.3mf';input.onchange=()=>{const file=input.files?.[0];if(!file||!viewerManager)return;
   void run(async signal=>{setPending('');uploadId.current='';setBusy('Checking model…');try{
    const asset=await uploadModel(file,{signal,capabilities:viewerManager.gpuCapabilities,safeMode:viewerManager.forceSafeMode,workspaceToken:session?.includeWorkspace?session.token:undefined,onSession:id=>{uploadId.current=id;},onProgress:value=>setBusy(`Uploading ${value}%`)});
    if(signal.aborted)return;uploadId.current='';setItems(previous=>[asset,...previous.filter(a=>a.id!==asset.id)]);setBusy('Model uploaded.');
    if(!session&&(viewerManager.modelLoadState.phase!=='ready'||window.confirm('Open the uploaded model? Unsaved analytics will be cleared.')))await onLoad(asset,signal);
   }catch(reason){if(!signal.aborted&&uploadId.current&&reason instanceof Error&&reason.message.includes('completion is not confirmed'))setPending(uploadId.current);throw reason;}
   });};input.click();
 };
 const button='min-h-11 rounded border border-zinc-300 px-3 text-xs disabled:opacity-50 dark:border-zinc-700';
 const selected=viewerManager&&(viewerManager as any).cloudModelAsset?.requestId===viewerManager.modelLoadState.requestId?(viewerManager as any).cloudModelAsset?.id:'';
 const content=<>
   <button type="button" className={button+' w-full'} disabled={!!busy} onClick={local}>Open local model</button>
   <button type="button" className={button+' w-full'} disabled={!!busy} onClick={()=>setShowUrl(!showUrl)}>Open Dropbox link</button>
   {showUrl&&<form className="space-y-2" onSubmit={event=>{event.preventDefault();void run(async signal=>{setBusy('Opening Dropbox model…');await onUrl(url.trim(),signal);});}}><label className="block text-xs">Dropbox model link<input aria-label="Dropbox model link" type="url" required value={url} onChange={event=>setUrl(event.target.value)} className="mt-1 min-h-11 w-full rounded border bg-transparent px-2"/></label><button className={button} disabled={!!busy}>Open link</button></form>}
   {canCatalog&&<label className="block text-[11px] uppercase tracking-wide">Available models<select aria-label="Available workspace models" className="mt-1 min-h-11 w-full rounded border border-zinc-300 bg-white px-2 text-xs normal-case tracking-normal dark:border-zinc-700 dark:bg-zinc-950" value={selected||''} disabled={!!busy||!items.length} onChange={event=>{const asset=items.find(item=>item.id===event.target.value);if(asset)void run(async signal=>{if(viewerManager&&!viewerManager.isEmpty&&!window.confirm('Open this model? Unsaved analytics will be cleared. Saved revisions are kept.'))return;setBusy('Opening model…');await onLoad(asset,signal);});}}><option value="">Select a model</option>{items.map(asset=><option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>}
   <div className="flex flex-wrap gap-2">{canUpload&&<button type="button" className={button+' bg-blue-600 text-white'} disabled={!!busy} onClick={upload}>{canUpload?'Upload to Dropbox':'Log in to upload'}</button>}{canCatalog&&<button type="button" className={button} disabled={!!busy} onClick={()=>void refresh()}>Refresh models</button>}</div>
   {busy&&<div role="status" className="text-xs">{busy}<button type="button" className="ml-2 underline" onClick={()=>{controller.current?.abort();controller.current=null;setBusy('');setPending('');if(uploadId.current)void cancelUpload(uploadId.current).catch(()=>{});}}>Cancel</button></div>}
   {error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
   {pending&&<button className={button} disabled={!!busy} onClick={()=>void run(async signal=>{setBusy('Confirming upload…');const asset=await completeUpload(pending,signal);setPending('');uploadId.current='';setItems(previous=>[asset,...previous.filter(item=>item.id!==asset.id)]);if(!session&&(viewerManager.modelLoadState.phase!=='ready'||window.confirm('Open the uploaded model? Unsaved analytics will be cleared.')))await onLoad(asset,signal);})}>Retry completion</button>}
 </>;
 if(embedded)return <div className="space-y-3">{content}</div>;
 return <section ref={container} aria-label="Workspace controls" className="rounded-lg border border-zinc-200 bg-zinc-50/70 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100" onMouseEnter={()=>{if(!shouldIgnoreHover()){clear();setOpen(true);}}} onMouseLeave={event=>{if(shouldIgnoreHover()||pinned||event.buttons)return;clear();timer.current=setTimeout(()=>{if(!container.current?.contains(document.activeElement)&&!controller.current)setOpen(false);},SECTION_COLLAPSE_DELAY_MS);}}>
 <div className="flex items-center gap-2 px-3 py-2"><button type="button" className="flex-1 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200" aria-expanded={open} onClick={()=>setOpen(!open)}>Workspace Revision</button><SectionControls label="workspace revisions" expanded={open} pinned={pinned} onToggle={()=>setOpen(!open)} onPin={()=>{setPinned(!pinned);setOpen(true);clear();}}/></div>
 <div aria-hidden={!open} className={SECTION_EXPANSION_CLASS} style={{gridTemplateRows:open?'1fr':'0fr',opacity:open?1:0}} inert={!open}><div className="min-h-0 overflow-hidden"><div className="space-y-3 px-3 pb-3">{content}</div></div></div>
 </section>;
}
