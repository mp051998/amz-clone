import { setProtection } from '@/app/actions/cart';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/**
 * A cart line's protection plan, as on Amazon: "☐ Add a 2-Year Protection Plan for $7.99". A
 * one-button server-action form like CartSelect, so it works without JS.
 */
export function CartProtection({ id, added, plan, price, name }: { id: string; added: boolean; plan: string; price: string; name: string }) {
  return (
    <form action={setProtection} className="-ml-2.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="on" value={added ? '0' : '1'} />
      <SubmitButton
        bare
        role="checkbox"
        aria-checked={added}
        aria-label={`${plan} for ${name}, ${price}`}
        className="group flex min-h-11 items-center gap-2 rounded-chip px-2.5 text-left text-[14px] hover:bg-surface-2"
      >
        <span
          aria-hidden
          className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[3px] border-[1.5px] text-[12px] font-bold leading-none ${added ? 'border-ink bg-ink text-on-ink' : 'border-line-3 bg-surface group-hover:border-ink'}`}
        >
          {added ? '✓' : null}
        </span>
        <span aria-hidden>
          {added ? `${plan} added` : `Add a ${plan}`} for <strong className="font-semibold">{price}</strong>
        </span>
      </SubmitButton>
    </form>
  );
}
