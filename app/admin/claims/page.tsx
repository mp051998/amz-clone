import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { fieldClass } from '@/components/lib/controls';
import { StatusChip } from '@/components/orders/Tracking';
import type { ChipTone } from '@/components/orders/format';
import { CLAIM_NOT_ALLOWED, CLAIM_NOTE_MAX, CLAIM_REASON_LABEL, CLAIM_STATUS_LABEL, type ClaimStatus } from '@/lib/atoz';
import { claimFilter, listClaimQueue, type AdminClaim, type AdminClaimFilter } from '@/lib/data/atoz-claims';
import { messageFor } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { adminTime } from '../orders/labels';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { claimAction } from './actions';

export const metadata: Metadata = { title: 'Claims · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const FILTER_LABEL: Record<AdminClaimFilter, string> = { open: 'Under review', decided: 'Decided', all: 'All' };
const CHIP: Record<ClaimStatus, ChipTone> = { under_review: 'warn', granted: 'good', denied: 'dark', withdrawn: 'neutral' };
const DONE: Record<string, string> = {
  grant: 'Claim granted. The shopper has been refunded.',
  grant_pending: 'Claim granted. The card refund is under way.',
  grant_failed: 'Claim granted, but the card refund didn’t go through. Retry it under Returns › Refund issues.',
  deny: 'Claim denied. The shopper sees your note.',
};
const FIELD_ERROR: Record<string, string> = {
  note: 'Say why the claim is denied (the shopper sees it), in up to 1,000 characters.',
};
const EMPTY: Record<AdminClaimFilter, [string, string]> = {
  open: ['No claims to review.', 'A-to-z Guarantee claims shoppers file show up here until you decide them.'],
  decided: ['No decided claims yet.', 'Granted and denied claims show up here.'],
  all: ['No claims yet.', 'A-to-z Guarantee claims shoppers file show up here.'],
};

/**
 * /admin/claims (and /in/admin/claims): A-to-z Guarantee claims about the store's other sellers.
 * Granting one refunds what's left of that seller's items in the order at once; denying it needs a
 * note the shopper sees.
 */
export default async function AdminClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/claims');
  if (!admin) return <AdminOnly store={store} />;

  const filter = claimFilter(one(sp, 'filter'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listClaimQueue(await db(), store.id, { filter, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, f: AdminClaimFilter = filter) => {
    const out = new URLSearchParams();
    if (f !== 'open') out.set('filter', f);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/claims${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const detail = one(sp, 'detail');
  const done = one(sp, 'done');
  const n = (v: number) => v.toLocaleString('en-US');
  const errorText = error
    ? (error === 'invalid_input' && FIELD_ERROR[detail]) ||
      (error === 'claim_not_allowed' && detail === 'nothing_left' ? 'Everything from that seller in the order has been returned or refunded since. Deny the claim with a note instead.' : null) ||
      (error === 'claim_not_allowed' && CLAIM_NOT_ALLOWED[detail]) ||
      messageFor(error) ||
      'Something went wrong. Please try again.'
    : null;

  return (
    <AdminFrame
      store={store}
      path="/admin/claims"
      title="A-to-z Guarantee claims"
      lede={<>Shoppers file a claim when one of the store’s other sellers didn’t deliver or sent something not as described, and didn’t put it right within 2 days. Granting refunds what’s left of that seller’s items in the order, with nothing sent back.</>}
    >
      <AdminTabs
        label="Claim filter"
        tabs={(['open', 'decided', 'all'] as const).map((f) => ({ href: listHref(1, f), label: `${FILTER_LABEL[f]} (${n(result.counts[f])})`, current: f === filter }))}
      />
      {errorText ? <Alert tone="error">{errorText}</Alert> : null}
      {!error && DONE[done] ? <Alert tone={done === 'grant_failed' ? 'error' : 'success'}>{DONE[done]}</Alert> : null}

      {result.claims.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.claims.map((c) => (
            <li key={c.id}>
              <ClaimRow c={c} store={store} to={to} act={(move) => claimAction.bind(null, c.id, move, filter)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={EMPTY[filter][0]}>{EMPTY[filter][1]}</EmptyState>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[14px]">
          {result.page > 1 ? <a href={listHref(result.page - 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>← Previous</a> : <span />}
          <span className="text-ink-2">Page {result.page} of {pageCount}</span>
          {result.page < pageCount ? <a href={listHref(result.page + 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Next →</a> : <span />}
        </nav>
      ) : null}
    </AdminFrame>
  );
}

function ClaimRow({
  c,
  store,
  to,
  act,
}: {
  c: AdminClaim;
  store: Parameters<typeof adminTime>[1] & { currency: { code: Parameters<typeof formatMoney>[1] } };
  to: (path: string) => string;
  act: (move: 'grant' | 'deny') => (formData: FormData) => Promise<void>;
}) {
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const when =
    c.status === 'withdrawn' && c.withdrawnAt
      ? `Filed ${adminTime(c.createdAt, store)} · withdrawn ${adminTime(c.withdrawnAt, store)}`
      : c.decidedAt
        ? `Filed ${adminTime(c.createdAt, store)} · ${c.status} ${adminTime(c.decidedAt, store)}`
        : `Filed ${adminTime(c.createdAt, store)}`;
  return (
    <article aria-labelledby={`cl-${c.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <a href={to(`/admin/orders/${encodeURIComponent(c.orderId)}`)} className="self-start font-mono text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">{c.orderId}</a>
          <strong id={`cl-${c.id}`} className="text-[16px] font-semibold leading-[1.35]">Sold by {c.seller}</strong>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <StatusChip label={CLAIM_STATUS_LABEL[c.status]} tone={CHIP[c.status]} />
          <StatusChip label={CLAIM_REASON_LABEL[c.reason]} tone="neutral" />
        </span>
      </div>

      <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">“{c.details}”</p>
      {c.decisionNote ? <p className="m-0 text-[14px] text-ink-2">Note to shopper: {c.decisionNote}</p> : null}

      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
        {c.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{i.qty} × {i.title}</span>
            <span className="flex-none tabular-nums text-ink-2">{money(i.unitPriceMinor * i.qty)}</span>
          </li>
        ))}
      </ul>
      {c.refund ? <p className="m-0 text-[14px]">Refunded {money(c.refund.amountMinor)}{c.refund.status && c.refund.status !== 'succeeded' ? ` (${c.refund.status})` : ''}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
        <span className="text-[13px] text-ink-3">{when}</span>
        {c.status === 'under_review' ? (
          <div className="flex flex-wrap items-start gap-2.5">
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Grant</summary>
              <form action={act('grant')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <p className="m-0 text-[13px] text-ink-2">Refunds what’s left of these items, their protection plans and their share of tax and delivery, with nothing sent back.</p>
                <label htmlFor={`grant-${c.id}`} className="text-[13px] font-semibold">Note to the shopper <span className="font-normal text-ink-3">(optional)</span></label>
                <textarea id={`grant-${c.id}`} name="note" rows={2} maxLength={CLAIM_NOTE_MAX} className={`${fieldClass} h-auto py-2 leading-normal`} />
                <button type="submit" className={`${buttonClasses({ variant: 'primary', size: 'sm' })} self-start`}>Grant and refund</button>
              </form>
            </details>
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Deny</summary>
              <form action={act('deny')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <label htmlFor={`deny-${c.id}`} className="text-[13px] font-semibold">Why? <span className="font-normal text-ink-3">(the shopper sees this)</span></label>
                <textarea id={`deny-${c.id}`} name="note" rows={2} required maxLength={CLAIM_NOTE_MAX} className={`${fieldClass} h-auto py-2 leading-normal`} placeholder="e.g. Tracking shows it was signed for at your door" />
                <button type="submit" className={`${buttonClasses({ variant: 'dark', size: 'sm' })} self-start`}>Deny claim</button>
              </form>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
