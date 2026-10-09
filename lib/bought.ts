/** Amazon shows nothing under this many units bought in the past month. */
export const BOUGHT_FLOOR = 50;

/**
 * Amazon's "1K+ bought in past month": units bought in the last 30 days, rounded down to a round
 * step (50+, 100+ … 900+, 1K+ … 9K+, 10K+ …). Null under the floor.
 */
export function boughtLabel(units: number): string | null {
  if (!Number.isFinite(units) || units < BOUGHT_FLOOR) return null;
  if (units < 100) return `${BOUGHT_FLOOR}+ bought in past month`;
  const step = 10 ** Math.floor(Math.log10(units)); // 100, 1000, 10000 …
  const n = Math.floor(units / step) * step;
  const text = n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : `${n}`;
  return `${text}+ bought in past month`;
}
