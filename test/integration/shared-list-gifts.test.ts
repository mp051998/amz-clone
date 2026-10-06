import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, createCollection, getSharedList, markSharedGift, moveItem, removeItem, shareCollection } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';
import { anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('marking shared list items bought', () => {
  let owner: TestUser;
  let giver: TestUser;
  let other: TestUser;
  let list: string;
  let token: string;
  let p: string;
  let q: string;
  let r: string;
  beforeAll(async () => {
    [owner, giver, other] = await Promise.all([newUser('Gift Owner'), newUser('Gift Giver'), newUser('Gift Other')]);
    [p, q, r] = (await Promise.all([pickProduct('US', 41), pickProduct('US', 42), pickProduct('US', 43)])).map((x) => x.id);
    list = (await createCollection(owner.db, 'US', { name: 'Wedding' })).id;
    // one after the other: the list reads newest first (q, then p)
    await addItem(owner.db, list, p);
    await addItem(owner.db, list, q);
    token = (await shareCollection(owner.db, list)).token;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(owner), deleteUser(giver), deleteUser(other)]);
  });

  it('a giver’s mark shows to everyone with the link but the owner, bought items last', async () => {
    await markSharedGift(giver.db, token, q, true);
    const mine = await getSharedList(giver.db, token);
    expect(mine!.bought).toEqual({ [q]: 'you' });
    expect(mine!.products.map((x) => x.id)).toEqual([p, q]);
    expect((await getSharedList(other.db, token))!.bought).toEqual({ [q]: 'someone' });
    expect((await getSharedList(anon(), token))!.bought).toEqual({ [q]: 'someone' });
    const owners = await getSharedList(owner.db, token);
    expect(owners!.bought).toEqual({});
    expect(owners!.products.map((x) => x.id)).toEqual([q, p]);
  });

  it('one giver per item; only they can undo it', async () => {
    expect(await code(markSharedGift(giver.db, token, q, true))).toBe('no error');
    expect(await code(markSharedGift(other.db, token, q, true))).toBe('gift_already_bought');
    await markSharedGift(other.db, token, q, false);
    expect((await getSharedList(other.db, token))!.bought).toEqual({ [q]: 'someone' });
    await markSharedGift(giver.db, token, q, false);
    expect((await getSharedList(giver.db, token))!.bought).toEqual({});
  });

  it('not on your own list, not signed out, and only items on a live link', async () => {
    expect(await code(markSharedGift(owner.db, token, p, true))).toBe('own_list');
    expect(await code(markSharedGift(giver.db, token, r, true))).toBe('item_not_found');
    expect(await code(markSharedGift(giver.db, 'f'.repeat(32), p, true))).toBe('collection_not_found');
    expect((await anon().rpc('mark_shared_gift', { p_token: token, p_product: p, p_bought: true })).error).not.toBeNull();
    const direct = await giver.db.from('collection_gifts').select('*');
    expect(direct.data ?? []).toEqual([]);
  });

  it('the mark goes with the item when it leaves the list', async () => {
    await markSharedGift(giver.db, token, p, true);
    await removeItem(owner.db, list, p);
    await addItem(owner.db, list, p);
    expect((await getSharedList(giver.db, token))!.bought).toEqual({});

    await markSharedGift(giver.db, token, p, true);
    const elsewhere = (await createCollection(owner.db, 'US', { name: 'Maybe later' })).id;
    await moveItem(owner.db, list, elsewhere, p);
    await addItem(owner.db, list, p);
    expect((await getSharedList(giver.db, token))!.bought).toEqual({});
  });
});
