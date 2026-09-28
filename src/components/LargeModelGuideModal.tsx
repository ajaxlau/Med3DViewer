import { useState, useEffect } from 'react';
import { HelpCircle, X, Cpu, Layers, HardDrive, Smartphone, CheckCircle, ArrowRight } from 'lucide-react';
import { detectGpuCapabilities, GpuCapabilities } from '../lib/gpuDetection';

export function LargeModelGuideModal({
  onClose,
  onOpenGpuStatus,
}: {
  onClose: () => void;
  onOpenGpuStatus: () => void;
}) {
  const [capabilities, setCapabilities] = useState<GpuCapabilities | null>(null);

  useEffect(() => {
    detectGpuCapabilities().then((cap) => {
      setCapabilities(cap);
    });
  }, []);

  return (
    <div className="flex flex-col text-zinc-700 dark:text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <HelpCircle size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
              Low-Memory & Mobile Model Optimization Guide
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
              Medical 3D Printing Service · Performance Best Practices
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* Hardware Profile Banner */}
      {capabilities && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Detected Hardware Profile:
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 uppercase">
              {capabilities.isMobileDevice ? 'Mobile Device' : 'Desktop / Workstation'} · {capabilities.isLowMemoryDevice ? 'Low-Memory Mode' : 'Standard Pipeline'}
            </span>
          </div>
          <button
            onClick={onOpenGpuStatus}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>Hardware Specs</span>
            <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Optimization Tips Grid */}
      <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1">
        {/* Tip 1 */}
        <div className="p-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3">
          <div className="w-7 h-7 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <HardDrive size={15} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              1. Always Use Binary STL (Not ASCII STL)
            </h4>
            <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
              ASCII STL files use plain text coordinate strings that are up to <strong>5x larger</strong> than binary STL files and require intensive JavaScript text parsing that can exhaust mobile browser memory. Always select <em>Binary STL</em> when exporting from 3D Slicer, Mimics, or CAD software.
            </p>
          </div>
        </div>

        {/* Tip 2 */}
        <div className="p-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3">
          <div className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Layers size={15} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              2. Target Polygon Count (&lt; 500,000 Triangles on Mobile)
            </h4>
            <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
              Mobile browsers enforce strict memory limits per tab (512MB – 1.4GB on iOS/Android). Models with over 1,000,000 polygons can cause WebGL context crashes. Applying surface decimation (e.g. Quadric Edge Collapse) down to 250,000–500,000 triangles preserves full anatomical fidelity while ensuring instant rendering.
            </p>
          </div>
        </div>

        {/* Tip 3 */}
        <div className="p-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3">
          <div className="w-7 h-7 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Smartphone size={15} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              3. Automatic Built-In Low-Memory Protection
            </h4>
            <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
              This viewer automatically adapts to low-memory and mobile devices:
            </p>
            <ul className="mt-1.5 space-y-1 text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
              <li className="flex items-center gap-1.5">
                <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                <span>Device Pixel Ratio capped at 1.0x to eliminate multi-million pixel VRAM spikes.</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                <span>Aggressive memory buffer disposal prevents memory leaks between model switches.</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                <span>Direct ArrayBuffer STLLoader fallback activates automatically if online importers stall.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Tip 4 */}
        <div className="p-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3">
          <div className="w-7 h-7 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Cpu size={15} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">
              4. Packaging Multiple Components into a Single ZIP
            </h4>
            <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
              If your surgical planning case involves multiple anatomical parts (e.g. skull, cutting guide, fibula plate), bundle them together into a standard <code>.zip</code> file. Dragging the ZIP file into the viewer extracts and loads all components in stream memory.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-4">
        <button
          onClick={onOpenGpuStatus}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold"
        >
          <Cpu size={14} />
          <span>View Hardware Pipeline</span>
        </button>

        <button
          onClick={onClose}
          className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
        >
          Understood
        </button>
      </div>
    </div>
  );
}
