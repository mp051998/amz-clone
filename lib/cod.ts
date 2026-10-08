/**
 * Pay on Delivery's ceiling, as on amazon.in: an order over ₹50,000 is paid for before it ships
 * (`markets.cod_max_minor`, on the order's total). The US store has no Pay on Delivery.
 */
export const COD_MAX_MINOR = 5000000;

/** Whether an order of this total is over the ceiling. */
export function overCodLimit(totalMinor: number): boolean {
  return totalMinor > COD_MAX_MINOR;
}
