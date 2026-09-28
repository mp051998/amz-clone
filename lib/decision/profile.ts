/**
 * Rules priority profile from quiz answers (prototype `ruleProfile`,
 * generalised to any category's quiz). Pure — the AI profile
 * (lib/ai/features/profile.ts) falls back to this.
 */
import { decisionConfig, PRICE_VS_QUALITY, type QuizOption } from './attributes';
import type { PriorityProfile, QuizAnswers, Weights } from './types';

const clampW = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Build a profile from answers. Unknown option labels are ignored. */
export function ruleProfile(category: string | null | undefined, answers: Partial<QuizAnswers>): PriorityProfile {
  const cfg = decisionConfig(category);
  const weights: Weights = { ...cfg.defaultWeights };
  const reasons: Record<string, string> = {};
  const watch: string[] = [];

  const apply = (opt: QuizOption | undefined) => {
    if (!opt) return;
    let topKey: string | null = null;
    let topDelta = 0;
    for (const [key, delta] of Object.entries(opt.boosts)) {
      if (!(key in weights)) continue;
      weights[key] = clampW(weights[key] + delta);
      if (Math.abs(delta) > Math.abs(topDelta)) {
        topDelta = delta;
        topKey = key;
      }
    }
    if (topKey && opt.reason && !reasons[topKey]) reasons[topKey] = opt.reason;
    if (opt.watch) watch.push(opt.watch);
  };

  for (const label of answers.use ?? []) apply(cfg.uses.options.find((o) => o.label === label));
  apply(cfg.duration.options.find((o) => o.label === answers.duration));

  const pvq = answers.priceVsQuality;
  if (pvq === PRICE_VS_QUALITY[0] && 'value' in weights) {
    weights.value = clampW(weights.value + 2);
    reasons.value = 'You want the lowest price that does the job';
  } else if (pvq === PRICE_VS_QUALITY[2] && 'value' in weights) {
    weights.value = clampW(weights.value - 2);
    reasons.value = 'Quality comes first for you, so price counts less';
  }

  for (const label of answers.pain ?? []) {
    const attr = cfg.attributes.find((a) => a.pain === label);
    if (!attr) continue;
    weights[attr.key] = clampW(weights[attr.key] + 2);
    reasons[attr.key] = attr.painReason;
  }

  for (const a of cfg.attributes) {
    if (!reasons[a.key]) {
      reasons[a.key] = weights[a.key] >= 4 ? 'This came up in several of your answers' : 'Nice to have, but not a deciding factor';
    }
  }

  const top = cfg.attributes
    .map((a, i) => ({ a, i }))
    .sort((x, y) => weights[y.a.key] - weights[x.a.key] || x.i - y.i)
    .slice(0, 2)
    .map((x) => x.a.phrase);

  return {
    weights,
    reasons,
    summary: `You care most about ${joinAnd(top)}, so those carry the most weight in your results.`,
    watch: watch[0] ?? '',
    source: 'rules',
  };
}
