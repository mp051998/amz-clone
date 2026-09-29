import 'server-only';
import { z } from 'zod';
import { decisionConfig, type CategorySpec } from '../../decision/attributes';
import { scoresFor } from '../../decision/rank';
import { compareVerdict, shortTitle } from '../../decision/verdict';
import type { CompareVerdict, RankedProduct, Weights } from '../../decision/types';
import { cached } from '../cache';
import { generateJson, getProvider, withFallback, type FeatureOptions } from '../index';

const Schema = z.object({
  winnerId: z.string(),
  text: z.string().min(1).max(400),
  perProduct: z
    .array(
      z.object({
        productId: z.string(),
        bestFor: z.string().max(120).default(''),
        strengths: z.array(z.string().max(60)).max(4).default([]),
        tradeoffs: z.array(z.string().max(80)).max(3).default([]),
      }),
    )
    .default([]),
});

function prompt(ranked: RankedProduct[], weights: Weights, cfg: CategorySpec): string {
  const prios = cfg.attributes.map((a) => `${a.key}=${weights[a.key] ?? 0}`).join(', ');
  const rows = ranked
    .map((r) => {
      const s = scoresFor(r.product, r.insight, 0.5, cfg);
      const sc = cfg.attributes.map((a) => `${a.key}:${s[a.key] ?? 3}`).join(' ');
      return `- id=${r.product.id} "${shortTitle(r.product.title, 6)}" price=${r.product.priceMinor / 100} ${r.product.curBase} rating=${r.product.rating} match=${r.match}% scores(1-5) ${sc}`;
    })
    .join('\n');
  return (
    `Compare these ${cfg.noun} for a shopper whose priorities (0-5) are: ${prios}.\n${rows}\n\n` +
    'Return ONLY JSON: {"winnerId":"<one id above>","text":"...","perProduct":[{"productId":"...","bestFor":"...","strengths":["..."],"tradeoffs":["..."]}]}\n' +
    '- text: one sentence (max 35 words) naming the winner and why, tied to the priorities.\n' +
    '- per product: bestFor max 10 words; 2-3 strengths and 1-2 tradeoffs, short phrases. Only use the data given.'
  );
}

/**
 * Compare verdict for 2–4 ranked products. Rules (compareVerdict) first; Gemini
 * when configured. The AI winner must be one of the given ids; products the
 * model skips keep their rules entry. Never throws.
 */
export async function compareVerdictAI(
  ranked: RankedProduct[],
  weights: Weights,
  config?: CategorySpec,
  opts: FeatureOptions = {},
): Promise<CompareVerdict> {
  const cfg = config ?? decisionConfig(ranked[0]?.product.category);
  const fallback = compareVerdict(ranked, weights, cfg);
  const provider = opts.provider === undefined ? getProvider() : opts.provider;
  if (ranked.length < 2) return fallback;
  const ids = ranked.map((r) => r.product.id);

  const ai = provider
    ? async (): Promise<CompareVerdict> => {
        const out = await cached(
          'compare',
          provider.id,
          { ids, weights: cfg.attributes.map((a) => weights[a.key] ?? 0), prices: ranked.map((r) => r.product.priceMinor) },
          () => generateJson(provider, { prompt: prompt(ranked, weights, cfg), maxOutputTokens: 700, temperature: 0.3 }, Schema),
          { enabled: opts.cache },
        );
        if (!ids.includes(out.winnerId)) throw new Error(`winnerId ${out.winnerId} is not a compared product`);
        const perProduct = fallback.perProduct.map((rule) => {
          const p = out.perProduct.find((x) => x.productId === rule.productId);
          if (!p) return rule;
          const strengths = p.strengths.map((s) => s.trim()).filter(Boolean);
          const tradeoffs = p.tradeoffs.map((s) => s.trim()).filter(Boolean);
          return {
            productId: rule.productId,
            bestFor: p.bestFor.trim() || rule.bestFor,
            strengths: strengths.length ? strengths : rule.strengths,
            tradeoffs: tradeoffs.length ? tradeoffs : rule.tradeoffs,
          };
        });
        return { winnerId: out.winnerId, text: out.text.trim(), perProduct, source: 'ai' };
      }
    : null;

  return (await withFallback(ai, () => fallback, 'ai:compare')).value;
}
