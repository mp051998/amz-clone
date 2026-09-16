import type { Product } from './catalog';

/** One customer review, generated deterministically from the product so it is stable across renders. */
export interface Review {
  id: string;
  author: string;
  initial: string;
  rating: number;
  title: string;
  body: string;
  date: string; // "September 3, 2025"
  verified: boolean;
  helpful: number;
}

export interface RatingBar {
  star: number;
  count: number;
  pct: number;
}

/** Deterministic PRNG (mulberry32) seeded from a string — same generator the catalog uses. */
function seed(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle into a new array so pools can be drawn without repeats. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Star distribution (5→1) as percentages, skewed to match the average rating. */
function tierPct(rating: number): [number, number, number, number, number] {
  if (rating >= 4.7) return [78, 14, 4, 2, 2];
  if (rating >= 4.5) return [70, 18, 6, 3, 3];
  if (rating >= 4.3) return [62, 22, 9, 4, 3];
  if (rating >= 4.1) return [55, 24, 12, 5, 4];
  if (rating >= 3.9) return [47, 26, 15, 7, 5];
  if (rating >= 3.5) return [39, 26, 18, 10, 7];
  return [30, 25, 21, 13, 11];
}

/** Per-star rating counts + percentages that sum to the product's total review count. */
export function ratingBreakdown(p: Product): RatingBar[] {
  const total = p.reviewCount;
  const pcts = tierPct(p.rating);
  const counts = pcts.map((pc) => Math.round((pc / 100) * total));
  // reconcile rounding drift onto the top bucket so the parts sum to the whole
  const drift = total - counts.reduce((a, b) => a + b, 0);
  counts[0] = Math.max(0, counts[0] + drift);
  return counts.map((count, i) => ({
    star: 5 - i,
    count,
    pct: total ? Math.round((count / total) * 100) : 0,
  }));
}

const POSITIVE_TITLES = [
  'Exactly what I needed', 'Great value for the price', 'Exceeded my expectations', 'Highly recommend',
  'Really happy with this purchase', 'Works perfectly', 'Better than I expected', 'Would buy again',
  'Solid quality, no complaints', 'Impressed so far',
];
const POSITIVE_BODIES = [
  'Arrived a day early and was exactly as described. Quality feels premium and it has worked flawlessly so far.',
  'I was hesitant at first, but this turned out to be a fantastic buy. Setup was simple and it does everything I hoped.',
  'Using it daily for a few weeks now with zero issues. Feels well built and the value is hard to beat.',
  'Honestly better than options costing twice as much. Packaging was secure and everything worked right out of the box.',
  'Does exactly what it promises. Comfortable, reliable, and it looks great. Very pleased overall.',
  'Bought one for myself and ended up ordering two more for family. That should tell you everything you need to know.',
];
const MIXED_TITLES = ['Good but not perfect', 'Decent for the price', 'Does the job, with caveats', 'Okay overall', 'Mostly good'];
const MIXED_BODIES = [
  'It works well for the most part, but there are a couple of small annoyances. For the price I can live with them.',
  'Quality is fine and it functions as advertised, though I wish a few of the details were better thought out.',
  'Gets the job done. Not premium, not bad — right about what you would expect at this price point.',
];
const CRITICAL_TITLES = ['Not what I expected', 'A little disappointed', 'Had higher hopes', 'Quality could be better', 'Just okay'];
const CRITICAL_BODIES = [
  'Looked great in the photos but felt cheaper in person. It works, but I expected more at this price.',
  'Worked fine at first, then started to feel flimsy with daily use. Returns were easy at least.',
  'It is fine in a pinch, but the build quality did not hold up the way I hoped it would.',
];
const AUTHORS = [
  'Jennifer M.', 'David R.', 'Priya S.', 'Michael T.', 'Sarah K.', 'James L.', 'Emily C.', 'Robert H.',
  'Ashley W.', 'Daniel P.', 'Maria G.', 'Kevin B.', 'Lauren F.', 'Chris A.', 'Nicole D.', 'Arjun N.',
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The sample of star ratings shown as written reviews, shaped to reflect the average. */
function sampleStars(rating: number): number[] {
  if (rating >= 4.6) return [5, 5, 5, 5, 4, 4, 3, 2];
  if (rating >= 4.3) return [5, 5, 4, 5, 4, 3, 4, 2];
  if (rating >= 4.0) return [5, 4, 4, 5, 3, 4, 2, 3];
  if (rating >= 3.6) return [5, 4, 3, 4, 2, 5, 3, 1];
  return [4, 3, 3, 2, 5, 2, 1, 3];
}

/** A stable "Month D, YYYY" date, `daysAgo` back from a fixed reference so SSR/CSR agree. */
function dateLabel(daysAgo: number): string {
  const ref = new Date('2026-09-10T00:00:00Z');
  const d = new Date(ref.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Deterministic set of written reviews for a product, sorted most-helpful first. */
export function productReviews(p: Product): Review[] {
  const stars = sampleStars(p.rating);
  // Draw titles/bodies/authors from shuffled pools so no two reviews repeat until a pool is exhausted.
  const pool = seed(`${p.id}#pool`);
  const posT = shuffle(POSITIVE_TITLES, pool), posB = shuffle(POSITIVE_BODIES, pool);
  const mixT = shuffle(MIXED_TITLES, pool), mixB = shuffle(MIXED_BODIES, pool);
  const criT = shuffle(CRITICAL_TITLES, pool), criB = shuffle(CRITICAL_BODIES, pool);
  const names = shuffle(AUTHORS, pool);
  let pi = 0, mi = 0, ci = 0;

  const reviews = stars.map((star, i) => {
    const rng = seed(`${p.id}#rev${i}`);
    const author = names[i % names.length];
    let title: string, body: string;
    if (star >= 4) { title = posT[pi % posT.length]; body = posB[pi % posB.length]; pi++; }
    else if (star === 3) { title = mixT[mi % mixT.length]; body = mixB[mi % mixB.length]; mi++; }
    else { title = criT[ci % criT.length]; body = criB[ci % criB.length]; ci++; }
    return {
      id: `${p.id}-r${i}`,
      author,
      initial: author.charAt(0).toUpperCase(),
      rating: star,
      title,
      body,
      date: dateLabel(6 + Math.floor(rng() * 430)),
      verified: rng() > 0.12,
      helpful: star >= 4 ? Math.floor(rng() * 320) + 6 : Math.floor(rng() * 70),
    };
  });
  return reviews.sort((a, b) => b.helpful - a.helpful);
}
