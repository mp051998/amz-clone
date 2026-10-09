import type { Db } from '../db/client';
import { DataError, unwrap } from './errors';
import type { InboxKind } from './inbox';

/**
 * Communication preferences (20261231090000_message_preferences.sql), as on Amazon's
 * Communication Preferences Center: the shopper can turn off the messages that aren't about an
 * order they're waiting on. Order, delivery, refund, return, support, A-to-z claim and recall
 * messages always come. Preferences are the account's, across both stores.
 */

export type MessageTopic = 'review_request' | 'answer' | 'deal_live';

export interface MessageTopicInfo {
  id: MessageTopic;
  label: string;
  desc: string;
}

/** What can be turned off, in the order it's shown. Each topic is one kind of message. */
export const MESSAGE_TOPICS: readonly MessageTopicInfo[] = [
  { id: 'review_request', label: 'Review requests', desc: 'Asking how something you bought turned out, a couple of days after it arrives.' },
  { id: 'answer', label: 'Answers to your questions', desc: 'When another shopper answers a question you asked about a product.' },
  { id: 'deal_live', label: 'Watched deal alerts', desc: 'When a Lightning Deal you’re watching goes live.' },
];

/** The messages that always come, whatever the shopper turns off. */
export const ALWAYS_SENT: readonly string[] = [
  'Order updates: order confirmations, shipped, out for delivery, delivered, cancelled',
  'Refunds, returns and replacements',
  'Replies on your support cases and A-to-z Guarantee claims',
  'Product safety recalls',
];

export function isMessageTopic(v: unknown): v is MessageTopic {
  return typeof v === 'string' && MESSAGE_TOPICS.some((t) => t.id === v);
}

/** Each topic and whether it's on; everything is on until the shopper turns it off. */
export function topicStates(muted: ReadonlySet<MessageTopic>): (MessageTopicInfo & { on: boolean })[] {
  return MESSAGE_TOPICS.map((t) => ({ ...t, on: !muted.has(t.id) }));
}

/** Whether a message of this kind is one the shopper turned off. */
export function isMuted(kind: InboxKind, muted: ReadonlySet<MessageTopic>): boolean {
  return isMessageTopic(kind) && muted.has(kind);
}

/** The topics `userId` has turned off (none until they've changed anything). */
export async function mutedTopics(db: Db, userId: string): Promise<Set<MessageTopic>> {
  const row = unwrap(await db.from('message_preferences').select('muted').eq('user_id', userId).maybeSingle());
  return new Set((row?.muted ?? []).filter(isMessageTopic));
}

/** Turn a topic on or off for the caller; the topics now off. `invalid_input` (topic) for anything else. */
export async function setMessageTopic(db: Db, topic: unknown, on: boolean): Promise<Set<MessageTopic>> {
  if (!isMessageTopic(topic)) throw new DataError('invalid_input', 'topic', 'Pick one of the messages you can turn off.');
  const muted = unwrap(await db.rpc('set_message_topic', { p_topic: topic, p_on: on }));
  return new Set((muted ?? []).filter(isMessageTopic));
}
