import { buttonClasses } from '@/components/primitives/Button';
import { Select } from '@/components/primitives/Select';
import { frequencyLabel, SNS_FREQUENCIES, SNS_MANY, SNS_MAX_QTY, SNS_PCT, SNS_PCT_MANY } from '@/lib/subscribe-save';

export interface SubscribeSaveProps {
  productId: string;
  /** the Subscribe & Save price ("$56.04") and the usual one */
  priceText: string;
  listText: string;
  /** how many can be in one delivery: up to 10, and what's in stock */
  maxQty: number;
  /** where "Set Up Now" goes (the set-up page) */
  setupHref: string;
  /** the shopper's subscription to it, when they have one */
  subscribed?: { qty: number; everyMonths: number; nextText: string; manageHref: string };
}

/**
 * The product page's "Subscribe & Save": the subscription price, how many and how often, and "Set
 * Up Now" (on to the set-up page to choose the address and payment); or, when the shopper is
 * subscribed already, what's coming and where to change it.
 */
export function SubscribeSave({ productId, priceText, listText, maxQty, setupHref, subscribed }: SubscribeSaveProps) {
  return (
    <section aria-labelledby="sns-h" className="mt-4 flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sns-h" className="m-0 text-[16px] font-semibold">Subscribe &amp; Save</h2>
        <span className="flex items-baseline gap-1.5">
          <strong className="text-[17px] font-semibold tabular-nums">{priceText}</strong>
          <s className="text-[13px] text-ink-3 tabular-nums">{listText}</s>
        </span>
      </div>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
        <li>Save {SNS_PCT}% now, and {SNS_PCT_MANY}% on deliveries of {SNS_MANY} or more subscriptions</li>
        <li>FREE delivery on every subscription order</li>
        <li>Skip, change or cancel any time</li>
      </ul>
      {subscribed ? (
        <div className="flex flex-col gap-2 text-[14px]">
          <p className="m-0">
            <strong className="font-semibold">You’re subscribed:</strong> {subscribed.qty} {frequencyLabel(subscribed.everyMonths).toLowerCase()}. Next delivery {subscribed.nextText}.
          </p>
          <a href={subscribed.manageHref} className="self-start text-[14px] text-ink underline underline-offset-2">Manage your subscription</a>
        </div>
      ) : (
        <form method="get" action={setupHref} className="flex flex-col gap-3">
          <input type="hidden" name="product" value={productId} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Quantity"
              name="qty"
              defaultValue="1"
              options={Array.from({ length: Math.max(1, Math.min(SNS_MAX_QTY, maxQty)) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
            <Select label="Deliver every" name="every" defaultValue="1" options={SNS_FREQUENCIES.map((m) => ({ value: String(m), label: m === 1 ? '1 month' : `${m} months` }))} />
          </div>
          <button type="submit" className={buttonClasses({ variant: 'secondary', block: true })}>Set Up Now</button>
        </form>
      )}
    </section>
  );
}
