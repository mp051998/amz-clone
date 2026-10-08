import { IconCash, IconClose, IconLock, IconReturn, IconTruck } from '@/components/icons';
import type { Perk } from './perks';

const ICONS = { delivery: IconTruck, cod: IconCash, returns: IconReturn, secure: IconLock } as const;

/**
 * The row of icons under the price on amazon.in, each opening a note on what it means (a native
 * popover, so no script). Nothing without perks.
 */
export function ProductPerks({ perks }: { perks: readonly Perk[] }) {
  if (!perks.length) return null;
  return (
    <div className="border-t border-line pt-4">
      <h2 className="sr-only">Delivery, payment and returns</h2>
      <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0 max-[420px]:grid-cols-2">
        {perks.map((perk) => {
          const Icon = ICONS[perk.key];
          const id = `perk-${perk.key}`;
          return (
            <li key={perk.key}>
              <button
                type="button"
                popoverTarget={id}
                className="flex w-full flex-col items-center gap-1.5 rounded-input px-1 py-1.5 text-center text-[12px] leading-tight text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink">
                  <Icon />
                </span>
                {perk.label}
              </button>
              <div
                id={id}
                popover="auto"
                role="dialog"
                aria-label={perk.label}
                className="m-auto w-[min(360px,calc(100vw-32px))] rounded-card border border-line bg-surface p-4 text-ink shadow-lg backdrop:bg-scrim"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="m-0 text-[15px] font-semibold">{perk.label}</p>
                  <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close" className="-m-1 rounded-full p-1 text-ink-2 hover:text-ink">
                    <IconClose width={18} height={18} />
                  </button>
                </div>
                <p className="m-0 mt-1.5 text-[14px] text-ink-2">{perk.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
