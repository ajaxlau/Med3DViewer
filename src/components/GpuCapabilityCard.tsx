import { AlertCircle } from 'lucide-react';
import { GpuCapabilities } from '../lib/gpuDetection';

interface GpuCapabilityCardProps {
  capabilities: GpuCapabilities;
  compact?: boolean;
}

export function GpuCapabilityCard({ capabilities, compact = false }: GpuCapabilityCardProps) {
  const isWebGpu = capabilities.tier === 'webgpu';
  const isWebGL2 = capabilities.tier === 'webgl2';

  const tierColors = isWebGpu
    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
    : isWebGL2
    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-200'
    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200';

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Status badge banner */}
      <div className={`px-2.5 py-1.5 rounded border flex items-center justify-between ${tierColors}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold uppercase tracking-wider text-[11px] shrink-0">
            ACTIVE TIER: {capabilities.tier.toUpperCase()}
          </span>
          <span className="opacity-80 text-[10px] truncate hidden sm:inline">
            {isWebGpu
              ? 'Native WebGPU compute and buffer pipelines active'
              : 'Optimized WebGL2 fallback rendering pipeline active'}
          </span>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/80 dark:bg-black/40 border border-current font-bold uppercase shrink-0">
          {isWebGpu ? 'TIER 1' : 'TIER 2'}
        </span>
      </div>

      {/* Fallback explanation if applicable */}
      {capabilities.fallbackReason && (
        <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-300 flex items-start gap-1.5 text-[10px]">
          <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <span>{capabilities.fallbackReason}</span>
        </div>
      )}

      {/* 2-Column Spec & Feature Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Hardware Details Table */}
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2 flex flex-col justify-between gap-1 font-mono text-[10px]">
          <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <span className="text-zinc-500 dark:text-zinc-400">Adapter:</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-right truncate max-w-[140px]" title={capabilities.adapterName}>
              {capabilities.adapterName}
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <span className="text-zinc-500 dark:text-zinc-400">Vendor:</span>
            <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">{capabilities.vendor}</span>
          </div>
          <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <span className="text-zinc-500 dark:text-zinc-400">Pipeline:</span>
            <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">{capabilities.architecture}</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-zinc-500 dark:text-zinc-400">Workgroup / Buffer:</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
              {capabilities.maxComputeWorkgroupSizeX || 256} · {capabilities.maxStorageBufferBindingSize ? `${(capabilities.maxStorageBufferBindingSize / (1024 * 1024)).toFixed(0)} MB` : '128 MB'}
            </span>
          </div>
        </div>

        {/* Compute & Feature Support Matrix */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-0.5">
            Compute & Features
          </span>
          <div className="grid grid-cols-2 gap-1 text-[10px] h-full">
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 truncate mr-1">WASM Parser</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Supported</span>
            </div>
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 truncate mr-1">Offline Store</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Ready</span>
            </div>
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 truncate mr-1">BVH Spatial</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Enabled</span>
            </div>
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 truncate mr-1">Compute</span>
              <span className={`font-bold shrink-0 ${isWebGpu ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                {isWebGpu ? 'WGSL' : 'CPU'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
