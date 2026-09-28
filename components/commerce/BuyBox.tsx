import type { CurrencyCode } from '@/lib/contracts';
import { Button } from '../primitives/Button';
import { Price } from '../primitives/Price';

export interface BuyBoxProps {
  priceMinor: number;
  currency: CurrencyCode;
  promise: string;
  soldBy: string;
  taxNote?: string;
}

/**
 * Static buy card (showcase/presentational): price → delivery promise → In stock → Add to Cart (accent)
 * → Buy Now (dark). The live PDP uses components/product/BuyPanel.
 */
export function BuyBox({ priceMinor, currency, promise, soldBy, taxNote }: BuyBoxProps) {
  return (
    <div className="flex w-full max-w-[300px] flex-col gap-2 rounded-card border border-line bg-surface p-4 text-[14px] text-ink">
      <Price minor={priceMinor} currency={currency} size={28} />
      {taxNote ? <p className="m-0 text-[12px] text-ink-3">{taxNote}</p> : null}
      <p className="m-0">FREE delivery <strong className="font-semibold">{promise}</strong></p>
      <p className="m-0 font-semibold text-good">In stock</p>
      <div className="mt-1 flex flex-col gap-2">
        <Button variant="primary" size="lg" block>Add to Cart</Button>
        <Button variant="dark" size="lg" block>Buy Now</Button>
      </div>
      <p className="m-0 text-[13px] text-ink-2">Sold by <span className="text-ink">{soldBy}</span></p>
    </div>
  );
}
