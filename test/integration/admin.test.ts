import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  isAdmin,
  listAdminProducts,
  updateProduct,
  uploadProductImage,
  type ProductInput,
} from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { setCartQty } from '@/lib/data/cart';
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
  badge: null,
  boughtPastMonth: null,
  seller: 'Lumen Store',
  shipsFrom: 'Store',
  bullets: ['Warm white', 'USB-C'],
  stock: 30,
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

  it('only accepts categories the store carries', async () => {
    // Mobiles is an India-only department
    expect(await code(createProduct(boss.db, 'US', input({ category: 'mobiles' })))).toBe('invalid_category');
    expect(await code(createProduct(boss.db, 'US', input({ category: 'no-such-dept' })))).toBe('invalid_category');
  });

  it('keeps ordered products for order history', async () => {
    const id = await createProduct(boss.db, 'US', input({ stock: 5 }));
    created.push(id);
    await setCartQty(shopper.db, 'US', id, 1);
    await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(await code(deleteProduct(boss.db, id))).toBe('product_has_orders');
    // order_items keep the product row alive; afterAll can't delete it either, so take it off sale
    await updateProduct(boss.db, id, input({ stock: 0 }));
    created.splice(created.indexOf(id), 1);
  });

  it('deletes a product nobody ordered', async () => {
    const id = await createProduct(boss.db, 'US', input());
    await deleteProduct(boss.db, id);
    expect(await getAdminProduct(admin(), id)).toBeNull();
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
