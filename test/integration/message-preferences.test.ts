import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { listInbox } from '@/lib/data/inbox';
import { mutedTopics, setMessageTopic } from '@/lib/data/message-preferences';
import { placeOrder } from '@/lib/data/orders';
import { answerQuestion, askQuestion } from '@/lib/data/questions';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};
const list = async (p: Promise<Set<string>>) => [...(await p)];

describe('communication preferences', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Prefs Shopper'), newUser('Prefs Answerer')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  it('has everything on to start, and turns kinds off and back on', async () => {
    expect(await list(mutedTopics(me.db, me.id))).toEqual([]);
    expect(await list(setMessageTopic(me.db, 'deal_live', false))).toEqual(['deal_live']);
    expect(await list(setMessageTopic(me.db, 'review_request', false))).toEqual(['review_request', 'deal_live']);
    // again changes nothing
    expect(await list(setMessageTopic(me.db, 'review_request', false))).toEqual(['review_request', 'deal_live']);
    expect(await list(setMessageTopic(me.db, 'deal_live', true))).toEqual(['review_request']);
    expect(await list(setMessageTopic(me.db, 'answer', true))).toEqual(['review_request']);
    expect(await list(mutedTopics(me.db, me.id))).toEqual(['review_request']);
    expect(await list(setMessageTopic(me.db, 'review_request', true))).toEqual([]);
  });

  it('refuses kinds that always come', async () => {
    expect(await failure(setMessageTopic(me.db, 'shipped', false))).toBe('invalid_input:topic');
    const direct = await me.db.rpc('set_message_topic', { p_topic: 'recall', p_on: false });
    expect(direct.error?.message).toBe('invalid_input');
  });

  it('keeps each shopper’s preferences their own, written only through the function', async () => {
    await setMessageTopic(me.db, 'answer', false);
    expect(await list(mutedTopics(other.db, me.id))).toEqual([]);
    expect(await list(mutedTopics(other.db, other.id))).toEqual([]);
    expect((await other.db.from('message_preferences').insert({ user_id: other.id, muted: ['answer'] })).error).toBeTruthy();
    const forged = await me.db.from('message_preferences').update({ muted: [] }).eq('user_id', me.id).select();
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    expect(await list(mutedTopics(me.db, me.id))).toEqual(['answer']);
    expect((await anon().rpc('set_message_topic', { p_topic: 'answer', p_on: false })).error).toBeTruthy();
    expect((await anon().from('message_preferences').select('user_id')).data ?? []).toEqual([]);
    await setMessageTopic(me.db, 'answer', true);
  });

  it('leaves what’s turned off out of the inbox, and brings it back once on', async () => {
    const [bought, asked] = await Promise.all([pickProduct('US', 117), pickProduct('US', 118)]);
    const o = await placeOrder(me.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: bought.id, qty: 1 } });
    await deliveredDaysAgo(o.id, 3);
    const q = await askQuestion(me.db, asked.id, me.id, 'Does it fold flat for storage?');
    const a = await answerQuestion(other.db, q.id, other.id, 'Yes, it folds to about an inch.');
    const keys = async () => (await listInbox(me.db, 'US', me.id, new Date(), 'America/Los_Angeles')).map((m) => m.key);

    expect(await keys()).toEqual(expect.arrayContaining([`delivered:${o.id}`, `review_request:${bought.id}`, `answer:${a.id}`]));
    await setMessageTopic(me.db, 'review_request', false);
    await setMessageTopic(me.db, 'answer', false);
    const quiet = await keys();
    expect(quiet).toContain(`delivered:${o.id}`);
    expect(quiet).not.toContain(`review_request:${bought.id}`);
    expect(quiet).not.toContain(`answer:${a.id}`);
    await setMessageTopic(me.db, 'answer', true);
    expect(await keys()).toContain(`answer:${a.id}`);
    await setMessageTopic(me.db, 'review_request', true);
    expect(await keys()).toContain(`review_request:${bought.id}`);
    await admin().from('product_questions').delete().eq('id', q.id);
  });

  it('serves them at /me/message-preferences', async () => {
    const { GET, PUT } = await import('@/app/api/v1/me/message-preferences/route');
    const token = (await me.db.auth.getSession()).data.session!.access_token;
    // a bearer token: the cookie client needs a Next request scope
    const req = (method: string, body?: unknown) =>
      new NextRequest('http://localhost/api/v1/me/message-preferences', {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-market': 'IN' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const ctx = { params: Promise.resolve({}) };
    type Prefs = { topics: { id: string; on: boolean }[]; alwaysSent: string[] };
    const on = (p: Prefs) => p.topics.map((t) => [t.id, t.on]);

    const got = (await (await GET(req('GET'), ctx)).json()) as Prefs;
    expect(on(got)).toEqual([['review_request', true], ['answer', true], ['deal_live', true]]);
    expect(got.alwaysSent.length).toBeGreaterThan(0);
    const put = await PUT(req('PUT', { topic: 'deal_live', on: false }), ctx);
    expect(put.status).toBe(200);
    expect(on((await put.json()) as Prefs)).toEqual([['review_request', true], ['answer', true], ['deal_live', false]]);
    // the account's, whichever store asks
    expect(await list(mutedTopics(me.db, me.id))).toEqual(['deal_live']);
    expect((await PUT(req('PUT', { topic: 'shipped', on: false }), ctx)).status).toBe(422);
    expect((await PUT(req('PUT', { topic: 'answer' }), ctx)).status).toBe(422);
    await setMessageTopic(me.db, 'deal_live', true);
  });
});
