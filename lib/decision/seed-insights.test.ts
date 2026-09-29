import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGURED_CATEGORIES, decisionConfig } from './attributes';
import type { ProductInsight } from './types';

/** The committed seed must match the attribute configs — re-run `npm run db:insights:build` after editing them. */
describe('supabase/seed-insights.sql', () => {
  it('is up to date and every insight scores its category attributes', async () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/seed-insights.sql'), 'utf8');
    const { buildInsights } = (await import('../../scripts/build-insights.mjs')) as {
      buildInsights: () => Promise<Omit<ProductInsight, 'updatedAt'>[]>;
    };
    const rows = await buildInsights();
    expect(rows.length).toBeGreaterThan(200);
    const keySets = new Set(CONFIGURED_CATEGORIES.map((c) => decisionConfig(c).attributes.map((a) => a.key).sort().join(',')));
    for (const r of rows) {
      expect(keySets.has(Object.keys(r.scores).sort().join(','))).toBe(true);
      expect(sql).toContain(`'${r.productId}', '${JSON.stringify(r.scores)}'::jsonb`);
    }
  });
});
