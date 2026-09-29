import type { LlmProvider, LlmRequest } from '../types';

/**
 * Scriptable provider for tests: returns queued replies (strings or functions of
 * the request), throws queued errors, or replies after a delay (to exercise timeouts).
 * The last reply repeats once the queue is down to one.
 */
export type MockReply = string | Error | { delayMs: number; text?: string } | ((req: LlmRequest) => string);

export interface MockProvider extends LlmProvider {
  /** every request received, in order */
  calls: LlmRequest[];
  /** queue more replies */
  push(...replies: MockReply[]): void;
}

export function createMockProvider(replies: MockReply[] = [], id = 'mock:test'): MockProvider {
  const queue = [...replies];
  const calls: LlmRequest[] = [];
  return {
    id,
    calls,
    push: (...more) => queue.push(...more),
    async generate(req) {
      calls.push(req);
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      if (next === undefined) throw new Error('mock provider: no reply queued');
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(req);
      if (typeof next === 'object') {
        await new Promise((r) => setTimeout(r, next.delayMs));
        return next.text ?? '';
      }
      return next;
    },
  };
}
