/**
 * Provider-agnostic LLM contract. Gemini is the intended provider
 * (lib/ai/providers/gemini.ts, enabled by GEMINI_API_KEY); with no key every AI
 * feature falls back to its deterministic rules and reports `source: 'rules'`.
 */
export interface LlmRequest {
  system?: string;
  prompt: string;
  /** Ask the model for a JSON object (Gemini: responseMimeType application/json). */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  /** Abort after this many ms (default 8000). */
  timeoutMs?: number;
  /** Pictures to look at with the prompt, base64 (Gemini: inlineData parts before the text). */
  images?: readonly LlmImage[];
}

export interface LlmImage {
  /** image/jpeg, image/png or image/webp */
  mimeType: string;
  /** the bytes, base64 */
  data: string;
}

export interface LlmProvider {
  /** e.g. "gemini:gemini-2.5-flash" — recorded with cached results. */
  readonly id: string;
  /** Returns the raw text of the first candidate. Throws on transport/HTTP/safety errors. */
  generate(req: LlmRequest): Promise<string>;
}
