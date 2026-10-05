import { beforeEach, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string; opts?: Record<string, unknown> }>();
let market: 'US' | 'IN' = 'US';
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: (name: string, value: string, opts?: Record<string, unknown>) => void jar.set(name, { value, opts }) }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getMarket: async () => market }));

const { setDeliverTo } = await import('./deliver-to');
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  jar.clear();
  market = 'US';
});

it('saves a typed ZIP for the store', async () => {
  const state = await setDeliverTo({}, form({ postcode: '94103-1234' }));
  expect(state.saved).toEqual(expect.any(Number));
  expect(jar.get('deliver:US')).toMatchObject({ value: '94103', opts: { path: '/', httpOnly: true, sameSite: 'lax' } });
});

it('saves a saved address with its city', async () => {
  market = 'IN';
  await setDeliverTo({}, form({ postcode: '560034', city: 'Bengaluru' }));
  expect(jar.get('deliver:IN')?.value).toBe('560034|Bengaluru');
});

it('explains a bad postcode and saves nothing', async () => {
  expect(await setDeliverTo({}, form({ postcode: '123' }))).toEqual({ error: 'Enter a 5-digit ZIP Code.' });
  market = 'IN';
  expect(await setDeliverTo({}, form({ postcode: '94103' }))).toEqual({ error: 'Enter a 6-digit Pincode.' });
  expect(jar.size).toBe(0);
});
