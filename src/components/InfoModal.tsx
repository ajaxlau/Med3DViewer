import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Info, X, BookOpen } from 'lucide-react';
import readmeText from '../../README.md?raw';

export function InfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-xs">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 id="info-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                User Guide & Documentation
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                  README
                </span>
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                NTEC 3D Printing Office — Medical 3D Viewer Plus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Markdown Body */}
        <div className="p-6 overflow-y-auto flex-1 text-sm text-zinc-700 dark:text-zinc-300">
          <div className="max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800 tracking-tight">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-6 mb-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 tracking-tight flex items-center gap-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-4 mb-2 tracking-normal">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-300 mb-3 leading-relaxed">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 mb-3 space-y-1 text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 mb-3 space-y-1 text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed">
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {children}
                  </strong>
                ),
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800 shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 font-bold border-b border-zinc-200 dark:border-zinc-800">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                    {children}
                  </tbody>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                    {children}
                  </tr>
                ),
                th: ({ children }) => (
                  <th className="p-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="p-2.5 text-zinc-600 dark:text-zinc-300">
                    {children}
                  </td>
                ),
                code: ({ children }) => (
                  <code className="font-mono bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded text-[11px] text-blue-600 dark:text-blue-400 font-semibold border border-zinc-200/60 dark:border-zinc-700/60">
                    {children}
                  </code>
                ),
                hr: () => (
                  <hr className="my-5 border-zinc-200 dark:border-zinc-800" />
                ),
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-blue-600 dark:text-blue-400 font-medium hover:underline inline-flex items-center gap-0.5"
                  >
                    {children}
                  </a>
                )
              }}
            >
              {readmeText}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Info size={13} className="text-blue-600 dark:text-blue-400" />
            <span>Press <kbd className="font-mono px-1 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-[10px] text-zinc-700 dark:text-zinc-300">Esc</kbd> or click outside to dismiss</span>
          </div>
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-sm text-xs font-bold uppercase tracking-widest bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
