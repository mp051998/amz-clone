// Build supabase/seed.sql from the catalog seed data (supabase/seed/catalog-*.json).
// - categories + per-market category order
// - products with deterministic stock (seeded by id → stable across runs)
// - product_ratings baseline: each product's historical rating volume + star histogram
// - a handful of sample written reviews per product (seeded = true; already counted
//   in the baseline, so real customer reviews add on top via trigger)
// Run: node scripts/build-seed.mjs   (then: npx supabase db reset)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = join(ROOT, 'supabase', 'seed');

/** Deterministic PRNG (mulberry32) seeded from a string — same generator the catalog builders use. */
function seed(str) {
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

function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── rating histogram ─────────────────────────────────────────────────────────
/** Star distribution (5→1) as percentages, skewed to match the average rating. */
function tierPct(rating) {
  if (rating >= 4.7) return [78, 14, 4, 2, 2];
  if (rating >= 4.5) return [70, 18, 6, 3, 3];
  if (rating >= 4.3) return [62, 22, 9, 4, 3];
  if (rating >= 4.1) return [55, 24, 12, 5, 4];
  if (rating >= 3.9) return [47, 26, 15, 7, 5];
  if (rating >= 3.5) return [39, 26, 18, 10, 7];
  return [30, 25, 21, 13, 11];
}

/** per-star counts (5→1) summing exactly to the product's rating volume. */
function starCounts(rating, total) {
  const counts = tierPct(rating).map((pc) => Math.round((pc / 100) * total));
  const drift = total - counts.reduce((a, b) => a + b, 0);
  counts[0] = Math.max(0, counts[0] + drift);
  return counts;
}

// ── sample reviews ───────────────────────────────────────────────────────────
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
const AUTHORS_US = [
  'Jennifer M.', 'David R.', 'Priya S.', 'Michael T.', 'Sarah K.', 'James L.', 'Emily C.', 'Robert H.',
  'Ashley W.', 'Daniel P.', 'Maria G.', 'Kevin B.', 'Lauren F.', 'Chris A.', 'Nicole D.', 'Arjun N.',
];
const AUTHORS_IN = [
  'Rahul K.', 'Priya S.', 'Ananya R.', 'Vikram M.', 'Sneha P.', 'Arjun N.', 'Kavya I.', 'Rohan D.',
  'Meera T.', 'Aditya G.', 'Divya L.', 'Karthik V.', 'Pooja B.', 'Siddharth J.', 'Neha C.', 'Amit H.',
];

/** The sample of star ratings shown as written reviews, shaped to reflect the average. */
function sampleStars(rating) {
  if (rating >= 4.6) return [5, 5, 5, 5, 4, 4, 3, 2];
  if (rating >= 4.3) return [5, 5, 4, 5, 4, 3, 4, 2];
  if (rating >= 4.0) return [5, 4, 4, 5, 3, 4, 2, 3];
  if (rating >= 3.6) return [5, 4, 3, 4, 2, 5, 3, 1];
  return [4, 3, 3, 2, 5, 2, 1, 3];
}

const REF_DATE = Date.parse('2026-09-10T00:00:00Z');

function sampleReviews(p, market) {
  const stars = sampleStars(p.rating);
  const pool = seed(`${p.id}#pool`);
  const posT = shuffle(POSITIVE_TITLES, pool), posB = shuffle(POSITIVE_BODIES, pool);
  const mixT = shuffle(MIXED_TITLES, pool), mixB = shuffle(MIXED_BODIES, pool);
  const criT = shuffle(CRITICAL_TITLES, pool), criB = shuffle(CRITICAL_BODIES, pool);
  const names = shuffle(market === 'IN' ? AUTHORS_IN : AUTHORS_US, pool);
  let pi = 0, mi = 0, ci = 0;

  return stars.map((star, i) => {
    const rng = seed(`${p.id}#rev${i}`);
    let title, body;
    if (star >= 4) { title = posT[pi % posT.length]; body = posB[pi % posB.length]; pi++; }
    else if (star === 3) { title = mixT[mi % mixT.length]; body = mixB[mi % mixB.length]; mi++; }
    else { title = criT[ci % criT.length]; body = criB[ci % criB.length]; ci++; }
    const daysAgo = 6 + Math.floor(rng() * 430);
    return {
      product_id: p.id,
      author_name: names[i % names.length],
      rating: star,
      title,
      body,
      verified: rng() > 0.12,
      helpful_count: star >= 4 ? Math.floor(rng() * 320) + 6 : Math.floor(rng() * 70),
      created_at: new Date(REF_DATE - daysAgo * 86_400_000).toISOString(),
    };
  });
}

// ── stock ────────────────────────────────────────────────────────────────────
/** Deterministic stock: most items comfortably stocked, a few running low. */
function stockFor(id) {
  const rng = seed(`${id}#stock`);
  const r = rng();
  if (r < 0.08) return 2 + Math.floor(rng() * 4); // 2–5 left
  return 25 + Math.floor(rng() * 375); // 25–399
}

// ── SQL helpers ──────────────────────────────────────────────────────────────
const q = (v) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === undefined || v === null ? 'null' : String(Number(v)));
const b = (v) => (v ? 'true' : 'false');
const arr = (list) => `array[${list.map(q).join(', ')}]::text[]`;

function insert(table, cols, rows) {
  if (!rows.length) return '';
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    chunks.push(`insert into ${table} (${cols.join(', ')}) values\n  ${slice.map((r) => `(${r.join(', ')})`).join(',\n  ')};\n`);
  }
  return chunks.join('\n');
}

async function main() {
  const us = JSON.parse(await readFile(join(SEED_DIR, 'catalog-us.json'), 'utf8'));
  const inn = JSON.parse(await readFile(join(SEED_DIR, 'catalog-in.json'), 'utf8'));

  const categories = [...us.categories, ...inn.categories].map(({ slug, name }) => ({ slug, name }));
  const baseSlugs = us.categories.map((c) => c.slug);
  // India-only departments: one without `after` leads the nav (amazon.in opens with Mobiles;
  // amazon.com folds phones into Electronics), the rest follow the department they split from.
  const inOrder = inn.categories.filter((c) => !c.after).map((c) => c.slug);
  for (const slug of baseSlugs) inOrder.push(slug, ...inn.categories.filter((c) => c.after === slug).map((c) => c.slug));
  const marketCategories = [
    ...baseSlugs.map((slug, i) => ['US', slug, i]),
    ...inOrder.map((slug, i) => ['IN', slug, i]),
  ];

  const catalog = [
    ...us.products.map((p, i) => ({ ...p, market: 'US', position: i })),
    ...inn.products.map((p, i) => ({ ...p, market: 'IN', position: i })),
  ];

  const productRows = catalog.map((p) => [
    q(p.id), q(p.market), q(p.category), q(p.title), q(p.brand), q(p.image),
    n(p.priceMinor), n(p.listMinor), n(p.dealPct), b(p.deal), q(p.badge), q(p.boughtPastMonth),
    q(p.seller), q(p.shipsFrom), arr(p.bullets ?? []), n(stockFor(p.id)), n(p.position),
  ]);

  const ratingRows = catalog.map((p) => {
    const [s5, s4, s3, s2, s1] = starCounts(p.rating, p.reviewCount);
    return [q(p.id), n(p.reviewCount), (p.rating * p.reviewCount).toFixed(1), n(s1), n(s2), n(s3), n(s4), n(s5)];
  });

  const reviewRows = catalog.flatMap((p) =>
    sampleReviews(p, p.market).map((r) => [
      q(r.product_id), q(r.author_name), n(r.rating), q(r.title), q(r.body), b(r.verified), 'true', n(r.helpful_count), q(r.created_at),
    ]),
  );

  const sql = [
    '-- AUTO-GENERATED by scripts/build-seed.mjs from supabase/seed/catalog-*.json — do not edit by hand.',
    '-- Loaded by `supabase db reset` after the migrations.',
    '',
    insert('public.categories', ['slug', 'name'], categories.map((c) => [q(c.slug), q(c.name)])),
    insert('public.market_categories', ['market_id', 'category_slug', 'position'], marketCategories.map(([m, s, i]) => [q(m), q(s), n(i)])),
    insert(
      'public.products',
      ['id', 'market_id', 'category_slug', 'title', 'brand', 'image', 'price_minor', 'list_minor', 'deal_pct', 'deal', 'badge', 'bought_past_month', 'seller', 'ships_from', 'bullets', 'stock', 'position'],
      productRows,
    ),
    insert('public.product_ratings', ['product_id', 'rating_count', 'rating_sum', 'star_1', 'star_2', 'star_3', 'star_4', 'star_5'], ratingRows),
    insert('public.reviews', ['product_id', 'author_name', 'rating', 'title', 'body', 'verified', 'seeded', 'helpful_count', 'created_at'], reviewRows),
  ].join('\n');

  await writeFile(join(ROOT, 'supabase', 'seed.sql'), sql);
  console.log(`wrote supabase/seed.sql — ${categories.length} categories, ${catalog.length} products, ${reviewRows.length} sample reviews`);
}

main();
