import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, listVariantGroups, listVariantSiblings, setArchived, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { getProductInfo } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? [err.code, err.detail, err.message] : [String(err)];
  }
  return ['no error'];
};

const tag = crypto.randomUUID().slice(0, 6);
const group = `test-mug-${tag}`;
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Variant test mug ${tag}`,
  brand: 'Kiln',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 1800,
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
  seller: 'Kiln Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  stock: 10,
  gallery: [],
  variantGroup: group,
  variantAxis: 'Color',
  variantLabel: 'Sage',
  ...over,
});

let boss: TestUser;
const created: string[] = [];
let sage: string;
let clay: string;

beforeAll(async () => {
  boss = await newUser('Variant Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  sage = await createProduct(boss.db, 'US', input());
  clay = await createProduct(boss.db, 'US', input({ variantLabel: 'Clay', priceMinor: 2000, stock: 0, gallery: ['https://img.test/clay-side.jpg', 'https://img.test/clay-top.jpg'] }));
  created.push(sage, clay);
});

afterAll(async () => {
  if (created.length) await admin().from('products').delete().in('id', created);
  await deleteUser(boss);
});

describe('product variants', () => {
  it('shows each product its group, current one marked, in label order', async () => {
    const info = await getProductInfo(anon(), sage);
    expect(info.variants).toMatchObject({ group, axis: 'Color', label: 'Sage' });
    expect(info.variants!.options.map((o) => [o.label, o.current, o.priceMinor, o.stock])).toEqual([
      ['Clay', false, 2000, 0],
      ['Sage', true, 1800, 10],
    ]);
  });

  it('keeps labels unique within a group, whatever the case', async () => {
    expect(await fail(createProduct(boss.db, 'US', input({ variantLabel: 'sage' })))).toEqual([
      'invalid_input',
      'variantLabel',
      'Another product in this group already uses that option',
    ]);
    // the index backs the check up
    const raw = await boss.db.from('products').update({ variant_label: 'CLAY' }).eq('id', sage);
    expect(raw.error?.code).toBe('23505');
  });

  it('keeps one option name across a group', async () => {
    expect(await fail(createProduct(boss.db, 'US', input({ variantAxis: 'Size', variantLabel: 'Large' })))).toEqual([
      'invalid_input',
      'variantAxis',
      'Products in this group use “Color”',
    ]);
    // the same name in another case is the same name
    const slate = await createProduct(boss.db, 'US', input({ variantAxis: 'color', variantLabel: 'Slate' }));
    created.push(slate);
    expect((await getAdminProduct(boss.db, slate))?.variantAxis).toBe('Color'); // spelled as the group does
    expect((await getProductInfo(anon(), slate)).variants?.options.map((o) => o.label)).toEqual(['Clay', 'Sage', 'Slate']);
  });

  it('a group is per store', async () => {
    const inMug = await createProduct(boss.db, 'IN', input({ category: 'home-kitchen', variantLabel: 'Sage' }));
    created.push(inMug);
    expect((await getProductInfo(anon(), inMug)).variants).toBeNull(); // a group of one
  });

  it('hides archived options from the others, not from themselves', async () => {
    await setArchived(boss.db, clay, true);
    try {
      expect((await getProductInfo(anon(), sage)).variants?.options.map((o) => o.label)).not.toContain('Clay');
      const own = await getProductInfo(admin(), clay);
      expect(own.variants?.options.find((o) => o.current)?.label).toBe('Clay');
      expect((await listVariantSiblings(boss.db, 'US', group, sage)).find((s) => s.id === clay)?.archived).toBe(true);
    } finally {
      await setArchived(boss.db, clay, false);
    }
  });

  it('leaving a group clears the option fields', async () => {
    const solo = await createProduct(boss.db, 'US', input({ variantLabel: 'Ink' }));
    created.push(solo);
    await updateProduct(boss.db, solo, input({ variantGroup: null, variantLabel: 'Ink' }));
    const row = await getAdminProduct(boss.db, solo);
    expect([row?.variantGroup, row?.variantAxis, row?.variantLabel]).toEqual([null, null, null]);
    expect((await getProductInfo(anon(), solo)).variants).toBeNull();
  });

  it('lists the store’s groups for the form', async () => {
    const groups = await listVariantGroups(boss.db, 'US');
    expect(groups.find((g) => g.group === group)).toMatchObject({ axis: 'Color' });
    expect(groups.find((g) => g.group === 'sony-wh-ch520')).toEqual({ group: 'sony-wh-ch520', axis: 'Color', count: 2 });
  });
});

describe('product gallery', () => {
  it('saves the extra images in order and serves them', async () => {
    expect((await getProductInfo(anon(), clay)).gallery).toEqual(['https://img.test/clay-side.jpg', 'https://img.test/clay-top.jpg']);
    await updateProduct(boss.db, clay, input({ variantLabel: 'Clay', gallery: ['https://img.test/clay-top.jpg'] }));
    expect((await getAdminProduct(boss.db, clay))?.gallery).toEqual(['https://img.test/clay-top.jpg']);
  });

  it('the database caps it at 8', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => `https://img.test/${i}.jpg`);
    const res = await boss.db.from('products').update({ gallery: nine }).eq('id', sage);
    expect(res.error?.code).toBe('23514');
  });
});
