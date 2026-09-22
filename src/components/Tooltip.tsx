import React, { useState, useRef, useEffect } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'bottom',
  delay = 150,
  className = ''
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const positionClasses = {
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side];

  const arrowClasses = {
    bottom: '-top-1 left-1/2 -translate-x-1/2 border-b-zinc-900 dark:border-b-zinc-800 border-l-transparent border-r-transparent border-t-transparent border-4',
    top: '-bottom-1 left-1/2 -translate-x-1/2 border-t-zinc-900 dark:border-t-zinc-800 border-l-transparent border-r-transparent border-b-transparent border-4',
    left: '-right-1 top-1/2 -translate-y-1/2 border-l-zinc-900 dark:border-l-zinc-800 border-t-transparent border-b-transparent border-r-transparent border-4',
    right: '-left-1 top-1/2 -translate-y-1/2 border-r-zinc-900 dark:border-r-zinc-800 border-t-transparent border-b-transparent border-l-transparent border-4',
  }[side];

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onClick={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-[100] pointer-events-none whitespace-nowrap px-2.5 py-1 text-[11px] font-medium tracking-wide rounded-md bg-zinc-900 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 border border-zinc-700/80 dark:border-zinc-700 shadow-xl transition-all duration-150 animate-in fade-in zoom-in-95 ${positionClasses}`}
        >
          {content}
          <div className={`absolute w-0 h-0 ${arrowClasses}`} />
        </div>
      )}
    </div>
  );
}
