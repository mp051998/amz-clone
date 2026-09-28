import { body, json, preflight, route } from '@/lib/api/http';
import { clampBudget } from '@/lib/decision/attributes';
import type { QuizAnswers } from '@/lib/decision/types';
import { buildProfile } from '@/lib/ai/features/profile';

/**
 * POST /api/v1/ai/profile { category?, answers: {use[], duration, priceVsQuality, pain[], note}, budgetMinor? }
 * — priority weights (0..5 per attribute) with reasons, summary and watch-out.
 */
export const POST = route(async (ctx) => {
  const b = await body(ctx.req);
  const category = typeof b.category === 'string' ? b.category : null;
  const answers = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Partial<QuizAnswers>;
  const budget = typeof b.budgetMinor === 'number' ? clampBudget(ctx.market, category, b.budgetMinor) : null;
  const profile = await buildProfile(category, answers, budget, ctx.market);
  return json({ profile });
});

export const OPTIONS = preflight;
