import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceHistory, storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { listExchangeDevices } from '@/lib/data/exchange';
import { cancelTradeIn, listAdminTradeIns, listTradeIns, receiveTradeIn, rejectTradeIn, requestTradeIn } from '@/lib/data/trade-ins';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

const IPHONE = 'us-apple-iphone-14';
const XPS = 'us-dell-xps-13';

describe('Trade-In', () => {
  let shopper: TestUser;
  let other: TestUser;
  let boss: TestUser;

  beforeAll(async () => {
    [shopper, other, boss] = await Promise.all([newUser('Trade-In Seller'), newUser('Trade-In Snooper'), newUser('Trade-In Checker')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
  });

  afterAll(async () => {
    await admin().from('trade_ins').delete().in('user_id', [shopper.id, other.id]);
    await admin().from('admins').delete().eq('user_id', boss.id);
    await Promise.all([shopper, other, boss].map(deleteUser));
  });

  it('lists amazon.com’s models alongside amazon.in’s exchange ones', async () => {
    const us = await listExchangeDevices(anon(), 'US');
    expect(us.find((d) => d.id === IPHONE)).toMatchObject({ kind: 'phone', brand: 'Apple', model: 'iPhone 14', valueMinor: 25_000 });
    expect(us.some((d) => d.kind === 'laptop')).toBe(true);
    expect((await listExchangeDevices(anon(), 'IN')).some((d) => d.id.startsWith('us-'))).toBe(false);
  });

  it('quotes a US model, half with a damaged screen, and refuses anything else', async () => {
    const good = await requestTradeIn(shopper.db, IPHONE, 'good');
    expect(good).toMatchObject({ device: 'Apple iPhone 14', kind: 'phone', condition: 'good', quoteMinor: 25_000, goodMinor: 25_000, status: 'open' });
    expect(good.shipCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    const days = (Date.parse(good.shipBy) - Date.parse(good.createdAt)) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);
    expect((await requestTradeIn(shopper.db, XPS, 'screen_damaged')).quoteMinor).toBe(14_000);

    expect(await failure(requestTradeIn(shopper.db, 'apple-iphone-14', 'good'))).toBe('invalid_input:device');
    expect(await failure(requestTradeIn(shopper.db, IPHONE, 'broken' as 'good'))).toBe('invalid_input:condition');
    expect(await failure(requestTradeIn(anon(), IPHONE, 'good'))).toMatch(/^forbidden|not_authenticated/);
  });

  it('holds 5 open at once, and cancelling makes room', async () => {
    const open = (await listTradeIns(shopper.db, 'US')).filter((t) => t.status === 'open').length;
    const extra = [];
    for (let i = open; i < 5; i++) extra.push(await requestTradeIn(shopper.db, IPHONE, 'good'));
    expect(await failure(requestTradeIn(shopper.db, IPHONE, 'good'))).toBe('trade_in_limit');

    const last = extra[extra.length - 1]!;
    expect(await failure(cancelTradeIn(other.db, last.id))).toBe('trade_in_not_found');
    expect((await cancelTradeIn(shopper.db, last.id)).status).toBe('cancelled');
    expect(await failure(cancelTradeIn(shopper.db, last.id))).toBe('trade_in_closed');
    const again = await requestTradeIn(shopper.db, IPHONE, 'good');
    expect(again.status).toBe('open');
    expect(await listTradeIns(other.db, 'US')).toEqual([]);
  });

  it('lets only admins work the queue, in the trade-in’s store, crediting the balance', async () => {
    const mine = (await listTradeIns(shopper.db, 'US')).filter((t) => t.status === 'open');
    const phone = mine.find((t) => t.deviceId === IPHONE && t.condition === 'good')!;
    const laptop = mine.find((t) => t.deviceId === XPS)!;
    const lost = mine.find((t) => t.id !== phone.id && t.id !== laptop.id)!;

    expect(await failure(listAdminTradeIns(shopper.db, 'US'))).toBe('forbidden');
    expect(await failure(receiveTradeIn(shopper.db, 'US', phone.id, 'good'))).toBe('forbidden');

    const queue = await listAdminTradeIns(boss.db, 'US', 'open');
    const ids = queue.tradeIns.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([phone.id, laptop.id, lost.id]));
    expect(queue.tradeIns.find((t) => t.id === phone.id)?.customer).toMatchObject({ id: shopper.id, email: shopper.email });
    expect(queue.counts.open).toBeGreaterThanOrEqual(5);
    expect(await failure(receiveTradeIn(boss.db, 'IN', phone.id, 'good'))).toBe('trade_in_not_found');

    const before = (await storeBalance(shopper.db, 'US'))!;
    // came in with a cracked screen: what it's worth so
    const worse = await receiveTradeIn(boss.db, 'US', phone.id, 'screen_damaged');
    expect(worse).toMatchObject({ status: 'credited', receivedCondition: 'screen_damaged', creditedMinor: 12_500 });
    // came in better than said: still the quote
    expect((await receiveTradeIn(boss.db, 'US', laptop.id, 'good')).creditedMinor).toBe(14_000);
    expect(await storeBalance(shopper.db, 'US')).toBe(before + 26_500);
    const entries = (await balanceHistory(shopper.db, 'US', 5)).filter((e) => e.kind === 'trade_in').map((e) => e.amountMinor);
    expect(entries.sort((a, b) => a - b)).toEqual([12_500, 14_000]);
    expect(await failure(receiveTradeIn(boss.db, 'US', phone.id, 'good'))).toBe('trade_in_closed');

    const back = await rejectTradeIn(boss.db, 'US', lost.id, '  It didn’t switch on  ');
    expect(back).toMatchObject({ status: 'rejected', rejectNote: 'It didn’t switch on' });
    expect(await failure(cancelTradeIn(shopper.db, lost.id))).toBe('trade_in_closed');
    expect(await storeBalance(shopper.db, 'US')).toBe(before + 26_500);

    const closed = await listAdminTradeIns(boss.db, 'US', 'closed');
    expect(closed.tradeIns.map((t) => t.id)).toEqual(expect.arrayContaining([phone.id, laptop.id, lost.id]));
  });

  it('is served at /me/trade-ins and /admin/trade-ins', async () => {
    const mine = await import('@/app/api/v1/me/trade-ins/route');
    const cancel = await import('@/app/api/v1/me/trade-ins/[id]/cancel/route');
    const queue = await import('@/app/api/v1/admin/trade-ins/route');
    const act = await import('@/app/api/v1/admin/trade-ins/[id]/[action]/route');
    const token = async (u: TestUser) => (await u.db.auth.getSession()).data.session!.access_token;
    const req = async (u: TestUser, path: string, market: 'US' | 'IN', init?: { method: string; body?: unknown }) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init?.method ?? 'GET',
        headers: { authorization: `Bearer ${await token(u)}`, 'x-market': market, 'content-type': 'application/json' },
        ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    const none = { params: Promise.resolve({}) };

    // make room: cancel what's still open
    for (const t of (await listTradeIns(other.db, 'US')).filter((x) => x.status === 'open')) await cancelTradeIn(other.db, t.id);
    const made = await mine.POST(await req(other, '/me/trade-ins', 'US', { method: 'POST', body: { deviceId: XPS, condition: 'good' } }), none);
    expect(made.status).toBe(201);
    const { tradeIn } = (await made.json()) as { tradeIn: { id: string; quoteMinor: number } };
    expect(tradeIn.quoteMinor).toBe(28_000);
    expect((await mine.POST(await req(other, '/me/trade-ins', 'US', { method: 'POST', body: { deviceId: XPS } }), none)).status).toBe(422);
    expect((await mine.POST(await req(other, '/me/trade-ins', 'IN', { method: 'POST', body: { deviceId: XPS, condition: 'good' } }), none)).status).toBe(404);

    const listed = (await (await mine.GET(await req(other, '/me/trade-ins', 'US'), none)).json()) as { tradeIns: { id: string }[] };
    expect(listed.tradeIns.map((t) => t.id)).toContain(tradeIn.id);

    expect((await queue.GET(await req(other, '/admin/trade-ins', 'US'), none)).status).toBe(403);
    const q = (await (await queue.GET(await req(boss, '/admin/trade-ins?filter=all', 'US'), none)).json()) as { tradeIns: { id: string }[] };
    expect(q.tradeIns.map((t) => t.id)).toContain(tradeIn.id);

    const params = (action: string) => ({ params: Promise.resolve({ id: tradeIn.id, action }) });
    expect((await act.POST(await req(boss, `/admin/trade-ins/${tradeIn.id}/receive`, 'US', { method: 'POST', body: {} }), params('receive'))).status).toBe(422);
    expect((await act.POST(await req(boss, `/admin/trade-ins/${tradeIn.id}/receive`, 'IN', { method: 'POST', body: { condition: 'good' } }), params('receive'))).status).toBe(404);

    const cancelled = await cancel.POST(await req(other, `/me/trade-ins/${tradeIn.id}/cancel`, 'US', { method: 'POST' }), { params: Promise.resolve({ id: tradeIn.id }) });
    expect(((await cancelled.json()) as { tradeIn: { status: string } }).tradeIn.status).toBe('cancelled');
    expect((await act.POST(await req(boss, `/admin/trade-ins/${tradeIn.id}/reject`, 'US', { method: 'POST', body: {} }), params('reject'))).status).toBe(409);
  });
});
