import type { CartPriceChange } from '@/lib/cart-price-changes';

/** The cart's price-change messages: what costs more or less now than when it was added. */
export function PriceChanges({ changes, money, sp }: { changes: CartPriceChange[]; money: (minor: number) => string; sp: (path: string) => string }) {
  if (!changes.length) return null;
  return (
    <section className="flex flex-col gap-1.5 rounded-panel border border-line bg-surface px-[18px] py-4" aria-labelledby="price-changes-h">
      <h2 id="price-changes-h" className="m-0 text-[16px] font-semibold">Important messages about items in your cart</h2>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-ink-2">
        {changes.map((c) => (
          <li key={c.product.id}>
            The price of{' '}
            <a href={sp(`/product/${c.product.id}`)} className="text-ink underline underline-offset-2">
              {c.product.title}
            </a>{' '}
            has {c.toMinor > c.fromMinor ? 'increased' : 'decreased'} from {money(c.fromMinor)} to <strong className="font-semibold text-ink">{money(c.toMinor)}</strong>.
          </li>
        ))}
      </ul>
    </section>
  );
}
