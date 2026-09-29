import 'server-only';
import type { z } from 'zod';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from './providers/gemini';
import type { LlmProvider, LlmRequest } from './types';

/**
 * AI entry points. The provider comes from env (`GEMINI_API_KEY`, optional
 * `GEMINI_MODEL`, default gemini-2.5-flash). With no key there is no provider and
 * every feature returns its deterministic rules result with `source: 'rules'`.
 */

export type { LlmProvider, LlmRequest } from './types';
export type AiSource = 'rules' | 'ai';

/** Options every AI feature accepts. */
export interface FeatureOptions {
  /** override the env provider (tests); null forces rules */
  provider?: LlmProvider | null;
  /** false skips the ai_cache (tests) */
  cache?: boolean;
}

let override: LlmProvider | null | undefined;

/** Tests: force a provider (or `null` for none); `undefined` restores env lookup. */
export function setProviderOverride(p: LlmProvider | null | undefined): void {
  override = p;
}

/** The configured provider, or null when AI is disabled (no GEMINI_API_KEY). */
export function getProvider(): LlmProvider | null {
  if (override !== undefined) return override;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL });
}

/** `{provider, enabled}` for GET /api/v1/ai/status — never includes the key. */
export function aiStatus(): { provider: string | null; enabled: boolean } {
  const p = getProvider();
  return { provider: p?.id ?? null, enabled: !!p };
}

/** The first `{…}` object in a model reply (tolerates code fences and chatter). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Ask for JSON and validate it. Throws on transport errors, timeouts
 * (`req.timeoutMs`, default 8000, enforced here for every provider), unparseable
 * replies and schema mismatches — callers wrap this in `withFallback`.
 */
export async function generateJson<S extends z.ZodType>(
  provider: LlmProvider,
  req: LlmRequest,
  schema: S,
): Promise<z.infer<S>> {
  const timeoutMs = req.timeoutMs ?? 8000;
  const text = await withTimeout(provider.generate({ ...req, json: true, timeoutMs }), timeoutMs + 250);
  const parsed = schema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error(`AI reply failed validation: ${parsed.error.issues.map((i) => i.path.join('.') || i.message).join(', ')}`);
  return parsed.data;
}

/**
 * Run the AI path when one is given, otherwise (or when it fails for any reason)
 * the rules path. Never throws for AI failures; reports which path produced the value.
 */
export async function withFallback<T>(
  ai: (() => Promise<T>) | null,
  rules: () => T | Promise<T>,
  label = 'ai',
): Promise<{ value: T; source: AiSource }> {
  if (ai) {
    try {
      return { value: await ai(), source: 'ai' };
    } catch (err) {
      console.warn(`[${label}] falling back to rules:`, (err as Error).message);
    }
  }
  return { value: await rules(), source: 'rules' };
}
