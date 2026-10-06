// Build supabase/seed.sql from the catalog seed data (supabase/seed/catalog-*.json).
// - categories + per-market category order
// - products with deterministic stock (seeded by id → stable across runs)
// - product_ratings baseline: each product's historical rating volume + star histogram
// - a handful of sample written reviews per product (seeded = true; already counted
//   in the baseline, so real customer reviews add on top via trigger), worded from the
//   product's category pool (supabase/seed/review-pools.json)
// - each product's description and "Product information" rows, plus brands/authors the
//   scraped titles lacked (supabase/seed/enrichment-*.json)
// - variant groups: sibling products shown as options of each other (supabase/seed/variants.json)
// - coupons: about one product in seven has a 5–25% coupon (seeded by id → stable across runs)
// Run: node scripts/build-seed.mjs   (then: npx supabase db reset)
//      node scripts/build-seed.mjs --migration <file>   also writes the same product copy and
//      review wording as UPDATEs, for a database seeded before they existed
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

/** Category pools as {title, body} lists; categories without one use the generic wording above. */
const GENERIC_POOL = {
  positive: POSITIVE_TITLES.map((title, i) => ({ title, body: POSITIVE_BODIES[i % POSITIVE_BODIES.length] })),
  mixed: MIXED_TITLES.map((title, i) => ({ title, body: MIXED_BODIES[i % MIXED_BODIES.length] })),
  critical: CRITICAL_TITLES.map((title, i) => ({ title, body: CRITICAL_BODIES[i % CRITICAL_BODIES.length] })),
};

function sampleReviews(p, market, pools) {
  const stars = sampleStars(p.rating);
  // Author order comes from the first sample generator's draws (six shuffles, then the
  // names), kept as-is so each seeded review keeps its author, stars and date: the
  // --migration output finds already-seeded rows by them.
  const pool = seed(`${p.id}#pool`);
  for (const list of [POSITIVE_TITLES, POSITIVE_BODIES, MIXED_TITLES, MIXED_BODIES, CRITICAL_TITLES, CRITICAL_BODIES]) shuffle(list, pool);
  const names = shuffle(market === 'IN' ? AUTHORS_IN : AUTHORS_US, pool);
  const words = seed(`${p.id}#words`);
  const cat = pools[p.category] ?? GENERIC_POOL;
  const pos = shuffle(cat.positive, words), mix = shuffle(cat.mixed, words), cri = shuffle(cat.critical, words);
  let pi = 0, mi = 0, ci = 0;

  return stars.map((star, i) => {
    const rng = seed(`${p.id}#rev${i}`);
    const { title, body } = star >= 4 ? pos[pi++ % pos.length] : star === 3 ? mix[mi++ % mix.length] : cri[ci++ % cri.length];
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

// ── coupons ──────────────────────────────────────────────────────────────────
const COUPON_PCTS = [5, 10, 15, 20, 25];
/** Deterministic coupon: about one product in seven gets a percent-off coupon. */
function couponFor(id) {
  const rng = seed(`${id}#coupon`);
  if (rng() >= 0.15) return null;
  return COUPON_PCTS[Math.floor(rng() * COUPON_PCTS.length)];
}

// ── SQL helpers ──────────────────────────────────────────────────────────────
const q = (v) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === undefined || v === null ? 'null' : String(Number(v)));
const b = (v) => (v ? 'true' : 'false');
const arr = (list) => `array[${list.map(q).join(', ')}]::text[]`;
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`;

function insert(table, cols, rows) {
  if (!rows.length) return '';
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    chunks.push(`insert into ${table} (${cols.join(', ')}) values\n  ${slice.map((r) => `(${r.join(', ')})`).join(',\n  ')};\n`);
  }
  return chunks.join('\n');
}

const readJson = async (name) => JSON.parse(await readFile(join(SEED_DIR, name), 'utf8'));

/** --migration: product copy and review wording as UPDATEs, matched by product id and by review author, stars and date. */
function backfillSql(catalog, reviews) {
  const products = catalog.map((p) => `(${q(p.id)}, ${q(p.enrichedBrand)}::text, ${q(p.description)}, ${jsonb(p.details)})`);
  const rows = reviews.map((r) => `(${q(r.product_id)}, ${q(r.author_name)}, ${q(r.created_at)}::timestamptz, ${n(r.rating)}::smallint, ${q(r.title)}, ${q(r.body)})`);
  const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
  return [
    ...chunks(products, 100).map(
      (c) => `update public.products p
set brand = coalesce(p.brand, v.brand),
    description = coalesce(p.description, v.description),
    details = case when p.details = '[]'::jsonb then v.details else p.details end
from (values
  ${c.join(',\n  ')}
) as v (id, brand, description, details)
where p.id = v.id;
`,
    ),
    ...chunks(rows, 400).map(
      (c) => `update public.reviews r
set title = v.title, body = v.body
from (values
  ${c.join(',\n  ')}
) as v (product_id, author_name, created_at, rating, title, body)
where r.seeded and r.product_id = v.product_id and r.author_name = v.author_name
  and r.created_at = v.created_at and r.rating = v.rating;
`,
    ),
  ].join('\n');
}

async function main() {
  const us = await readJson('catalog-us.json');
  const inn = await readJson('catalog-in.json');
  const enrichment = { ...(await readJson('enrichment-us.json')), ...(await readJson('enrichment-in.json')) };
  const pools = await readJson('review-pools.json');
  const variants = new Map(
    (await readJson('variants.json')).groups.flatMap((g) => g.options.map(([id, label]) => [id, { group: g.group, axis: g.axis, label }])),
  );

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
  ].map((p) => {
    const e = enrichment[p.id];
    if (!e) throw new Error(`no enrichment for ${p.id}`);
    return { ...p, brand: p.brand ?? e.brand, enrichedBrand: p.brand ? null : e.brand ?? null, description: e.description, details: e.details };
  });
  const known = new Set(catalog.map((p) => p.id));
  for (const id of variants.keys()) if (!known.has(id)) throw new Error(`variants.json: no product ${id}`);

  const productRows = catalog.map((p) => [
    q(p.id), q(p.market), q(p.category), q(p.title), q(p.brand), q(p.image),
    n(p.priceMinor), n(p.listMinor), n(p.dealPct), b(p.deal), q(p.badge), q(p.boughtPastMonth),
    q(p.seller), q(p.shipsFrom), arr(p.bullets ?? []), q(p.description), jsonb(p.details), n(stockFor(p.id)), n(p.position),
    q(variants.get(p.id)?.group), q(variants.get(p.id)?.axis), q(variants.get(p.id)?.label),
  ]);

  const ratingRows = catalog.map((p) => {
    const [s5, s4, s3, s2, s1] = starCounts(p.rating, p.reviewCount);
    return [q(p.id), n(p.reviewCount), (p.rating * p.reviewCount).toFixed(1), n(s1), n(s2), n(s3), n(s4), n(s5)];
  });

  const reviews = catalog.flatMap((p) => sampleReviews(p, p.market, pools));
  const reviewRows = reviews.map((r) => [
    q(r.product_id), q(r.author_name), n(r.rating), q(r.title), q(r.body), b(r.verified), 'true', n(r.helpful_count), q(r.created_at),
  ]);

  const couponRows = catalog.flatMap((p) => {
    const pct = couponFor(p.id);
    return pct ? [[q(p.id), n(pct)]] : [];
  });

  const sql = [
    '-- AUTO-GENERATED by scripts/build-seed.mjs from supabase/seed/catalog-*.json — do not edit by hand.',
    '-- Loaded by `supabase db reset` after the migrations.',
    '',
    insert('public.categories', ['slug', 'name'], categories.map((c) => [q(c.slug), q(c.name)])),
    insert('public.market_categories', ['market_id', 'category_slug', 'position'], marketCategories.map(([m, s, i]) => [q(m), q(s), n(i)])),
    insert(
      'public.products',
      ['id', 'market_id', 'category_slug', 'title', 'brand', 'image', 'price_minor', 'list_minor', 'deal_pct', 'deal', 'badge', 'bought_past_month', 'seller', 'ships_from', 'bullets', 'description', 'details', 'stock', 'position', 'variant_group', 'variant_axis', 'variant_label'],
      productRows,
    ),
    insert('public.product_ratings', ['product_id', 'rating_count', 'rating_sum', 'star_1', 'star_2', 'star_3', 'star_4', 'star_5'], ratingRows),
    insert('public.reviews', ['product_id', 'author_name', 'rating', 'title', 'body', 'verified', 'seeded', 'helpful_count', 'created_at'], reviewRows),
    insert('public.coupons', ['product_id', 'percent_off'], couponRows),
  ].join('\n');

  await writeFile(join(ROOT, 'supabase', 'seed.sql'), sql);
  console.log(`wrote supabase/seed.sql — ${categories.length} categories, ${catalog.length} products, ${reviewRows.length} sample reviews, ${couponRows.length} coupons`);

  const at = process.argv.indexOf('--migration');
  if (at > 0) {
    const file = process.argv[at + 1];
    if (!file) throw new Error('--migration needs a file');
    await writeFile(file, backfillSql(catalog, reviews));
    console.log(`wrote ${file}`);
  }
}

main();
