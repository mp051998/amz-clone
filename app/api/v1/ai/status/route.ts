import { json, preflight, route } from '@/lib/api/http';
import { aiStatus } from '@/lib/ai';

/** GET /api/v1/ai/status — { provider, enabled }. Never exposes the key. */
export const GET = route(async () => json(aiStatus()));

export const OPTIONS = preflight;
