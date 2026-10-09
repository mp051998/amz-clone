/**
 * Amazon's notes under the cart: prices can change while things wait in it, and where a gift card
 * or promo code goes (a promo code at checkout; a gift card onto the balance, which pays there).
 */
export function CartNotes({ giftCardHref }: { giftCardHref: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px] leading-[1.45] text-ink-3">
      <p className="m-0">
        The price and availability of items are subject to change. The cart is a temporary place to keep a list of your items and shows each one’s most
        recent price.
      </p>
      <p className="m-0">
        Do you have a gift card or promotional code? Enter a promo code at checkout, or{' '}
        <a href={giftCardHref} className="text-ink-2 underline underline-offset-2 hover:text-ink">
          redeem a gift card
        </a>{' '}
        to your balance and pay with it there.
      </p>
    </div>
  );
}
