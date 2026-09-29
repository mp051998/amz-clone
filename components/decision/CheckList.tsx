import { cn } from '../lib/cn';

export interface CheckListProps {
  /** strengths — rendered with a green ✓. */
  good?: string[];
  /** trade-offs — rendered with a warn ⚠. */
  warn?: string[] | string | null;
  /** 14px (cards, default) or 15px (PDP). */
  size?: 'sm' | 'md';
  className?: string;
}

/** "WHY IT'S HERE" lines: ✓ strengths then ⚠ trade-offs (design.md §5 Why it's here). */
export function CheckList({ good = [], warn, size = 'sm', className }: CheckListProps) {
  const warns = warn == null ? [] : Array.isArray(warn) ? warn : [warn];
  if (!good.length && !warns.length) return null;
  const text = size === 'md' ? 'text-[15px] gap-2.5' : 'text-[14px] gap-2';
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-1.5 p-0', className)}>
      {good.map((t) => (
        <li key={`g-${t}`} className={cn('flex', text)}>
          <span aria-hidden className="font-bold text-good">✓</span>
          <span><span className="sr-only">Strength: </span>{t}</span>
        </li>
      ))}
      {warns.map((t) => (
        <li key={`w-${t}`} className={cn('flex', text)}>
          <span aria-hidden className="font-bold text-warn">⚠</span>
          <span><span className="sr-only">Trade-off: </span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
