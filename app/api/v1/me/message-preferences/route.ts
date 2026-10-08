import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { ALWAYS_SENT, mutedTopics, setMessageTopic, topicStates } from '@/lib/data/message-preferences';

/**
 * GET /api/v1/me/message-preferences — the caller's communication preferences: each kind of
 * message they can turn off (`topics`, with `on`) and what always comes (`alwaysSent`). The
 * account's, the same in both stores.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ topics: topicStates(await mutedTopics(ctx.db, user.id)), alwaysSent: ALWAYS_SENT });
});

/**
 * PUT /api/v1/me/message-preferences { topic, on } — turn one kind of message on or off;
 * `topic` is `review_request`, `answer` or `deal_live`, else `422 invalid_input` (`topic`).
 */
export const PUT = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (typeof b.on !== 'boolean') throw new DataError('invalid_input', 'on', 'Say whether to turn it on or off.');
  return json({ topics: topicStates(await setMessageTopic(ctx.db, b.topic, b.on)), alwaysSent: ALWAYS_SENT });
});

export const OPTIONS = preflight;
