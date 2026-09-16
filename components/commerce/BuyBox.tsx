import type { CurrencyCode } from '@/lib/contracts';
import { Button } from '../primitives/Button';
import { Price } from '../primitives/Price';
import { Select } from '../primitives/Select';

export interface BuyBoxProps {
  priceMinor: number;
  currency: CurrencyCode;
  promise: string;
  soldBy: string;
  taxNote?: string;
}

/** 244px buy box: price → promise → In Stock → qty → Add to Cart → Buy Now (design.md §5 Buy box). */
export function BuyBox({ priceMinor, currency, promise, soldBy, taxNote }: BuyBoxProps) {
  return (
    <div className="w-[244px] rounded-[8px] border border-line p-[14px] text-[14px]">
      <Price minor={priceMinor} currency={currency} size={28} />
      {taxNote ? <p className="mt-1 text-[12px] text-ink-2">{taxNote}</p> : null}
      <p className="mt-2">FREE delivery <b>{promise}</b></p>
      <p className="mt-1 text-[18px] text-success">In Stock</p>
      <div className="mt-2"><Select label="Qty" options={Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} /></div>
      <div className="mt-3 space-y-2">
        <Button className="w-full">Add to Cart</Button>
        <Button variant="orange" className="w-full">Buy Now</Button>
      </div>
      <p className="mt-3 text-[12px] text-ink-2">Sold by <span className="text-link-teal">{soldBy}</span></p>
    </div>
  );
}
