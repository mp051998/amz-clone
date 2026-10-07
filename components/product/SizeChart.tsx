import { sizeChartFor } from '@/lib/size-chart';
import { cn } from '../lib/cn';

/**
 * Amazon's "Size Chart" link under the size buttons: the sizes the product comes in, what each
 * measures and what it is in the other systems, a tap away. The size picked is highlighted.
 * Nothing for sizes there's no chart for.
 */
export function SizeChart({ sizes, title, selected = null }: { sizes: readonly string[]; title: string; selected?: string | null }) {
  const chart = sizeChartFor(sizes, title);
  if (!chart) return null;
  return (
    <details className="text-[13px] text-ink-2">
      <summary className="inline cursor-pointer list-none text-ink underline underline-offset-2 hover:text-accent-ink [&::-webkit-details-marker]:hidden">Size Chart</summary>
      <table className="mt-2 w-full border-collapse">
        <caption className="mb-1 text-left text-[13px] font-semibold text-ink">{chart.title}</caption>
        <thead>
          <tr className="text-left text-ink-3">
            {chart.columns.map((c, i) => (
              <th key={c} scope="col" className={cn('py-1 font-medium', i ? 'pl-2 text-right' : 'pr-2')}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r) => {
            const on = r.size === selected;
            return (
              <tr key={r.size} aria-current={on ? 'true' : undefined} className={cn('border-t border-line-2', on && 'bg-surface-2 font-semibold')}>
                <th scope="row" className={cn('py-1 pr-2 text-left text-ink', on ? 'font-semibold' : 'font-normal')}>{r.size}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className="py-1 pl-2 text-right tabular-nums text-ink">{c}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 mt-1 text-[12px] text-ink-3">{chart.note} Sizes vary a little by brand.</p>
    </details>
  );
}
