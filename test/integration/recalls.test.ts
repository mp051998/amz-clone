import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, setArchived, type ProductInput } from '@/lib/data/admin-catalog';
import { addToCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { listInbox } from '@/lib/data/inbox';
import { placeOrder } from '@/lib/data/orders';
import { getRecall, listRecalls, myRecalls, recallProduct, recallsFor } from '@/lib/data/recalls';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: PromiseLike<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const tag = crypto.randomUUID().slice(0, 6);
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Recall${tag} electric kettle`,
  brand: 'Boil',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 2500,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  badge: null,
  boughtPastMonth: null,
  seller: 'Boil Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

const HAZARD = 'The handle can overheat and cause burns.';
const REMEDY = 'Stop using it and return it for a full refund.';

describe('product recalls', () => {
  let boss: TestUser;
  let shopper: TestUser;
  let other: TestUser;
  let kettle: string;
  let mug: string;
  let orderId: string;

  beforeAll(async () => {
    [boss, shopper, other] = await Promise.all([newUser('Recall Admin'), newUser('Recall Shopper'), newUser('Recall Other')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
    kettle = await createProduct(boss.db, 'US', input());
    mug = await createProduct(boss.db, 'IN', input({ title: `Recall${tag} mug`, priceMinor: 30000 }));
    await addToCart(shopper.db, 'US', kettle, 1);
    orderId = (await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING })).id;
  });
  afterAll(async () => {
    // the shopper's orders go with them, so the products can go after
    await deleteUser(shopper);
    for (const p of [kettle, mug]) if (p) await admin().from('products').delete().eq('id', p);
    await admin().from('admins').delete().eq('user_id', boss.id);
    await Promise.all([boss, other].map(deleteUser));
  });

  it('only admins recall, with a hazard and remedy the database checks too', async () => {
    const rpc = (db: typeof shopper.db, args: { p_product: string; p_hazard: string; p_remedy: string }) => db.rpc('recall_product', args);
    expect((await rpc(shopper.db, { p_product: kettle, p_hazard: HAZARD, p_remedy: REMEDY })).error?.message).toBe('forbidden');
    expect((await rpc(anon(), { p_product: kettle, p_hazard: HAZARD, p_remedy: REMEDY })).error).not.toBeNull();
    expect((await rpc(boss.db, { p_product: kettle, p_hazard: '   too hot ', p_remedy: REMEDY })).error?.message).toBe('invalid_input');
    expect((await rpc(boss.db, { p_product: kettle, p_hazard: HAZARD, p_remedy: 'x'.repeat(501) })).error?.message).toBe('invalid_input');
    expect((await rpc(boss.db, { p_product: 'no-such-product', p_hazard: HAZARD, p_remedy: REMEDY })).error?.message).toBe('product_not_found');
    expect(await getRecall(anon(), kettle)).toBeNull();
    expect((await getAdminProduct(boss.db, kettle))?.archivedAt).toBeNull();
  });

  it('takes the product off sale for good; recalling again rewrites the text and keeps the date', async () => {
    const first = await recallProduct(boss.db, kettle, { hazard: `  ${HAZARD} `, remedy: REMEDY });
    expect(first.updated).toBe(false);
    expect(first.recall).toMatchObject({ productId: kettle, title: `Recall${tag} electric kettle`, hazard: HAZARD, remedy: REMEDY });
    expect((await getAdminProduct(boss.db, kettle))?.archivedAt).not.toBeNull();
    expect(await code(setArchived(boss.db, kettle, false))).toBe('product_recalled');

    const again = await recallProduct(boss.db, kettle, { hazard: 'The lid can come off while it boils.', remedy: REMEDY });
    expect(again.updated).toBe(true);
    expect(again.recall.issuedAt).toBe(first.recall.issuedAt);
    expect(again.recall.hazard).toBe('The lid can come off while it boils.');
    expect(Date.parse(again.recall.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.recall.updatedAt));
  });

  it('is public, per store, without who issued it, and written only through the function', async () => {
    expect((await listRecalls(anon(), 'US')).map((r) => r.productId)).toContain(kettle);
    expect((await listRecalls(anon(), 'IN')).map((r) => r.productId)).not.toContain(kettle);
    expect([...(await recallsFor(other.db, [kettle, mug])).keys()]).toEqual([kettle]);
    expect((await anon().from('product_recalls').select('issued_by').eq('product_id', kettle)).error).not.toBeNull();
    const { error: write } = await boss.db.from('product_recalls').insert({ product_id: mug, hazard: HAZARD, remedy: REMEDY });
    expect(write).not.toBeNull();
    const { error: edit } = await boss.db.from('product_recalls').update({ hazard: 'Nothing wrong with it at all.' }).eq('product_id', kettle);
    expect(edit).not.toBeNull();
  });

  it('tells the shopper who bought it, on /recalls and in their messages, and nobody else', async () => {
    const mine = await myRecalls(shopper.db, 'US', shopper.id);
    expect(mine).toEqual([expect.objectContaining({ productId: kettle, orderId })]);
    expect(await myRecalls(other.db, 'US', other.id)).toEqual([]);
    expect(await myRecalls(shopper.db, 'IN', shopper.id)).toEqual([]);
    // another shopper's id gets nothing: orders stay private
    expect(await myRecalls(other.db, 'US', shopper.id)).toEqual([]);

    const inbox = await listInbox(shopper.db, 'US', shopper.id);
    expect(inbox.find((m) => m.kind === 'recall')).toMatchObject({ key: `recall:${kettle}`, orderId, href: `/recalls#recall-${kettle}` });
  });
});
