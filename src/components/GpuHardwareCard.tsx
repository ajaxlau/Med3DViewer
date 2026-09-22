import { useState, useEffect } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { detectGpuCapabilities, GpuCapabilities } from '../lib/gpuDetection';
import { GpuCapabilityCard } from './GpuCapabilityCard';
import { Tooltip } from './Tooltip';

export function GpuHardwareCard({ className = "" }: { className?: string }) {
  const [capabilities, setCapabilities] = useState<GpuCapabilities | null>(null);
  const [loadingGpu, setLoadingGpu] = useState(true);

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

  const handleRecheckGpu = () => {
    setLoadingGpu(true);
    detectGpuCapabilities(true).then((cap) => {
      setCapabilities(cap);
      setLoadingGpu(false);
    });
  };

  return (
    <div className={`bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 sm:p-3 text-[12px] shadow-xs flex flex-col gap-2 ${className}`}>
      {/* Header with Title and inline Re-probe button */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Cpu size={13} />
          </div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100 truncate">
            GPU Hardware & Acceleration
          </h4>
        </div>

        <Tooltip content="Re-probe GPU capabilities" side="left">
          <button
            onClick={handleRecheckGpu}
            className="flex items-center gap-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-0.5 px-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 cursor-pointer shrink-0"
          >
            <RefreshCw size={10} className={loadingGpu ? "animate-spin text-blue-600" : ""} />
            <span>Re-probe</span>
          </button>
        </Tooltip>
      </div>

      {loadingGpu ? (
        <div className="py-3 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 gap-1.5">
          <RefreshCw className="animate-spin text-blue-600 dark:text-blue-400" size={16} />
          <span className="text-[10px]">Probing hardware pipeline...</span>
        </div>
      ) : capabilities ? (
        <GpuCapabilityCard capabilities={capabilities} compact={true} />
      ) : null}
    </div>
  );
}
