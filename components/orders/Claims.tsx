import { ConfirmAction } from '../admin/ConfirmAction';
import { buttonClasses } from '@/components/primitives/Button';
import { CLAIM_REASON_LABEL, CLAIM_STATUS_LABEL, type AtozClaim, type ClaimStatus } from '@/lib/atoz';
import type { CurrencyCode } from '@/lib/contracts';
import { formatMoney } from '@/lib/marketplaces';
import { StatusChip } from './Tracking';
import { longDate, shortDate, type ChipTone, type StoreDates } from './format';

/** The order page's A-to-z Guarantee section: the claims filed about it, and where to file one. */

const CHIP: Record<ClaimStatus, ChipTone> = { under_review: 'warn', granted: 'good', denied: 'dark', withdrawn: 'neutral' };

/** "Lumen Store", "Lumen Store or Acme", "Lumen Store, Acme or Zed". */
function orList(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** What's happened with a claim, for the shopper. */
function claimText(c: AtozClaim, money: (minor: number) => string, refundTo: string, store: StoreDates): string {
  switch (c.status) {
    case 'under_review':
      return `We’re reviewing it and will let you know within a few days. ${c.seller} can still put it right in the meantime.`;
    case 'withdrawn':
      return `You withdrew it${c.withdrawnAt ? ` on ${shortDate(new Date(c.withdrawnAt), store)}` : ''}.`;
    case 'denied':
      return `We couldn’t grant it${c.decisionNote ? `: ${sentence(c.decisionNote)}` : '.'}`;
    case 'granted': {
      const amount = money(c.refund?.amountMinor ?? 0);
      const note = c.decisionNote ? ` ${sentence(c.decisionNote)}` : '';
      if (c.refund?.status === 'succeeded') return `We stepped in: ${amount} refunded to ${refundTo}, with nothing to send back.${note}`;
      if (c.refund?.status === 'failed') return `We stepped in. The refund of ${amount} to ${refundTo} is delayed; we’re retrying it.${note}`;
      return `We stepped in: the refund of ${amount} to ${refundTo} is on its way, with nothing to send back.${note}`;
    }
  }
}

export function ClaimsSection({
  claims,
  sellers,
  openUntil,
  fileHref,
  withdraw,
  currency,
  refundTo,
  store,
}: {
  claims: AtozClaim[];
  /** the sellers a claim can still be filed about */
  sellers: string[];
  /** the last day one can be filed, while it can */
  openUntil: Date | null;
  fileHref: string;
  /** bound "withdraw claim" action for a claim under review */
  withdraw: (claimId: string) => () => Promise<void>;
  currency: CurrencyCode;
  /** where a refund goes, mid-sentence */
  refundTo: string;
  store: StoreDates;
}) {
  const money = (minor: number) => formatMoney(minor, currency);
  const canFile = openUntil && sellers.length > 0;
  if (!claims.length && !canFile) return null;
  return (
    <section id="claims" className="flex flex-col gap-3" aria-labelledby="claims-h">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4">
        <div className="flex max-w-[640px] flex-col gap-0.5">
          <h2 id="claims-h" className="m-0 text-[16px] font-semibold">A-to-z Guarantee</h2>
          <p className="m-0 text-[14px] text-ink-2">
            {canFile
              ? <>Something from {orList(sellers)} didn’t arrive or isn’t as described? Contact the seller first. If they haven’t put it right within 2 days, file a claim by {longDate(openUntil, store)} and we’ll step in.</>
              : 'We step in when a seller doesn’t put things right.'}
          </p>
        </div>
        {canFile ? <a href={fileHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>File a claim</a> : null}
      </div>
      {claims.map((c) => (
        <article key={c.id} aria-label={`Claim about ${c.seller}`} className="flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip label={CLAIM_STATUS_LABEL[c.status]} tone={CHIP[c.status]} />
            <span className="text-[13px] text-ink-3">Filed {shortDate(new Date(c.createdAt), store)} · {CLAIM_REASON_LABEL[c.reason]}</span>
          </div>
          <p className="m-0 text-[15px] font-semibold">Items sold by {c.seller}</p>
          <p className="m-0 text-[14px] leading-[1.5] text-ink-2">{claimText(c, money, refundTo, store)}</p>
          <p className="m-0 whitespace-pre-line text-[13px] text-ink-3">“{c.details}”</p>
          {c.status === 'under_review' ? (
            <div className="border-t border-line-2 pt-2.5">
              <ConfirmAction
                action={withdraw(c.id)}
                label="Withdraw claim"
                prompt="Withdraw this claim? You can file it again later if the seller doesn’t put it right."
                confirmLabel="Yes, withdraw it"
                pendingLabel="Withdrawing…"
                cancelLabel="Keep it"
              />
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
