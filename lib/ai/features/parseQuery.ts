import 'server-only';
import { z } from 'zod';
import { decisionConfig } from '../../decision/attributes';
import { buildParsedQuery, parseQuery as ruleParseQuery } from '../../decision/query';
import type { ParsedQuery } from '../../decision/types';
import type { Category, Market } from '../../types';
import { cached } from '../cache';
import { generateJson, getProvider, withFallback, type FeatureOptions } from '../index';

const Schema = z.object({
  keywords: z.string().max(120).default(''),
  category: z.string().nullable().default(null),
  budget: z.number().positive().nullable().default(null),
  use: z.string().nullable().default(null),
  title: z.string().max(90).default(''),
});

function prompt(market: Market, q: string, categories: Category[]): string {
  const cats = categories
    .map((c) => {
      const presets = decisionConfig(c.slug).presets.map((p) => p.id).join('|');
      return `- ${c.slug} (${c.name}); use ids: ${presets}`;
    })
    .join('\n');
  const cur = market === 'IN' ? 'Indian rupees' : 'US dollars';
  return (
    `Parse this shopping search from the ${market} store: "${q}"\n\n` +
    `Categories:\n${cats}\n\n` +
    'Return ONLY JSON: {"keywords":"...","category":"<slug or null>","budget":<number or null>,"use":"<use id or null>","title":"..."}\n' +
    '- keywords: the product words to full-text search (no budget, no use-case words, no filler); may be "".\n' +
    `- budget: the price ceiling in ${cur} (whole units, e.g. 10000), or null if none.\n` +
    '- use: one use id listed for the chosen category, or null.\n' +
    '- title: a short results headline (max 60 chars), e.g. "Headphones for travel under ₹10,000".'
  );
}

/**
 * Understand a search query: keywords, category (one of the store's), budget
 * ceiling, use-case preset, chips and a headline. Rules first; Gemini when
 * configured (validated, then normalised through the same chip builder).
 * Never throws.
 */
export async function parseSearchQuery(
  market: Market,
  q: string,
  categories: Category[],
  opts: FeatureOptions = {},
): Promise<ParsedQuery> {
  const rules = () => ruleParseQuery(market, q, categories);
  const provider = opts.provider === undefined ? getProvider() : opts.provider;
  const text = (q ?? '').trim().slice(0, 200);
  if (!text) return rules();

  const ai = provider
    ? async () => {
        const out = await cached(
          'parseQuery',
          provider.id,
          { market, q: text.toLowerCase(), cats: categories.map((c) => c.slug) },
          () =>
            generateJson(
              provider,
              { prompt: prompt(market, text, categories), maxOutputTokens: 300, temperature: 0.1, timeoutMs: 4000 },
              Schema,
            ),
          { enabled: opts.cache },
        );
        const category = out.category && categories.some((c) => c.slug === out.category) ? out.category : null;
        const use = out.use && decisionConfig(category).presets.some((p) => p.id === out.use) ? out.use : null;
        const budgetMinor = out.budget ? Math.round(out.budget * 100) : null;
        return buildParsedQuery(market, { keywords: out.keywords.trim(), category, budgetMinor, use, title: out.title }, categories, 'ai', text);
      }
    : null;

  return (await withFallback(ai, rules, 'ai:parseQuery')).value;
}
