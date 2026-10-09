import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { searchCatalog } from '@/lib/data/catalog';
import type { DetailRow } from '@/lib/product-details';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
let boss: TestUser;
// the test's own amazon.in department, so its filters are only these products'
let dept = '';
const ids: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

const item = (title: string, details: DetailRow[]): ProductInput => ({
  title: `${title} ${tag}`,
  brand: null,
  category: dept,
  image: '/products/placeholder.jpg',
  priceMinor: 1_000_00,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details,
  // under pickProduct's 25, so other tests never pick them
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const search = (q: Record<string, string> = {}) => searchCatalog(anon(), 'IN', parseQuery({ dept, ...q }));
const found = (r: { items: { id: string }[] }) => r.items.map((p) => p.id).sort();

beforeAll(async () => {
  boss = await newUser('Search Attributes Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  dept = await createCategory(boss.db, { name: `Attributes ${tag}` }, 'IN');
  [ids.a, ids.b, ids.c, ids.d] = await Promise.all([
    createProduct(boss.db, 'IN', item('Phone A', [['Brand', 'Acme'], ['Storage', '128 GB'], ['RAM', '8 GB'], ['Colour', 'Red']])),
    createProduct(boss.db, 'IN', item('Phone B', [['Brand', 'Acme'], ['Storage', '128 GB'], ['RAM', '6 GB'], ['Colour', 'Blue']])),
    createProduct(boss.db, 'IN', item('Phone C', [['Brand', 'Bolt'], ['Storage', '256 GB'], ['RAM', '8 GB'], ['Colour', 'Green']])),
    createProduct(boss.db, 'IN', item('Phone D', [['Brand', 'Bolt'], ['Storage', '256 GB'], ['Colour', 'Black'], ['In the box', 'Handset, charger, cable, SIM tool and a case']])),
  ]);
});

afterAll(async () => {
  const made = Object.values(ids).filter(Boolean);
  if (made.length) await admin().from('products').delete().in('id', made);
  if (dept) {
    await admin().from('market_categories').delete().eq('category_slug', dept);
    await admin().from('categories').delete().eq('slug', dept);
  }
  await deleteUser(boss);
});

describe('search by a department’s own filters', () => {
  it('offers the details most of the department states, with shared values, most stated first', async () => {
    const r = await search();
    expect(r.total).toBe(4);
    // Brand has its own filter; a colour per phone and a long "In the box" are no filter
    expect(r.attributeFacets).toEqual([
      { label: 'Storage', values: [{ name: '128 GB', count: 2 }, { name: '256 GB', count: 2 }] },
      { label: 'RAM', values: [{ name: '8 GB', count: 2 }, { name: '6 GB', count: 1 }] },
    ]);
  });

  it('has none outside a department', async () => {
    const r = await searchCatalog(anon(), 'IN', parseQuery({ k: `Phone ${tag}` }));
    expect(r.total).toBe(4);
    expect(r.attributeFacets).toEqual([]);
  });

  it('narrows to any value picked of a label, and all labels picked, and the facets stay whole', async () => {
    const all = await search();
    const storage = await search({ attr: 'Storage:128 GB' });
    expect(found(storage)).toEqual([ids.a, ids.b].sort());
    expect(storage.attributeFacets).toEqual(all.attributeFacets);

    expect(found(await search({ attr: 'Storage:128 GB|256 GB' }))).toEqual(Object.values(ids).sort());
    expect(found(await search({ attr: 'Storage:128 GB|256 GB;RAM:8 GB' }))).toEqual([ids.a, ids.c].sort());
    // any detail can be picked, though it isn't offered
    expect(found(await search({ attr: 'Colour:Black' }))).toEqual([ids.d]);
    expect(found(await search({ attr: 'Storage:512 GB' }))).toEqual([]);
  });

  it('ignores filters it can’t read', async () => {
    for (const p_attrs of ['Storage', ['128 GB'], { Storage: '128 GB' }, {}]) {
      const { data, error } = await anon().rpc('search_catalog', { p_market: 'IN', p_dept: dept, p_attrs });
      expect(error).toBeNull();
      const total = (data as { total: number }).total;
      // a label whose values aren't a list matches nothing; anything else isn't a filter
      expect(total).toBe(p_attrs && typeof p_attrs === 'object' && !Array.isArray(p_attrs) && Object.keys(p_attrs).length ? 0 : 4);
    }
  });
});
