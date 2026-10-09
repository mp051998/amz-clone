import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { setCartQty } from '@/lib/data/cart';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, cancelOrderItems, getOrder, placeOrder } from '@/lib/data/orders';
import { plannedSchedule } from '@/lib/decision/tracking';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const LA = 'America/Los_Angeles';
const DAY = 86_400_000;
const same = (a: string | null | undefined, b: string | null | undefined) => expect(a && Date.parse(a)).toBe(b && Date.parse(b));
// releases are counted from now, never pinned to a date that will pass
const inDays = (n: number) => new Date(Math.floor(Date.now() / 1000) * 1000 + n * DAY).toISOString();

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? [err.code, err.detail] : [String(err)];
  }
  return ['no error'];
};

const tag = crypto.randomUUID().slice(0, 6);
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Preorder${tag} board game`,
  brand: 'Meeple',
  category: 'toys',
  image: '/products/placeholder.jpg',
  priceMinor: 3000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Meeple Store',
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

let boss: TestUser;
let shopper: TestUser;
let game: string;
let dice: string;
const release = inDays(30);

beforeAll(async () => {
  boss = await newUser('Pre-order Admin');
  shopper = await newUser('Pre-order Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  game = await createProduct(boss.db, 'US', input({ releaseAt: release }));
  dice = await createProduct(boss.db, 'US', input({ title: `Preorder${tag} dice`, priceMinor: 1000 }));
});

afterAll(async () => {
  await deleteUser(shopper);
  for (const p of [game, dice]) if (p) await admin().from('products').delete().eq('id', p);
  await deleteUser(boss);
});

const order = async (ids: string[]) => {
  await shopper.db.rpc('cart_clear', { p_market: 'US' });
  for (const id of ids) await setCartQty(shopper.db, 'US', id, 1);
  return placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
};

describe('pre-orders', () => {
  it('admins set a release date, and shoppers see it', async () => {
    same((await getAdminProduct(boss.db, game))?.releaseAt, release);
    same((await getProduct(anon(), game))?.releaseAt, release);
    expect((await getProduct(anon(), dice))?.releaseAt).toBeUndefined();
    expect(await fail(updateProduct(boss.db, game, input({ releaseAt: 'next month' })))).toEqual(['invalid_input', 'releaseAt']);
  });

  it('only admins write it', async () => {
    const forged = await shopper.db.from('products').update({ release_at: null }).eq('id', game).select();
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    same((await getProduct(anon(), game))?.releaseAt, release);
  });

  it('an order holding one ships from its release, and the rest wait with it', async () => {
    const o = await order([game, dice]);
    same(o.releaseAt, release);
    const plan = plannedSchedule(release, LA);
    same(o.shippedAt, plan.shippedAt);
    same(o.outForDeliveryAt, plan.outForDeliveryAt);
    same(o.deliveredAt, plan.deliveredAt);
    same((await getOrder(shopper.db, o.id))?.releaseAt, release);

    // cancelling the pre-order lets the rest go now
    const rest = await cancelOrderItems(shopper.db, o.id, [game]);
    expect(Date.parse(rest.releaseAt!)).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(Date.parse(rest.shippedAt!)).toBeGreaterThan(Date.now());
    expect(Date.parse(rest.shippedAt!)).toBeLessThan(Date.now() + DAY);
  });

  it('moving the release moves the orders waiting on it; clearing it ships them now', async () => {
    const o = await order([game]);
    const later = inDays(45);
    await updateProduct(boss.db, game, input({ releaseAt: later }));
    const moved = await getOrder(shopper.db, o.id);
    same(moved?.releaseAt, later);
    same(moved?.shippedAt, plannedSchedule(later, LA).shippedAt);

    await updateProduct(boss.db, game, input({ releaseAt: null }));
    const out = await getOrder(shopper.db, o.id);
    expect(Date.parse(out!.releaseAt!)).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(Date.parse(out!.shippedAt!)).toBeLessThan(Date.now() + DAY);
    expect((await getProduct(anon(), game))?.releaseAt).toBeUndefined();

    await cancelOrder(shopper.db, o.id);
  });

  it('a product past its release is an ordinary one', async () => {
    await updateProduct(boss.db, game, input({ releaseAt: inDays(-1) }));
    const o = await order([game]);
    expect(o.releaseAt).toBeUndefined();
    expect(Date.parse(o.shippedAt!)).toBeLessThan(Date.now() + DAY);
    await cancelOrder(shopper.db, o.id);
  });
});
