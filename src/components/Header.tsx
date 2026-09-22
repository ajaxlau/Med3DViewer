import { Link, Share2, Ruler, Moon, Sun, PenTool, Camera, RotateCcw, Download, Info, Activity } from 'lucide-react';
import { useViewer } from '../context/ViewerContext';
import { usePwaInstallPrompt } from '../lib/usePwaInstallPrompt';

// Custom icon: 3 parallel menu lines with an overlaid eye, middle line broken around pupil
export function VisualizationMenuIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      {/* Top and bottom parallel lines placed at full icon height bounds */}
      <line x1="3" y1="3" x2="21" y2="3" />
      <line x1="3" y1="21" x2="21" y2="21" />
      
      {/* Middle line broken so it does not cross over the center pupil */}
      <line x1="3" y1="12" x2="7.5" y2="12" />
      <line x1="16.5" y1="12" x2="21" y2="12" />
      
      {/* Full-height eye outline and central pupil */}
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Header({ 
  toggleSidebar,
  systemStatusOpen,
  toggleSystemStatus
}: { 
  toggleSidebar: () => void;
  systemStatusOpen?: boolean;
  toggleSystemStatus?: () => void;
}) {
  const { 
    theme, setTheme, activeModal, setActiveModal, toggleRulers, rulersVisible 
  } = useViewer();

  const { isInstallable, triggerInstallPrompt } = usePwaInstallPrompt();

  return (
    <header className="h-[64px] bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 z-10 shrink-0 md:h-[64px] h-auto py-2 md:py-0 flex-col md:flex-row gap-3 md:gap-0">
      <div className="flex items-center gap-3 font-bold text-[14px] text-zinc-800 dark:text-zinc-100 font-display tracking-tight text-base md:text-lg">
        <img 
          src="./3DPO_Small_Logo.png" 
          alt="3DPO Logo" 
          className="h-6 w-auto max-w-[150px] object-contain" 
        />
        <span className="whitespace-nowrap md:text-[14px] text-xs truncate max-w-[200px] md:max-w-none">
          NTEC 3DPO - Medical 3D Viewer<sup>+</sup>
        </span>
      </div>
      
      <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto justify-start md:justify-end text-zinc-500 dark:text-zinc-400">
        {/* PWA Install Button when available */}
        {isInstallable && (
          <button
            onClick={() => triggerInstallPrompt()}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors mr-1"
            title="Install 3DViewerPlus as Desktop / Standalone App"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}

        {toggleSystemStatus && (
          <button 
            className={`w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 ${systemStatusOpen ? 'text-blue-600 dark:text-blue-400 bg-zinc-100 dark:bg-zinc-800 font-semibold' : ''}`} 
            onClick={toggleSystemStatus} 
            title="Toggle System Status"
          >
            <Activity size={18} />
          </button>
        )}

        <button className="w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400" onClick={toggleSidebar} title="Toggle Visualization Tools">
          <VisualizationMenuIcon size={18} />
        </button>

        <button className="w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400" onClick={() => setActiveModal('url')} title="Load from URL">
          <Link size={18} />
        </button>
        <button className="w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400" onClick={() => setActiveModal('share')} title="Share Model">
          <Share2 size={18} />
        </button>
        <button 
          className={`w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 ${activeModal === 'snapshot' ? 'text-blue-600 dark:text-blue-400 bg-zinc-100 dark:bg-zinc-800' : ''}`} 
          onClick={() => setActiveModal(activeModal === 'snapshot' ? null : 'snapshot')} 
          title="Snapshot & WhatsApp Share"
        >
          <Camera size={18} />
        </button>
        <button 
          className={`w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 ${rulersVisible ? 'text-blue-600 dark:text-blue-400 bg-zinc-100 dark:bg-zinc-800' : ''}`} 
          onClick={toggleRulers} 
          title="Toggle Rulers"
        >
          <Ruler size={18} />
        </button>
        <button className="w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle Dark Mode">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button 
          className={`w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 ${activeModal === 'info' ? 'text-blue-600 dark:text-blue-400 bg-zinc-100 dark:bg-zinc-800' : ''}`} 
          onClick={() => setActiveModal(activeModal === 'info' ? null : 'info')} 
          title="User Guide & Readme Documentation"
        >
          <Info size={18} />
        </button>

        <button 
          className={`w-8 h-8 rounded shrink-0 flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-600 dark:hover:text-red-400 ${activeModal === 'reset' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40' : ''}`} 
          onClick={() => setActiveModal(activeModal === 'reset' ? null : 'reset')} 
          title="Reset Workspace (Clear Models & Analytic Items)"
        >
          <RotateCcw size={18} />
        </button>

        <button 
          className={`hidden sm:flex w-8 h-8 rounded shrink-0 items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 ${activeModal === 'planning' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : ''}`} 
          onClick={() => setActiveModal(activeModal === 'planning' ? null : 'planning')} 
          title="3D Interaction Analytic Tools"
        >
          <PenTool size={18} />
        </button>
      </div>
    </header>
  );
}
