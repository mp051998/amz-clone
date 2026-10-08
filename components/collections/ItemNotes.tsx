import type { ListPriority } from '@/lib/decision/types';

export const PRIORITY_LABEL: Record<ListPriority, string> = {
  lowest: 'Lowest',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  highest: 'Highest',
};

/**
 * A list item's priority, quantity and comment, as Amazon's lists show them. Nothing for an item
 * left as it was saved (medium, one, no comment).
 */
export function ItemNotes({ comment = '', quantity = 1, priority = 'medium' }: { comment?: string; quantity?: number; priority?: ListPriority }) {
  if (!comment && quantity <= 1 && priority === 'medium') return null;
  return (
    <dl className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2">
      {priority !== 'medium' ? (
        <div className="flex gap-1">
          <dt className="text-ink-3">Priority:</dt>
          <dd className="m-0 font-semibold">{PRIORITY_LABEL[priority]}</dd>
        </div>
      ) : null}
      {quantity > 1 ? (
        <div className="flex gap-1">
          <dt className="text-ink-3">Quantity:</dt>
          <dd className="m-0 font-semibold tabular-nums">{quantity}</dd>
        </div>
      ) : null}
      {comment ? (
        <div className="flex basis-full gap-1">
          <dt className="sr-only">Comment</dt>
          <dd className="m-0 whitespace-pre-line break-words italic text-pretty">“{comment}”</dd>
        </div>
      ) : null}
    </dl>
  );
}
