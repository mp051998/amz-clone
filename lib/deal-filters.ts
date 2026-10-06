/** "N% off or more" steps on Today's deals (Amazon's discount filter). */
export const DISCOUNT_STEPS = [10, 20, 30, 40, 50] as const;

/** `?off=30` → 30; anything that isn't a step → null (any discount). */
export function readDiscount(v: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (DISCOUNT_STEPS as readonly number[]).includes(n) ? n : null;
}

export function atLeast<T extends { dealPct?: number | null }>(items: T[], min: number | null): T[] {
  return min == null ? items : items.filter((p) => (p.dealPct ?? 0) >= min);
}

/**
 * The steps worth offering for these deals: ones that narrow the list without emptying it, plus the
 * picked one (so it can be seen and cleared even where it now matches nothing).
 */
export function discountOptions(pcts: number[], picked: number | null = null): { min: number; count: number }[] {
  return DISCOUNT_STEPS.flatMap((min) => {
    const count = pcts.filter((p) => p >= min).length;
    return (count > 0 && count < pcts.length) || min === picked ? [{ min, count }] : [];
  });
}
