import { selectItems } from '@/app/actions/cart';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/**
 * Tick box for one cart line: ticked lines are what the subtotal and checkout cover, unticked
 * ones stay in the cart. A one-button server-action form, so it works without JS.
 */
export function CartSelect({ id, selected, name }: { id: string; selected: boolean; name: string }) {
  return (
    <form action={selectItems} className="-ml-2.5 -mt-2.5 flex-none">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="selected" value={selected ? '0' : '1'} />
      <SubmitButton
        bare
        role="checkbox"
        aria-checked={selected}
        aria-label={`Include ${name} in this order`}
        className="group flex h-11 w-11 items-center justify-center rounded-chip hover:bg-surface-2"
      >
        <span
          aria-hidden
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border-[1.5px] text-[12px] font-bold leading-none ${selected ? 'border-ink bg-ink text-on-ink' : 'border-line-3 bg-surface group-hover:border-ink'}`}
        >
          {selected ? '✓' : null}
        </span>
      </SubmitButton>
    </form>
  );
}

/** "Select all items" / "Deselect all items" over the cart's lines. */
export function CartSelectAll({ allSelected }: { allSelected: boolean }) {
  return (
    <form action={selectItems}>
      <input type="hidden" name="selected" value={allSelected ? '0' : '1'} />
      <SubmitButton bare className="min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
        {allSelected ? 'Deselect all items' : 'Select all items'}
      </SubmitButton>
    </form>
  );
}
