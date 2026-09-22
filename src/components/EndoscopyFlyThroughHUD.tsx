import { useEffect, useState } from 'react';
import { useViewer } from '../context/ViewerContext';
import { Crosshair, X, Settings, ChevronUp, ChevronDown } from 'lucide-react';

export function EndoscopyFlyThroughHUD() {
  const {
    flyThroughState,
    stopFlyThrough,
    setFlyThroughProgress,
    stepFlyThroughDistance,
    setFlyThroughFov,
    setFlyThroughReticle,
    setFlyThroughLookTrim,
    setFlyThroughPathOffset,
    planningObjects
  } = useViewer();

  const [showSettings, setShowSettings] = useState(false);

  // Keyboard shortcut listener for endoscopy navigation
  useEffect(() => {
    if (!flyThroughState.active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFlyThroughDistance(0.6);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFlyThroughDistance(-0.6);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        stopFlyThrough();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flyThroughState.active, stepFlyThroughDistance, stopFlyThrough]);

  if (!flyThroughState.active) return null;

  const currentCurve = planningObjects.find(o => o.id === flyThroughState.curveId);
  const curveName = currentCurve?.name || flyThroughState.curveName || 'Anatomical Spline';
  const progressPercent = Math.round(flyThroughState.progress * 100);
  const currentDistMm = (flyThroughState.currentDistance || 0).toFixed(1);
  const totalDistMm = (flyThroughState.totalDistance || 0).toFixed(1);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden font-sans">
      {/* Endoscopic Reticle / Target Overlay */}
      {flyThroughState.showReticle && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-28 h-28 border border-cyan-400/30 dark:border-cyan-400/40 rounded-full flex items-center justify-center">
            {/* Crosshair lines */}
            <div className="absolute w-full h-[1px] bg-cyan-400/30 dark:bg-cyan-400/40" />
            <div className="absolute h-full w-[1px] bg-cyan-400/30 dark:bg-cyan-400/40" />
            <div className="w-2 h-2 rounded-full border border-cyan-400/70 bg-cyan-400/20 shadow-sm" />
            {/* Axis markers */}
            <span className="absolute -top-4 text-[9px] font-mono text-cyan-500/80 font-bold uppercase tracking-wider">SUP</span>
            <span className="absolute -bottom-4 text-[9px] font-mono text-cyan-500/80 font-bold uppercase tracking-wider">INF</span>
            <span className="absolute -left-5 text-[9px] font-mono text-cyan-500/80 font-bold uppercase tracking-wider">L</span>
            <span className="absolute -right-5 text-[9px] font-mono text-cyan-500/80 font-bold uppercase tracking-wider">R</span>
          </div>
        </div>
      )}

      {/* Bottom Main Navigation & Scope Control Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl px-2 pointer-events-auto">
        <div className="bg-zinc-900/95 dark:bg-zinc-950/95 backdrop-blur-md border border-zinc-700/60 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-3 text-zinc-100">
          
          {/* Header Row: Merged Info and Settings Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span className="w-2 h-2 rounded-full bg-emerald-500 -ml-3.5 inline-block" />
                <span className="font-bold tracking-wider uppercase text-[11px] text-zinc-300">
                  Endoscopy Mode
                </span>
              </div>
              <div className="h-3.5 w-[1px] bg-zinc-700" />
              <span className="font-mono text-cyan-400 font-semibold text-[11px] truncate max-w-[200px]" title={curveName}>
                {curveName}
              </span>
            </div>
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`text-[10px] font-medium px-2 py-1 rounded flex items-center gap-1 transition-colors border ${showSettings ? 'bg-zinc-800 text-cyan-300 border-zinc-600' : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-800'}`}
              title="Toggle Scope Settings"
            >
              <Settings size={12} />
              <span>Settings</span>
              {showSettings ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          </div>
          
          {/* 1. Slidebar with progress in percentage and distance values with Rev/Fwd 0.6mm buttons */}
          <div className="flex items-center gap-2.5 w-full">
            <button
              onClick={() => stepFlyThroughDistance(-0.6)}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow border border-cyan-500/40 active:scale-95 transition shrink-0"
              title="Step backward 0.6mm (Left Arrow)"
            >
              <span>Rev</span>
            </button>
            <div className="flex flex-col items-center justify-center min-w-[45px]">
              <span className="text-[12px] font-mono font-bold text-zinc-200">
                {progressPercent}%
              </span>
              <span className="text-[9px] font-mono text-cyan-300">
                {currentDistMm}mm
              </span>
            </div>
            <div className="relative flex-1 flex flex-col gap-0.5 justify-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={flyThroughState.progress}
                onChange={(e) => setFlyThroughProgress(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700/80 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                title="Slide to navigate along spline path"
              />
              <div className="flex justify-between text-[8px] font-mono text-zinc-400 px-0.5">
                <span>0 mm</span>
                <span className="text-cyan-400 font-semibold">Interval: 0.6 mm</span>
                <span>{totalDistMm} mm</span>
              </div>
            </div>
            <button
              onClick={() => stepFlyThroughDistance(0.6)}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow border border-cyan-500/40 active:scale-95 transition shrink-0"
              title="Step forward 0.6mm (Right Arrow)"
            >
              <span>Fwd</span>
            </button>
            <button
              onClick={() => setFlyThroughReticle(!flyThroughState.showReticle)}
              className={`p-1.5 rounded-lg transition-colors border shrink-0 ${
                flyThroughState.showReticle
                  ? 'text-cyan-400 bg-cyan-950/50 border-cyan-600/40'
                  : 'text-zinc-400 bg-zinc-800/60 border-zinc-700/50 hover:text-white'
              }`}
              title="Toggle Scope Reticle"
            >
              <Crosshair size={14} />
            </button>
            <button
              onClick={stopFlyThrough}
              className="px-2.5 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 border border-red-800/60 text-red-300 hover:text-red-100 text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0"
              title="Exit Endoscopy Mode (ESC)"
            >
              <X size={12} />
              <span>Exit Mode</span>
            </button>
          </div>

          {/* 2. Scope Field of View, Wall Look Trim, and Spline View Path Offset */}
          {showSettings && (
            <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
              
              {/* Scope Field of View */}
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40">
              <div className="flex justify-between items-center text-zinc-300 font-mono text-[10px]">
                <span className="font-semibold text-zinc-400 uppercase tracking-wider">Scope FOV</span>
                <span className="text-cyan-400 font-bold font-mono">{flyThroughState.fov}°</span>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[9px] text-zinc-500 font-mono">50°</span>
                <input
                  type="range"
                  min="50"
                  max="110"
                  step="5"
                  value={flyThroughState.fov}
                  onChange={(e) => setFlyThroughFov(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  title={`Field of View: ${flyThroughState.fov}°`}
                />
                <span className="text-[9px] text-zinc-500 font-mono">110°</span>
              </div>
            </div>

            {/* Wall Look Trim */}
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40">
              <div className="flex justify-between items-center text-zinc-300 font-mono text-[10px]">
                <span className="font-semibold text-zinc-400 uppercase tracking-wider">Wall Look Trim</span>
                <button
                  onClick={() => setFlyThroughLookTrim(0, 0)}
                  className="text-[9px] text-zinc-400 hover:text-cyan-300 underline"
                  title="Reset look angle to center"
                >
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-zinc-400 font-mono">Pan (L/R)</span>
                  <input
                    type="range"
                    min="-0.7"
                    max="0.7"
                    step="0.05"
                    value={flyThroughState.yawOffset}
                    onChange={(e) => setFlyThroughLookTrim(parseFloat(e.target.value), flyThroughState.pitchOffset)}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    title={`Pan: ${flyThroughState.yawOffset.toFixed(2)}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-zinc-400 font-mono">Tilt (U/D)</span>
                  <input
                    type="range"
                    min="-0.7"
                    max="0.7"
                    step="0.05"
                    value={flyThroughState.pitchOffset}
                    onChange={(e) => setFlyThroughLookTrim(flyThroughState.yawOffset, parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    title={`Tilt: ${flyThroughState.pitchOffset.toFixed(2)}`}
                  />
                </div>
              </div>
            </div>

            {/* Spline View Path Offset */}
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40">
              <div className="flex justify-between items-center text-zinc-300 font-mono text-[10px]">
                <span className="font-semibold text-zinc-400 uppercase tracking-wider">Spline Path Offset</span>
                <button
                  onClick={() => setFlyThroughPathOffset(0, 0)}
                  className="text-[9px] text-zinc-400 hover:text-cyan-300 underline"
                  title="Center directly on spline curve"
                >
                  Reset (0,0)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-[9px] text-zinc-400 font-mono">
                    <span>Lateral:</span>
                    <span className="text-cyan-300">
                      {(flyThroughState.pathOffsetX || 0) > 0 ? `+${(flyThroughState.pathOffsetX || 0).toFixed(1)}` : (flyThroughState.pathOffsetX || 0).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.5"
                    value={flyThroughState.pathOffsetX || 0}
                    onChange={(e) => setFlyThroughPathOffset(parseFloat(e.target.value), flyThroughState.pathOffsetY || 0)}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    title={`Lateral: ${flyThroughState.pathOffsetX || 0} mm`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-[9px] text-zinc-400 font-mono">
                    <span>Elevation:</span>
                    <span className="text-cyan-300">
                      {(flyThroughState.pathOffsetY || 0) > 0 ? `+${(flyThroughState.pathOffsetY || 0).toFixed(1)}` : (flyThroughState.pathOffsetY || 0).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.5"
                    value={flyThroughState.pathOffsetY || 0}
                    onChange={(e) => setFlyThroughPathOffset(flyThroughState.pathOffsetX || 0, parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    title={`Elevation: ${flyThroughState.pathOffsetY || 0} mm`}
                  />
                </div>
              </div>
            </div>

          </div>
          )}
        </div>
      </div>
    </div>
  );
}
