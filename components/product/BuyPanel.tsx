'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buyNow } from '@/app/actions/cart';
import { addToCartInline } from '@/app/product/[id]/actions';
import { buttonClasses } from '../primitives/Button';
import { selectClass } from '../lib/controls';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import { CompareToggle } from '../decision/Compare';
import { SaveButton } from '../decision/SaveButton';
import { useToast } from '../decision/Toast';

export interface ConfidenceRow { k: string; v: string }

export interface BuyPanelProps {
  productId: string;
  name: string;
  image?: string;
  market: MarketId;
  stock: number;
  saved: boolean;
  delivery: {
    /** "FREE delivery" or "FREE delivery over $35" */
    headline: string;
    /** standard promise date, e.g. "Tue, Sep 29" */
    promise: string;
    /** fastest date */
    fastest: string;
    /** "to Bengaluru 560001" (IN default) */
    to?: string;
    /** member programme name for the tag ("Plus") */
    member: string;
  };
  confidence: { level: 'High' | 'Medium' | 'Low'; rows: ConfidenceRow[] };
  /** why the last add-to-cart failed (legacy ?error= redirects) */
  error?: string | null;
}

/** at or below this many units the panel warns "Only N left". */
export const LOW_STOCK = 10;

const LEVEL_TONE = {
  High: 'bg-good-bg text-good-strong',
  Medium: 'bg-surface-2 text-ink',
  Low: 'bg-warn-bg text-warn-strong',
} as const;

/**
 * PDP aside (prototype Product detail): delivery card, Purchase confidence, qty, Add to Cart (accent,
 * stays on the page with a ✓ banner + toast) / Buy Now (dark → checkout), Save + Compare.
 */
export function BuyPanel({ productId, name, image, market, stock, saved, delivery, confidence, error }: BuyPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [err, setErr] = useState<string | null>(error ?? null);
  const [pending, start] = useTransition();
  const available = stock > 0;
  const maxQty = Math.max(1, Math.min(10, stock));
  const cartHref = storeHref(market, '/cart');

  const onAdd = () =>
    start(async () => {
      try {
        const res = await addToCartInline(productId, qty);
        if (!res.ok) { setErr(res.message); setJustAdded(false); return; }
        setErr(null);
        setJustAdded(true);
        toast(qty > 1 ? `Added ${qty} to cart` : 'Added to cart');
        router.refresh(); // header cart count
      } catch {
        setErr("Couldn't add to cart — try again");
      }
    });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4">
        <span className="text-[13px] text-ink">
          <span className="mr-1.5 rounded-tag bg-ink px-[5px] py-px text-[11px] font-bold uppercase text-white">{delivery.member}</span>
          {delivery.headline}
        </span>
        <strong className="text-[18px] font-semibold">{delivery.promise}</strong>
        <span className="text-[13px] text-ink-2">
          Or fastest <strong className="font-semibold text-ink">{delivery.fastest}</strong>{delivery.to ? ` · ${delivery.to}` : ''}
        </span>
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
        <p className="m-0 rounded-input bg-surface-4 px-3 py-2.5 text-[15px] font-semibold text-ink-2">Out of stock — save it to hear when the price moves.</p>
      ) : stock <= LOW_STOCK ? (
        <p className="m-0 text-[14px] font-semibold text-warn-strong">Only {stock} left in stock — order soon.</p>
      ) : (
        <p className="m-0 text-[14px] font-semibold text-good">In stock</p>
      )}
      {err ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {err}</p> : null}

      {available ? (
        <form action={buyNow} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={productId} />
          <label className="flex items-center justify-between gap-3 text-[14px] text-ink-2">
            Quantity
            <select name="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={selectClass}>
              {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
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
        <SaveButton productId={productId} saved={saved} name={name} market={market} />
        <CompareToggle item={{ id: productId, name, image }} />
      </div>
    </div>
  );
}
