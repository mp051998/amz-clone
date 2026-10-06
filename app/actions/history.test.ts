import { beforeEach, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string; opts?: Record<string, unknown> }>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, opts?: Record<string, unknown>) => void jar.set(name, { value, opts }),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { clearHistory, removeFromHistory, setHistoryPaused } = await import('./history');
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => jar.clear());

it('removes one product and keeps the order of the rest', async () => {
  jar.set('recent:v1', { value: 'a,b,c' });
  await removeFromHistory(form({ id: 'b' }));
  expect(jar.get('recent:v1')).toMatchObject({ value: 'a,c', opts: { path: '/', httpOnly: false, sameSite: 'lax' } });
});

it('drops the cookie when the last product goes', async () => {
  jar.set('recent:v1', { value: 'a' });
  await removeFromHistory(form({ id: 'a' }));
  expect(jar.has('recent:v1')).toBe(false);
});

it('clears everything', async () => {
  jar.set('recent:v1', { value: 'a,b' });
  await clearHistory();
  expect(jar.has('recent:v1')).toBe(false);
});

it('pauses and resumes without touching the list', async () => {
  jar.set('recent:v1', { value: 'a,b' });
  await setHistoryPaused(form({ paused: '1' }));
  expect(jar.get('recent:off')?.value).toBe('1');
  await setHistoryPaused(form({ paused: '0' }));
  expect(jar.has('recent:off')).toBe(false);
  expect(jar.get('recent:v1')?.value).toBe('a,b');
});
