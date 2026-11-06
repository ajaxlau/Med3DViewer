import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { UserSessionProvider } from './context/UserSessionContext';
import { ViewerProvider, useViewer } from './context/ViewerContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ViewerCanvas } from './components/ViewerCanvas';
import { Modals } from './components/Modals';
import { PlanningMenu } from './components/PlanningMenu';
import { isSafeModelUrl } from './lib/utils';
import { beginSharedModelImport, captureModelLoad, loadSharedModel, tokenFromSharePath, waitForSharedModelReady } from './lib/sharedWorkspace';
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
  const { viewerManager, activeModal, isEmpty, modelLoadState } = useViewer();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sharedNotice, setSharedNotice] = useState<{ loading: boolean; error?: boolean; text: string } | null>(null);
  const sharedAbortRef = useRef<AbortController | null>(null);
  const [sharedSession,setSharedSession]=useState<SharedWorkspaceSession|null>(null);
  useEffect(()=>{
    if(sharedSession&&modelLoadState.requestId!==sharedSession.requestId){setSharedSession(null);setSharedNotice(null);}
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
            viewerManager.sharedWorkspaceExpiresAt = metadata.expiresAt;
            viewerManager.sharedWorkspaceRole = metadata.role;
            viewerManager.sharedWorkspaceIncludesPlanning = metadata.includeWorkspace !== false;
            viewerManager.sharedWorkspaceViewUrl = metadata.viewUrl ?? (metadata.role==='view'?`${window.location.origin}/s/${token}`:null);
            setSharedSession({token,role:metadata.role,revision:metadata.revision,workspaceName:metadata.workspaceName,historyEnabled:metadata.historyEnabled,includeWorkspace:metadata.includeWorkspace,editingEnabled:metadata.editingEnabled,workspaceVersion:metadata.workspaceVersion,modelIdentity:metadata.modelIdentity,requestId:importId!,expiresAt:metadata.expiresAt});
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
        {sharedSession&&viewerManager&&<SharedWorkspaceBar session={sharedSession} manager={viewerManager} onSaved={(revision,expiresAt)=>{
          setSharedSession(previous=>previous&&previous.token===sharedSession.token?{...previous,revision,expiresAt}:previous);
          viewerManager.sharedWorkspaceExpiresAt=expiresAt;
        }} />}
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
          <ViewerCanvas />
          <PlanningMenu />
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
