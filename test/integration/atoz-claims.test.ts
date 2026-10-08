import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { decideClaim, fileClaim, getClaim, listClaimQueue, orderClaims, withdrawClaim } from '@/lib/data/atoz-claims';
import { addToCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { listInbox } from '@/lib/data/inbox';
import { reportNotReceived } from '@/lib/data/not-received';
import { placeOrder } from '@/lib/data/orders';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import { openCase } from '@/lib/data/support';
import type { Market } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const DAY = 86_400_000;
const tag = crypto.randomUUID().slice(0, 6);
const ACME = `Atoz ${tag} Acme`;
const ZED = `Atoz ${tag} Zed`;

const input = (n: number, seller: string): ProductInput => ({
  title: `Atoz${tag} ceramic mug ${n}`,
  brand: 'Lumen',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 60_000,
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
  seller,
  shipsFrom: seller,
  bullets: ['Holds 350 ml'],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 12,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const details = 'The mug arrived cracked down the side.';

describe('A-to-z Guarantee claims', () => {
  let shopper: TestUser;
  let other: TestUser;
  let boss: TestUser;
  let acme: string;
  let zed: string;
  let storeOwn: string;
  let mixed: string; // amazonpay: 2 from Acme, 1 from Zed
  let cod: string; // cash on delivery: 1 from Zed
  let granted: { id: string; returnId: string; amountMinor: number };
  let denied: string;

  /** Ages the shopper's cases with a seller about an order, as if opened `days` ago. */
  const askedDaysAgo = async (orderId: string, days: number) => {
    const { error } = await admin()
      .from('support_cases')
      .update({ created_at: new Date(Date.now() - days * DAY).toISOString() })
      .eq('user_id', shopper.id)
      .eq('order_id', orderId);
    if (error) throw error;
  };
  const ask = (orderId: string, seller: string) =>
    openCase(shopper.db, 'IN', { topic: 'order', subject: 'Something is wrong with my order', body: 'It isn’t right. Can you help me with it?', orderId, seller });

  beforeAll(async () => {
    [shopper, other, boss] = await Promise.all([newUser('Claim Filer'), newUser('Claim Snooper'), newUser('Claim Judge')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
    acme = await createProduct(boss.db, 'IN', input(1, ACME));
    zed = await createProduct(boss.db, 'IN', input(2, ZED));
    storeOwn = await createProduct(boss.db, 'US', { ...input(3, 'Amazon.com'), priceMinor: 2_000 });

    await addToCart(shopper.db, 'IN', acme, 2);
    await addToCart(shopper.db, 'IN', zed, 1);
    mixed = (await placeOrder(shopper.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING })).id;
    cod = (await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: zed, qty: 1 } })).id;
  });

  afterAll(async () => {
    await admin().from('atoz_claims').delete().in('user_id', [shopper.id, other.id]);
    await admin().from('support_cases').delete().eq('user_id', shopper.id);
    await admin().from('admins').delete().eq('user_id', boss.id);
    await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', [acme, zed, storeOwn]);
    await Promise.all([shopper, other, boss].map(deleteUser));
  });

  it('waits for delivery, then for the seller to have had 2 days', async () => {
    const claim = { seller: ACME, reason: 'not_as_described', details };
    expect(await failure(fileClaim(shopper.db, mixed, claim))).toBe('claim_not_allowed:not_delivered');
    await deliveredDaysAgo(mixed, 5);
    expect(await failure(fileClaim(shopper.db, mixed, { ...claim, seller: 'Nobody Sells This Ltd' }))).toBe('invalid_input:seller');
    expect(await failure(fileClaim(shopper.db, mixed, { ...claim, reason: 'damaged' }))).toBe('invalid_input:reason');
    expect(await failure(fileClaim(shopper.db, mixed, claim))).toBe('claim_not_allowed:contact_seller_first');

    // a case with another seller doesn't count
    await ask(mixed, ZED);
    expect(await failure(fileClaim(shopper.db, mixed, claim))).toBe('claim_not_allowed:contact_seller_first');
    await ask(mixed, ACME);
    expect(await failure(fileClaim(shopper.db, mixed, claim))).toBe('claim_not_allowed:wait_for_seller');
    await askedDaysAgo(mixed, 3);
  });

  it('files one claim per seller, which only the shopper and admins see, until it is withdrawn', async () => {
    const first = await fileClaim(shopper.db, mixed, { seller: ACME, reason: 'not_as_described', details: `  ${details}  ` });
    expect(first).toMatchObject({ orderId: mixed, market: 'IN', seller: ACME, reason: 'not_as_described', details, status: 'under_review', returnId: null, refund: null });
    expect(await failure(fileClaim(shopper.db, mixed, { seller: ACME, reason: 'not_received', details }))).toBe('claim_not_allowed:already_claimed');

    // someone else can't see, file, withdraw or decide it
    expect(await failure(fileClaim(other.db, mixed, { seller: ACME, reason: 'not_received', details }))).toBe('order_not_found:');
    expect(await orderClaims(other.db, mixed)).toEqual([]);
    expect(await getClaim(other.db, first.id)).toBeNull();
    expect(await failure(withdrawClaim(other.db, first.id))).toBe('claim_not_found:');
    expect(await failure(decideClaim(shopper.db, first.id, 'grant'))).toBe('forbidden:');
    const sneak = await shopper.db.from('atoz_claims').insert({ order_id: mixed, user_id: shopper.id, market_id: 'IN', seller: ZED, reason: 'not_received', details });
    expect(sneak.error).not.toBeNull();

    const withdrawn = await withdrawClaim(shopper.db, first.id);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(await failure(withdrawClaim(shopper.db, first.id))).toBe('claim_not_open:');

    // it can be filed again
    const again = await fileClaim(shopper.db, mixed, { seller: ACME, reason: 'not_as_described', details });
    expect(again.status).toBe('under_review');
    expect((await orderClaims(shopper.db, mixed)).map((c) => [c.id, c.status])).toEqual([
      [first.id, 'withdrawn'],
      [again.id, 'under_review'],
    ]);
    expect((await orderClaims(boss.db, mixed)).map((c) => c.id)).toEqual([first.id, again.id]);
  });

  it('an admin grant refunds what is left of that seller’s items, at once, and nothing else', async () => {
    const [claim] = (await orderClaims(shopper.db, mixed)).filter((c) => c.status === 'under_review');
    // one of the two Acme mugs is already on its way back
    await requestReturn(shopper.db, mixed, { items: [{ productId: acme, qty: 1 }], reason: 'damaged' });

    const balance = async () => (await admin().from('store_balances').select('balance_minor').eq('user_id', shopper.id).eq('market_id', 'IN').single()).data!.balance_minor;
    const before = await balance();
    expect(await failure(decideClaim(boss.db, claim.id, 'deny'))).toBe('invalid_input:note');

    const done = await decideClaim(boss.db, claim.id, 'grant', 'Sorry about that.');
    expect(done).toMatchObject({ status: 'granted', decisionNote: 'Sorry about that.' });
    expect(done.decidedAt).not.toBeNull();
    expect(done.returnId).not.toBeNull();
    expect(done.refund?.status).toBe('succeeded');
    // the mug left, at the price paid, plus its share of delivery
    expect(done.refund!.amountMinor).toBeGreaterThanOrEqual(60_000);
    expect(done.refund!.amountMinor).toBeLessThan(120_000);
    granted = { id: done.id, returnId: done.returnId!, amountMinor: done.refund!.amountMinor };

    const { data: ret } = await admin().from('returns').select('status, reason, refund_minor, return_items(product_id, qty)').eq('id', granted.returnId).single();
    expect(ret).toMatchObject({ status: 'received', reason: 'atoz_claim', refund_minor: granted.amountMinor, return_items: [{ product_id: acme, qty: 1 }] });
    // paid back to the balance the order was paid from
    expect(await balance()).toBe(before + granted.amountMinor);

    // Zed's mug can still be returned; Acme's can't, and the package can't be reported missing
    const returns = await getOrderReturns(shopper.db, mixed);
    expect(returns?.returnable[acme] ?? 0).toBe(0);
    expect(returns?.returnable[zed]).toBe(1);
    expect(await failure(reportNotReceived(shopper.db, mixed))).toBe('return_not_allowed:returned');
    expect(await failure(decideClaim(boss.db, claim.id, 'deny', 'Changed my mind'))).toBe('claim_not_open:');
  });

  it('a claim on a cash on delivery order can’t be for a missing package; a deny comes with a note', async () => {
    await deliveredDaysAgo(cod, 3);
    await ask(cod, ZED);
    await askedDaysAgo(cod, 2.5);
    expect(await failure(fileClaim(shopper.db, cod, { seller: ZED, reason: 'not_received', details: 'It never turned up at my door.' }))).toBe('claim_not_allowed:cash_on_delivery');
    const claim = await fileClaim(shopper.db, cod, { seller: ZED, reason: 'not_as_described', details: 'It is blue, not the green shown.' });
    const done = await decideClaim(boss.db, claim.id, 'deny', 'The seller has offered a replacement.');
    expect(done).toMatchObject({ status: 'denied', decisionNote: 'The seller has offered a replacement.', returnId: null, refund: null });
    denied = done.id;
  });

  it('tells the shopper what was decided, in place of a return message', async () => {
    const inbox = await listInbox(shopper.db, 'IN', shopper.id);
    expect(inbox.find((m) => m.key === `claim_granted:${granted.id}`)).toMatchObject({
      kind: 'claim_granted',
      orderId: mixed,
      from: ACME,
      amountMinor: granted.amountMinor,
      detail: 'Sorry about that.',
      href: `/orders/${mixed}?placed=0#claims`,
    });
    expect(inbox.find((m) => m.key === `claim_denied:${denied}`)).toMatchObject({ kind: 'claim_denied', orderId: cod, from: ZED, detail: 'The seller has offered a replacement.' });
    expect(inbox.some((m) => m.key.endsWith(granted.returnId))).toBe(false);
  });

  it('can only be filed for 90 days after delivery', async () => {
    await deliveredDaysAgo(cod, 91);
    expect(await failure(fileClaim(shopper.db, cod, { seller: ZED, reason: 'not_as_described', details }))).toBe('claim_not_allowed:window_closed');
  });

  it('doesn’t cover what the store sells itself', async () => {
    const own = (await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: storeOwn, qty: 1 } })).id;
    await deliveredDaysAgo(own, 2);
    expect(await failure(fileClaim(shopper.db, own, { seller: 'Amazon.com', reason: 'not_as_described', details }))).toBe('claim_not_allowed:sold_by_amazon');
  });

  it('are in the store’s admin queue, open ones until decided', async () => {
    const decided = await listClaimQueue(boss.db, 'IN', { filter: 'decided' });
    const mine = decided.claims.filter((c) => c.id === granted.id || c.id === denied);
    expect(mine.map((c) => c.id).sort()).toEqual([granted.id, denied].sort());
    expect(mine.find((c) => c.id === granted.id)?.items).toEqual([{ productId: acme, title: expect.stringContaining('mug 1'), image: expect.any(String), qty: 2, unitPriceMinor: 60_000 }]);
    expect(decided.counts.decided).toBeGreaterThanOrEqual(2);
    expect(decided.counts.all).toBeGreaterThanOrEqual(decided.counts.decided + decided.counts.open);
    expect((await listClaimQueue(boss.db, 'IN', { filter: 'open' })).claims.some((c) => c.id === granted.id)).toBe(false);
    expect((await listClaimQueue(boss.db, 'US', { filter: 'all' })).claims.some((c) => c.id === granted.id)).toBe(false);
    // the claimed items come from an admin-only function
    expect(await failure(listClaimQueue(shopper.db, 'IN', { filter: 'all' }))).toBe('forbidden:');
  });

  it('are served by the API', async () => {
    const orderClaimsRoute = await import('@/app/api/v1/orders/[id]/claims/route');
    const withdrawRoute = await import('@/app/api/v1/claims/[id]/withdraw/route');
    const queueRoute = await import('@/app/api/v1/admin/claims/route');
    const decideRoute = await import('@/app/api/v1/admin/claims/[id]/[action]/route');
    const token = async (u: TestUser) => (await u.db.auth.getSession()).data.session!.access_token;
    const [mine, theirs] = await Promise.all([token(shopper), token(boss)]);
    const req = (path: string, as: string, market: Market, init: { method?: string; body?: unknown } = {}) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${as}`, 'x-market': market, 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

    const listed = await orderClaimsRoute.GET(req(`/orders/${mixed}/claims`, mine, 'IN'), params({ id: mixed }));
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { claims: { status: string }[] }).claims.map((c) => c.status)).toEqual(['withdrawn', 'granted']);
    // someone else's order (even an admin's view goes through the claim queue instead)
    expect((await orderClaimsRoute.GET(req(`/orders/${mixed}/claims`, theirs, 'IN'), params({ id: mixed }))).status).toBe(404);

    const bad = await orderClaimsRoute.POST(req(`/orders/${mixed}/claims`, mine, 'IN', { method: 'POST', body: { seller: ZED, reason: 'nope', details } }), params({ id: mixed }));
    expect(bad.status).toBe(422);
    const twice = await orderClaimsRoute.POST(req(`/orders/${mixed}/claims`, mine, 'IN', { method: 'POST', body: { seller: ACME, reason: 'not_received', details } }), params({ id: mixed }));
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({ error: { code: 'claim_not_allowed', detail: 'already_claimed' } });

    // Zed was asked about the mixed order too (aged with Acme's case): file through the API, withdraw it again
    const filed = await orderClaimsRoute.POST(req(`/orders/${mixed}/claims`, mine, 'IN', { method: 'POST', body: { seller: ZED, reason: 'not_received', details } }), params({ id: mixed }));
    expect(filed.status).toBe(201);
    const { claim } = (await filed.json()) as { claim: { id: string; status: string } };
    expect(claim.status).toBe('under_review');

    const queue = await queueRoute.GET(req('/admin/claims?filter=open', theirs, 'IN'), params({}));
    expect(((await queue.json()) as { claims: { id: string }[] }).claims.map((c) => c.id)).toContain(claim.id);
    expect((await queueRoute.GET(req('/admin/claims', mine, 'IN'), params({}))).status).toBe(403);
    expect((await decideRoute.POST(req(`/admin/claims/${claim.id}/deny`, theirs, 'US', { method: 'POST', body: { note: 'No.' } }), params({ id: claim.id, action: 'deny' }))).status).toBe(404);
    expect((await decideRoute.POST(req(`/admin/claims/${claim.id}/approve`, theirs, 'IN', { method: 'POST', body: {} }), params({ id: claim.id, action: 'approve' }))).status).toBe(404);

    const out = await withdrawRoute.POST(req(`/claims/${claim.id}/withdraw`, mine, 'IN', { method: 'POST' }), params({ id: claim.id }));
    expect(((await out.json()) as { claim: { status: string } }).claim.status).toBe('withdrawn');
    expect((await withdrawRoute.POST(req(`/claims/${granted.id}/withdraw`, mine, 'IN', { method: 'POST' }), params({ id: granted.id }))).status).toBe(409);
    const late = await decideRoute.POST(req(`/admin/claims/${granted.id}/grant`, theirs, 'IN', { method: 'POST', body: {} }), params({ id: granted.id, action: 'grant' }));
    expect(late.status).toBe(409);
  });
});
