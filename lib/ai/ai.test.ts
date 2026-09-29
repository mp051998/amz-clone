import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { CATEGORIES, product } from '@/test/fixtures/decision';
import { decisionConfig } from '@/lib/decision/attributes';
import { rankProducts } from '@/lib/decision/rank';
import { aiStatus, extractJson, generateJson, getProvider, setProviderOverride, withFallback } from './index';
import { createMockProvider } from './providers/mock';
import { createGeminiProvider, LlmError } from './providers/gemini';
import { parseSearchQuery } from './features/parseQuery';
import { buildProfile } from './features/profile';
import { compareVerdictAI } from './features/compare';
import { z } from 'zod';

const off = { cache: false } as const;

afterEach(() => {
  setProviderOverride(undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('provider selection', () => {
  it('is disabled without GEMINI_API_KEY and never exposes the key', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(getProvider()).toBeNull();
    expect(aiStatus()).toEqual({ provider: null, enabled: false });
    vi.stubEnv('GEMINI_API_KEY', 'secret-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash-lite');
    const s = aiStatus();
    expect(s).toEqual({ provider: 'gemini:gemini-2.5-flash-lite', enabled: true });
    expect(JSON.stringify(s)).not.toContain('secret-key');
  });
});

describe('generateJson / withFallback', () => {
  const S = z.object({ a: z.number() });

  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('nope')).toThrow();
  });

  it('validates replies and asks for JSON', async () => {
    const p = createMockProvider(['{"a": 2}']);
    await expect(generateJson(p, { prompt: 'x' }, S)).resolves.toEqual({ a: 2 });
    expect(p.calls[0].json).toBe(true);
    await expect(generateJson(createMockProvider(['{"a":"x"}']), { prompt: 'x' }, S)).rejects.toThrow(/validation/);
  });

  it('times out slow providers', async () => {
    const p = createMockProvider([{ delayMs: 1000, text: '{"a":1}' }]);
    await expect(generateJson(p, { prompt: 'x', timeoutMs: 20 }, S)).rejects.toThrow(/timed out/);
  });

  it('withFallback reports its source', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await withFallback(async () => 1, () => 2)).toEqual({ value: 1, source: 'ai' });
    expect(await withFallback(async () => { throw new Error('x'); }, () => 2)).toEqual({ value: 2, source: 'rules' });
    expect(await withFallback(null, () => 3)).toEqual({ value: 3, source: 'rules' });
  });
});

describe('parseSearchQuery', () => {
  it('uses rules with no provider', async () => {
    const q = await parseSearchQuery('IN', 'headphones for travel under ₹10,000', CATEGORIES, { provider: null });
    expect(q.source).toBe('rules');
    expect(q.budgetMinor).toBe(1_000_000);
  });

  it('accepts a valid AI reply, validating category and use', async () => {
    const p = createMockProvider([
      JSON.stringify({ keywords: 'noise cancelling headphones', category: 'electronics', budget: 10000, use: 'travel', title: 'ANC headphones for flights' }),
    ]);
    const q = await parseSearchQuery('IN', 'anc cans for flights max 10k', CATEGORIES, { provider: p, ...off });
    expect(q.source).toBe('ai');
    expect(q).toMatchObject({ keywords: 'noise cancelling headphones', category: 'electronics', budgetMinor: 1_000_000, use: 'travel' });
    expect(q.intents.map((i) => i.kind)).toEqual(expect.arrayContaining(['category', 'budget', 'use']));
    expect(p.calls[0].prompt).toContain('electronics');
    expect(p.calls[0].prompt).toMatch(/ONLY JSON/);
  });

  it('drops categories/uses the store does not have', async () => {
    const p = createMockProvider([JSON.stringify({ keywords: 'x', category: 'garden', budget: null, use: 'moon', title: '' })]);
    const q = await parseSearchQuery('US', 'x', CATEGORIES, { provider: p, ...off });
    expect(q.category).toBeNull();
    expect(q.use).toBeNull();
  });

  it('falls back on invalid JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = await parseSearchQuery('US', 'kindle', CATEGORIES, { provider: createMockProvider(['not json']), ...off });
    expect(q.source).toBe('rules');
    expect(q.keywords).toBe('kindle');
  });

  it('falls back on timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    const p = createMockProvider([{ delayMs: 60_000, text: '{}' }]);
    const pending = parseSearchQuery('US', 'kindle under $100', CATEGORIES, { provider: p, ...off });
    await vi.advanceTimersByTimeAsync(5000);
    const q = await pending;
    expect(q.source).toBe('rules');
    expect(q.budgetMinor).toBe(10000);
  });

  it('falls back on provider errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = await parseSearchQuery('US', 'kindle', CATEGORIES, { provider: createMockProvider([new Error('503')]), ...off });
    expect(q.source).toBe('rules');
  });
});

describe('buildProfile', () => {
  const cfg = decisionConfig('electronics');

  it('clamps AI weights to the category keys and fills missing reasons', async () => {
    const p = createMockProvider([
      JSON.stringify({
        weights: { sound: 11, battery: -3, comfort: '4', anc: 2.4, bogus: 5 },
        reasons: { sound: 'You listen a lot.' },
        summary: 'You want great sound.',
        watch: 'Heavy models tire the ears.',
      }),
    ]);
    const prof = await buildProfile('electronics', { use: ['Commuting'] }, 1_000_000, 'IN', { provider: p, ...off });
    expect(prof.source).toBe('ai');
    expect(prof.weights).toEqual({ sound: 5, battery: 0, comfort: 4, anc: 2, value: cfg.defaultWeights.value });
    expect(prof.reasons.sound).toBe('You listen a lot.');
    for (const a of cfg.attributes) expect(prof.reasons[a.key]).toBeTruthy();
    expect(p.calls[0].prompt).toContain('battery');
    expect(p.calls[0].prompt).toContain('₹10,000');
  });

  it('falls back to rules on invalid JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prof = await buildProfile('electronics', {}, null, 'US', { provider: createMockProvider(['{"weights": "loud"}']), ...off });
    expect(prof.source).toBe('rules');
    expect(prof.weights).toEqual(cfg.defaultWeights);
  });

  it('uses rules without a provider and ignores unknown pain answers', async () => {
    const prof = await buildProfile('electronics', { pain: ['made up'] }, null, 'US', { provider: null });
    expect(prof.source).toBe('rules');
    expect(prof.weights).toEqual(cfg.defaultWeights);
  });
});

describe('compareVerdictAI', () => {
  const a = product({ id: 'a', priceMinor: 5000 });
  const b = product({ id: 'b', priceMinor: 9000, title: 'Beta Headphones' });
  const weights = decisionConfig('electronics').defaultWeights;
  const ranked = rankProducts([a, b], new Map(), weights);

  it('accepts a valid verdict and fills skipped products from rules', async () => {
    const p = createMockProvider([
      JSON.stringify({ winnerId: 'b', text: 'Beta wins on sound.', perProduct: [{ productId: 'b', bestFor: 'Audiophiles', strengths: ['Rich sound'], tradeoffs: ['Pricey'] }] }),
    ]);
    const v = await compareVerdictAI(ranked, weights, undefined, { provider: p, ...off });
    expect(v.source).toBe('ai');
    expect(v.winnerId).toBe('b');
    expect(v.perProduct).toHaveLength(2);
    expect(v.perProduct.find((x) => x.productId === 'b')!.strengths).toEqual(['Rich sound']);
    expect(v.perProduct.find((x) => x.productId === 'a')!.strengths.length).toBeGreaterThan(0);
  });

  it('rejects a winner that was not compared', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = createMockProvider([JSON.stringify({ winnerId: 'zzz', text: 'Other wins.' })]);
    const v = await compareVerdictAI(ranked, weights, undefined, { provider: p, ...off });
    expect(v.source).toBe('rules');
    expect(['a', 'b']).toContain(v.winnerId);
  });
});

describe('gemini provider', () => {
  it('posts generateContent with the key header and JSON mode', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }),
    );
    const g = createGeminiProvider({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch });
    expect(await g.generate({ prompt: 'hi', json: true })).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/models\/gemini-2\.5-flash:generateContent$/);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const sent = JSON.parse(String(init.body));
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.contents[0].parts[0].text).toBe('hi');
  });

  it('throws LlmError on HTTP errors and blocked replies', async () => {
    const http = createGeminiProvider({ apiKey: 'k', fetch: (async () => new Response('no', { status: 429 })) as unknown as typeof fetch });
    await expect(http.generate({ prompt: 'x' })).rejects.toBeInstanceOf(LlmError);
    const blocked = createGeminiProvider({
      apiKey: 'k',
      fetch: (async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } })) as unknown as typeof fetch,
    });
    await expect(blocked.generate({ prompt: 'x' })).rejects.toMatchObject({ kind: 'blocked' });
  });
});
