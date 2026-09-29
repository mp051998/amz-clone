import 'server-only';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { getProduct } from '../../data/catalog';
import { getInsight, upsertInsight } from '../../data/insights';
import { decisionConfig } from '../../decision/attributes';
import { deriveInsight } from '../../decision/derive';
import type { ProductInsight } from '../../decision/types';
import { createAdminClient } from '../../supabase/admin';
import { cached } from '../cache';
import { generateJson, getProvider, withFallback, type FeatureOptions } from '../index';

const Theme = z.object({ theme: z.string().min(1).max(40), count: z.coerce.number().int().nonnegative() });
const Schema = z.object({
  summary: z.string().min(1).max(1200),
  pros: z.array(z.string().min(1).max(60)).max(5).default([]),
  cons: z.array(z.string().min(1).max(80)).max(4).default([]),
  bestFor: z.string().max(120).default(''),
  praised: z.array(Theme).max(5).default([]),
  criticized: z.array(Theme).max(5).default([]),
});

interface ReviewText {
  rating: number;
  title: string;
  body: string;
}

export interface SummarizeOptions extends FeatureOptions {
  /** service-role client (defaults to createAdminClient()); product_insights is write-protected */
  admin?: Db;
  /** max reviews sent to the model (default 30) */
  maxReviews?: number;
}

function prompt(title: string, category: string | null, reviews: ReviewText[], total: number): string {
  const cfg = decisionConfig(category);
  const keys = cfg.attributes.map((a) => a.label).join(', ');
  const lines = reviews
    .map((r) => `- ${r.rating}★ ${r.title.slice(0, 80)}: ${r.body.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n');
  return (
    `Summarise shopper reviews of "${title}" (${reviews.length} of ${total} reviews shown).\n` +
    `Themes to use where they fit: ${keys}.\n\nReviews:\n${lines}\n\n` +
    'Return ONLY JSON: {"summary":"...","pros":["..."],"cons":["..."],"bestFor":"...",' +
    '"praised":[{"theme":"...","count":n}],"criticized":[{"theme":"...","count":n}]}\n' +
    '- summary: 2-3 plain sentences, neutral, no marketing, no invented facts.\n' +
    '- pros/cons: up to 3 short phrases each. bestFor: who it suits, max 10 words.\n' +
    '- praised/criticized: up to 3 themes each; count = how many of the shown reviews mention it.'
  );
}

/**
 * AI review summary for one product, stored in `product_insights` with
 * `source: 'ai'` (existing scores are kept). Runs only when a provider is
 * configured and the product has reviews; otherwise returns the stored (rules)
 * insight unchanged. Cached per product + review set. Never throws — returns
 * null only when the product or database is unavailable.
 */
export async function summarizeReviews(productId: string, opts: SummarizeOptions = {}): Promise<ProductInsight | null> {
  let admin: Db;
  try {
    admin = opts.admin ?? (createAdminClient() as unknown as Db);
  } catch {
    return null;
  }
  try {
    const existing = await getInsight(admin, productId);
    const provider = opts.provider === undefined ? getProvider() : opts.provider;
    if (!provider) return existing;

    const product = await getProduct(admin, productId, { includeArchived: true });
    if (!product) return existing;
    const res = await admin
      .from('reviews')
      .select('rating, title, body')
      .eq('product_id', productId)
      .is('hidden_at', null)
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(opts.maxReviews ?? 30, 1), 60));
    const reviews = (res.data ?? []) as ReviewText[];
    if (res.error || !reviews.length) return existing;

    const cfg = decisionConfig(product.category);
    const base =
      existing ??
      ({ ...deriveInsight(product, cfg, { pricePercentile: 0.5 }), updatedAt: new Date().toISOString() } as ProductInsight);
    const total = Math.max(product.reviewCount, reviews.length);

    const ai = async () => {
      const out = await cached(
        'reviews',
        provider.id,
        { productId, n: reviews.length, sig: reviews.map((r) => `${r.rating}:${r.title}`).join('|').slice(0, 2000) },
        () => generateJson(provider, { prompt: prompt(product.title, product.category, reviews, total), maxOutputTokens: 700, temperature: 0.3 }, Schema),
        { enabled: opts.cache },
      );
      const clean = (xs: string[], n: number) => xs.map((s) => s.trim()).filter(Boolean).slice(0, n);
      return upsertInsight(admin, {
        productId,
        scores: base.scores,
        pros: clean(out.pros, 3).length ? clean(out.pros, 3) : base.pros,
        cons: clean(out.cons, 3).length ? clean(out.cons, 3) : base.cons,
        bestFor: out.bestFor.trim() || base.bestFor,
        summary: out.summary.trim(),
        praised: out.praised.slice(0, 3),
        criticized: out.criticized.slice(0, 3),
        source: 'ai',
      });
    };
    return (await withFallback(ai, () => existing, 'ai:reviews')).value;
  } catch (err) {
    console.warn('[ai:reviews] failed:', (err as Error).message);
    return null;
  }
}
