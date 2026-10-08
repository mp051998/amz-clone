import { cn } from '../lib/cn';

/** The "Plus exclusive deal" tag, in the store's membership's name. */
export function MemberDealTag({ label, className }: { label: string; className?: string }) {
  return <span className={cn('rounded-[3px] bg-ink px-[5px] py-px text-[11px] font-bold uppercase text-on-ink', className)}>{label}</span>;
}

/**
 * A Plus exclusive deal on a product's page: what a member pays (and saves), or for anyone else,
 * what members pay and a way to join.
 */
export function MemberDeal({
  label,
  membership,
  pct,
  priceText,
  member,
  joinHref,
}: {
  label: string;
  membership: string;
  pct: number;
  priceText: string;
  member: boolean;
  joinHref: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[14px] text-ink-2">
      <MemberDealTag label={label} />
      {member ? (
        <span>
          You pay <strong className="font-semibold text-ink">{priceText}</strong> as a {membership} member ({pct}% off)
        </span>
      ) : (
        <span>
          <strong className="font-semibold text-ink">{priceText}</strong> for {membership} members ({pct}% off).{' '}
          <a href={joinHref} className="text-ink underline underline-offset-2">
            Join {membership}
          </a>
        </span>
      )}
    </span>
  );
}
