import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, setArchived, type ProductInput } from '@/lib/data/admin-catalog';
import {
  addCategoryToStore,
  createCategory,
  deleteCategory,
  listAdminCategories,
  moveCategory,
  removeCategoryFromStore,
  renameCategory,
  storeNav,
} from '@/lib/data/admin-categories';
import { listCategories } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const tag = crypto.randomUUID().slice(0, 6);
const slugs: string[] = [];
const products: string[] = [];
let boss: TestUser;
let shopper: TestUser;

const product = (category: string): ProductInput => ({
  title: `Category test ${tag}`,
  brand: null,
  category,
  image: '/products/placeholder.jpg',
  priceMinor: 1500,
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
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  stock: 3,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const navOf = async (market: 'US' | 'IN') => (await listCategories(anon(), market)).map((c) => c.slug);

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('Category Admin'), newUser('Category Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  if (products.length) await admin().from('products').delete().in('id', products);
  if (slugs.length) {
    await admin().from('market_categories').delete().in('category_slug', slugs);
    await admin().from('categories').delete().in('slug', slugs);
  }
  await Promise.all([deleteUser(boss), deleteUser(shopper)]);
});

describe('categories', () => {
  it('admins create one, listed last in the store nav; the slug comes from the name', async () => {
    const before = await navOf('US');
    const slug = await createCategory(boss.db, { name: `Garden & Patio ${tag}` }, 'US');
    slugs.push(slug);
    expect(slug).toBe(`garden-and-patio-${tag}`);
    expect(await navOf('US')).toEqual([...before, slug]);
    expect(await navOf('IN')).not.toContain(slug);

    const [row] = (await listAdminCategories(boss.db)).filter((c) => c.slug === slug);
    expect(row).toMatchObject({ name: `Garden & Patio ${tag}`, tailored: false });
    // last in the nav (positions can have gaps where rows were deleted directly, e.g. by test cleanup)
    const { data: nav } = await anon().from('market_categories').select('position').eq('market_id', 'US');
    expect(row.stores.US).toEqual({ position: Math.max(...nav!.map((r) => r.position)), products: 0, archived: 0, returnDays: null });
    expect(row.stores.IN.position).toBeNull();
  });

  it('rejects bad input, duplicate slugs and non-admins', async () => {
    expect(await code(createCategory(boss.db, { name: '' }))).toBe('invalid_input');
    expect(await code(createCategory(boss.db, { name: 'Ok', slug: 'Not A Slug' }))).toBe('invalid_input');
    expect(await code(createCategory(boss.db, { name: 'Electronics again', slug: 'electronics' }))).toBe('category_exists');
    expect(await code(createCategory(shopper.db, { name: `Nope ${tag}` }))).toBe('forbidden');
  });

  it('renames (the slug stays)', async () => {
    const slug = await createCategory(boss.db, { name: `Rename me ${tag}` });
    slugs.push(slug);
    await renameCategory(boss.db, slug, `Renamed ${tag}`);
    const row = (await listAdminCategories(boss.db)).find((c) => c.slug === slug);
    expect(row?.name).toBe(`Renamed ${tag}`);
    expect(await code(renameCategory(boss.db, slug, ''))).toBe('invalid_input');
    expect(await code(renameCategory(shopper.db, slug, 'Hijacked'))).toBe('category_not_found');
    expect(await code(renameCategory(boss.db, `missing-${tag}`, 'x'))).toBe('category_not_found');
  });

  it('reorders a store nav and renumbers it 0..n-1', async () => {
    const slug = await createCategory(boss.db, { name: `Mover ${tag}` }, 'IN');
    slugs.push(slug);
    const start = await navOf('IN');
    expect(start.at(-1)).toBe(slug);

    await moveCategory(boss.db, 'IN', slug, -2);
    const moved = await navOf('IN');
    expect(moved.indexOf(slug)).toBe(start.length - 3);
    expect(moved.filter((s) => s !== slug)).toEqual(start.filter((s) => s !== slug));

    // clamps at the ends
    await moveCategory(boss.db, 'IN', slug, -100);
    expect((await navOf('IN'))[0]).toBe(slug);
    await moveCategory(boss.db, 'IN', slug, 100);
    expect((await navOf('IN')).at(-1)).toBe(slug);

    const { data } = await anon().from('market_categories').select('position').eq('market_id', 'IN').order('position');
    expect(data!.map((r) => r.position)).toEqual(start.map((_, i) => i));

    expect(await code(moveCategory(shopper.db, 'IN', slug, -1))).toBe('forbidden');
    expect(await code(moveCategory(boss.db, 'US', slug, -1))).toBe('category_not_found');
  });

  it('a store can drop a category only once it has no products there, archived included', async () => {
    const slug = await createCategory(boss.db, { name: `In use ${tag}` }, 'US');
    slugs.push(slug);
    const id = await createProduct(boss.db, 'US', product(slug));
    products.push(id);
    expect(storeNav(await listAdminCategories(boss.db), 'US').find((c) => c.slug === slug)?.stores.US.products).toBe(1);

    expect(await code(removeCategoryFromStore(boss.db, 'US', slug))).toBe('category_in_use');
    await setArchived(boss.db, id, true);
    const row = (await listAdminCategories(boss.db)).find((c) => c.slug === slug);
    expect(row?.stores.US).toMatchObject({ products: 1, archived: 1 });
    expect(await code(removeCategoryFromStore(boss.db, 'US', slug))).toBe('category_in_use');
    // nor can the category itself go
    expect(await code(deleteCategory(boss.db, slug))).toBe('category_in_use');

    await admin().from('products').delete().eq('id', id);
    products.splice(products.indexOf(id), 1);
    expect(await code(removeCategoryFromStore(shopper.db, 'US', slug))).toBe('category_not_found');
    await removeCategoryFromStore(boss.db, 'US', slug);
    expect(await navOf('US')).not.toContain(slug);
    // products need their store to list the category
    expect(await code(createProduct(boss.db, 'US', product(slug)))).toBe('invalid_category');
    await addCategoryToStore(boss.db, 'US', slug);
    await addCategoryToStore(boss.db, 'US', slug); // already listed: no-op
    expect((await navOf('US')).filter((s) => s === slug)).toHaveLength(1);
  });

  it('deletes an unused category from every store nav', async () => {
    const slug = await createCategory(boss.db, { name: `Doomed ${tag}` }, 'US');
    await addCategoryToStore(boss.db, 'IN', slug);
    expect(await code(deleteCategory(shopper.db, slug))).toBe('category_not_found');
    await deleteCategory(boss.db, slug);
    expect(await navOf('US')).not.toContain(slug);
    expect(await navOf('IN')).not.toContain(slug);
    expect(await code(deleteCategory(boss.db, slug))).toBe('category_not_found');
  });

  it('non-admins cannot write categories or store navs directly', async () => {
    const ins = await shopper.db.from('categories').insert({ slug: `x-${tag}`, name: 'x' });
    expect(ins.error).not.toBeNull();
    const nav = await shopper.db.from('market_categories').update({ position: 999 }).eq('market_id', 'US').select('position');
    expect(nav.data ?? []).toEqual([]);
    const fresh = await createCategory(boss.db, { name: `Anon add ${tag}` });
    slugs.push(fresh);
    expect(await code(addCategoryToStore(shopper.db, 'US', fresh))).toBe('forbidden');
  });

  it('marks built-in categories as tailored', async () => {
    const all = await listAdminCategories(boss.db);
    for (const slug of ['electronics', 'wearables', 'kitchen-appliances', 'yoga']) {
      expect(all.find((c) => c.slug === slug)?.tailored).toBe(true);
    }
  });
});
