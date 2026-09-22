import { useEffect, useState } from 'react';
import { useViewer } from '../context/ViewerContext';
import { Scissors, X, RotateCcw, Eye, Compass, Settings, ChevronUp, ChevronDown } from 'lucide-react';

export function SplineClippingHUD() {
  const {
    splineClippingState,
    stopSplineClipping,
    setSplineClippingProgress,
    setSplineClippingDistance,
    stepSplineClippingDistance,
    setSplineClippingInvert,
    setSplineClippingAlignCamera,
    planningObjects
  } = useViewer();

  const [showSettings, setShowSettings] = useState(false);

  // Keyboard shortcut listener for spline clipping navigation
  useEffect(() => {
    if (!splineClippingState.active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepSplineClippingDistance(0.6);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepSplineClippingDistance(-0.6);
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        setSplineClippingInvert(!splineClippingState.invert);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        stopSplineClipping();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    splineClippingState.active,
    splineClippingState.progress,
    splineClippingState.invert,
    stepSplineClippingDistance,
    setSplineClippingInvert,
    stopSplineClipping
  ]);

  if (!splineClippingState.active) return null;

  const currentCurve = planningObjects.find(o => o.id === splineClippingState.curveId);
  const curveName = currentCurve?.name || splineClippingState.curveName || 'Spline Path';
  const progressPercent = Math.round(splineClippingState.progress * 100);
  const totalDist = Math.max(0.6, splineClippingState.totalDistance || 100);
  const currentDist = splineClippingState.currentDistance !== undefined 
    ? splineClippingState.currentDistance 
    : (splineClippingState.progress * totalDist);
  const currentDistMm = currentDist.toFixed(1);
  const totalDistMm = totalDist.toFixed(1);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden font-sans">
      {/* Bottom Main Navigation Control Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl px-2 pointer-events-auto">
        <div className="bg-zinc-900/95 dark:bg-zinc-950/95 backdrop-blur-md border border-indigo-700/50 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-3 text-zinc-100">
          
          {/* Header Row: Merged Info and Settings Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping inline-block" />
                <span className="w-2 h-2 rounded-full bg-indigo-500 -ml-3.5 inline-block" />
                <span className="font-bold tracking-wider uppercase text-[11px] text-indigo-200 flex items-center gap-1.5">
                  <Scissors size={13} className="text-indigo-400" />
                  <span>Spline Clipping</span>
                </span>
              </div>
              <div className="h-3.5 w-[1px] bg-zinc-700" />
              <span className="font-mono text-indigo-300 font-semibold text-[11px] truncate max-w-[200px]" title={curveName}>
                {curveName}
              </span>
            </div>
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`text-[10px] font-medium px-2 py-1 rounded flex items-center gap-1 transition-colors border ${showSettings ? 'bg-zinc-800 text-indigo-300 border-zinc-600' : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-transparent hover:bg-zinc-800'}`}
              title="Toggle Slice Options"
            >
              <Settings size={12} />
              <span>Settings</span>
              {showSettings ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          </div>

          {/* 1. Slidebar with 0.6mm interval progress adjustment and distance values along 3D Spline */}
          <div className="flex items-center gap-2.5 w-full">
            <button
              onClick={() => stepSplineClippingDistance(-0.6)}
              className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-base flex items-center justify-center shadow-md border border-indigo-400/40 active:scale-95 transition shrink-0"
              title="Step backward 0.6mm (Left Arrow)"
            >
              -
            </button>
            <div className="flex flex-col items-center justify-center min-w-[50px]">
              <span className="text-[12px] font-mono font-bold text-zinc-200">
                {progressPercent}%
              </span>
              <span className="text-[9px] font-mono text-indigo-300">
                {currentDistMm}mm
              </span>
            </div>
            <div className="relative flex-1 flex flex-col gap-0.5 justify-center">
              <input
                type="range"
                min="0"
                max={totalDist}
                step="0.6"
                value={Math.min(totalDist, Math.max(0, currentDist))}
                onChange={(e) => setSplineClippingDistance(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700/80 rounded-lg appearance-none cursor-pointer accent-indigo-400 focus:outline-none"
                title="Adjust position along spline in 0.6mm intervals"
              />
              <div className="flex justify-between text-[8px] font-mono text-zinc-400 px-0.5">
                <span>0 mm</span>
                <span className="text-indigo-400 font-semibold">Interval: 0.6 mm</span>
                <span>{totalDistMm} mm</span>
              </div>
            </div>
            <button
              onClick={() => stepSplineClippingDistance(0.6)}
              className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-base flex items-center justify-center shadow-md border border-indigo-400/40 active:scale-95 transition shrink-0"
              title="Step forward 0.6mm (Right Arrow)"
            >
              +
            </button>
            <button
              onClick={stopSplineClipping}
              className="px-2.5 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 border border-red-800/60 text-red-300 hover:text-red-100 text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0"
              title="Exit Spline Clipping (ESC)"
            >
              <X size={12} />
              <span>Exit</span>
            </button>
          </div>

          {/* 2. Slice Options: Lock Clip View, Flip View */}
          {showSettings && (
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
                <Eye size={12} className="text-indigo-400" />
                <span className="font-semibold uppercase tracking-wider text-zinc-300">Slice Options</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSplineClippingAlignCamera(!splineClippingState.alignCamera)}
                  className={`px-3 py-1 rounded text-[10px] font-medium border flex items-center gap-1.5 transition ${
                    splineClippingState.alignCamera
                      ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  }`}
                  title="Lock camera to face the spline cross-section directly"
                >
                  <Compass size={11} />
                  <span>Lock Clip View</span>
                </button>

                <button
                  onClick={() => setSplineClippingInvert(!splineClippingState.invert)}
                  className={`px-3 py-1 rounded text-[10px] font-medium border flex items-center gap-1.5 transition ${
                    splineClippingState.invert
                      ? 'bg-amber-600/80 border-amber-500 text-white font-bold'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  }`}
                  title="Flip slice view direction (Key: I)"
                >
                  <RotateCcw size={11} />
                  <span>Flip View</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
