import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { lastPurchase } from '@/lib/data/buy-again';
import { setCartQty } from '@/lib/data/cart';
import { getProduct, searchCatalog } from '@/lib/data/catalog';
import { listOffers } from '@/lib/data/offers';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { awaitingReview, listReviews, upsertReview } from '@/lib/data/reviews';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, US_SHIPPING, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Offers${tag} desk lamp`,
  brand: 'Lumen',
  category: 'home-kitchen',
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
  boughtPastMonth: null,
  seller: 'Lumen Store',
  shipsFrom: 'Amazon',
  bullets: ['Warm light'],
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
let lamp: string;
const used = () => `${lamp}-o1`;
const renewed = () => `${lamp}-o2`;

// another seller lists an offer on the product (sellers have no app of their own yet)
const addOffer = (id: string, over: Record<string, unknown> = {}) =>
  admin()
    .from('products')
    .insert({
      id,
      market_id: 'US',
      offer_of: lamp,
      position: 0,
      category_slug: 'home-kitchen',
      title: 'copied from the product',
      image: 'copied',
      price_minor: 1800,
      seller: 'Offer Seller',
      ships_from: 'Offer Seller',
      stock: 3,
      ...over,
    });

beforeAll(async () => {
  boss = await newUser('Offers Admin');
  shopper = await newUser('Offers Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  lamp = await createProduct(boss.db, 'US', input());
  for (const res of [
    await addOffer(used(), { condition: 'used_good', condition_note: 'Small scratch on the base' }),
    await addOffer(renewed(), { condition: 'renewed', price_minor: 2400, seller: 'Renew Co', ships_from: 'Amazon' }),
  ])
    if (res.error) throw res.error;
});

afterAll(async () => {
  await deleteUser(shopper);
  if (lamp) await admin().from('products').delete().eq('id', lamp);
  await deleteUser(boss);
});

describe('other sellers’ offers', () => {
  it('take the product’s title, image and rating, and keep their own price, seller and condition', async () => {
    const offer = await getProduct(anon(), used());
    const product = await getProduct(anon(), lamp);
    expect(offer).toMatchObject({
      offerOf: lamp,
      title: product?.title,
      image: product?.image,
      bullets: ['Warm light'],
      rating: product?.rating,
      reviewCount: product?.reviewCount,
      priceMinor: 1800,
      seller: 'Offer Seller',
      condition: 'used_good',
      conditionNote: 'Small scratch on the base',
    });
    expect(product?.offerOf).toBeUndefined();
    expect(product?.condition).toBeUndefined();
  });

  it('are listed for the product cheapest first, in stock only', async () => {
    expect((await listOffers(anon(), lamp)).map((p) => [p.id, p.condition])).toEqual([
      [used(), 'used_good'],
      [renewed(), 'renewed'],
    ]);
    await admin().from('products').update({ stock: 0 }).eq('id', renewed());
    expect((await listOffers(anon(), lamp)).map((p) => p.id)).toEqual([used()]);
    await admin().from('products').update({ stock: 3 }).eq('id', renewed());
  });

  it('never show in search and browse', async () => {
    const found = await searchCatalog(anon(), 'US', parseQuery({ k: `Offers${tag}` }));
    expect(found.items.map((p) => p.id)).toEqual([lamp]);
    expect(found.sellerFacets.map((s) => s.name)).toEqual(['Lumen Store']);
  });

  it('follow the product: renamed and taken off sale with it', async () => {
    await admin().from('products').update({ title: `Offers${tag} desk lamp, brass` }).eq('id', lamp);
    expect((await getProduct(anon(), used()))?.title).toBe(`Offers${tag} desk lamp, brass`);
    await admin().from('products').update({ archived_at: new Date().toISOString() }).eq('id', lamp);
    expect((await getProduct(anon(), renewed(), { includeArchived: true }))?.archived).toBe(true);
    expect(await listOffers(anon(), lamp)).toEqual([]);
    await admin().from('products').update({ archived_at: null }).eq('id', lamp);
    expect((await getProduct(anon(), renewed()))?.archived).toBeUndefined();
    expect((await listOffers(anon(), lamp)).map((p) => p.id)).toEqual([used(), renewed()]);
  });

  it('can’t be an offer on an offer or on another store’s product, or be new with a note on its own', async () => {
    expect((await addOffer(`${lamp}-x1`, { offer_of: used() })).error?.message).toBe('invalid_input');
    expect((await addOffer(`${lamp}-x2`, { market_id: 'IN' })).error?.message).toBe('invalid_input');
    const own = await admin().from('products').update({ condition: 'used_good' }).eq('id', lamp);
    expect(own.error?.message).toContain('products_offer_fields');
  });

  it('are bought like any product, and the order says whose and in what condition', async () => {
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', used(), 1);
    const placed = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    const order = await getOrder(shopper.db, placed.id);
    expect(order?.items).toEqual([
      expect.objectContaining({ productId: used(), offerOf: lamp, condition: 'used_good', seller: 'Offer Seller', unitPriceMinor: 1800 }),
    ]);
    expect(await lastPurchase(shopper.db, shopper.id, [lamp, used()])).toMatchObject({ orderId: placed.id });

    // once it arrives, its review is a verified purchase's, on the product
    await deliveredDaysAgo(placed.id);
    expect((await awaitingReview(shopper.db, 'US', shopper.id)).map((x) => x.product.id)).toEqual([lamp]);
    await upsertReview(shopper.db, lamp, shopper.id, { rating: 4, title: 'Works fine', body: 'Bought it used, it works.' });
    const { items } = await listReviews(anon(), lamp, null, { limit: 10, sort: 'recent' });
    expect(items.find((r) => r.title === 'Works fine')).toMatchObject({ verified: true });
  });
});
