import { useState, useEffect } from 'react';
import { useViewer } from '../context/ViewerContext';
import { Cpu, RefreshCw, X, Loader2, Activity, FileCode } from 'lucide-react';
import { detectGpuCapabilities, GpuCapabilities } from '../lib/gpuDetection';
import { ModelStats } from '../lib/ViewerManager';
import { GpuCapabilityCard } from './GpuCapabilityCard';

export function SystemStatusSidebar({ onClose }: { onClose?: () => void }) {
  const { status, loadingProgress, isEmpty, filename, meshes, viewerManager } = useViewer();
  const [capabilities, setCapabilities] = useState<GpuCapabilities | null>(null);
  const [loadingGpu, setLoadingGpu] = useState(true);
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);

  useEffect(() => {
    let mounted = true;
    detectGpuCapabilities().then((cap) => {
      if (mounted) {
        setCapabilities(cap);
        setLoadingGpu(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (viewerManager && !isEmpty) {
      const stats = viewerManager.getModelStats();
      setModelStats(stats);
    } else {
      setModelStats(null);
    }
  }, [viewerManager, isEmpty, meshes, filename]);

  const handleRecheckGpu = () => {
    setLoadingGpu(true);
    detectGpuCapabilities(true).then((cap) => {
      setCapabilities(cap);
      setLoadingGpu(false);
    });
  };

  const isLoading = status.includes('Loading') || status.includes('Parsing') || (loadingProgress > 0 && loadingProgress < 100);

  return (
    <aside className="w-full md:w-[320px] lg:w-[340px] h-auto max-h-[50vh] md:max-h-none md:h-auto border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col overflow-y-auto overflow-x-hidden shrink-0 transition-all duration-300">
      <div className="flex flex-col w-full min-h-min pb-5">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
          <div className="flex items-center font-bold text-sm text-zinc-800 dark:text-zinc-100 uppercase tracking-widest">
            <span>System Status</span>
          </div>
          {onClose && (
            <button 
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
              onClick={onClose}
              title="Close System Status"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Card 1: Model Status */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-4 text-[13px] text-zinc-600 dark:text-zinc-400 shadow-sm flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Activity size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
                  Model Status
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    {isLoading && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      status.includes('Error') ? 'bg-red-500' :
                      isLoading ? 'bg-blue-500' : 'bg-emerald-500 dark:bg-emerald-400'
                    }`}></span>
                  </span>
                  <span className="truncate">
                    {isLoading ? 'Active Process' : status.includes('Error') ? 'Error' : isEmpty ? 'Ready / Standby' : 'Model Active'}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-zinc-700 dark:text-zinc-300">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center w-full">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                    <Loader2 className="animate-spin shrink-0" size={18} />
                    <span className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line text-xs font-semibold">
                      {status.replace(/\*\*/g, '')}
                    </span>
                  </div>
                  
                  {/* Integrated Progress Bar in System Status Box */}
                  <div className="w-full mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex justify-between items-center text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1.5">
                      <span>Loading Progress</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{Math.round(loadingProgress || 5)}%</span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden shadow-inner">
                      <div 
                        className="bg-gradient-to-r from-blue-600 to-blue-500 h-2 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${Math.max(5, Math.min(100, loadingProgress))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ) : !isEmpty && (modelStats || filename) ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileCode size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 truncate" title={modelStats?.filename || filename || '3D Model'}>
                        {modelStats?.filename || filename || '3D Model'}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold uppercase shrink-0">
                      {modelStats?.fileFormat || '3D'}
                    </span>
                  </div>

                  {modelStats && (
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                        <span className="text-zinc-500 dark:text-zinc-400">Triangles:</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {modelStats.triangleCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                        <span className="text-zinc-500 dark:text-zinc-400">Vertices:</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {modelStats.vertexCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                        <span className="text-zinc-500 dark:text-zinc-400">Mesh Count:</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {modelStats.meshCount}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                        <span className="text-zinc-500 dark:text-zinc-400">Dimensions:</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                          {modelStats.dimensions.x} × {modelStats.dimensions.y} × {modelStats.dimensions.z} mm
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-zinc-500 dark:text-zinc-400">Materials:</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {modelStats.materialCount}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  <p className="whitespace-pre-line text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {status.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                      part.startsWith('**') && part.endsWith('**') ? (
                        <strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: GPU Hardware & Acceleration */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-4 text-[13px] shadow-sm flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Cpu size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
                  GPU Hardware & Acceleration
                </h4>
              </div>
            </div>

            {loadingGpu ? (
              <div className="py-6 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 gap-2">
                <RefreshCw className="animate-spin text-blue-600 dark:text-blue-400" size={20} />
                <span className="text-[11px]">Probing hardware pipeline...</span>
              </div>
            ) : capabilities ? (
              <div className="flex flex-col gap-3">
                <GpuCapabilityCard capabilities={capabilities} compact={true} />

                {/* Re-probe button */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={handleRecheckGpu}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 px-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                  >
                    <RefreshCw size={12} className={loadingGpu ? "animate-spin text-blue-600" : ""} />
                    <span>Re-probe GPU</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
