'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buyNow } from '@/app/actions/cart';
import { addToCartInline } from '@/app/product/[id]/actions';
import { buttonClasses } from '../primitives/Button';
import { selectClass } from '../lib/controls';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import type { ListChoice } from '@/lib/data/collections';
import { AddToList } from '../collections/AddToList';
import { CompareToggle } from '../decision/Compare';
import { SaveButton } from '../decision/SaveButton';
import { useToast } from '../decision/Toast';
import { limitNote } from '@/lib/purchase-limits';

export interface ConfidenceRow { k: string; v: string }

export interface BuyPanelProps {
  productId: string;
  name: string;
  image?: string;
  /** category slug + name, for the compare tray's cross-category check. */
  category?: string;
  categoryName?: string;
  market: MarketId;
  stock: number;
  saved: boolean;
  /** the shopper's lists for "Add to List"; null/absent when signed out */
  lists?: ListChoice[] | null;
  delivery: {
    /** "FREE delivery" or "FREE delivery over $35" */
    headline: string;
    /** standard delivery day, e.g. "Tomorrow, October 8" */
    promise: string;
    /** faster delivery ("Today by 7:30 PM"), when checkout offers it */
    fastest?: string;
    /** the faster option is free (Plus members) */
    fastFree?: boolean;
    /** "Order within 2 hrs 13 mins": how long the faster option lasts */
    orderWithin?: string;
    /** "to Bengaluru 560001": the shopper's delivery location, when there is one */
    to?: string;
    /** member programme name for the tag ("Plus") */
    member: string;
  };
  confidence: { level: 'High' | 'Medium' | 'Low'; rows: ConfidenceRow[] };
  /** why the last add-to-cart failed (legacy ?error= redirects) */
  error?: string | null;
  /** the store's protection plan for this product ("2-Year Protection Plan", "$7.99" per unit), when it has one */
  protection?: { name: string; price: string };
  /** "Limit 3 per customer": the limit, and how many more the shopper can buy (null when unknown, signed out) */
  limit?: { max: number; left: number | null };
  /** the sizes it comes in: one must be picked before Add to Cart or Buy Now */
  sizes?: string[];
}

/** at or below this many units the panel warns "Only N left". */
export const LOW_STOCK = 10;

const SIZE_CHIP =
  'flex min-h-10 min-w-12 cursor-pointer items-center justify-center rounded-input border border-line bg-surface px-3 text-[14px] text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:font-semibold has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';

const LEVEL_TONE = {
  High: 'bg-good-bg text-good-strong',
  Medium: 'bg-surface-2 text-ink',
  Low: 'bg-warn-bg text-warn-strong',
} as const;

/**
 * PDP aside (prototype Product detail): delivery card, Purchase confidence, qty, Add to Cart (accent,
 * stays on the page with a ✓ banner + toast) / Buy Now (dark → checkout), Save + Compare, and Add to List.
 * An eligible product offers the store's protection plan as a box above the buttons; both take it.
 * A product that comes in sizes (clothes, shoes) asks for one first, and both buttons take it.
 */
export function BuyPanel({ productId, name, image, category, categoryName, market, stock, saved, lists = null, delivery, confidence, error, protection, limit, sizes }: BuyPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [plan, setPlan] = useState(false);
  const [size, setSize] = useState<string | null>(null);
  const needsSize = Boolean(sizes?.length) && !size;
  const [justAdded, setJustAdded] = useState(false);
  const [err, setErr] = useState<string | null>(error ?? null);
  const [pending, start] = useTransition();
  const available = stock > 0;
  const maxQty = Math.max(1, Math.min(10, stock, limit?.left ?? limit?.max ?? 10));
  // bought as many as the limit allows: nothing more to add
  const used = limit?.left === 0;
  const cartHref = storeHref(market, '/cart');

  const askSize = () => {
    setErr('Select a size first.');
    setJustAdded(false);
  };

  const onAdd = () => {
    if (needsSize) return askSize();
    start(async () => {
      try {
        const res = await addToCartInline(productId, qty, Boolean(protection) && plan, size);
        if (!res.ok) { setErr(res.message); setJustAdded(false); return; }
        setErr(null);
        setJustAdded(true);
        toast(qty > 1 ? `Added ${qty} to cart` : 'Added to cart');
        router.refresh(); // header cart count
      } catch {
        setErr("Couldn't add to cart — try again");
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4">
        <span className="text-[13px] text-ink">
          <span className="mr-1.5 rounded-tag bg-ink px-[5px] py-px text-[11px] font-bold uppercase text-on-ink">{delivery.member}</span>
          {delivery.headline}
        </span>
        <strong className="text-[18px] font-semibold">{delivery.promise}</strong>
        {delivery.fastest ? (
          <span className="text-[13px] text-ink-2">
            Or {delivery.fastFree ? 'FREE ' : ''}fastest delivery <strong className="font-semibold text-ink">{delivery.fastest}</strong>
            {delivery.orderWithin ? <>. <span className="font-semibold text-good">{delivery.orderWithin}</span></> : null}
          </span>
        ) : null}
        {delivery.to ? <span className="text-[13px] text-ink-2">Delivering {delivery.to}</span> : null}
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">Purchase confidence</span>
          <span className={cn('rounded-[5px] px-2 py-[3px] text-[13px] font-bold', LEVEL_TONE[confidence.level])}>{confidence.level}</span>
        </div>
        <dl className="m-0 flex flex-col gap-2">
          {confidence.rows.map((r) => (
            <div key={r.k} className="flex justify-between gap-3 text-[14px]">
              <dt className="text-ink-2">{r.k}</dt>
              <dd className="m-0 text-right font-medium">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {!available ? (
        <p className="m-0 rounded-input bg-surface-4 px-3 py-2.5 text-[15px] font-semibold text-ink-2">Out of stock — save it and we’ll flag it on your lists when it’s back.</p>
      ) : stock <= LOW_STOCK ? (
        <p className="m-0 text-[14px] font-semibold text-warn-strong">Only {stock} left in stock — order soon.</p>
      ) : (
        <p className="m-0 text-[14px] font-semibold text-good">In stock</p>
      )}
      {limit ? <p className="m-0 text-[13px] text-ink-2">{limitNote(limit.max, limit.left)}</p> : null}
      {err ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {err}</p> : null}

      {available && used ? (
        <p className="m-0 rounded-input bg-surface-4 px-3 py-2.5 text-[14px] text-ink-2">You’ve bought as many of this item as one customer can.</p>
      ) : available ? (
        <form
          action={buyNow}
          onSubmit={(e) => {
            if (!needsSize) return;
            e.preventDefault();
            askSize();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={productId} />
          {sizes?.length ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[14px] text-ink-2">
                Size: <strong className="font-semibold text-ink">{size ?? 'Select'}</strong>
              </legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <label key={s} className={SIZE_CHIP}>
                    <input
                      type="radio"
                      name="size"
                      value={s}
                      checked={size === s}
                      onChange={() => {
                        setSize(s);
                        setErr(null);
                      }}
                      className="sr-only"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="flex items-center justify-between gap-3 text-[14px] text-ink-2">
            Quantity
            <select name="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={selectClass}>
              {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          {protection ? (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[14px] font-semibold">Add a protection plan:</legend>
              <label className="flex items-start gap-2 text-[14px]">
                <input type="checkbox" name="protection" value="1" checked={plan} onChange={(e) => setPlan(e.target.checked)} className="mt-[3px] h-4 w-4 accent-ink" />
                <span>
                  {protection.name} for <strong className="font-semibold">{protection.price}</strong>
                  {qty > 1 ? <span className="text-ink-3"> each</span> : null}
                </span>
              </label>
            </fieldset>
          ) : null}
          <button type="button" onClick={onAdd} disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ variant: 'primary', size: 'lg', block: true })}>
            {pending ? 'Adding…' : 'Add to Cart'}
          </button>
          <button type="submit" className={buttonClasses({ variant: 'dark', size: 'lg', block: true })}>Buy Now</button>
        </form>
      ) : null}

      {justAdded ? (
        <div role="status" className="flex items-center justify-between gap-2 rounded-input bg-good-bg px-3 py-2.5 text-[14px]">
          <span className="font-semibold text-good-strong">✓ Added to cart</span>
          <a href={cartHref} className="font-semibold text-ink underline underline-offset-2">View cart →</a>
        </div>
      ) : null}

      <div className="flex gap-2">
        {/* remount when the server's saved state changes (e.g. after Add to List) */}
        <SaveButton key={saved ? 'saved' : 'unsaved'} productId={productId} saved={saved} name={name} market={market} />
        <CompareToggle item={{ id: productId, name, image, category, categoryName }} />
      </div>
      <AddToList productId={productId} productName={name} market={market} lists={lists} />
    </div>
  );
}
