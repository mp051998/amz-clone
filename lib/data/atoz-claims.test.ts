import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { claimFilter, decideClaim, fileClaim, parseClaim, toClaim, withdrawClaim } from './atoz-claims';

vi.mock('server-only', () => ({}));
const refundReturn = vi.fn();
vi.mock('./refunds', () => ({ refundReturn: (...a: unknown[]) => refundReturn(...a) }));

const ID = '0b6f8a4e-3c1d-4a5b-9e7f-1a2b3c4d5e6f';
const row = (over: object = {}) => ({
  id: ID, order_id: '114-1234567-1234567', market_id: 'IN', seller: 'Acme', reason: 'not_received',
  details: 'It never came.', status: 'under_review', decision_note: null, return_id: null,
  created_at: '2026-10-01T00:00:00Z', decided_at: null, withdrawn_at: null, refund: null, ...over,
});

function fakeDb(data: object, reread?: object) {
  const calls: [string, object][] = [];
  const db = {
    rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error: null }),
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: reread ?? data, error: null }) };
      return q;
    },
  } as unknown as Db;
  return { db, calls };
}

beforeEach(() => {
  refundReturn.mockReset();
});

describe('parseClaim', () => {
  it('trims and keeps a good claim', () => {
    expect(parseClaim({ seller: ' Acme ', reason: 'not_as_described', details: '  Arrived cracked.  ' })).toEqual({
      seller: 'Acme',
      reason: 'not_as_described',
      details: 'Arrived cracked.',
    });
  });

  it('names the field that is wrong', () => {
    const fails = (input: object, detail: string) => expect(() => parseClaim(input)).toThrow(expect.objectContaining({ code: 'invalid_input', detail }));
    fails({ seller: '  ', reason: 'not_received', details: 'It never came.' }, 'seller');
    fails({ seller: 1, reason: 'not_received', details: 'It never came.' }, 'seller');
    fails({ seller: 'Acme', reason: 'damaged', details: 'It never came.' }, 'reason');
    fails({ seller: 'Acme', reason: 'not_received', details: 'short     ' }, 'details');
    fails({ seller: 'Acme', reason: 'not_received', details: 'x'.repeat(2001) }, 'details');
    fails({ seller: 'Acme', reason: 'not_received' }, 'details');
  });
});

it('maps a row, with its refund once granted', () => {
  expect(toClaim(row())).toMatchObject({ id: ID, orderId: '114-1234567-1234567', market: 'IN', status: 'under_review', refund: null });
  expect(toClaim(row({ status: 'granted', return_id: 'r1', refund: { refund_minor: 26350, refund_status: 'succeeded', refunded_at: '2026-10-05T00:00:00Z' } })).refund).toEqual({
    amountMinor: 26350,
    status: 'succeeded',
    refundedAt: '2026-10-05T00:00:00Z',
  });
});

it('files a claim with the checked fields', async () => {
  const { db, calls } = fakeDb(row());
  const c = await fileClaim(db, '114-1234567-1234567', { seller: 'Acme ', reason: 'not_received', details: 'It never came.' });
  expect(calls).toEqual([['file_atoz_claim', { p_order_id: '114-1234567-1234567', p_seller: 'Acme', p_reason: 'not_received', p_details: 'It never came.' }]]);
  expect(c.status).toBe('under_review');
});

it('refuses a bad id without asking the database', async () => {
  const { db, calls } = fakeDb(row());
  await expect(withdrawClaim(db, 'nope')).rejects.toMatchObject({ code: 'claim_not_found' });
  await expect(decideClaim(db, 'nope', 'grant')).rejects.toMatchObject({ code: 'claim_not_found' });
  expect(calls).toHaveLength(0);
});

describe('decideClaim', () => {
  it('needs a decision, and a note to deny', async () => {
    const { db, calls } = fakeDb(row());
    await expect(decideClaim(db, ID, 'maybe')).rejects.toMatchObject({ code: 'invalid_input', detail: 'decision' });
    await expect(decideClaim(db, ID, 'deny')).rejects.toMatchObject({ code: 'invalid_input', detail: 'note' });
    await expect(decideClaim(db, ID, 'deny', '   ')).rejects.toMatchObject({ code: 'invalid_input', detail: 'note' });
    await expect(decideClaim(db, ID, 'grant', 'x'.repeat(1001))).rejects.toMatchObject({ code: 'invalid_input', detail: 'note' });
    expect(calls).toHaveLength(0);
  });

  it('denies with the note', async () => {
    const { db, calls } = fakeDb(row({ status: 'denied', decision_note: 'Signed for.' }));
    const c = await decideClaim(db, ID, 'deny', ' Signed for. ');
    expect(calls).toEqual([['decide_atoz_claim', { p_claim_id: ID, p_grant: false, p_note: 'Signed for.' }]]);
    expect(c.status).toBe('denied');
    expect(refundReturn).not.toHaveBeenCalled();
  });

  it('grants without a note and leaves a settled refund alone', async () => {
    const { db, calls } = fakeDb(row({ status: 'granted', return_id: 'r1', refund: { refund_minor: 500, refund_status: 'succeeded', refunded_at: null } }));
    await decideClaim(db, ID, 'grant');
    expect(calls).toEqual([['decide_atoz_claim', { p_claim_id: ID, p_grant: true, p_note: undefined }]]);
    expect(refundReturn).not.toHaveBeenCalled();
  });

  it('sends a pending card refund to Stripe and reads the claim again', async () => {
    const granted = row({ status: 'granted', return_id: 'r1', refund: { refund_minor: 500, refund_status: 'pending', refunded_at: null } });
    const { db } = fakeDb(granted, { ...granted, refund: { refund_minor: 500, refund_status: 'succeeded', refunded_at: '2026-10-08T00:00:00Z' } });
    const c = await decideClaim(db, ID, 'grant');
    expect(refundReturn).toHaveBeenCalledWith('r1');
    expect(c.refund?.status).toBe('succeeded');
  });

  it('still returns the granted claim when the card refund fails', async () => {
    refundReturn.mockImplementation(async () => {
      throw new Error('stripe down');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const granted = row({ status: 'granted', return_id: 'r1', refund: { refund_minor: 500, refund_status: 'pending', refunded_at: null } });
    const { db } = fakeDb(granted, { ...granted, refund: { refund_minor: 500, refund_status: 'failed', refunded_at: null } });
    const c = await decideClaim(db, ID, 'grant');
    expect(c.status).toBe('granted');
    expect(c.refund?.status).toBe('failed');
    spy.mockRestore();
  });
});

it('reads the filter, open by default', () => {
  expect(claimFilter('decided')).toBe('decided');
  expect(claimFilter('all')).toBe('all');
  expect(claimFilter('closed')).toBe('open');
  expect(claimFilter(null)).toBe('open');
});
