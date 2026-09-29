'use server';
import { getMarket } from '@/lib/session';
import { clampBudget } from '@/lib/decision/attributes';
import { buildProfile } from '@/lib/ai/features/profile';
import type { PriorityProfile, QuizAnswers } from '@/lib/decision/types';

/**
 * Priority quiz → profile (weights 0..5 per attribute, reasons, summary, watch).
 * Gemini when GEMINI_API_KEY is set, rules otherwise; never throws.
 */
export async function buildProfileAction(
  category: string | null,
  answers: Partial<QuizAnswers>,
  budgetMinor: number | null,
): Promise<PriorityProfile> {
  const market = await getMarket();
  return buildProfile(category, answers ?? {}, clampBudget(market, category, budgetMinor), market);
}
