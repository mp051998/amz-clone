import 'server-only';
import type { LlmProvider, LlmRequest } from '../types';

/**
 * Google Gemini over plain REST (no SDK):
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * with the key in `x-goog-api-key`. JSON mode sets
 * `generationConfig.responseMimeType = application/json`.
 */

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export class LlmError extends Error {
  readonly kind: 'http' | 'blocked' | 'empty' | 'timeout' | 'network';
  readonly status?: number;
  constructor(kind: LlmError['kind'], message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** injectable for tests */
  fetch?: typeof fetch;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKING_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);

export function createGeminiProvider(opts: GeminiOptions): LlmProvider {
  const model = opts.model?.trim() || DEFAULT_GEMINI_MODEL;
  const base = (opts.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;

  return {
    id: `gemini:${model}`,
    async generate(req: LlmRequest): Promise<string> {
      const controller = new AbortController();
      const timeoutMs = req.timeoutMs ?? 8000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const generationConfig: Record<string, unknown> = {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 800,
      };
      if (req.json) generationConfig.responseMimeType = 'application/json';
      // 2.5 Flash thinks by default, which eats the output budget and latency; these tasks don't need it
      if (/flash/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

      let res: Response;
      try {
        res = await doFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
          body: JSON.stringify({
            ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
            contents: [{ role: 'user', parts: [...(req.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })), { text: req.prompt }] }],
            generationConfig,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new LlmError('timeout', `Gemini timed out after ${timeoutMs}ms`);
        throw new LlmError('network', `Gemini request failed: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // never echo the body verbatim into logs beyond a short excerpt (it can quote the prompt)
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        throw new LlmError('http', `Gemini HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
      }
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (data.promptFeedback?.blockReason) throw new LlmError('blocked', `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
      const cand = data.candidates?.[0];
      if (cand?.finishReason && BLOCKING_FINISH.has(cand.finishReason)) {
        throw new LlmError('blocked', `Gemini stopped: ${cand.finishReason}`);
      }
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
        .trim();
      if (!text) throw new LlmError('empty', 'Gemini returned no text');
      return text;
    },
  };
}
