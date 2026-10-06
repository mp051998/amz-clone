import { buttonClasses } from '../primitives/Button';

export interface UnavailablePanelProps {
  categoryName: string;
  /** store-scoped link to the product's department. */
  categoryHref: string;
}

/** PDP aside for an archived product: no price, no buy buttons, a way on to similar items. */
export function UnavailablePanel({ categoryName, categoryHref }: UnavailablePanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <strong className="text-[18px] font-semibold">No longer available</strong>
      <p className="m-0 text-[14px] text-ink-2">
        This item has been taken off sale and we don’t know if it will be back. Its reviews stay here for reference.
      </p>
      <a href={categoryHref} className={buttonClasses({ variant: 'secondary', block: true })}>
        Shop {categoryName}
      </a>
    </div>
  );
}
