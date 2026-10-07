/**
 * The "Size Chart" under a product's sizes, as on Amazon's clothes and shoes: what each size the
 * product comes in measures, and what it is in the other systems. Charts are the usual
 * conversions (brands vary a little); the product's title says whose sizes they are.
 */

export interface SizeChart {
  title: string;
  /** column headings, the size's own first */
  columns: string[];
  rows: { size: string; cells: string[] }[];
  /** how to measure */
  note: string;
}

type Fit = 'men' | 'women' | null;

/** Men's or women's sizes, as the title says ("Men's", "Mens", "Women", "Ladies"). */
export function fitOf(title: string): Fit {
  if (/\b(wom[ae]n'?s?|ladies)\b/i.test(title)) return 'women';
  if (/\bm[ae]n'?s?\b/i.test(title)) return 'men';
  return null;
}

const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
// chest (men's and unisex) and bust (women's), inches, smallest to largest letter
const CHEST: [number, number][] = [[32, 34], [34, 36], [36, 38], [38, 40], [40, 42], [42, 44], [44, 46], [46, 48]];
const BUST: [number, number][] = [[30, 31], [32, 33], [34, 35], [36, 37], [38, 40], [41, 43], [44, 46], [47, 49]];

const half = (n: number) => Math.round(n * 2) / 2;
const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const range = ([lo, hi]: [number, number], f: (n: number) => number = (n) => n) => `${f(lo)}–${f(hi)}`;
const cm = (inches: number) => Math.round(inches * 2.54);

/** EU and foot length (cm) for a UK shoe size: EU = 4/3 × (UK + 23.5); the last is (UK + 25) / 3 inches, the foot 1.5 cm less. */
const euOf = (uk: number) => String(half((4 / 3) * (uk + 23.5)));
const footOf = (uk: number) => oneDp(((uk + 25) * 2.54) / 3 - 1.5);

const NUMBER = /^\d{1,2}(\.5)?$/;
const UK = /^UK (\d{1,2}(?:\.5)?)$/i;

/** The chart for these sizes, or null when they aren't letter sizes or shoe sizes the store knows (or mix systems). */
export function sizeChartFor(sizes: readonly string[] | undefined, title: string): SizeChart | null {
  if (!sizes?.length) return null;
  const fit = fitOf(title);

  if (sizes.every((s) => LETTERS.includes(s.toUpperCase()))) {
    const women = fit === 'women';
    const table = women ? BUST : CHEST;
    const label = women ? 'Bust' : 'Chest';
    return {
      title: women ? 'Women’s tops' : fit === 'men' ? 'Men’s tops' : 'Tops',
      columns: ['Size', `${label} (in)`, `${label} (cm)`],
      rows: sizes.map((s) => {
        const r = table[LETTERS.indexOf(s.toUpperCase())];
        return { size: s, cells: [range(r), range(r, cm)] };
      }),
      note: `Measure around the fullest part of your ${women ? 'bust' : 'chest'}, under the arms. Between sizes, pick the larger.`,
    };
  }

  const note = 'Stand on paper, mark your heel and longest toe, and measure between them. Between sizes, pick the larger.';
  const whose = fit === 'women' ? 'Women’s' : 'Men’s';
  // US women's sizes run two above UK, men's one
  const usOffset = fit === 'women' ? 2 : 1;

  if (sizes.every((s) => UK.test(s))) {
    const uk = sizes.map((s) => Number(UK.exec(s)![1]));
    return {
      title: fit ? `${whose} shoes` : 'Shoes',
      columns: ['UK', ...(fit ? [`US ${fit === 'women' ? 'women' : 'men'}`] : []), 'EU', 'Foot length (cm)'],
      rows: sizes.map((s, i) => ({ size: s, cells: [...(fit ? [String(uk[i] + usOffset)] : []), euOf(uk[i]), footOf(uk[i])] })),
      note,
    };
  }

  // US sizes: whose they are decides the UK size, so a title that doesn't say gets no chart
  if (fit && sizes.every((s) => NUMBER.test(s))) {
    return {
      title: `${whose} shoes`,
      columns: ['US', 'UK', 'EU', 'Foot length (cm)'],
      rows: sizes.map((s) => {
        const uk = Number(s) - usOffset;
        return { size: s, cells: [String(uk), euOf(uk), footOf(uk)] };
      }),
      note,
    };
  }
  return null;
}
