import { StatusChip } from '@/components/orders/Tracking';
import type { ChipTone } from '@/components/orders/format';
import type { SupportMessage, SupportStatus } from '@/lib/data/support';
import { cn } from '../lib/cn';

type Viewer = 'customer' | 'agent';

const STATUS: Record<SupportStatus, { customer: string; agent: string; tone: ChipTone }> = {
  open: { customer: 'Waiting for our reply', agent: 'Waiting on us', tone: 'warn' },
  answered: { customer: 'We replied', agent: 'Answered', tone: 'good' },
  closed: { customer: 'Closed', agent: 'Closed', tone: 'neutral' },
};

/** A case's status, worded for whoever is looking. */
export function CaseStatus({ status, viewer }: { status: SupportStatus; viewer: Viewer }) {
  return <StatusChip label={STATUS[status][viewer]} tone={STATUS[status].tone} />;
}

/**
 * A support case's messages, oldest first. The viewer's own messages say "You"; the other side is
 * the store ("Store support") for a shopper, or the shopper's name for an admin.
 */
export function CaseThread({ messages, viewer, customer, time }: {
  messages: SupportMessage[];
  viewer: Viewer;
  customer: string;
  time: (iso: string) => string;
}) {
  const who = (m: SupportMessage) => (m.from === viewer ? 'You' : m.from === 'agent' ? 'Store support' : customer || 'Customer');
  return (
    <ol aria-label="Messages" className="m-0 flex list-none flex-col gap-3 p-0">
      {messages.map((m) => (
        <li
          key={m.id}
          aria-label={`${who(m)}, ${time(m.createdAt)}`}
          className={cn('flex flex-col gap-1.5 rounded-panel border p-4', m.from === 'agent' ? 'border-line bg-surface-2' : 'border-line bg-surface')}
        >
          <span className="flex flex-wrap items-baseline gap-2 text-[13px] text-ink-3">
            <strong className="font-semibold text-ink">{who(m)}</strong>
            <span aria-hidden>·</span>
            <span>{time(m.createdAt)}</span>
          </span>
          <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
