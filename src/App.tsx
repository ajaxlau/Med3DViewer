import { useState, useEffect, useRef } from 'react';
import { ViewerProvider, useViewer } from './context/ViewerContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SystemStatusSidebar } from './components/SystemStatusSidebar';
import { ViewerCanvas } from './components/ViewerCanvas';
import { Modals } from './components/Modals';
import { PlanningMenu } from './components/PlanningMenu';
import { isSafeModelUrl } from './lib/utils';

// Add the global reference for easy hacky access in simple DOM events (like file inputs)
declare global {
  interface Window {
    _viewerManagerInstance: any;
  }
}

function MainLayout() {
  const { viewerManager, activeModal, isEmpty } = useViewer();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [systemStatusOpen, setSystemStatusOpen] = useState(true);
  const prevIsEmptyRef = useRef(isEmpty);

  useEffect(() => {
    // Hide sidebar automatically once model is loaded
    if (prevIsEmptyRef.current && !isEmpty) {
      setSystemStatusOpen(false);
    } else if (!prevIsEmptyRef.current && isEmpty) {
      // Re-open by default when workspace is empty
      setSystemStatusOpen(true);
    }
    prevIsEmptyRef.current = isEmpty;
  }, [isEmpty]);

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
  }, [viewerManager, activeModal, isEmpty, systemStatusOpen, sidebarCollapsed]);

  useEffect(() => {
    if (viewerManager) {
      window._viewerManagerInstance = viewerManager;
      
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
          console.warn("[Security] Blocked modelUrl with unsafe scheme:", modelUrl);
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

  const toggleSystemStatus = () => {
    setSystemStatusOpen(prev => !prev);
    setTimeout(() => {
      if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
      if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
    }, 300);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
    setTimeout(() => {
      if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
      if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
    }, 300);
  };

  return (
    <div className="flex flex-col h-dvh w-dvw overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 transition-colors">
      <div className="flex flex-col flex-1 overflow-hidden ">
        <Header 
          toggleSidebar={toggleSidebar}
          systemStatusOpen={systemStatusOpen}
          toggleSystemStatus={toggleSystemStatus}
        />
        <div className="flex flex-1 min-h-0 relative flex-col md:flex-row">
          {systemStatusOpen && (
            <SystemStatusSidebar onClose={() => {
              setSystemStatusOpen(false);
              setTimeout(() => {
                if (viewerManager && viewerManager.viewer) viewerManager.viewer.Resize();
                if (viewerManager && viewerManager.rulersVisible) viewerManager.resizeRulers();
              }, 300);
            }} />
          )}
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
  return (
    <ViewerProvider>
      <MainLayout />
    </ViewerProvider>
  );
}
