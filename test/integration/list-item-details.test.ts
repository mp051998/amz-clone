import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATCH } from '@/app/api/v1/collections/[id]/items/[productId]/route';
import { addItem, createCollection, getCollection, getSharedList, moveItem, setItemDetails, shareCollection } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';
import { anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

describe('comment, quantity and priority on list items', () => {
  let owner: TestUser;
  let other: TestUser;
  let a: string;
  let b: string;
  let p: string;
  beforeAll(async () => {
    [owner, other] = await Promise.all([newUser('Details Owner'), newUser('Details Other')]);
    p = (await pickProduct('US', 28)).id;
    a = (await createCollection(owner.db, 'US', { name: 'Birthday' })).id;
    b = (await createCollection(owner.db, 'US', { name: 'Maybe later' })).id;
    await addItem(owner.db, a, p);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(owner), deleteUser(other)]);
  });

  it('starts as saved, and the owner sets any of the three', async () => {
    expect((await getCollection(owner.db, a))!.items[0]).toMatchObject({ comment: '', quantity: 1, priority: 'medium' });
    const item = await setItemDetails(owner.db, a, p, { comment: '  Size M, not yellow  ', quantity: 2, priority: 'highest' });
    expect(item).toMatchObject({ comment: 'Size M, not yellow', quantity: 2, priority: 'highest', product: { id: p } });
    // what's left out stays
    expect(await setItemDetails(owner.db, a, p, { priority: 'low' })).toMatchObject({ comment: 'Size M, not yellow', quantity: 2, priority: 'low' });
    expect((await getCollection(owner.db, a))!.items[0]).toMatchObject({ comment: 'Size M, not yellow', quantity: 2, priority: 'low' });
  });

  it('is the owner’s alone, and only through the function', async () => {
    expect(await failure(setItemDetails(other.db, a, p, { comment: 'mine now' }))).toBe('item_not_found');
    expect(await failure(setItemDetails(owner.db, a, 'no-such-product', { comment: 'x' }))).toBe('item_not_found');
    const direct = await owner.db.from('collection_items').update({ comment: 'direct', quantity: 50 }).eq('collection_id', a).eq('product_id', p);
    expect(direct.error).not.toBeNull();
    // the database checks too, past the app's own checks
    const tooMany = await owner.db.rpc('set_collection_item_details', { p_collection: a, p_product: p, p_quantity: 100 });
    expect(tooMany.error?.message).toBe('invalid_input');
    const long = await owner.db.rpc('set_collection_item_details', { p_collection: a, p_product: p, p_comment: 'x'.repeat(251) });
    expect(long.error?.message).toBe('invalid_input');
    expect((await getCollection(owner.db, a))!.items[0]).toMatchObject({ comment: 'Size M, not yellow', quantity: 2, priority: 'low' });
  });

  it('moves with the item, and anyone with the link sees it', async () => {
    await moveItem(owner.db, a, b, p);
    expect((await getCollection(owner.db, b))!.items[0]).toMatchObject({ comment: 'Size M, not yellow', quantity: 2, priority: 'low' });
    const { token } = await shareCollection(owner.db, b);
    const shared = await getSharedList(anon(), token);
    expect(shared!.details[p]).toEqual({ comment: 'Size M, not yellow', quantity: 2, priority: 'low' });
  });

  it('the API sets it', async () => {
    const token = (await owner.db.auth.getSession()).data.session!.access_token;
    const patch = (productId: string, payload: object) =>
      PATCH(
        new NextRequest(`http://localhost/api/v1/collections/${b}/items/${productId}?market=US`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        { params: Promise.resolve({ id: b, productId }) },
      );
    const res = await patch(p, { comment: '', quantity: 1, priority: 'high' });
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ comment: '', quantity: 1, priority: 'high', product: { id: p } });
    const bad = await patch(p, { priority: 'urgent' });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatchObject({ code: 'invalid_input', detail: 'priority' });
    expect((await patch('no-such-product', { comment: 'x' })).status).toBe(404);
  });
});
