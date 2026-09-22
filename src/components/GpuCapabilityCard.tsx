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
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4 text-xs'}`}>
      {/* Status badge banner */}
      <div className={`p-2.5 rounded border flex items-center justify-between ${tierColors}`}>
        <div className="flex flex-col">
          <span className={`font-bold uppercase tracking-wider block ${compact ? 'text-[11px]' : 'text-xs'}`}>
            Active Tier: {capabilities.tier.toUpperCase()}
          </span>
          <span className={`opacity-80 block ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>
            {isWebGpu
              ? 'Native WebGPU compute and buffer pipelines active'
              : 'Optimized WebGL2 fallback rendering pipeline active'}
          </span>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/70 dark:bg-black/30 border border-current font-bold uppercase shrink-0">
          {isWebGpu ? 'Tier 1' : 'Tier 2'}
        </span>
      </div>

      {/* Fallback explanation if applicable */}
      {capabilities.fallbackReason && (
        <div className={`p-2 rounded bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-300 flex items-start gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <AlertCircle size={compact ? 13 : 15} className="text-amber-500 shrink-0 mt-0.5" />
          <span>{capabilities.fallbackReason}</span>
        </div>
      )}

      {/* Details Table */}
      <div className={`bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2.5 flex flex-col gap-1.5 font-mono ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <span className="text-zinc-500 dark:text-zinc-400">Adapter / GPU:</span>
          <span className={`font-semibold text-zinc-800 dark:text-zinc-200 text-right truncate ${compact ? 'max-w-[150px]' : 'max-w-[240px]'}`}>
            {capabilities.adapterName}
          </span>
        </div>
        <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <span className="text-zinc-500 dark:text-zinc-400">Vendor:</span>
          <span className="text-zinc-800 dark:text-zinc-200">{capabilities.vendor}</span>
        </div>
        <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <span className="text-zinc-500 dark:text-zinc-400">Pipeline Type:</span>
          <span className="text-zinc-800 dark:text-zinc-200">{capabilities.architecture}</span>
        </div>
        {capabilities.maxComputeWorkgroupSizeX && (
          <div className="flex justify-between items-center py-0.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <span className="text-zinc-500 dark:text-zinc-400">Max Workgroup Size:</span>
            <span className="text-zinc-800 dark:text-zinc-200">{capabilities.maxComputeWorkgroupSizeX}</span>
          </div>
        )}
        {capabilities.maxStorageBufferBindingSize && (
          <div className="flex justify-between items-center py-0.5">
            <span className="text-zinc-500 dark:text-zinc-400">Storage Buffer Binding:</span>
            <span className="text-zinc-800 dark:text-zinc-200">
              {(capabilities.maxStorageBufferBindingSize / (1024 * 1024)).toFixed(0)} MB
            </span>
          </div>
        )}
      </div>

      {/* Compute & Feature Support */}
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Compute & Feature Support
        </span>
        <div className={`grid grid-cols-2 gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="truncate mr-1">WASM Parser</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Supported</span>
          </div>
          <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="truncate mr-1">Offline Storage</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Ready</span>
          </div>
          <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="truncate mr-1">BVH Spatial</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Enabled</span>
          </div>
          <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="truncate mr-1">Compute Shaders</span>
            <span className={`font-bold shrink-0 ${isWebGpu ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
              {isWebGpu ? 'WGSL' : 'CPU'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
