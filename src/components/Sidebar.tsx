import { useState, useEffect } from 'react';
import { useViewer } from '../context/ViewerContext';
import { ChevronDown, Loader2, Eye, EyeOff, Droplets, Camera, X, Copy, Video, Play, ChevronRight, Sparkles, Spline, Scissors, ZoomIn, ZoomOut, Compass, RotateCcw, ArrowLeftRight } from 'lucide-react';

export function Sidebar({ collapsed, onClose }: { collapsed: boolean, onClose?: () => void }) {
  const { 
    status, loadingProgress, filename, meshes, globalOpacity, setGlobalOpacity, 
    toggleMeshVisibility, toggleAllMeshesVisibility, invertMeshesVisibility, setMeshOpacity, highlightMesh, highlightedMeshId,
    isClipping, setIsClipping, clipPlanes, updateClipPlane,
    isGhostingMode, setIsGhostingMode,
    explodeValue, setExplodeValue, isEmpty, isAutoRotating, setIsAutoRotating,
    backgroundImage, setBackgroundImage, backgroundOpacity, setBackgroundOpacity,
    viewerManager, setActiveModal,
    flyThroughState, startFlyThrough, stopFlyThrough,
    generateSampleAnatomicalCurve, planningObjects, setPlanningMode,
    splineClippingState, startSplineClipping, stopSplineClipping,
    setSplineClippingProgress, setSplineClippingInvert,
    setSplineClippingAlignCamera, zoomSplineCrossSection, setSplineClippingZoomLevel
  } = useViewer();

  const [meshVisOpen, setMeshVisOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [flyThroughSectionExpanded, setFlyThroughSectionExpanded] = useState<boolean>(false);
  const [selectedCurveId, setSelectedCurveId] = useState<string>('');
  const [splineMeshTarget, setSplineMeshTarget] = useState<string>('all');
  const [showSplineGenerator, setShowSplineGenerator] = useState<boolean>(false);

  const [splineClippingExpanded, setSplineClippingExpanded] = useState<boolean>(false);
  const [splineClippingCurveId, setSplineClippingCurveId] = useState<string>('');
  const [splineClipMeshTarget, setSplineClipMeshTarget] = useState<string>('all');

  const availableCurves = (planningObjects || []).filter(o => o.type === 'curve');

  useEffect(() => {
    if (availableCurves.length > 0) {
      if (!selectedCurveId || !availableCurves.some(c => c.id === selectedCurveId)) {
        setSelectedCurveId(availableCurves[0].id);
      }
      if (!splineClippingCurveId || !availableCurves.some(c => c.id === splineClippingCurveId)) {
        setSplineClippingCurveId(availableCurves[0].id);
      }
    }
  }, [availableCurves, selectedCurveId, splineClippingCurveId]);

  return (
    <aside 
      onMouseLeave={(e) => {
        if (e.buttons === 0) {
          setMeshVisOpen(false);
          setAdvancedOpen(false);
          setSplineClippingExpanded(false);
          setFlyThroughSectionExpanded(false);
        }
      }}
      className={`transition-all duration-300 bg-zinc-50 dark:bg-zinc-900 flex-col overflow-y-auto overflow-x-hidden shrink-0 ${collapsed ? 'w-full md:w-0 h-0 md:h-auto opacity-0 border-none pointer-events-none' : 'w-full md:w-[280px] h-auto max-h-[50vh] md:max-h-none md:h-auto border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 flex'}`}
    >
      <div className="flex flex-col w-full min-h-min pb-5">
        
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
          <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 uppercase tracking-widest flex items-center gap-2">
            Visualization Tools
          </h3>
          {onClose && (
            <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Section: Mesh Visibility */}
        <div 
          className="border-t border-b border-zinc-200 dark:border-zinc-800 transition-colors"
          onMouseLeave={(e) => {
            if (e.buttons === 0) {
              setMeshVisOpen(false);
            }
          }}
        >
          <div className="flex justify-between items-center cursor-pointer px-6 py-4 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setMeshVisOpen(!meshVisOpen)}>
            <span>Mesh Visibility</span>
            <ChevronDown size={14} className={`transition-transform duration-200 text-zinc-400 ${meshVisOpen ? 'rotate-180' : ''}`} />
          </div>
          
          {meshVisOpen && (
            <div className="px-6 py-4">
              <div className="border-l-2 border-zinc-900 dark:border-zinc-100 pl-3 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold">Global Opacity</label>
                  <div className="flex items-center gap-1">
                    <button 
                      className="bg-transparent border-none cursor-pointer text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center p-1 rounded"
                      onClick={invertMeshesVisibility}
                      disabled={meshes.length === 0}
                      title="Invert Displayed Models"
                    >
                      <ArrowLeftRight size={13} />
                    </button>
                    <button 
                      className="bg-transparent border-none cursor-pointer text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center p-1 rounded"
                      onClick={toggleAllMeshesVisibility}
                      disabled={meshes.length === 0}
                      title={meshes.length > 0 && meshes.every(m => m.visible !== false) ? "Hide All Models" : "Show All Models"}
                    >
                      {meshes.length > 0 && meshes.every(m => m.visible !== false) ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <input 
                    type="range" 
                    min="0" max="1" step="0.05" 
                    value={globalOpacity} 
                    onChange={(e) => setGlobalOpacity(parseFloat(e.target.value))}
                    className="flex-1 cursor-pointer" 
                  />
                  <span className="w-10 text-right text-zinc-800 dark:text-zinc-200 font-mono text-sm font-semibold">{Math.round(globalOpacity * 100)}%</span>
                </div>
              </div>
              
              <div className="flex flex-col">
                {meshes.length === 0 ? (
                  <div className="text-[13px] text-zinc-500 dark:text-zinc-400 py-2">
                    No sub-models found.
                  </div>
                ) : (
                  meshes.map((mesh) => (
                    <div 
                      key={mesh.id}
                      className={`border-b border-zinc-100 dark:border-zinc-800/50 py-3 text-[13px] cursor-pointer transition-all duration-200 ${highlightedMeshId === mesh.id ? 'text-blue-600 dark:text-blue-400 font-semibold bg-zinc-100/50 dark:bg-zinc-800/30' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/20'}`}
                      onMouseEnter={() => {
                        highlightMesh(mesh.id);
                      }}
                      onMouseLeave={() => {
                        highlightMesh(null);
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
                        highlightMesh(highlightedMeshId === mesh.id ? null : mesh.id);
                      }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={mesh.name}>{mesh.name}</span>
                        <div className="flex items-center gap-0.5">
                          <button 
                            className="bg-transparent border-none cursor-pointer text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center p-1 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (viewerManager && typeof viewerManager.duplicateSubmeshToPlanningObjects === 'function') {
                                viewerManager.duplicateSubmeshToPlanningObjects(mesh.id);
                                setActiveModal('planning');
                              }
                            }}
                            title="Add / Duplicate to Object List & Analytic Tools"
                          >
                            <Copy size={13} />
                          </button>
                          <button 
                            className="bg-transparent border-none cursor-pointer text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center p-1 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMeshVisibility(mesh.id);
                            }}
                            title="Toggle Visibility"
                          >
                            {mesh.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 opacity-80" onClick={e => e.stopPropagation()}>
                        <span title="Opacity" className="flex items-center">
                          <Droplets size={12} className="text-zinc-400" />
                        </span>
                        <input 
                          type="range" 
                          min="0" max="1" step="0.05" 
                          value={mesh.opacity} 
                          onChange={(e) => setMeshOpacity(mesh.id, parseFloat(e.target.value))}
                          className="flex-1 cursor-pointer" 
                        />
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 w-8 text-right">{Math.round(mesh.opacity * 100)}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section: Advanced Visual Tools */}
        <div 
          className="border-b border-zinc-200 dark:border-zinc-800 transition-colors"
          onMouseLeave={(e) => {
            if (e.buttons === 0) {
              setAdvancedOpen(false);
            }
          }}
        >
          <div className="flex justify-between items-center cursor-pointer px-6 py-4 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setAdvancedOpen(!advancedOpen)}>
            <span>Advanced Visual Tools</span>
            <ChevronDown size={14} className={`transition-transform duration-200 text-zinc-400 ${advancedOpen ? 'rotate-180' : ''}`} />
          </div>

          {advancedOpen && (
            <div className="px-6 py-4 flex flex-col gap-6">
            <div className="border-l-2 border-zinc-900 dark:border-zinc-100 pl-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold cursor-pointer" onClick={() => setIsClipping(!isClipping)}>Clipping</label>
                <label className="switch mb-0">
                  <input type="checkbox" checked={isClipping} onChange={(e) => setIsClipping(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
              
              {isClipping && (() => {
                const cameraAlignedAxis = (['x', 'y', 'z'] as const).find(
                  (a) => clipPlanes[a]?.active && clipPlanes[a]?.alignToCamera
                );
                return (
                  <div className="flex flex-col gap-3 mt-1">
                    {cameraAlignedAxis && (
                      <div className="text-[9px] text-blue-500 font-medium bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                        <span>Aligned to Camera ({cameraAlignedAxis.toUpperCase()} Active)</span>
                        <span className="text-[8px] text-zinc-400">Other axes locked</span>
                      </div>
                    )}
                    <ClipControl 
                      axis="x" 
                      label="L" 
                      title="Left / Right (X Axis)" 
                      config={clipPlanes.x} 
                      onChange={updateClipPlane} 
                      disabled={!!cameraAlignedAxis && cameraAlignedAxis !== 'x'}
                    />
                    <ClipControl 
                      axis="y" 
                      label="P" 
                      title="Anterior / Posterior (Y Axis)" 
                      config={clipPlanes.y} 
                      onChange={updateClipPlane} 
                      disabled={!!cameraAlignedAxis && cameraAlignedAxis !== 'y'}
                    />
                    <ClipControl 
                      axis="z" 
                      label="S" 
                      title="Superior / Inferior (Z Axis)" 
                      config={clipPlanes.z} 
                      onChange={updateClipPlane} 
                      disabled={!!cameraAlignedAxis && cameraAlignedAxis !== 'z'}
                    />
                  </div>
                );
              })()}
            </div>

            {/* 3D Spline Clipping Feature */}
            <div 
              className={`border-l-2 ${splineClippingState.active ? 'border-indigo-500 bg-indigo-950/20 rounded-r p-2.5 -ml-1 pl-3' : 'border-indigo-500 pl-3'} transition-all`}
              onMouseLeave={(e) => {
                if (e.buttons === 0) {
                  setSplineClippingExpanded(false);
                }
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                  onClick={() => setSplineClippingExpanded(!splineClippingExpanded)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <label className={`text-[10px] uppercase tracking-widest font-semibold cursor-pointer ${splineClippingState.active ? 'text-indigo-400 font-bold' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        Spline Clipping
                      </label>
                      {splineClippingState.active && (
                        <span className="px-1 py-0.2 rounded text-[8px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-400">Curved 3D Spline Slicing</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle button to enter/exit spline clipping mode once spline path is available */}
                  <label 
                    className={`switch mb-0 shrink-0 ${availableCurves.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={availableCurves.length > 0 ? (splineClippingState.active ? "Exit Spline Clipping" : "Enter Spline Clipping") : "Spline curve required to enter Spline Clipping"}
                  >
                    <input 
                      type="checkbox" 
                      disabled={availableCurves.length === 0}
                      checked={splineClippingState.active} 
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (availableCurves.length > 0) {
                            startSplineClipping(splineClippingCurveId || availableCurves[0].id);
                          }
                        } else {
                          stopSplineClipping();
                        }
                      }} 
                    />
                    <span className="slider"></span>
                  </label>

                  <button
                    onClick={() => setSplineClippingExpanded(!splineClippingExpanded)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <ChevronDown size={14} className={`transition-transform duration-200 ${splineClippingExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {splineClippingExpanded && (
                <div className="flex flex-col gap-2 pt-1 text-xs">
                  {/* Mesh Target Selector & Spline Generator for Clipping */}
                  <div className="p-2 rounded bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Target Mesh for Spline:</span>
                      {meshes.length > 1 && (
                        <span className="text-[9px] text-zinc-400 font-mono">{meshes.length} models</span>
                      )}
                    </div>
                    <select
                      value={splineClipMeshTarget}
                      onChange={(e) => setSplineClipMeshTarget(e.target.value)}
                      className="w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                    >
                      <option value="all">All Displayed Models (Default)</option>
                      {meshes.map((m) => (
                        <option key={m.id} value={m.id.toString()}>
                          {m.name || `Mesh ${m.id + 1}`} {!m.visible ? '(hidden)' : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        const targetId = splineClipMeshTarget === 'all' ? null : parseInt(splineClipMeshTarget, 10);
                        const newCurveId = generateSampleAnatomicalCurve(targetId);
                        if (newCurveId) {
                          setSplineClippingCurveId(newCurveId);
                          startSplineClipping(newCurveId);
                        }
                      }}
                      className="w-full py-1.5 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-1.5 transition shadow-sm text-[11px] active:scale-95"
                    >
                      <Sparkles size={12} />
                      <span>Calculate Spline for {splineClipMeshTarget === 'all' ? 'Displayed Model' : 'Selected Mesh'}</span>
                    </button>
                  </div>

                  {availableCurves.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-600 dark:text-zinc-400">Clipping Spline Path:</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                          {availableCurves.length} path{availableCurves.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <select
                        value={splineClippingCurveId}
                        onChange={(e) => {
                          setSplineClippingCurveId(e.target.value);
                          if (splineClippingState.active) {
                            startSplineClipping(e.target.value);
                          }
                        }}
                        className="w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      >
                        {availableCurves.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.id} ({(c.baseDistance || 0).toFixed(1)} mm)
                          </option>
                        ))}
                      </select>

                      {/* Prominent Toggle Button to Enter/Exit Spline Clipping */}
                      <button
                        onClick={() => {
                          if (splineClippingState.active) {
                            stopSplineClipping();
                          } else {
                            if (splineClippingCurveId) startSplineClipping(splineClippingCurveId);
                          }
                        }}
                        className={`w-full py-1.5 px-3 rounded font-bold flex items-center justify-center gap-1.5 transition shadow-sm text-xs ${
                          splineClippingState.active 
                            ? 'bg-red-600/90 hover:bg-red-500 text-white' 
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
                        }`}
                      >
                        {splineClippingState.active ? (
                          <>
                            <X size={13} />
                            <span>Exit Spline Clipping</span>
                          </>
                        ) : (
                          <>
                            <Scissors size={13} />
                            <span>Enter Spline Clipping</span>
                          </>
                        )}
                      </button>

                      <div className="text-[9px] text-zinc-400 dark:text-zinc-500 bg-zinc-100/50 dark:bg-zinc-800/40 rounded p-1.5 border border-zinc-200/50 dark:border-zinc-700/40 leading-relaxed">
                        Control bar with 0.6mm slice interval and lock clip view is active at the bottom of the viewer.
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px]">
                        No spline path available yet. Calculate an automatic spline above or draw a custom curve on the model.
                      </div>
                      <button
                        onClick={() => {
                          setActiveModal('planning');
                          setPlanningMode('curve');
                        }}
                        className="w-full py-1 px-2 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-1 transition text-[10px]"
                      >
                        <Spline size={12} className="text-pink-500" />
                        <span>Draw Custom Curve on Model</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FOCUS X-RAY MODE */}
            <div className="border-l-2 border-cyan-500 pl-3">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold cursor-pointer" onClick={() => setIsGhostingMode(!isGhostingMode)}>FOCUS X-RAY MODE</label>
                  <span className="text-[9px] text-zinc-400">Shows target in original color with semi-transparent X-ray context</span>
                </div>
                <label className="switch mb-0 shrink-0 ml-2">
                  <input type="checkbox" checked={isGhostingMode} onChange={(e) => setIsGhostingMode(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {/* Curved Anatomical Endoscopy Mode (Virtual Endoscopy / Vessel Probe) */}
            <div 
              className={`border-l-2 ${flyThroughState.active ? 'border-cyan-500 bg-cyan-950/20 rounded-r p-2.5 -ml-1 pl-3' : 'border-cyan-500 pl-3'} transition-all`}
              onMouseLeave={(e) => {
                if (e.buttons === 0) {
                  setFlyThroughSectionExpanded(false);
                }
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                  onClick={() => setFlyThroughSectionExpanded(!flyThroughSectionExpanded)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <label className={`text-[10px] uppercase tracking-widest font-semibold cursor-pointer ${flyThroughState.active ? 'text-cyan-400 font-bold' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        Endoscopy Mode
                      </label>
                      {flyThroughState.active && (
                        <span className="px-1 py-0.2 rounded text-[8px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          LIVE
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-400">Virtual Endoscopy / Vessel Probe</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle button to enter/exit endoscopy mode once spline path is available */}
                  <label 
                    className={`switch mb-0 shrink-0 ${availableCurves.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={availableCurves.length > 0 ? (flyThroughState.active ? "Exit Endoscopy Mode" : "Enter Endoscopy Mode") : "Spline curve required to enter Endoscopy Mode"}
                  >
                    <input 
                      type="checkbox" 
                      disabled={availableCurves.length === 0}
                      checked={flyThroughState.active} 
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (availableCurves.length > 0) {
                            startFlyThrough(selectedCurveId || availableCurves[0].id, false);
                          }
                        } else {
                          stopFlyThrough();
                        }
                      }} 
                    />
                    <span className="slider"></span>
                  </label>

                  <button
                    onClick={() => setFlyThroughSectionExpanded(!flyThroughSectionExpanded)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <ChevronDown size={14} className={`transition-transform duration-200 ${flyThroughSectionExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {flyThroughSectionExpanded && (
                <div className="flex flex-col gap-2 pt-1 text-xs">
                  {/* Mesh Target Selector & Spline Generator */}
                  <div className="p-2 rounded bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Target Mesh for Spline:</span>
                      {meshes.length > 1 && (
                        <span className="text-[9px] text-zinc-400 font-mono">{meshes.length} models</span>
                      )}
                    </div>
                    <select
                      value={splineMeshTarget}
                      onChange={(e) => setSplineMeshTarget(e.target.value)}
                      className="w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
                    >
                      <option value="all">All Displayed Models (Default)</option>
                      {meshes.map((m) => (
                        <option key={m.id} value={m.id.toString()}>
                          {m.name || `Mesh ${m.id + 1}`} {!m.visible ? '(hidden)' : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        const targetId = splineMeshTarget === 'all' ? null : parseInt(splineMeshTarget, 10);
                        const newCurveId = generateSampleAnatomicalCurve(targetId);
                        if (newCurveId) {
                          setSelectedCurveId(newCurveId);
                          // User requested: don't automatically start playing when changed to virtual endoscopy
                          startFlyThrough(newCurveId, false);
                        }
                      }}
                      className="w-full py-1.5 px-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-1.5 transition shadow-sm text-[11px] active:scale-95"
                    >
                      <Sparkles size={12} />
                      <span>Calculate Spline for {splineMeshTarget === 'all' ? 'Displayed Model' : 'Selected Mesh'}</span>
                    </button>
                  </div>

                  {availableCurves.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-600 dark:text-zinc-400">Camera Spline Path:</span>
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                          {availableCurves.length} path{availableCurves.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <select
                        value={selectedCurveId}
                        onChange={(e) => setSelectedCurveId(e.target.value)}
                        className="w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                      >
                        {availableCurves.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.id} ({(c.baseDistance || 0).toFixed(1)} mm)
                          </option>
                        ))}
                      </select>

                      {/* Prominent Toggle Button to Enter/Exit Endoscopy Mode */}
                      <button
                        onClick={() => {
                          if (flyThroughState.active) {
                            stopFlyThrough();
                          } else {
                            if (selectedCurveId) startFlyThrough(selectedCurveId, false);
                          }
                        }}
                        className={`w-full py-1.5 px-3 rounded font-bold flex items-center justify-center gap-1.5 transition shadow-sm text-xs ${
                          flyThroughState.active 
                            ? 'bg-red-600/90 hover:bg-red-500 text-white' 
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white active:scale-95'
                        }`}
                      >
                        {flyThroughState.active ? (
                          <>
                            <X size={13} />
                            <span>Exit Endoscopy Mode</span>
                          </>
                        ) : (
                          <>
                            <Play size={13} />
                            <span>Enter Endoscopy Mode</span>
                          </>
                        )}
                      </button>

                      <div className="text-[9px] text-zinc-400 dark:text-zinc-500 bg-zinc-100/50 dark:bg-zinc-800/40 rounded p-1.5 border border-zinc-200/50 dark:border-zinc-700/40 leading-relaxed">
                        Navigation bar with progress, FOV, wall look trim, and path offset is active at the bottom of the viewer.
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px]">
                        No spline path available yet. Calculate an automatic spline above or draw a custom curve on the model.
                      </div>
                      <button
                        onClick={() => {
                          setActiveModal('planning');
                          setPlanningMode('curve');
                        }}
                        className="w-full py-1 px-2 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-1 transition text-[10px]"
                      >
                        <Spline size={12} className="text-pink-500" />
                        <span>Draw Custom Curve on Model</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-l-2 border-zinc-900 dark:border-zinc-100 pl-3">
              <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold mb-3">Exploded View</label>
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={explodeValue} 
                onChange={(e) => setExplodeValue(parseFloat(e.target.value))}
                className="w-full cursor-pointer" 
              />
            </div>
            
            <div className="border-l-2 border-emerald-500 pl-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold cursor-pointer" onClick={() => setIsAutoRotating(!isAutoRotating)}>Auto-Rotate</label>
                <label className="switch mb-0">
                  <input type="checkbox" checked={isAutoRotating} onChange={(e) => setIsAutoRotating(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div className="border-l-2 border-indigo-500 pl-3">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-semibold">Background Picture</label>
                {backgroundImage && (
                  <button onClick={() => setBackgroundImage(null)} className="text-[9px] text-red-500 uppercase tracking-wider font-bold">Clear</button>
                )}
              </div>
              {!backgroundImage ? (
                <div 
                  className="w-full border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-4 text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  onClick={() => {
                    document.getElementById('bg-paste-capture')?.focus();
                  }}
                >
                  <input type="text" id="bg-paste-capture" className="absolute opacity-0 w-0 h-0" onPaste={(e) => {
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.indexOf('image') !== -1) {
                        const blob = items[i].getAsFile();
                        if (blob) {
                          const url = URL.createObjectURL(blob);
                          setBackgroundImage(url);
                        }
                      }
                    }
                  }} />
                  <span className="text-[10px] text-zinc-400 font-medium select-none pointer-events-none">Click & Ctrl+V to paste</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Opacity</span>
                    <span className="text-[10px] font-mono text-zinc-500">{Math.round(backgroundOpacity * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="1" step="0.01" 
                    value={backgroundOpacity} 
                    onChange={(e) => setBackgroundOpacity(parseFloat(e.target.value))}
                    className="w-full cursor-pointer" 
                  />
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </aside>
  );
}

function ClipControl({ 
  axis, 
  label, 
  title, 
  config, 
  onChange,
  disabled = false
}: { 
  axis: 'x'|'y'|'z', 
  label: string, 
  title: string, 
  config: any, 
  onChange: any,
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 transition-opacity ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
      <button 
        disabled={disabled}
        className={`w-[24px] h-[24px] flex items-center justify-center text-[10px] font-bold rounded-sm border transition-colors ${config.active ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        onClick={() => onChange(axis, { active: !config.active })}
        title={title}
      >
        {label}
      </button>
      <input 
        type="range" 
        disabled={disabled}
        min="0" max="100" step="1" 
        value={config.sliderVal} 
        onChange={(e) => onChange(axis, { sliderVal: parseFloat(e.target.value) })}
        className="flex-1 cursor-pointer w-16" 
      />
      <button 
        disabled={disabled}
        className={`px-1.5 h-[24px] flex items-center justify-center rounded border transition-colors ${config.alignToCamera ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        onClick={() => onChange(axis, { alignToCamera: !config.alignToCamera })}
        title="Align to Camera View"
      >
        <Camera size={13} />
      </button>
      <button 
        disabled={disabled}
        className="px-2 h-[24px] flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider rounded border border-zinc-300 dark:border-zinc-600 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        onClick={() => onChange(axis, { invert: !config.invert })}
        title="Flip Normal"
      >
        Flip
      </button>
    </div>
  );
}
