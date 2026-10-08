import type { Db } from '../db/client';
import type { Database, Json } from '../db/database.types';
import type { ProductInsight } from '../decision/types';
import { countThemes } from '../review-themes';
import { unwrap } from './errors';
import { reviewWords } from './reviews';

type InsightRow = Database['public']['Tables']['product_insights']['Row'];

function themes(v: Json): { theme: string; count: number }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return [];
    const theme = typeof t.theme === 'string' ? t.theme : '';
    const count = Number(t.count);
    return theme ? [{ theme, count: Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0 }] : [];
  });
}

function scoresOf(v: Json): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, s] of Object.entries(v)) {
      const n = Number(s);
      if (Number.isFinite(n)) out[k] = Math.min(5, Math.max(1, Math.round(n)));
    }
  }
  return out;
}

/** product_insights row → ProductInsight. */
export function toInsight(row: InsightRow): ProductInsight {
  return {
    productId: row.product_id,
    scores: scoresOf(row.scores),
    pros: row.pros ?? [],
    cons: row.cons ?? [],
    bestFor: row.best_for,
    summary: row.summary,
    praised: themes(row.praised),
    criticized: themes(row.criticized),
    source: row.source === 'ai' ? 'ai' : 'rules',
    updatedAt: row.updated_at,
  };
}

/**
 * A rules insight with its praised and criticized themes counted from the product's written
 * reviews (`words`, else read here), so "Value for money · 3 mentions" means three reviews say so:
 * the rules builder only picks themes from the product's specs and can't count anything. Themes
 * no review mentions are dropped, and both lists are empty if the reviews can't be read. AI
 * insights already count the reviews they were given and are returned as they are.
 */
export async function withReviewCounts(
  db: Db,
  insight: ProductInsight,
  words?: Promise<{ rating: number; title: string; body: string }[] | null>,
): Promise<ProductInsight> {
  if (insight.source !== 'rules' || (!insight.praised.length && !insight.criticized.length)) return insight;
  const reviews = await (words ?? reviewWords(db, insight.productId).catch(() => null));
  return { ...insight, ...(reviews ? countThemes(insight, reviews) : { praised: [], criticized: [] }) };
}

/** One product's insight (public read), or null when none is stored. Rules themes are counted from its reviews. */
export async function getInsight(db: Db, productId: string): Promise<ProductInsight | null> {
  // read alongside, so counting adds no round trip
  const words = reviewWords(db, productId).catch(() => null);
  const row = unwrap(await db.from('product_insights').select('*').eq('product_id', productId).maybeSingle());
  return row ? withReviewCounts(db, toInsight(row), words) : null;
}

/** Insights for many products, keyed by product id (missing ids are simply absent). */
export async function getInsights(db: Db, productIds: readonly string[]): Promise<Map<string, ProductInsight>> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const rows = unwrap(await db.from('product_insights').select('*').in('product_id', ids));
  return new Map(rows.map((r) => [r.product_id, toInsight(r)]));
}

/**
 * Write an insight. Browser roles cannot write this table — pass the
 * service-role client (lib/supabase/admin.ts).
 */
export async function upsertInsight(admin: Db, insight: Omit<ProductInsight, 'updatedAt'>): Promise<ProductInsight> {
  const row = unwrap(
    await admin
      .from('product_insights')
      .upsert(
        {
          product_id: insight.productId,
          scores: insight.scores,
          pros: insight.pros,
          cons: insight.cons,
          best_for: insight.bestFor,
          summary: insight.summary,
          praised: insight.praised,
          criticized: insight.criticized,
          source: insight.source,
        },
        { onConflict: 'product_id' },
      )
      .select('*')
      .single(),
  );
  return toInsight(row);
}
