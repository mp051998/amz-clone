import 'server-only';
import { z } from 'zod';
import { clampWeights, decisionConfig } from '../../decision/attributes';
import { ruleProfile } from '../../decision/profile';
import type { PriorityProfile, QuizAnswers } from '../../decision/types';
import { formatMoney } from '../../marketplaces';
import type { Market } from '../../types';
import { cached } from '../cache';
import { generateJson, getProvider, withFallback, type FeatureOptions } from '../index';

const Schema = z.object({
  weights: z.record(z.string(), z.union([z.number(), z.string()])),
  reasons: z.record(z.string(), z.string()).default({}),
  summary: z.string().default(''),
  watch: z.string().default(''),
});

/** Normalise untrusted answers to the quiz's option labels and caps. */
export function sanitizeAnswers(category: string | null | undefined, raw: Partial<QuizAnswers> | null | undefined): QuizAnswers {
  const cfg = decisionConfig(category);
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, 10) : []);
  return {
    use: list(raw?.use),
    duration: str(raw?.duration, 80) || null,
    priceVsQuality: str(raw?.priceVsQuality, 80) || null,
    pain: list(raw?.pain).filter((p) => cfg.attributes.some((a) => a.pain === p)),
    note: str(raw?.note, 400),
  };
}

function prompt(category: string | null | undefined, a: QuizAnswers, budget: string | null): string {
  const cfg = decisionConfig(category);
  const keys = cfg.attributes.map((x) => `${x.key} (${x.phrase})`).join(', ');
  const shape = cfg.attributes.map((x) => `"${x.key}":n`).join(',');
  const reasonShape = cfg.attributes.map((x) => `"${x.key}":"..."`).join(',');
  return (
    `A shopper is choosing ${cfg.noun}${budget ? ` (budget around ${budget})` : ''}. Their answers:\n` +
    `- ${cfg.uses.title} ${a.use.join(', ') || 'not given'}\n` +
    `- ${cfg.duration.title} ${a.duration ?? 'not given'}\n` +
    `- Price vs quality: ${a.priceVsQuality ?? 'not given'}\n` +
    `- Past annoyances: ${a.pain.join(', ') || 'none'}\n` +
    `- Notes: ${a.note || 'none'}\n\n` +
    `Set an importance weight 0-5 for each attribute: ${keys}. Use the full range; not everything can be 5.\n` +
    `Return ONLY JSON: {"weights":{${shape}},"reasons":{${reasonShape}},"summary":"...","watch":"..."}\n` +
    'Each reason: one short second-person sentence (max 12 words) tied to their answers. ' +
    'summary: one warm sentence (max 28 words) reflecting their answers back. ' +
    'watch: one sentence about something to be careful of, or "" if nothing.'
  );
}

/**
 * Priority profile from quiz answers. Rules first; Gemini when configured.
 * AI weights are clamped to the category's keys (0..5); missing reasons fall
 * back to the rules reasons. Never throws.
 */
export async function buildProfile(
  category: string | null | undefined,
  rawAnswers: Partial<QuizAnswers>,
  budgetMinor: number | null,
  market: Market = 'US',
  opts: FeatureOptions = {},
): Promise<PriorityProfile> {
  const answers = sanitizeAnswers(category, rawAnswers);
  const fallback = ruleProfile(category, answers);
  const provider = opts.provider === undefined ? getProvider() : opts.provider;
  const budget = budgetMinor ? formatMoney(budgetMinor, market === 'IN' ? 'INR' : 'USD') : null;
  const cfg = decisionConfig(category);

  const ai = provider
    ? async (): Promise<PriorityProfile> => {
        const out = await cached(
          'profile',
          provider.id,
          { category: cfg.category, answers, budget },
          () => generateJson(provider, { prompt: prompt(category, answers, budget), maxOutputTokens: 600, temperature: 0.4 }, Schema),
          { enabled: opts.cache },
        );
        const weights = clampWeights(category, { ...fallback.weights, ...out.weights });
        const reasons: Record<string, string> = {};
        for (const a of cfg.attributes) {
          const r = out.reasons[a.key]?.trim();
          reasons[a.key] = r ? r.slice(0, 140) : fallback.reasons[a.key];
        }
        return {
          weights,
          reasons,
          summary: out.summary.trim().slice(0, 240) || fallback.summary,
          watch: out.watch.trim().slice(0, 200),
          source: 'ai',
        };
      }
    : null;

  return (await withFallback(ai, () => fallback, 'ai:profile')).value;
}
