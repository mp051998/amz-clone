import { BuyAgainButton } from '../orders/BuyAgainButton';

/** One way to buy a product: the product itself or another seller's offer, ready to show. */
export interface OfferItem {
  /** the product id to put in the cart */
  id: string;
  priceText: string;
  /** "New", "Renewed", "Used – Like New" */
  condition: string;
  /** what the seller says about its condition */
  note?: string;
  seller: string;
  sellerHref: string;
  /** "92% positive (25 ratings)" */
  sellerRating?: string;
  shipsFrom: string;
  /** "FREE delivery Tuesday, October 13" */
  delivery?: string;
  /** the product's own offer, the one its page sells ("Featured offer") */
  featured?: boolean;
  /** a product that comes in sizes is added from its page, once one is picked */
  optionsHref?: string;
}

function AddOffer({ offer, name, block }: { offer: OfferItem; name: string; block?: boolean }) {
  const title = `${name}, ${offer.condition} from ${offer.seller}`;
  return <BuyAgainButton productId={offer.id} title={title} label="Add to cart" optionsHref={offer.optionsHref} block={block} />;
}

function SoldBy({ offer }: { offer: OfferItem }) {
  return (
    <span className="text-ink-2">
      Sold by{' '}
      <a href={offer.sellerHref} className="text-ink underline underline-offset-2">{offer.seller}</a>
      {offer.sellerRating ? <> · {offer.sellerRating}</> : null}
    </span>
  );
}

/**
 * The product page's "Other sellers on Amazon": the cheapest few offers, each with its own add to
 * cart, and the link to every way to buy it.
 */
export function OtherSellers({ name, offers, allHref, allLabel }: { name: string; offers: OfferItem[]; allHref: string; allLabel: string }) {
  return (
    <section aria-labelledby="other-sellers-h" className="mt-4 flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <h2 id="other-sellers-h" className="m-0 text-[16px] font-semibold">Other sellers on Amazon</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {offers.map((o) => (
          <li key={o.id} className="flex items-start justify-between gap-3 border-t border-line-2 py-3 first:border-t-0 first:pt-0">
            <div className="flex min-w-0 flex-col gap-0.5 text-[14px]">
              <strong className="text-[17px] font-semibold tabular-nums">{o.priceText}</strong>
              <span className="font-semibold">{o.condition}</span>
              <SoldBy offer={o} />
            </div>
            <AddOffer offer={o} name={name} />
          </li>
        ))}
      </ul>
      <a href={allHref} className="self-start text-[14px] text-ink underline underline-offset-2">{allLabel}</a>
    </section>
  );
}

/** Every way to buy a product (its "Buying options" page): price, condition, seller and delivery. */
export function OfferList({ name, offers }: { name: string; offers: OfferItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
      {offers.map((o) => (
        <li key={o.id} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 border-t border-line-2 p-[18px] first:border-t-0">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 text-[14px]">
            {o.featured ? <span className="self-start rounded-tag bg-ink px-1.5 py-0.5 text-[12px] font-bold text-on-ink">Featured offer</span> : null}
            <strong className="text-[22px] font-semibold tabular-nums">{o.priceText}</strong>
            {o.delivery ? <span className="text-ink">{o.delivery}</span> : null}
            <span>
              <span className="font-semibold">Condition: {o.condition}</span>
              {o.note ? <span className="text-ink-2"> — {o.note}</span> : null}
            </span>
            <span className="text-ink-2">Ships from {o.shipsFrom}</span>
            <SoldBy offer={o} />
          </div>
          <div className="flex w-[180px] flex-none max-sm:w-full">
            <AddOffer offer={o} name={name} block />
          </div>
        </li>
      ))}
    </ul>
  );
}
