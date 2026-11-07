import {useUserSession} from './context/UserSessionContext';
import { WorkspaceModelsPanel } from './components/WorkspaceModelsPanel';
import { downloadModel, type UploadedModel } from './lib/modelUploads';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { UserSessionProvider } from './context/UserSessionContext';
import { ViewerProvider, useViewer } from './context/ViewerContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ViewerCanvas } from './components/ViewerCanvas';
import { Modals } from './components/Modals';
import { PlanningMenu } from './components/PlanningMenu';
import { isSafeModelUrl } from './lib/utils';
import { beginSharedModelImport, captureModelLoad, loadSharedModel, loadSharedWorkspaceMetadata, loadWorkspaceVersion, tokenFromSharePath, waitForSharedModelReady } from './lib/sharedWorkspace';
import { getDeviceLoadProfile } from './lib/modelLoading';
import { SharedWorkspaceBar, type SharedWorkspaceSession } from './components/SharedWorkspaceBar';
const ShareAdminPage=lazy(()=>import('./components/ShareAdminPage'));

// Add the global reference for easy hacky access in simple DOM events (like file inputs)
declare global {
  interface Window {
    _viewerManagerInstance: any;
  }
}

function MainLayout() {
  const auth=useUserSession();
  const { viewerManager, activeModal, isEmpty, modelLoadState, setActiveModal } = useViewer();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sharedNotice, setSharedNotice] = useState<{ loading: boolean; error?: boolean; text: string } | null>(null);
  const sharedAbortRef = useRef<AbortController | null>(null);
  const [sharedSession,setSharedSession]=useState<SharedWorkspaceSession|null>(null);
  const sharedTransition=useRef(false),workspaceOperation=useRef(0);
  const ensureWorkspaceOperation=(operation:number,signal:AbortSignal)=>{signal.throwIfAborted();if(operation!==workspaceOperation.current)throw new DOMException('A newer workspace action replaced this request.','AbortError');};
  useEffect(()=>{
    if(!sharedTransition.current&&sharedSession&&modelLoadState.requestId!==sharedSession.requestId){setSharedSession(null);setSharedNotice(null);}
  },[modelLoadState.requestId,sharedSession]);

  useEffect(() => {
    let timer1 = setTimeout(() => {
      if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
      if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
    }, 10);
    let timer2 = setTimeout(() => {
      if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
      if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
    }, 300);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [viewerManager, activeModal, isEmpty, sidebarCollapsed]);

  useEffect(() => {
    if (viewerManager) {
      window._viewerManagerInstance = viewerManager;
      const sharePath = window.location.pathname.startsWith('/s/');
      const token = tokenFromSharePath(window.location.pathname);
      if (sharePath) {
        if (!token) {
          setSharedNotice({ loading: false, error: true, text: 'This share address is invalid. Ask its owner for a new link.' });
          return;
        }
        const controller = new AbortController();
        sharedAbortRef.current = controller;
        let importId: string | null = null;
        const initialLoad = captureModelLoad(viewerManager);
        setSharedNotice({ loading: true, text: 'Opening shared workspace…' });
        void (async () => {
          try {
            const { metadata, file } = await loadSharedModel(token, {
              signal: controller.signal,
              capabilities: viewerManager.gpuCapabilities,
              safeMode: viewerManager.forceSafeMode,
              onProgress: (received, total) => setSharedNotice({ loading: true, text: total
                ? `Downloading shared model: ${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`
                : `Downloading shared model: ${(received / 1048576).toFixed(1)} MB` })
            });
            controller.signal.throwIfAborted();
            setSharedNotice({ loading: true, text: 'Model identity verified. Opening model and planning data…' });
            const importJob = beginSharedModelImport(viewerManager, file, initialLoad, controller.signal);
            importId = importJob.requestId;
            await importJob.completion;
            const profile = getDeviceLoadProfile(viewerManager.gpuCapabilities, viewerManager.forceSafeMode);
            await waitForSharedModelReady(viewerManager, importId!, controller.signal, profile.maxWaitMs + 10_000);
            controller.signal.throwIfAborted();
            if (viewerManager.modelLoadState.requestId !== importId) throw new Error('A newer model load replaced this shared workspace.');
            await viewerManager.restoreShareWorkspace(metadata.workspace);
            controller.signal.throwIfAborted();
            viewerManager.loadedUrl = metadata.modelUrl;
            viewerManager.loadedModelIdentity = metadata.modelIdentity;
            (viewerManager as any).cloudModelAsset=metadata.modelAssetId?{id:metadata.modelAssetId,requestId:importId}:null;
            viewerManager.sharedWorkspaceExpiresAt = metadata.expiresAt;
            viewerManager.sharedWorkspaceRole = metadata.role;
            viewerManager.sharedWorkspaceIncludesPlanning = metadata.includeWorkspace !== false;
            viewerManager.sharedWorkspaceViewUrl = metadata.viewUrl ?? (metadata.role==='view'?`${window.location.origin}/s/${token}`:null);
            setSharedSession({token,role:metadata.role,revision:metadata.revision,workspaceName:metadata.workspaceName,historyEnabled:metadata.historyEnabled,includeWorkspace:metadata.includeWorkspace,editingEnabled:metadata.editingEnabled,workspaceVersion:metadata.workspaceVersion,modelHistoryEnabled:metadata.modelUrl.includes('/revisions/'),modelAssetId:metadata.modelAssetId,modelIdentity:metadata.modelIdentity,requestId:importId!,expiresAt:metadata.expiresAt});
            viewerManager.config.onStatusChange('Shared workspace loaded.', false, file.name, metadata.modelUrl);
            setSharedNotice(null);
          } catch (error) {
            if (controller.signal.aborted) {
              if (importId && viewerManager.activeLoadRequestId === importId) viewerManager.cancelModelLoad();
              setSharedNotice({ loading: false, text: 'Opening the shared workspace was cancelled.' });
            } else {
              setSharedNotice({ loading: false, error: true, text: error instanceof Error ? error.message : 'The shared workspace could not be opened.' });
            }
          }
        })();
        return () => {
          controller.abort();
          if (importId && viewerManager.activeLoadRequestId === importId) viewerManager.cancelModelLoad();
          if (sharedAbortRef.current === controller) sharedAbortRef.current = null;
        };
      }
      
      // Auto-load logic from URL attributes when viewer settles
      const hash = window.location.hash;
      let modelUrl = null;
      let pendingCamera = undefined;
      
      if (hash && hash.startsWith('#model=')) {
          try {
              const hashParams = hash.substring(7).split('$');
              modelUrl = decodeURIComponent(hashParams[0]);
              const camParam = hashParams.find((p: string) => p.startsWith('camera='));
              if (camParam) {
                  pendingCamera = camParam.substring(7).split(',').map(Number);
              }
          } catch (e) { console.warn("Could not decode hash parameter", e); }
      }
      if (!modelUrl) {
          try { const urlParams = new URLSearchParams(window.location.search); modelUrl = urlParams.get('url'); } 
          catch (e) { console.warn("Could not decode query parameter", e); }
      }

      let timer3: any;
      if (modelUrl && isSafeModelUrl(modelUrl)) {
          timer3 = setTimeout(() => { viewerManager.loadUrl(modelUrl, pendingCamera); }, 100);
      } else if (modelUrl) {
          console.warn("[Security] Blocked model URL with unsafe scheme.");
      }
      return () => { if (timer3) clearTimeout(timer3); };
    }
  }, [viewerManager]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (viewerManager) {
        if (e.key.toLowerCase() === 'r') {
          viewerManager.resetCamera();
        } else if (e.key === '1') {
          viewerManager.setView('front');
        } else if (e.key === '2') {
          viewerManager.setView('back');
        } else if (e.key === '3') {
          viewerManager.setView('left');
        } else if (e.key === '4') {
          viewerManager.setView('right');
        } else if (e.key === '5') {
          viewerManager.setView('top');
        } else if (e.key === '6') {
          viewerManager.setView('bottom');
        }
      }
      
      if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) {
          const promise = document.documentElement.requestFullscreen();
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
          }
        } else {
          const promise = document.exitFullscreen();
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerManager]);

  const openWorkspaceModel=async(asset:UploadedModel,signal:AbortSignal)=>{
    if(!viewerManager)throw new Error('The viewer is not ready.');
    const operation=++workspaceOperation.current,previous=sharedSession,initial=captureModelLoad(viewerManager);sharedTransition.current=true;
    try{
      const file=await downloadModel(asset,previous?.includeWorkspace?previous.token:undefined,{signal,capabilities:viewerManager.gpuCapabilities,safeMode:viewerManager.forceSafeMode});
      ensureWorkspaceOperation(operation,signal);const job=beginSharedModelImport(viewerManager,file,initial,signal);await job.completion;
      await waitForSharedModelReady(viewerManager,job.requestId!,signal,getDeviceLoadProfile(viewerManager.gpuCapabilities,viewerManager.forceSafeMode).maxWaitMs+10000);
      ensureWorkspaceOperation(operation,signal);viewerManager.loadedModelIdentity=asset.modelIdentity;
      (viewerManager as any).cloudModelAsset={id:asset.id,requestId:job.requestId};
      const url=previous?.includeWorkspace?`/api/shares/${previous.token}/models/${asset.id}/model.${asset.extension}`:`/api/shares/models/${asset.id}/model.${asset.extension}`;
      viewerManager.loadedUrl=new URL(url,window.location.origin).href;
      viewerManager.config.onStatusChange('Model opened.',false,file.name,viewerManager.loadedUrl);
      if(previous?.includeWorkspace)setSharedSession({...previous,modelAssetId:asset.id,modelIdentity:asset.modelIdentity,localDraft:false,requestId:job.requestId!});else setSharedSession(null);
    }catch(reason){if(operation===workspaceOperation.current&&viewerManager.modelLoadState.requestId!==initial.requestId)setSharedSession(null);throw reason;}
    finally{if(operation===workspaceOperation.current)sharedTransition.current=false;}
  };
  const openWorkspaceRevision=async(version:number,signal:AbortSignal)=>{
    if(!viewerManager||!sharedSession)return;
    const operation=++workspaceOperation.current,previous=sharedSession,initial=captureModelLoad(viewerManager);sharedTransition.current=true;
    try{
      if(!previous.modelHistoryEnabled&&!previous.localDraft){
        const old=await loadWorkspaceVersion(previous.token,version,previous.modelIdentity,signal);
        ensureWorkspaceOperation(operation,signal);await viewerManager.restoreShareWorkspace(old.workspace);ensureWorkspaceOperation(operation,signal);
        setSharedSession({...previous,revision:old.revision,workspaceVersion:version,localDraft:false});return;
      }
      const metadata=await loadSharedWorkspaceMetadata(previous.token,{...(previous.modelHistoryEnabled?{version}:{}),signal});
      ensureWorkspaceOperation(operation,signal);let requestId=previous.requestId,filename=viewerManager.loadedFilename;
      if(metadata.modelIdentity!==viewerManager.loadedModelIdentity||previous.localDraft){
        const {file}=await loadSharedModel(previous.token,{metadata,signal,capabilities:viewerManager.gpuCapabilities,safeMode:viewerManager.forceSafeMode});
        ensureWorkspaceOperation(operation,signal);const job=beginSharedModelImport(viewerManager,file,initial,signal);requestId=job.requestId!;await job.completion;filename=file.name;
        await waitForSharedModelReady(viewerManager,requestId,signal,getDeviceLoadProfile(viewerManager.gpuCapabilities,viewerManager.forceSafeMode).maxWaitMs+10000);
      }
      const workspace=previous.modelHistoryEnabled?metadata.workspace:(await loadWorkspaceVersion(previous.token,version,previous.modelIdentity,signal)).workspace;
      ensureWorkspaceOperation(operation,signal);await viewerManager.restoreShareWorkspace(workspace);ensureWorkspaceOperation(operation,signal);
      viewerManager.loadedModelIdentity=metadata.modelIdentity;viewerManager.loadedUrl=metadata.modelUrl;
      (viewerManager as any).cloudModelAsset=metadata.modelAssetId?{id:metadata.modelAssetId,requestId}:null;
      setSharedSession({...previous,...metadata,token:previous.token,requestId,workspaceVersion:version,localDraft:false});
      viewerManager.config.onStatusChange('Workspace revision opened.',false,filename,metadata.modelUrl);
    }catch(reason){if(operation===workspaceOperation.current&&viewerManager.modelLoadState.requestId!==initial.requestId)setSharedSession(null);throw reason;}
    finally{if(operation===workspaceOperation.current)sharedTransition.current=false;}
  };
  const openLocalDraft=async(files:FileList,signal:AbortSignal)=>{
    if(!viewerManager)return;
    if(viewerManager.modelLoadState.phase==='ready'&&!window.confirm('Open a local model? Unsaved analytics will be cleared.'))return;
    const operation=++workspaceOperation.current,previous=sharedSession,initial=captureModelLoad(viewerManager);sharedTransition.current=true;
    try{const job=beginSharedModelImport(viewerManager,files[0],initial,signal);await job.completion;
      await waitForSharedModelReady(viewerManager,job.requestId!,signal,getDeviceLoadProfile(viewerManager.gpuCapabilities,viewerManager.forceSafeMode).maxWaitMs+10000);
      ensureWorkspaceOperation(operation,signal);(viewerManager as any).cloudModelAsset=null;
      if(previous)setSharedSession({...previous,localDraft:true,modelAssetId:null,requestId:job.requestId!});
    }catch(reason){if(operation===workspaceOperation.current&&viewerManager.modelLoadState.requestId!==initial.requestId)setSharedSession(null);throw reason;}finally{if(operation===workspaceOperation.current)sharedTransition.current=false;}
  };
  const openDropboxDraft=async(url:string,signal:AbortSignal)=>{
    if(!viewerManager)return;
    const source=new URL(url);if(!['www.dropbox.com','dropbox.com','dl.dropboxusercontent.com'].includes(source.hostname)||source.protocol!=='https:')throw new Error('Enter a Dropbox file-sharing link.');
    const operation=++workspaceOperation.current,previous=sharedSession;sharedTransition.current=true;
    let ownId:string|null=null;const cancel=()=>{if(ownId&&viewerManager.activeLoadRequestId===ownId)viewerManager.cancelModelLoad();};signal.addEventListener('abort',cancel,{once:true});
    try{ensureWorkspaceOperation(operation,signal);const loading=viewerManager.loadUrl(url,undefined);ownId=viewerManager.activeLoadRequestId;await loading;ensureWorkspaceOperation(operation,signal);
      if(viewerManager.activeLoadRequestId!==ownId||viewerManager.modelLoadState.phase!=='ready')throw new Error('The Dropbox model could not be opened.');
      ensureWorkspaceOperation(operation,signal);(viewerManager as any).cloudModelAsset=null;
      if(previous)setSharedSession({...previous,localDraft:true,modelAssetId:null,requestId:viewerManager.modelLoadState.requestId!});
    }catch(reason){if(operation===workspaceOperation.current)setSharedSession(null);throw reason;}finally{signal.removeEventListener('abort',cancel);if(operation===workspaceOperation.current)sharedTransition.current=false;}
  };
  const modelControls=<WorkspaceModelsPanel session={sharedSession} embedded={!!sharedSession} onLoad={openWorkspaceModel} onLocal={openLocalDraft} onUrl={openDropboxDraft}/>;
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
    setTimeout(() => {
      if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
      if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
    }, 300);
  };

  return (
    <div className="flex flex-col h-dvh w-dvw overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 transition-colors">
      <div className="flex flex-col flex-1 min-h-0">
        <Header 
          toggleSidebar={toggleSidebar}
        />
        {sharedNotice && (
          <div role={sharedNotice.error ? 'alert' : 'status'} className={`px-4 py-2 text-xs flex items-center justify-between gap-3 ${sharedNotice.error ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'}`}>
            <span>{sharedNotice.text}</span>
            {sharedNotice.loading && <button className="min-h-11 px-3 underline shrink-0" onClick={() => sharedAbortRef.current?.abort()}>Cancel</button>}
          </div>
        )}
        <div className="flex flex-1 min-h-0 relative flex-col md:flex-row overflow-hidden">
          <Sidebar collapsed={sidebarCollapsed} onClose={() => {
            setSidebarCollapsed(true);
            setTimeout(() => {
              if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
              if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
            }, 300);
          }} />
          <ViewerCanvas onWorkspaceModels={auth.user||sharedSession?()=>setActiveModal('planning'):undefined} />
          <PlanningMenu workspaceControls={sharedSession&&viewerManager?<SharedWorkspaceBar modelControls={modelControls} onLoadRevision={openWorkspaceRevision} session={sharedSession} manager={viewerManager} onSaved={(revision,expiresAt)=>{
            setSharedSession(previous=>previous&&previous.token===sharedSession.token?{...previous,revision,expiresAt}:previous);
            viewerManager.sharedWorkspaceExpiresAt=expiresAt;
          }} />:auth.user?modelControls:null} />
        </div>
      </div>
      <Modals />
    </div>
  );
}

export default function App() {
  if(/^\/admin\/shares\/?$/.test(window.location.pathname))return <Suspense fallback={<p className="p-6">Opening workspace manager…</p>}><ShareAdminPage /></Suspense>;
  return (
    <UserSessionProvider>
      <ViewerProvider>
        <MainLayout />
      </ViewerProvider>
    </UserSessionProvider>
  );
}
