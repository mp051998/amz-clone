import type { PriorityProfile, QuizAnswers } from '@/lib/decision/types';

/**
 * The quiz result is carried to /s in a short-lived cookie so the server render can show the
 * "TUNED FROM YOUR ANSWERS" box (the weights themselves live in the URL: `preset=ai&w=…`).
 * Pure — safe on server and client.
 */
export const PROFILE_COOKIE = 'tuned_profile';
export const PROFILE_MAX_AGE = 60 * 60 * 24 * 7;

export interface StoredProfile {
  category: string;
  profile: PriorityProfile;
  answers: QuizAnswers;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function encodeProfile(p: StoredProfile): string {
  return encodeURIComponent(JSON.stringify(p));
}

/** Decode + sanitise a cookie value; null when missing or malformed. */
export function decodeProfile(raw: string | null | undefined): StoredProfile | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(decodeURIComponent(raw)) as Partial<StoredProfile>;
    const pr = j.profile as Partial<PriorityProfile> | undefined;
    if (!j.category || typeof j.category !== 'string' || !pr || typeof pr.weights !== 'object' || !pr.weights) return null;
    const weights: Record<string, number> = {};
    for (const [k, v] of Object.entries(pr.weights)) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n)) weights[k.slice(0, 32)] = Math.min(5, Math.max(0, n));
    }
    const reasons: Record<string, string> = {};
    for (const [k, v] of Object.entries(pr.reasons ?? {})) reasons[k.slice(0, 32)] = str(v, 200);
    const a = (j.answers ?? {}) as Partial<QuizAnswers>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, 10) : []);
    return {
      category: j.category.slice(0, 40),
      profile: {
        weights,
        reasons,
        summary: str(pr.summary, 400),
        watch: str(pr.watch, 300),
        source: pr.source === 'ai' ? 'ai' : 'rules',
      },
      answers: {
        use: list(a.use),
        duration: str(a.duration, 80) || null,
        priceVsQuality: str(a.priceVsQuality, 80) || null,
        pain: list(a.pain),
        note: str(a.note, 400),
      },
    };
  } catch {
    return null;
  }
}
