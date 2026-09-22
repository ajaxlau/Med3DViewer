import { useState, useEffect } from 'react';
import { Cpu, RefreshCw, X } from 'lucide-react';
import { detectGpuCapabilities, GpuCapabilities } from '../lib/gpuDetection';
import { GpuCapabilityCard } from './GpuCapabilityCard';

export function GpuStatusModal({ onClose }: { onClose: () => void }) {
  const [capabilities, setCapabilities] = useState<GpuCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    detectGpuCapabilities().then((cap) => {
      if (mounted) {
        setCapabilities(cap);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const handleRecheck = () => {
    setLoading(true);
    detectGpuCapabilities(true).then((cap) => {
      setCapabilities(cap);
      setLoading(false);
    });
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
              GPU Hardware & Acceleration
            </h3>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
        >
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 gap-2">
          <RefreshCw className="animate-spin text-blue-600 dark:text-blue-400" size={24} />
          <span className="text-xs">Probing hardware pipeline and shader modules...</span>
        </div>
      ) : capabilities ? (
        <div className="flex flex-col gap-4">
          <GpuCapabilityCard capabilities={capabilities} />

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800 mt-1">
            <button
              onClick={handleRecheck}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold"
            >
              <RefreshCw size={14} />
              <span>Re-probe GPU</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
