import { useEffect, useState, useRef } from 'react';
import { useViewer } from '../context/ViewerContext';
import { BoxSelect, Camera, Move, RotateCw, Scaling, Info, Plus, Maximize, Loader2, MapPin, X } from 'lucide-react';
import { EndoscopyFlyThroughHUD } from './EndoscopyFlyThroughHUD';
import { SplineClippingHUD } from './SplineClippingHUD';

export function ViewerCanvas() {
  const { 
    setContainerRef, setRulerRefs, isEmpty, status, loadingProgress, rulersVisible, 
    viewerManager, filename, setActiveModal,
    backgroundImage, backgroundOpacity,
    isTransformActive, transformMode, activeTransformObjectId, planningObjects,
    planningMode, setPlanningMode, resnappingAnnotationId, setResnappingAnnotationId,
    gpuTier, isContextLost
  } = useViewer();
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [fallbackBannerDismissed, setFallbackBannerDismissed] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const topRulerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftRulerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (topRulerCanvasRef.current && leftRulerCanvasRef.current) {
      setRulerRefs(topRulerCanvasRef.current, leftRulerCanvasRef.current);
    }
  }, [setRulerRefs]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (infoRef.current && !infoRef.current.contains(target) && menuRef.current && !menuRef.current.contains(target)) {
        setShowInfo(false);
        setShowQuickMenu(false);
      }
    }
    function handleWindowBlur() {
        setShowInfo(false);
        setShowQuickMenu(false);
    }
    
    if (showInfo || showQuickMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('blur', handleWindowBlur);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [showInfo, showQuickMenu]);
  
  const handleOpenFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0 && viewerManager) {
        viewerManager.loadFiles(files);
      }
    };
    input.click();
  };

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => { 
      const isFile = e.dataTransfer?.types.includes('Files');
      if (!isFile) return;
      e.preventDefault(); e.stopPropagation(); setIsDragging(true); 
    };
    const handleDragOver = (e: DragEvent) => { 
      const isFile = e.dataTransfer?.types.includes('Files');
      if (!isFile) return;
      e.preventDefault(); e.stopPropagation(); setIsDragging(true); 
    };
    const handleDragLeave = (e: DragEvent) => { 
      e.preventDefault(); e.stopPropagation(); 
      if (e.relatedTarget === null || (e.relatedTarget as Node).nodeName === 'HTML') setIsDragging(false); 
    };
    const handleDrop = (e: DragEvent) => { 
      e.preventDefault(); e.stopPropagation(); 
      setIsDragging(false); 
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        if (viewerManager) viewerManager.loadFiles(e.dataTransfer.files);
      }
    };

    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('drop', handleDrop);

    return () => {
      document.body.removeEventListener('dragenter', handleDragEnter);
      document.body.removeEventListener('dragover', handleDragOver);
      document.body.removeEventListener('dragleave', handleDragLeave);
      document.body.removeEventListener('drop', handleDrop);
    };
  }, [viewerManager]);

  const handleQuickSnapshotShare = async () => {
    if (!viewerManager) return;
    try {
      const dataUrl = viewerManager.captureSnapshot(1920, 1080, false);
      if (dataUrl) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const dlName = filename || 'snapshot';
        const file = new File([blob], `${dlName.replace(/\.[^/.]+$/, "")}_snapshot.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file]
          });
        } else {
           setActiveModal('snapshot');
        }
      }
    } catch (e) {
      console.warn("Failed to share quick snapshot", e);
    }
  };

  return (
    <main className="flex-1 w-full h-full relative bg-white dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
      {/* Background Image Reference */}
      {backgroundImage && (
        <img 
          src={backgroundImage} 
          alt="Reference Background" 
          className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-200"
          style={{ opacity: backgroundOpacity, zIndex: 0 }}
        />
      )}

      {/* 3D Canvas Container */}
      <div 
        ref={(el) => setContainerRef(el)}
        className="w-full h-full outline-none absolute inset-0 mix-blend-normal z-10"
        id="viewer-container"
      />
      
      {/* Transform Floating Buttons */}
      {isTransformActive && activeTransformObjectId && ['plane', 'cylinder', 'custom_model'].includes(planningObjects.find(o => o.id === activeTransformObjectId)?.type || '') && (
        <div className="absolute top-6 right-6 z-20 flex bg-white/90 dark:bg-zinc-800/90 backdrop-blur shadow-md rounded-md p-1 border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => viewerManager?.setTransformMode('translate')}
              className={`p-2 rounded ${transformMode === 'translate' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'} transition-colors`}
              title="Translate"
            >
              <Move size={18} />
            </button>
            <button
              onClick={() => viewerManager?.setTransformMode('rotate')}
              className={`p-2 rounded ${transformMode === 'rotate' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'} transition-colors`}
              title="Rotate"
            >
              <RotateCw size={18} />
            </button>
        </div>
      )}

      {/* Floating Action Buttons */}
      {!isEmpty && (
        <div ref={menuRef} className="absolute bottom-6 left-6 z-20 flex flex-col-reverse items-center gap-3">
          <button
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all focus:outline-none shadow-[0_4px_14px_0_rgba(59,130,246,0.39)] hover:shadow-[0_6px_20px_rgba(59,130,246,0.23)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 z-30
              ${showQuickMenu ? 'bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 rotate-45' : 'bg-gradient-to-tr from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white'}`}
            title="Quick Menu"
          >
            <Plus size={24} className="transition-transform duration-300" />
          </button>
          
          <div className={`flex flex-col gap-3 transition-all duration-300 origin-bottom ${showQuickMenu ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}`}>
            <button
              onClick={handleQuickSnapshotShare}
              className="w-10 h-10 rounded-full bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shadow-lg transition-all hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none border border-zinc-200 dark:border-zinc-700"
              title="Share Snapshot"
            >
              <Camera size={18} />
            </button>

            <div ref={infoRef} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none border
                  ${showInfo ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50' : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
                title="Shortcuts Info"
              >
                <Info size={18} />
              </button>
              
              {showInfo && (
                <div className="absolute bottom-[-10px] left-14 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-700/50 shadow-xl w-80 pointer-events-auto origin-bottom-left animate-in fade-in zoom-in-95 duration-200">
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-3 uppercase tracking-wider">Controls & Shortcuts</h3>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-3">
                    <li className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <span>Reset Camera</span>
                      <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">R</kbd>
                    </li>
                    <li className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <span>Switch Views (Front/Back/Left...)</span>
                      <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">1 - 6</kbd>
                    </li>
                    <li className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <span>Rotate</span>
                      <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">Left Click & Drag</kbd>
                    </li>
                    <li className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <span>Pan</span>
                      <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">Middle Click & Drag</kbd>
                    </li>
                    <li className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <span>Zoom In / Out</span>
                      <div className="flex gap-1">
                          <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">Scroll</kbd>
                      </div>
                    </li>
                    <li className="flex justify-between items-center pt-1">
                      <span>Smooth Zoom</span>
                      <kbd className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[10px] shadow-sm font-bold text-zinc-700 dark:text-zinc-300">Ctrl + Left Click & Drag</kbd>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Object overlay settings (only for geometric planning objects with adjustable parameters) */}
      {isTransformActive && activeTransformObjectId && ['plane', 'cylinder', 'curve', 'point'].includes(planningObjects.find(o => o.id === activeTransformObjectId)?.type || '') && (
          <ActiveObjectOverlaySettings 
             obj={planningObjects.find(o => o.id === activeTransformObjectId)}
             viewerManager={viewerManager}
          />
      )}

      {/* Pin Repositioning Active Feedback Banner */}
      {planningMode === 'annotation' && resnappingAnnotationId && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-amber-500/95 text-white backdrop-blur-md px-4 py-2 rounded-full shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 border border-amber-400">
          <MapPin size={15} className="animate-pulse shrink-0 text-white" />
          <span>Click on the 3D model surface to reposition pin</span>
          <button 
            onClick={() => {
              setResnappingAnnotationId(null);
              setPlanningMode('none');
              viewerManager?.setPlanningMode('none');
              if (viewerManager) viewerManager.resnappingAnnotationId = null;
            }}
            className="ml-1 p-1 hover:bg-black/20 rounded-full transition text-white/90 hover:text-white"
            title="Cancel Repositioning"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Context Loss and Recovery Notification */}
      {isContextLost && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 bg-rose-600/95 text-white backdrop-blur-md px-4 py-2 rounded-full shadow-2xl text-xs font-semibold animate-pulse border border-rose-400">
          <Loader2 size={14} className="animate-spin text-white" />
          <span>Graphics context lost. Restoring WebGL viewport...</span>
        </div>
      )}

      {/* Hardware Fallback Mode Banner */}
      {gpuTier === 'unsupported' && !fallbackBannerDismissed && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-amber-600/95 text-white backdrop-blur-md px-4 py-2 rounded-lg shadow-xl text-xs font-medium border border-amber-400/40">
          <span>Legacy compatibility mode active (WebGPU/WebGL2 restricted).</span>
          <button 
            onClick={() => setFallbackBannerDismissed(true)}
            className="ml-1 p-0.5 hover:bg-black/20 rounded transition text-white/90 hover:text-white"
            title="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Curved Anatomical Fly-Through (Virtual Endoscopy) HUD */}
      <EndoscopyFlyThroughHUD />
      
      {/* 3D Spline Clipping HUD */}
      <SplineClippingHUD />
      
      {/* Rulers Overlay Layer */}
      <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-300 ${rulersVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute top-0 left-0 w-6 h-6 bg-zinc-50 dark:bg-zinc-900 border-r border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-500 z-20 box-border">
          mm
        </div>
        <canvas ref={topRulerCanvasRef} id="ruler-top" className="absolute top-0 left-6 right-0 h-6 w-[calc(100%-24px)] z-10 block" />
        <canvas ref={leftRulerCanvasRef} id="ruler-left" className="absolute top-6 left-0 bottom-0 w-6 h-[calc(100%-24px)] z-10 block" />
      </div>

      {/* Empty State / Initial Landing / Loading state */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-15 bg-white dark:bg-zinc-950">
          {(status.includes('Loading') || status.includes('Parsing')) ? (
            <div className="flex flex-col items-center justify-center max-w-sm px-6">
              <Loader2 size={44} className="animate-spin text-blue-600 dark:text-blue-400 mb-4" />
              <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-200 mb-1 tracking-tight uppercase">
                {status.replace(/\*\*/g, '')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 font-mono">
                {filename ? `Preparing ${filename}...` : 'Processing 3D model geometry...'}
              </p>
              {/* Progress Bar */}
              <div className="w-64 bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden mb-2 shadow-inner">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-blue-500 h-2 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${Math.max(5, Math.min(100, loadingProgress))}%` }}
                ></div>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 font-semibold">
                {Math.round(loadingProgress || 5)}%
              </span>
            </div>
          ) : (
            <>
              <BoxSelect size={48} className="text-zinc-300 dark:text-zinc-700 mb-5" />
              <h2 className="text-lg mb-2 text-zinc-800 dark:text-zinc-200 font-bold tracking-tight">DROP 3D MODELS TO BEGIN</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-8 font-mono uppercase tracking-widest">Supports OBJ, STL, GLTF, GLB, PLY</p>
              <button 
                onClick={handleOpenFiles}
                className="pointer-events-auto bg-blue-600 hover:bg-blue-700 text-white border-none py-2.5 px-8 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
              >
                Browse Files
              </button>
            </>
          )}
        </div>
      )}

      {/* Drag & Drop Target Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/10 border-[3px] border-dashed border-blue-500 z-[100] flex items-center justify-center text-2xl font-bold text-blue-600 pointer-events-none">
          Drop files to load model
        </div>
      )}
    </main>
  );
}

function ScaleSliderRow({ label, value, min, max, step, onChange, isMm = false }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, isMm?: boolean }) {
    return (
        <div className="flex flex-col gap-1 my-1 pointer-events-auto">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <span>{label}</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                    {isMm ? `${value?.toFixed(1) || '0.0'} mm` : `${((value || 0) * 100).toFixed(0)}%`}
                </span>
            </div>
            <input 
                type="range" 
                min={min} max={max} step={step}
                value={value || 0} 
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 dark:accent-blue-400 focus:outline-none"
            />
        </div>
    );
}

function ActiveObjectOverlaySettings({ obj, viewerManager }: { obj: any, viewerManager: any }) {
    if (!obj || !viewerManager || !['plane', 'cylinder', 'curve', 'point'].includes(obj.type)) return null;

    const handlePlaneChange = (extSize?: number, thk?: number) => {
        const nextExt = extSize !== undefined ? extSize : (obj.extWidth || 0);
        const nextThk = thk !== undefined ? thk : (obj.thickness || 0);
        viewerManager.updatePlaneGeometry(obj.id, nextExt, nextThk);
    };
  
    const handleCylinderChange = (dia?: number, ext?: number) => {
        const nextDia = dia !== undefined ? dia : ((obj.diameter !== undefined ? obj.diameter : obj.radius * 2) || 1.0);
        const nextExt = ext !== undefined ? ext : (obj.extension || 20);
        viewerManager.updateCylinderGeometry(obj.id, nextDia, nextExt);
    };
  
    const updateCurveDiameter = (val: number) => {
        viewerManager.updatePlanningObjectCurveThickness(obj.id, val);
    };
  
    const updatePointDiameter = (val: number) => {
        if (typeof viewerManager.updatePlanningPointDiameter === 'function') {
            viewerManager.updatePlanningPointDiameter(obj.id, val);
        }
    };

    const hasTools = obj.type === 'plane' || obj.type === 'cylinder';

    return (
        <div className={`absolute top-6 left-6 z-20 flex flex-col bg-white/90 dark:bg-zinc-800/90 backdrop-blur shadow-md rounded-md p-3 border border-zinc-200 dark:border-zinc-700 w-48 pointer-events-auto`}>
            {obj.type === 'plane' && (
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{obj.name || "Plane"} Geometry</div>
                    <ScaleSliderRow 
                        label="Extension" 
                        value={obj.extWidth !== undefined ? obj.extWidth : 10} 
                        min={0} max={100} step={5}
                        onChange={v => handlePlaneChange(v, undefined)} 
                        isMm={true}
                    />
                    <ScaleSliderRow 
                        label="Thickness" 
                        value={obj.thickness || 0.0} 
                        min={-1.0} max={1.0} step={0.1}
                        onChange={v => handlePlaneChange(undefined, v)} 
                        isMm={true}
                    />
                </div>
            )}
            
            {obj.type === 'cylinder' && (
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{obj.name || "Cylinder"} Geometry</div>
                    <ScaleSliderRow 
                        label="Diameter" 
                        value={obj.diameter !== undefined ? obj.diameter : (obj.radius ? obj.radius * 2 : 1.0)} 
                        min={0.1} max={10.0} step={0.1}
                        onChange={v => handleCylinderChange(v, undefined)} 
                        isMm={true}
                    />
                    <ScaleSliderRow 
                        label="Extension" 
                        value={obj.extension !== undefined ? obj.extension : 20} 
                        min={0} max={100} step={5}
                        onChange={v => handleCylinderChange(undefined, v)} 
                        isMm={true}
                    />
                </div>
            )}

            {obj.type === 'curve' && (
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{obj.name || "Curve"} Geometry</div>
                    <ScaleSliderRow 
                        label="Diameter" 
                        value={obj.thickness || 0.2} 
                        min={0.1} max={2.0} step={0.1}
                        onChange={updateCurveDiameter} 
                        isMm={true}
                    />
                </div>
            )}

            {obj.type === 'point' && (
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{obj.name || "Point"}</div>
                    <ScaleSliderRow 
                        label="Diameter" 
                        value={obj.diameter || 0.2} 
                        min={0.05} max={2.0} step={0.05}
                        onChange={updatePointDiameter} 
                        isMm={true}
                    />
                </div>
            )}
            
            {['measurement', 'angle'].includes(obj.type) && (
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{obj.name || obj.type}</div>
            )}
        </div>
    );
}
