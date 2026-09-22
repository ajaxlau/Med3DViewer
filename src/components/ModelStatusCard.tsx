import { useState, useEffect } from 'react';
import { useViewer } from '../context/ViewerContext';
import { Activity, FileCode, Loader2 } from 'lucide-react';
import { ModelStats } from '../lib/ViewerManager';

export function ModelStatusCard({ className = "" }: { className?: string }) {
  const { status, loadingProgress, isEmpty, filename, meshes, viewerManager } = useViewer();
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);

  useEffect(() => {
    if (viewerManager && !isEmpty) {
      const stats = viewerManager.getModelStats();
      setModelStats(stats);
    } else {
      setModelStats(null);
    }
  }, [viewerManager, isEmpty, meshes, filename]);

  const isLoading = status.includes('Loading') || status.includes('Parsing') || (loadingProgress > 0 && loadingProgress < 100);

  return (
    <div className={`bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3.5 text-[13px] text-zinc-600 dark:text-zinc-400 shadow-xs flex flex-col gap-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
          <Activity size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
            Model Status
          </h4>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
            <span className="relative flex h-2 w-2 shrink-0">
              {isLoading && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                status.includes('Error') ? 'bg-red-500' :
                isLoading ? 'bg-blue-500' :
                isEmpty ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-emerald-500 dark:bg-emerald-400'
              }`}></span>
            </span>
            <span className="truncate">
              {isLoading ? 'Active Process' : status.includes('Error') ? 'Error' : isEmpty ? 'Ready / Standby' : 'Model Active'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="text-zinc-700 dark:text-zinc-300">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center w-full py-1">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
              <Loader2 className="animate-spin shrink-0" size={16} />
              <span className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line text-xs font-semibold">
                {status.replace(/\*\*/g, '')}
              </span>
            </div>
            
            {/* Integrated Progress Bar */}
            <div className="w-full mt-1 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                <span>Loading Progress</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{Math.round(loadingProgress || 5)}%</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${Math.max(5, Math.min(100, loadingProgress))}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : !isEmpty && (modelStats || filename) ? (
          <div className="flex flex-col gap-2.5">
            {/* File info pill */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileCode size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-semibold text-[11px] text-zinc-800 dark:text-zinc-200 truncate" title={modelStats?.filename || filename || '3D Model'}>
                  {modelStats?.filename || filename || '3D Model'}
                </span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold uppercase shrink-0">
                {modelStats?.fileFormat || '3D'}
              </span>
            </div>

            {/* Geometry stats table */}
            {modelStats && (
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Triangles:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                    {modelStats.triangleCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Vertices:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                    {modelStats.vertexCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Mesh Count:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                    {modelStats.meshCount}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Dimensions:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[10px]">
                    {modelStats.dimensions.x} × {modelStats.dimensions.y} × {modelStats.dimensions.z} mm
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Materials:</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                    {modelStats.materialCount}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-1">
            <p className="whitespace-pre-line text-xs font-medium text-zinc-500 dark:text-zinc-400 text-center">
              {status ? status.replace(/\*\*/g, '') : 'No model loaded into workspace.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
