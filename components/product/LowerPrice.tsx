'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { tellLowerPrice } from '@/app/actions/lower-price';
import type { CurrencyCode } from '@/lib/contracts';
import { checkLowerPrice, LOWER_PRICE_DAYS, priceMinorOf, siteOf, type LowerPriceWhere, type PriceReport } from '@/lib/lower-price';
import { formatMoney } from '@/lib/marketplaces';
import { Button } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface LowerPriceProps {
  productId: string;
  /** the product's price now */
  priceMinor: number;
  currency: CurrencyCode;
  signedIn: boolean;
  signinHref: string;
  /** the shopper's open report on this product, if they have one */
  open: PriceReport | null;
  locale: string;
  timeZone: string;
}

const link = 'border-0 bg-transparent p-0 text-left text-[14px] text-ink underline underline-offset-2';
const label = 'flex flex-col gap-1.5 text-[14px] font-semibold';
const input = cn(fieldClass, 'h-10 font-normal');

/** The store's day as YYYY-MM-DD. */
const dayIn = (timeZone: string, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const amount = (minor: number, currency: CurrencyCode) => (currency === 'INR' ? String(Math.round(minor / 100)) : (minor / 100).toFixed(2));

/**
 * PDP "Would you like to tell us about a lower price?": where it was seen for less, online (the
 * page, price and delivery) or in a shop (its name, town, price and the day), sent to the store.
 */
export function LowerPrice({ productId, priceMinor, currency, signedIn, signinHref, open, locale, timeZone }: LowerPriceProps) {
  const [mine, setMine] = useState(open);
  const [editing, setEditing] = useState(false);
  const [where, setWhere] = useState<LowerPriceWhere | ''>(open?.seenAt ?? '');
  const [url, setUrl] = useState(open?.url ?? '');
  const [store, setStore] = useState(open?.storeName ?? '');
  const [city, setCity] = useState(open?.city ?? '');
  const [seenOn, setSeenOn] = useState(open?.seenOn ?? '');
  const [price, setPrice] = useState(open ? amount(open.priceMinor, currency) : '');
  const [shipping, setShipping] = useState(open?.seenAt === 'online' ? amount(open.shippingMinor, currency) : '');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<'new' | 'updated' | null>(null);
  const [pending, start] = useTransition();
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));
  const today = dayIn(timeZone);
  const earliest = dayIn(timeZone, new Date(Date.now() - LOWER_PRICE_DAYS * 86_400_000));

  if (!signedIn) {
    return (
      <a href={signinHref} className="self-start text-[14px] text-ink underline underline-offset-2">
        Sign in to tell us about a lower price
      </a>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const raw = {
      seenAt: where,
      priceMinor: priceMinorOf(price) ?? price,
      shippingMinor: shipping.trim() ? (priceMinorOf(shipping) ?? shipping) : 0,
      url,
      store,
      city,
      seenOn,
    };
    const checked = checkLowerPrice(raw, { ourPriceMinor: priceMinor, today });
    if ('field' in checked) return setError(checked.message);
    setError('');
    start(async () => {
      const res = await tellLowerPrice(productId, raw);
      if (!res.ok) return setError(res.message);
      setMine(res.report);
      setSent(res.updated ? 'updated' : 'new');
      setEditing(false);
    });
  };

  if (!editing) {
    const seen = mine ? (mine.seenAt === 'online' ? siteOf(mine.url ?? '') : mine.storeName) : '';
    return (
      <div className="flex flex-col gap-1.5 text-[14px]">
        {sent ? (
          <p role="status" className="m-0 text-good-strong">
            {sent === 'updated' ? 'Your feedback is updated.' : 'Thanks for telling us.'} We look at every price we’re told about, though we can’t reply to each one.
          </p>
        ) : mine ? (
          <p className="m-0 text-ink-2">
            On {day(mine.updatedAt)} you told us it was {money(mine.priceMinor + mine.shippingMinor)} at {seen}.
          </p>
        ) : null}
        <button type="button" onClick={() => { setEditing(true); setSent(null); }} className={cn(link, 'self-start')}>
          {mine ? 'Update the lower price you told us about' : 'Would you like to tell us about a lower price?'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="lower-price-h" className="flex max-w-[560px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
      <h3 id="lower-price-h" className="m-0 text-[16px] font-semibold">Tell us about a lower price</h3>
      <p className="m-0 text-[14px] text-ink-2">Our price: <strong className="text-ink">{money(priceMinor)}</strong></p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-semibold">Where did you see a lower price?</legend>
        {(
          [
            ['online', 'Website (online)'],
            ['store', 'Shop (offline)'],
          ] as const
        ).map(([v, text]) => (
          <label key={v} className="flex items-center gap-2.5 text-[14px]">
            <input type="radio" name="lower-price-where" value={v} checked={where === v} onChange={() => setWhere(v)} className="size-4 accent-ink" />
            {text}
          </label>
        ))}
      </fieldset>

      {where === 'online' ? (
        <label className={label}>
          Web address (URL)
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" className={input} />
        </label>
      ) : null}
      {where === 'store' ? (
        <>
          <label className={label}>
            Shop name
            <input value={store} onChange={(e) => setStore(e.target.value)} maxLength={80} className={input} />
          </label>
          <label className={label}>
            <span>Town or city <span className="font-normal text-ink-3">(optional)</span></span>
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} className={input} />
          </label>
        </>
      ) : null}
      {where ? (
        <div className="flex flex-wrap gap-3">
          <label className={cn(label, 'min-w-[140px] flex-1')}>
            Price
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={amount(priceMinor, currency)} className={input} />
          </label>
          {where === 'online' ? (
            <label className={cn(label, 'min-w-[140px] flex-1')}>
              Delivery cost
              <input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" className={input} />
            </label>
          ) : (
            <label className={cn(label, 'min-w-[140px] flex-1')}>
              Date of the price
              <input type="date" value={seenOn} onChange={(e) => setSeenOn(e.target.value)} min={earliest} max={today} className={input} />
            </label>
          )}
        </div>
      ) : null}

      {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending}>{mine ? 'Update feedback' : 'Submit feedback'}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
      </div>
    </form>
  );
}
