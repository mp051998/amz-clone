import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { fieldClass } from '@/components/lib/controls';
import { StatusChip } from '@/components/orders/Tracking';
import type { ChipTone } from '@/components/orders/format';
import { payChoice, payRadio } from '@/components/amazon-pay/PayMethods';
import { listAdminTradeIns, tradeInFilter, type AdminTradeIn, type AdminTradeInFilter } from '@/lib/data/trade-ins';
import { messageFor } from '@/lib/data/errors';
import { CONDITION_LABEL, EXCHANGE_CONDITIONS } from '@/lib/exchange';
import type { PublicMarketplace } from '@/lib/contracts';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { hasTradeIn, TRADE_IN_STATUS_LABEL, tradeInCredit, type TradeInStatus } from '@/lib/trade-in';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { adminTime } from '../orders/labels';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { tradeInAction } from './actions';

export const metadata: Metadata = { title: 'Trade-ins · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const FILTER_LABEL: Record<AdminTradeInFilter, string> = { open: 'Waiting', closed: 'Closed', all: 'All' };
const DONE: Record<string, string> = {
  receive: 'Trade-in received. The quote is on the shopper’s balance.',
  receive_less: 'Trade-in received. It came in worse than the shopper said, so they got what it’s worth as it came.',
  reject: 'Trade-in sent back. The shopper sees your note.',
};
const EMPTY: Record<AdminTradeInFilter, [string, string]> = {
  open: ['No trade-ins on the way.', 'Trade-ins shoppers start show up here until their devices arrive.'],
  closed: ['No closed trade-ins yet.', 'Credited, cancelled and sent-back trade-ins show up here.'],
  all: ['No trade-ins yet.', 'Trade-ins shoppers start show up here.'],
};
const TONE: Record<TradeInStatus, ChipTone> = { open: 'warn', credited: 'good', cancelled: 'neutral', rejected: 'neutral' };

/**
 * /admin/trade-ins: amazon.com's Trade-In queue. Devices on their way, oldest first: mark one
 * received in the condition it came in (that pays the shopper's balance, never more than the
 * quote), or send it back with a note. The India store doesn't run Trade-In.
 */
export default async function AdminTradeInsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/trade-ins');
  if (!admin) return <AdminOnly store={store} />;

  const filter = tradeInFilter(one(sp, 'filter'));
  const runs = hasTradeIn(store.id);
  const result = runs ? await listAdminTradeIns(await db(), store.id, filter) : null;
  const href = (f: AdminTradeInFilter) => storePath(store, `/admin/trade-ins${f === 'open' ? '' : `?filter=${f}`}`);
  const error = one(sp, 'error');
  const done = one(sp, 'done');
  const act = (id: string, move: string) => tradeInAction.bind(null, id, move, filter);
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/trade-ins"
      title="Trade-ins"
      lede={runs ? <>Shoppers send old phones and laptops within 7 days of their quote. Check each one when it arrives and mark it received in the condition it came in: that pays the shopper’s balance.</> : <>The India store doesn’t run Trade-In: shoppers there trade old devices in on a new one with Exchange offers.</>}
    >
      {result ? (
        <>
          <AdminTabs
            label="Trade-in filter"
            tabs={(['open', 'closed', 'all'] as const).map((f) => ({ href: href(f), label: `${FILTER_LABEL[f]} (${n(result.counts[f])})`, current: f === filter }))}
          />
          {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
          {!error && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}
          {result.tradeIns.length ? (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {result.tradeIns.map((t) => (
                <li key={t.id}>
                  <TradeInRow t={t} store={store} act={act} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={EMPTY[filter][0]}>{EMPTY[filter][1]}</EmptyState>
          )}
        </>
      ) : null}
    </AdminFrame>
  );
}

function TradeInRow({ t, store, act }: {
  t: AdminTradeIn;
  store: PublicMarketplace;
  act: (id: string, move: string) => (formData?: FormData) => Promise<void>;
}) {
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const when =
    t.status === 'open'
      ? `Quoted ${adminTime(t.createdAt, store)} · send by ${adminTime(t.shipBy, store)}`
      : `${TRADE_IN_STATUS_LABEL[t.status]} ${adminTime(t.closedAt ?? t.createdAt, store)}`;
  return (
    <article aria-labelledby={`ti-${t.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <span>{t.customer.name || t.customer.email || 'Customer'}</span>
            {t.customer.email && t.customer.name ? <a href={`mailto:${t.customer.email}`} className="break-all text-ink-3 underline underline-offset-2">{t.customer.email}</a> : null}
          </span>
          <strong id={`ti-${t.id}`} className="text-[16px] font-semibold leading-[1.35]">{t.device}</strong>
        </div>
        <StatusChip label={TRADE_IN_STATUS_LABEL[t.status]} tone={TONE[t.status]} />
      </div>
      {t.rejectNote ? <p className="m-0 text-[14px] text-ink-2">Note to shopper: {t.rejectNote}</p> : null}
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-2 text-[14px]">
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Shopper said</dt><dd className="m-0">{CONDITION_LABEL[t.condition]}</dd></div>
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Quote</dt><dd className="m-0 font-semibold tabular-nums">{money(t.quoteMinor)}</dd></div>
        {t.status === 'credited' && t.creditedMinor != null ? (
          <div className="flex flex-col">
            <dt className="text-[13px] text-ink-3">Paid</dt>
            <dd className="m-0 tabular-nums">{money(t.creditedMinor)}{t.receivedCondition ? ` · came in: ${CONDITION_LABEL[t.receivedCondition].toLowerCase()}` : ''}</dd>
          </div>
        ) : null}
        <div className="flex flex-col"><dt className="text-[13px] text-ink-3">Label code</dt><dd className="m-0 font-mono tracking-[0.06em]">{t.shipCode}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
        <span className="text-[13px] text-ink-3">{when}</span>
        {t.status === 'open' ? (
          <div className="flex flex-wrap items-start gap-2.5">
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'dark', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Mark received</summary>
              <form action={act(t.id, 'receive')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1 text-[13px] font-semibold">It came in</legend>
                  {EXCHANGE_CONDITIONS.map((c) => (
                    <label key={c} className={payChoice}>
                      <input type="radio" name="condition" value={c} defaultChecked={c === t.condition} className={payRadio} />
                      <span className="flex flex-col gap-0.5">
                        <span>{CONDITION_LABEL[c]}</span>
                        <span className="text-[13px] text-ink-3 tabular-nums">Pays {money(tradeInCredit(t.goodMinor, t.quoteMinor, c))}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className={`${buttonClasses({ variant: 'dark', size: 'sm' })} self-start`}>Credit the shopper</button>
              </form>
            </details>
            <details className="group">
              <summary className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Send back</summary>
              <form action={act(t.id, 'reject')} className="mt-2.5 flex w-[min(360px,80vw)] flex-col gap-2">
                <label htmlFor={`note-${t.id}`} className="text-[13px] font-semibold">Note to the shopper <span className="font-normal text-ink-3">(optional)</span></label>
                <textarea id={`note-${t.id}`} name="note" rows={2} maxLength={500} className={`${fieldClass} h-auto py-2 leading-normal`} placeholder="e.g. It didn’t switch on" />
                <button type="submit" className={`${buttonClasses({ variant: 'dark', size: 'sm' })} self-start`}>Send it back</button>
              </form>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
