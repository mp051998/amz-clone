import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, createCollection, getSharedList, shareCollection, unshareCollection } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('sharing a list by link', () => {
  let owner: TestUser;
  let friend: TestUser;
  let listId: string;
  let productId: string;
  let token: string;
  beforeAll(async () => {
    [owner, friend] = await Promise.all([newUser('Share Owner'), newUser('Link Friend')]);
    productId = (await pickProduct('US', 24)).id;
    listId = (await createCollection(owner.db, 'US', { name: 'Wedding registry', note: 'Ask Sam about the blender' })).id;
    await addItem(owner.db, listId, productId);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(owner), deleteUser(friend)]);
  });

  it('only the owner turns a link on, and it stays the same while it’s on', async () => {
    expect((await anon().rpc('share_collection', { p_collection: listId })).error).not.toBeNull();
    expect(await code(shareCollection(friend.db, listId))).toBe('collection_not_found');
    expect(await code(unshareCollection(friend.db, listId))).toBe('collection_not_found');

    ({ token } = await shareCollection(owner.db, listId));
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect((await shareCollection(owner.db, listId)).token).toBe(token);
  });

  it('anyone with the link sees the name, first name and products, and nothing private', async () => {
    const list = await getSharedList(anon(), token);
    expect(list).toMatchObject({ name: 'Wedding registry', kind: 'custom', market: 'US', ownerName: 'Share', mine: false, collectionId: null });
    expect(list!.products.map((p) => p.id)).toEqual([productId]);
    expect((await getSharedList(friend.db, token))!.mine).toBe(false);
    expect(await getSharedList(owner.db, token)).toMatchObject({ mine: true, collectionId: listId });

    const raw = JSON.stringify((await anon().rpc('shared_collection', { p_token: token })).data);
    expect(raw).not.toContain('Ask Sam');
    expect(raw).not.toContain('saved_price');
    expect(raw).not.toContain(owner.id);
    expect(raw).not.toContain(listId);

    expect(await getSharedList(anon(), 'f'.repeat(32))).toBeNull();
    expect(await getSharedList(anon(), 'not-a-token')).toBeNull();
  });

  it('turning it off kills the link, and sharing again makes a new one', async () => {
    await unshareCollection(owner.db, listId);
    expect(await getSharedList(anon(), token)).toBeNull();
    const again = await shareCollection(owner.db, listId);
    expect(again.token).not.toBe(token);
    expect((await getSharedList(anon(), again.token))!.name).toBe('Wedding registry');
  });

  it('links are always made by the database', async () => {
    const { error } = await owner.db.from('collections').update({ share_token: 'guessable' }).eq('id', listId);
    expect(error).not.toBeNull();
    const { data } = await admin().from('collections').select('share_token').eq('id', listId).single();
    expect(data!.share_token).toMatch(/^[0-9a-f]{32}$/);
  });
});
