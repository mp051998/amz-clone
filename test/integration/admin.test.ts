import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countAdminProducts,
  countAdminStock,
  createProduct,
  deleteProduct,
  getAdminProduct,
  isAdmin,
  listAdminProducts,
  productHasOrders,
  setArchived,
  updateProduct,
  uploadProductImage,
  LOW_STOCK,
  type ProductInput,
} from '@/lib/data/admin-catalog';
import { adminOverview } from '@/lib/data/admin-overview';
import { getProduct, getProductInfo } from '@/lib/data/catalog';
import { addItem, createCollection, getCollection } from '@/lib/data/collections';
import { clipCoupon, couponFor } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';
import { getInsight } from '@/lib/data/insights';
import { placeOrder } from '@/lib/data/orders';
import { addToCart, getCart, mergeGuestCart, setCartQty } from '@/lib/data/cart';
import { attributeKeys } from '@/lib/decision/attributes';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Admin test lamp ${crypto.randomUUID().slice(0, 6)}`,
  brand: 'Lumen',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 2599,
  listMinor: 3299,
  deal: true,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Lumen Store',
  shipsFrom: 'Store',
  bullets: ['Warm white', 'USB-C'],
  description: null,
  details: [],
  stock: 30,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

let boss: TestUser;
let shopper: TestUser;
const created: string[] = [];

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('Store Admin'), newUser('Plain Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  if (created.length) await admin().from('products').delete().in('id', created);
  await Promise.all([deleteUser(boss), deleteUser(shopper)]);
});

describe('admin access', () => {
  it('is_admin() answers for the caller only', async () => {
    expect(await isAdmin(boss.db)).toBe(true);
    expect(await isAdmin(shopper.db)).toBe(false);
    expect(await isAdmin(anon())).toBe(false);
  });

  it('nobody can read or change the admins table over the API', async () => {
    const read = await shopper.db.from('admins').select('user_id');
    expect(read.data ?? []).toEqual([]);
    const self = await shopper.db.from('admins').insert({ user_id: shopper.id });
    expect(self.error).not.toBeNull();
    expect(await isAdmin(shopper.db)).toBe(false);
  });

  it('non-admins cannot add, edit or delete products', async () => {
    expect(await code(createProduct(shopper.db, 'US', input()))).toBe('forbidden');
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    expect(await code(updateProduct(shopper.db, id, input({ priceMinor: 1 })))).toBe('product_not_found');
    expect(await code(deleteProduct(shopper.db, id))).toBe('product_not_found');
    expect((await getAdminProduct(admin(), id))?.priceMinor).toBe(2599);
  });
});

describe('catalog management', () => {
  it('adds a product last in catalog order, with the discount derived', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    expect(id).toMatch(/^n[A-Za-z0-9]{10}$/);
    const { data } = await admin().from('catalog_products').select('*').eq('id', id).single();
    expect(data).toMatchObject({ market_id: 'US', currency: 'USD', category_name: 'Home & Kitchen', deal_pct: 21, deal: true, rating: 0 });
    const { data: last } = await admin().from('products').select('id').eq('market_id', 'US').order('position', { ascending: false }).limit(1).single();
    expect(last?.id).toBe(id);
    const found = await listAdminProducts(boss.db, 'US', { q: data!.title! });
    expect(found.items.map((p) => p.id)).toEqual([id]);
    const search = await anon().rpc('search_catalog', { p_market: 'US', p_q: data!.title!.split(' ').slice(-1)[0] });
    expect(JSON.stringify(search.data)).toContain(id);
  });

  it('edits fields but never the id or store', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    await updateProduct(boss.db, id, input({ title: 'Renamed lamp', priceMinor: 1999, listMinor: null, deal: false, stock: 0 }));
    expect(await getAdminProduct(boss.db, id)).toMatchObject({ title: 'Renamed lamp', priceMinor: 1999, listMinor: null, deal: false, stock: 0 });
    const move = await boss.db.from('products').update({ market_id: 'IN' } as never).eq('id', id);
    expect(move.error?.code).toBe('42501');
  });

  it('gives a product a coupon, changes it and takes it away (with shoppers’ clips)', async () => {
    const id = await createProduct(boss.db, 'US', input({ couponPct: 15 }));
    created.push(id);
    expect((await getAdminProduct(boss.db, id))?.couponPct).toBe(15);
    expect(await couponFor(anon(), id, false)).toEqual({ percentOff: 15, clipped: false });
    expect(await code(createProduct(boss.db, 'US', input({ couponPct: 60 })))).toBe('invalid_input');

    await clipCoupon(shopper.db, id);
    await updateProduct(boss.db, id, input({ couponPct: 25 }));
    // a new percent keeps it applied
    expect(await couponFor(shopper.db, id, true)).toEqual({ percentOff: 25, clipped: true });

    await updateProduct(boss.db, id, input({ couponPct: null }));
    expect((await getAdminProduct(boss.db, id))?.couponPct).toBeNull();
    expect(await couponFor(shopper.db, id, true)).toBeNull();
    const clips = await admin().from('coupon_clips').select('user_id').eq('product_id', id);
    expect(clips.data).toEqual([]);
  });

  it('saves the description and spec table, which shoppers read and cannot change', async () => {
    const details: [string, string][] = [['Brand', 'Lumen'], ['Bulb', 'LED, 2700 K'], ['Power', 'USB-C, 5 V']];
    const id = await createProduct(boss.db, 'US', input({ description: 'A small warm lamp.', details }));
    created.push(id);
    // first available: the day it was listed
    expect(await getProductInfo(anon(), id)).toEqual({ description: 'A small warm lamp.', details, gallery: [], variants: null, firstAvailable: expect.any(String) });
    expect(await getAdminProduct(boss.db, id)).toMatchObject({ description: 'A small warm lamp.', details });

    await updateProduct(boss.db, id, input({ description: '  ', details: details.slice(0, 1) }));
    expect(await getProductInfo(anon(), id)).toMatchObject({ description: null, details: [['Brand', 'Lumen']] });

    const forged = await shopper.db.from('products').update({ description: 'hacked', details: [] }).eq('id', id).select('id');
    expect(forged.data ?? []).toEqual([]);
    expect((await getProductInfo(anon(), id)).description).toBeNull();
    // the database refuses a table that isn't an array, even from a trusted writer
    const bad = await admin().from('products').update({ details: { Brand: 'Lumen' } }).eq('id', id);
    expect(bad.error?.code).toBe('23514');
  });

  it('seeded products carry a description, a spec table and a brand or author', async () => {
    const { data } = await anon().from('products').select('id, brand, description, details').in('id', ['81MSoBpPAL', 'in-7144dxKjVL']);
    expect(data).toHaveLength(2);
    for (const row of data!) {
      expect(row.brand).toBeTruthy();
      expect(row.description?.length).toBeGreaterThan(100);
      expect((row.details as unknown[]).length).toBeGreaterThanOrEqual(5);
    }
    // both are books: their sample reviews come from the books pool, not the gadget one
    const { data: reviews } = await anon().from('reviews').select('body').eq('product_id', '81MSoBpPAL').eq('seeded', true);
    expect(reviews!.length).toBeGreaterThan(0);
    expect(reviews!.some((r) => /setup was simple|out of the box/i.test(r.body))).toBe(false);
  });

  it('only accepts categories the store carries', async () => {
    // Mobiles is an India-only department
    expect(await code(createProduct(boss.db, 'US', input({ category: 'mobiles' })))).toBe('invalid_category');
    expect(await code(createProduct(boss.db, 'US', input({ category: 'no-such-dept' })))).toBe('invalid_category');
  });

  it('keeps ordered products for order history: they can be archived, not deleted', async () => {
    const id = await createProduct(boss.db, 'US', input({ stock: 5 }));
    created.push(id);
    expect(await productHasOrders(boss.db, id)).toBe(false);
    await setCartQty(shopper.db, 'US', id, 1);
    await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(await productHasOrders(boss.db, id)).toBe(true);
    expect(await code(deleteProduct(boss.db, id))).toBe('product_has_orders');
    // order_items keep the product row alive; afterAll can't delete it either, so take it off sale
    await setArchived(boss.db, id, true);
    created.splice(created.indexOf(id), 1);
    expect((await getAdminProduct(boss.db, id))?.archivedAt).toEqual(expect.any(String));
  });

  it('only admins can ask whether a product was ordered', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    expect(await code(productHasOrders(shopper.db, id))).toBe('forbidden');
    expect(await code(productHasOrders(anon(), id))).toBe('forbidden');
  });

  it('deletes a product nobody ordered', async () => {
    const id = await createProduct(boss.db, 'US', input());
    await deleteProduct(boss.db, id);
    expect(await getAdminProduct(admin(), id)).toBeNull();
  });
});

describe('archived products', () => {
  let id: string;
  let listId: string;
  const guest = crypto.randomUUID();

  beforeAll(async () => {
    id = await createProduct(boss.db, 'US', input({ stock: 20 }));
    created.push(id);
    // already in a cart, a guest cart and a saved list when it's archived
    await addToCart(shopper.db, 'US', id, 2);
    await addToCart(anon(), 'US', id, 1, guest);
    listId = (await createCollection(shopper.db, 'US', { name: 'Archive test' })).id;
    await addItem(shopper.db, listId, id);
  });

  afterAll(async () => {
    await setCartQty(shopper.db, 'US', id, 0);
    await admin().from('collections').delete().eq('id', listId);
  });

  it('only admins archive', async () => {
    expect(await code(setArchived(shopper.db, id, true))).toBe('product_not_found');
    expect((await getAdminProduct(admin(), id))?.archivedAt).toBeNull();
    await setArchived(boss.db, id, true);
    const at = (await getAdminProduct(admin(), id))?.archivedAt;
    expect(at).toEqual(expect.any(String));
    // archiving again keeps the original date
    await setArchived(boss.db, id, true);
    expect((await getAdminProduct(admin(), id))?.archivedAt).toBe(at);
  });

  it('leaves every listing, but its page still loads', async () => {
    const listed = await anon().from('catalog_products').select('id').eq('id', id);
    expect(listed.data).toEqual([]);
    const title = (await getAdminProduct(admin(), id))!.title;
    const search = await anon().rpc('search_catalog', { p_market: 'US', p_q: title.split(' ').slice(-1)[0] });
    expect(JSON.stringify(search.data)).not.toContain(id);
    expect(await getProduct(anon(), id)).toBeNull();
    expect(await getProduct(anon(), id, { includeArchived: true })).toMatchObject({ id, archived: true });
  });

  it('admin lists and counts it under Archived', async () => {
    const active = await listAdminProducts(boss.db, 'US', { q: id });
    const archived = await listAdminProducts(boss.db, 'US', { q: id, status: 'archived' });
    expect(active.items).toEqual([]);
    expect(archived.items).toEqual([expect.objectContaining({ id, archivedAt: expect.any(String) })]);
    const counts = await countAdminProducts(boss.db, 'US');
    expect(counts.archived).toBeGreaterThanOrEqual(1);
    expect(counts.active).toBeGreaterThan(100);
  });

  it('carts keep the line, marked unavailable, and refuse more of it', async () => {
    const line = (await getCart(shopper.db, 'US')).lines.find((l) => l.product.id === id);
    expect(line).toMatchObject({ qty: 2, available: false, inStock: false });
    expect(await code(addToCart(shopper.db, 'US', id, 1))).toBe('product_unavailable');
    expect(await code(setCartQty(shopper.db, 'US', id, 3))).toBe('product_unavailable');
  });

  it("can't be checked out", async () => {
    expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('product_unavailable');
  });

  it('is dropped when a guest cart merges on sign-in', async () => {
    const other = await newUser('Merging Shopper');
    try {
      expect(await mergeGuestCart(other.db, guest)).toBe(0);
      expect((await getCart(other.db, 'US')).lines).toEqual([]);
    } finally {
      await deleteUser(other);
    }
  });

  it('saved lists keep it but cannot gain it', async () => {
    const list = await getCollection(shopper.db, listId);
    expect(list?.items).toEqual([expect.objectContaining({ product: expect.objectContaining({ id, archived: true }) })]);
    const fresh = await createCollection(shopper.db, 'US', { name: 'Archive test 2' });
    try {
      expect(await code(addItem(shopper.db, fresh.id, id))).toBe('product_unavailable');
    } finally {
      await admin().from('collections').delete().eq('id', fresh.id);
    }
  });

  it('restoring puts it back on sale', async () => {
    await setArchived(boss.db, id, false);
    expect((await getAdminProduct(admin(), id))?.archivedAt).toBeNull();
    expect(await getProduct(anon(), id)).toMatchObject({ id });
    const line = (await getCart(shopper.db, 'US')).lines.find((l) => l.product.id === id);
    expect(line).toMatchObject({ available: true, inStock: true });
    await addToCart(shopper.db, 'US', id, 1);
  });

  it('a never-ordered archived product can still be deleted', async () => {
    const other = await createProduct(boss.db, 'US', input());
    await setArchived(boss.db, other, true);
    await deleteProduct(boss.db, other);
    expect(await getAdminProduct(admin(), other)).toBeNull();
  });
});

describe('stock levels', () => {
  let out: string;
  let low: string;
  let plenty: string;

  beforeAll(async () => {
    [out, low, plenty] = await Promise.all([
      createProduct(boss.db, 'US', input({ stock: 0 })),
      createProduct(boss.db, 'US', input({ stock: LOW_STOCK })),
      createProduct(boss.db, 'US', input({ stock: LOW_STOCK + 1 })),
    ]);
    created.push(out, low, plenty);
  });

  const ids = async (stock: 'out' | 'low', q: string) => (await listAdminProducts(boss.db, 'US', { q, stock })).items.map((p) => p.id);

  it('the admin list filters to none left, or 1 to LOW_STOCK left', async () => {
    expect(await ids('out', out)).toEqual([out]);
    expect(await ids('low', out)).toEqual([]);
    expect(await ids('low', low)).toEqual([low]);
    expect(await ids('out', low)).toEqual([]);
    expect(await ids('out', plenty)).toEqual([]);
    expect(await ids('low', plenty)).toEqual([]);
  });

  it('counts them for the overview, which an admin reads in one call', async () => {
    const stock = await countAdminStock(boss.db, 'US');
    expect(stock.out).toBeGreaterThanOrEqual(1);
    expect(stock.low).toBeGreaterThanOrEqual(1);
    const o = await adminOverview(boss.db, 'US');
    expect(o.stock.out).toBeGreaterThanOrEqual(1);
    expect(o).toMatchObject({
      orders: { toShip: expect.any(Number), inTransit: expect.any(Number), refundIssues: expect.any(Number) },
      returns: { open: expect.any(Number), refundIssues: expect.any(Number) },
      claims: expect.any(Number),
      reportedReviews: expect.any(Number),
      unansweredQuestions: expect.any(Number),
      support: { waiting: expect.any(Number) },
    });
  });

  it('an archived product is not out of stock: it is off sale', async () => {
    await setArchived(boss.db, out, true);
    expect(await ids('out', out)).toEqual([]);
  });
});

describe('insights on save', () => {
  it('a new product gets a rules insight for its category', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    const insight = await getInsight(anon(), id);
    expect(insight?.source).toBe('rules');
    expect(Object.keys(insight!.scores).sort()).toEqual(attributeKeys('home-kitchen').sort());
  });

  it('moving category re-derives it, even over an AI insight', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    await admin().from('product_insights').update({ source: 'ai', summary: 'AI summary' }).eq('product_id', id);

    // new wording alone keeps an AI insight
    await updateProduct(boss.db, id, input({ title: 'Reworded lamp' }));
    expect((await getInsight(anon(), id))?.summary).toBe('AI summary');

    await updateProduct(boss.db, id, input({ title: 'Reworded lamp', category: 'electronics' }));
    const insight = await getInsight(anon(), id);
    expect(insight?.source).toBe('rules');
    expect(Object.keys(insight!.scores).sort()).toEqual(attributeKeys('electronics').sort());
  });

  it('new wording refreshes a rules insight', async () => {
    const id = await createProduct(boss.db, 'US', input());
    created.push(id);
    const before = await getInsight(anon(), id);
    await updateProduct(boss.db, id, input({ title: 'Reworded lamp' }));
    const after = await getInsight(anon(), id);
    expect(after?.source).toBe('rules');
    expect(after!.updatedAt > before!.updatedAt).toBe(true);
    // a price-only edit leaves it alone
    await updateProduct(boss.db, id, input({ title: 'Reworded lamp', priceMinor: 2499 }));
    expect((await getInsight(anon(), id))?.updatedAt).toBe(after!.updatedAt);
  });

  it('non-admins cannot write insights', async () => {
    const { data } = await admin().from('products').select('id').eq('market_id', 'US').limit(1).single();
    const write = await shopper.db.from('product_insights').update({ summary: 'hacked' }).eq('product_id', data!.id).select('product_id');
    expect(write.data ?? []).toEqual([]);
  });
});

describe('product images', () => {
  const png = () => new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'dot.png', { type: 'image/png' });

  it('admins upload to the public bucket; others cannot', async () => {
    const url = await uploadProductImage(boss.db, 'US', png());
    expect(url).toMatch(/\/storage\/v1\/object\/public\/product-images\/us\/[0-9a-f]{24}\.png$/);
    expect((await fetch(url)).status).toBe(200);
    expect(await code(uploadProductImage(shopper.db, 'US', png()))).toBe('forbidden');
    await admin().storage.from('product-images').remove([url.split('/product-images/')[1]]);
  });

  it('rejects other file types and big files before uploading', async () => {
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
    expect(await code(uploadProductImage(boss.db, 'US', gif))).toBe('invalid_input');
    const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect(await code(uploadProductImage(boss.db, 'US', big))).toBe('invalid_input');
  });
});
