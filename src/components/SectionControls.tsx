import { ChevronDown, ChevronUp, Pin, PinOff } from 'lucide-react';

export const SECTION_COLLAPSE_DELAY_MS = 10_000;

export function SectionControls({ label, expanded, pinned, onToggle, onPin }: {
  label: string;
  expanded: boolean;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
}) {
  const button = 'flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors';
  const idle = 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50';
  return <div className="flex shrink-0 items-center gap-1" onClick={event => event.stopPropagation()}>
    <button type="button" aria-label={`Pin ${label}`} aria-pressed={pinned} title={pinned ? `Unpin ${label}` : `Keep ${label} open`} onClick={onPin}
      className={`${button} ${pinned ? 'text-blue-600 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/40' : idle}`}>
      {pinned ? <Pin size={13} className="fill-current" /> : <PinOff size={13} />}
    </button>
    <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={expanded} title={`${expanded ? 'Collapse' : 'Expand'} ${label}`} onClick={onToggle} className={`${button} ${idle}`}>
      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  </div>;
}
