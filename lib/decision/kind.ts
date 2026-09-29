/**
 * Product "kind" from its title: categories are broad (electronics holds
 * headphones and smartwatches), so alternatives and accessories need a finer
 * notion of "the same sort of thing". Pure, rule-based; first match wins, so
 * specific patterns come before generic ones. `group` joins close kinds
 * (earbuds ~ headphones) for a second-best match.
 */
export interface ProductKind {
  kind: string;
  group: string;
}

const KINDS: [kind: string, group: string, re: RegExp][] = [
  ['smartwatch', 'wearable', /\bsmart ?watch/i],
  ['earbuds', 'audio', /\b(ear ?buds?|tws|buds|airdopes|in-ear)\b/i],
  ['headphones', 'audio', /\b(head ?phones?|headsets?|over-ear|on-ear)\b/i],
  ['pressure-cooker', 'cooker', /\bpressure cooker|\bcooker\b/i],
  ['mixer-grinder', 'appliance', /\bmixer|\bgrinder/i],
  ['cookware', 'cookware', /\bcookware|pots (and|&) pans|frying pans?|\bpan set/i],
  ['laptop', 'computer', /\b(laptop|macbook|chromebook|notebook pc)\b/i],
  ['phone', 'phone', /\b(iphone|smartphone|[45]g)\b/i],
  ['shoes', 'footwear', /\b(shoes?|sneakers?|trainers)\b/i],
  ['tshirt', 'apparel', /\bt-?shirt|\bpolo\b/i],
  ['sunscreen', 'skincare', /\b(sunscreen|sunblock)\b/i],
  ['face-wash', 'skincare', /\bface ?wash|\bcleanser\b/i],
  ['skincare-set', 'skincare', /\b(skin ?care|skincare)\b.{0,24}\b(set|kit)\b|\b(kit|minis|essentials)\b/i],
  ['serum', 'skincare', /\bserum\b/i],
  ['moisturizer', 'skincare', /\b(moisturi[sz]er|cream)\b/i],
  ['dumbbell', 'weights', /\bdumbbells?\b/i],
  ['yoga-mat', 'mat', /\b(yoga|fitness|exercise) mat\b/i],
  ['blocks', 'construction', /\b(blocks|building|tiles)\b/i],
  ['book', 'book', /\b(novel|books?)\b/i],
];

export function productKind(title: string): ProductKind | null {
  for (const [kind, group, re] of KINDS) if (re.test(title)) return { kind, group };
  return null;
}

/** 2 = same kind, 1 = same group, 0 = different, null = unknown (either side unclassified). */
export function kindMatch(a: ProductKind | null, b: ProductKind | null): 0 | 1 | 2 | null {
  if (!a || !b) return null;
  if (a.kind === b.kind) return 2;
  return a.group === b.group ? 1 : 0;
}

/**
 * Narrow `pool` to things of the same sort as `title`: same kind if any exist,
 * else same group; unclassified products are kept only when `title` itself is
 * unclassified (then the category is all we know and the pool is returned as is).
 */
export function sameKind<T extends { title: string }>(title: string, pool: T[]): T[] {
  const k = productKind(title);
  if (!k) return pool;
  const scored = pool.map((p) => ({ p, m: kindMatch(k, productKind(p.title)) }));
  const exact = scored.filter((s) => s.m === 2).map((s) => s.p);
  if (exact.length) return exact;
  return scored.filter((s) => s.m === 1).map((s) => s.p);
}
