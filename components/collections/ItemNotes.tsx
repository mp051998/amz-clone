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
 * left as it was saved (medium, one, no comment). Given `has` (gift givers on a shared list), the
 * quantity reads "Needs 3 · Has 1".
 */
export function ItemNotes({ comment = '', quantity = 1, priority = 'medium', has }: {
  comment?: string;
  quantity?: number;
  priority?: ListPriority;
  /** how many gift givers marked bought */
  has?: number;
}) {
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
          <dt className="text-ink-3">{has === undefined ? 'Quantity:' : 'Needs:'}</dt>
          <dd className="m-0 font-semibold tabular-nums">{quantity}</dd>
        </div>
      ) : null}
      {quantity > 1 && has !== undefined ? (
        <div className="flex gap-1">
          <dt className="text-ink-3">Has:</dt>
          <dd className="m-0 font-semibold tabular-nums">{has}</dd>
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
