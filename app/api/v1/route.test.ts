import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api/http', () => ({ json: (body: unknown) => Response.json(body), preflight: () => new Response(null) }));

const { GET } = await import('./route');

const ROOT = join(process.cwd(), 'app/api/v1');

/** Every "METHOD /path" a route file under /api/v1 exports, with [param] segments as :param. */
function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts' && dir !== ROOT) {
        const path = `/${relative(ROOT, dir).split(sep).join('/')}`.replace(/\[(\w+)\]/g, ':$1');
        for (const [, method] of readFileSync(full, 'utf8').matchAll(/export (?:async )?(?:function|const) (GET|POST|PATCH|PUT|DELETE)\b/g)) out.push(`${method} ${path}`);
      }
    }
  };
  walk(ROOT);
  return out.sort();
}

it('the endpoint index lists exactly the routes that exist', async () => {
  const listed: string[] = (await GET().json()).endpoints.map((e: string) => e.replace(/\?.*$/, '').replace(/\s+/g, ' ').trim());
  // a route file with an :action segment is listed once per action (POST /admin/orders/:id/ship, …)
  const matches = (route: string, entry: string) => new RegExp(`^${route.replace(/:action$/, '\\w[\\w-]*').replace(/:\w+/g, ':\\w+')}$`).test(entry);
  const existing = routes();
  expect(existing.filter((r) => !listed.some((e) => matches(r, e)))).toEqual([]);
  expect(listed.filter((e) => !existing.some((r) => matches(r, e)))).toEqual([]);
  expect(new Set(listed).size).toBe(listed.length);
});
