import { describe, expect, it, vi } from 'vitest';
import { DataError } from './errors';
import { isMessageTopic, isMuted, MESSAGE_TOPICS, mutedTopics, setMessageTopic, topicStates, type MessageTopic } from './message-preferences';
import type { Db } from '../db/client';

describe('communication preferences', () => {
  it('knows the topics that can be turned off', () => {
    expect(MESSAGE_TOPICS.map((t) => t.id)).toEqual(['review_request', 'answer', 'deal_live']);
    expect(isMessageTopic('answer')).toBe(true);
    expect(isMessageTopic('shipped')).toBe(false);
    expect(isMessageTopic(undefined)).toBe(false);
  });

  it('says what is on, and mutes only the topics turned off', () => {
    const muted = new Set<MessageTopic>(['answer']);
    expect(topicStates(muted).map((t) => [t.id, t.on])).toEqual([
      ['review_request', true],
      ['answer', false],
      ['deal_live', true],
    ]);
    expect(isMuted('answer', muted)).toBe(true);
    expect(isMuted('review_request', muted)).toBe(false);
    // order updates can't be muted, whatever is stored
    expect(isMuted('shipped', new Set(['shipped' as MessageTopic]))).toBe(false);
  });

  it('reads the topics turned off, none without a row, ignoring anything unknown', async () => {
    const read = (muted: string[] | null) => {
      const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: muted ? { muted } : null, error: null }) }));
      const db = { from: vi.fn(() => ({ select: () => ({ eq }) })) } as unknown as Db;
      return { db, eq };
    };
    const a = read(['deal_live', 'shipped']);
    expect([...(await mutedTopics(a.db, 'u1'))]).toEqual(['deal_live']);
    expect(a.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect([...(await mutedTopics(read(null).db, 'u1'))]).toEqual([]);
  });

  it('turns a topic on or off through the function, refusing anything else', async () => {
    const rpc = vi.fn(async () => ({ data: ['review_request'], error: null }));
    const db = { rpc } as unknown as Db;
    expect([...(await setMessageTopic(db, 'review_request', false))]).toEqual(['review_request']);
    expect(rpc).toHaveBeenCalledWith('set_message_topic', { p_topic: 'review_request', p_on: false });
    await expect(setMessageTopic(db, 'shipped', false)).rejects.toMatchObject({ code: 'invalid_input', detail: 'topic' });
    await expect(setMessageTopic(db, 'shipped', false)).rejects.toBeInstanceOf(DataError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
