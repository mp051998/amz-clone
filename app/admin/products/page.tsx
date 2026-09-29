import type { Metadata } from 'next';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { getAdminProduct, listAdminProducts } from '@/lib/data/admin-catalog';
import { listCategories } from '@/lib/data/catalog';
import { formatMoney } from '@/lib/marketplaces';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly } from '../ui';

export const metadata: Metadata = { title: 'Catalogue · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** /admin/products (and /in/admin/products): the store's products, searchable, newest changes first. */
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/products');
  if (!admin) return <AdminOnly store={store} />;

  const q = one(sp, 'q').trim();
  const category = one(sp, 'category');
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const client = await db();
  const [categories, result, touched] = await Promise.all([
    listCategories(client, store.id),
    listAdminProducts(client, store.id, { q, category: category || undefined, page }),
    one(sp, 'id') ? getAdminProduct(client, one(sp, 'id')) : Promise.resolve(null),
  ]);
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const to = (path: string) => storePath(store, path);
  const pageHref = (n: number) => {
    const out = new URLSearchParams();
    if (q) out.set('q', q);
    if (category) out.set('category', category);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/products${qs ? `?${qs}` : ''}`);
  };
  const done = one(sp, 'done');
  const notice =
    done === 'deleted' ? 'Product deleted.'
    : done && touched ? `${done === 'created' ? 'Added' : 'Saved'} “${touched.title}”.`
    : null;

  return (
    <AdminFrame
      store={store}
      path="/admin/products"
      title="Catalogue"
      lede={<>{result.total.toLocaleString('en-US')} products in this store. Changes show on the storefront straight away.</>}
      actions={<a href={to('/admin/products/new')} className={buttonClasses({ variant: 'primary', size: 'md' })}>Add product</a>}
    >
      {notice ? (
        <Alert tone="success">
          {notice}{' '}
          {touched ? <a href={to(`/product/${encodeURIComponent(touched.id)}`)} className="text-ink underline underline-offset-2">View in store</a> : null}
        </Alert>
      ) : null}

      <form role="search" aria-label="Filter products" className="flex flex-wrap items-end gap-3" action={to('/admin/products')}>
        <div className="flex min-w-[220px] flex-[1_1_320px] flex-col gap-1.5">
          <label htmlFor="admin-q" className="text-[14px] font-semibold">Search</label>
          <input id="admin-q" name="q" defaultValue={q} placeholder="Title or product id" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="admin-cat" className="text-[14px] font-semibold">Category</label>
          <select id="admin-cat" name="category" defaultValue={category} className={selectClass}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'md' })}>Filter</button>
        {q || category ? <a href={to('/admin/products')} className={buttonClasses({ variant: 'link' })}>Clear</a> : null}
      </form>

      {result.items.length ? (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
            <caption className="sr-only">Products, most recently changed first</caption>
            <thead>
              <tr className="border-b border-line text-[12px] font-mono uppercase tracking-[0.04em] text-ink-3">
                <th scope="col" className="px-4 py-3 font-normal">Product</th>
                <th scope="col" className="px-4 py-3 font-normal">Category</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Price</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Stock</th>
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((p) => (
                <tr key={p.id} className="border-b border-line-2 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="hatch relative h-12 w-12 flex-none overflow-hidden rounded-[6px]">
                        {p.image ? <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-contain p-1" /> : null}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <a href={to(`/admin/products/${encodeURIComponent(p.id)}`)} className="line-clamp-2 font-semibold text-ink no-underline hover:underline">{p.title}</a>
                        <span className="font-mono text-[12px] text-ink-3">{p.id}{p.brand ? ` · ${p.brand}` : ''}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{p.categoryName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold">{money(p.priceMinor)}</span>
                    {p.listMinor ? <span className="block text-[12px] text-ink-3 line-through">{money(p.listMinor)}</span> : null}
                    {p.deal ? <span className="block text-[12px] text-good-strong">On deals</span> : null}
                  </td>
                  <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums', p.stock === 0 && 'text-bad', p.stock > 0 && p.stock <= 5 && 'text-warn')}>
                    {p.stock === 0 ? 'Out of stock' : p.stock.toLocaleString('en-US')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <a href={to(`/admin/products/${encodeURIComponent(p.id)}`)} className="text-ink underline underline-offset-2" aria-label={`Edit ${p.title}`}>Edit</a>
                    <span aria-hidden className="px-1.5 text-ink-4">·</span>
                    <a href={to(`/product/${encodeURIComponent(p.id)}`)} className="text-ink-2 underline underline-offset-2" aria-label={`View ${p.title} in the store`}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={q || category ? 'No products match.' : 'No products yet.'}
          action={<a href={to('/admin/products/new')} className="text-[15px] underline underline-offset-2">Add a product</a>}
        >
          {q || category ? 'Try another search or category.' : 'Products you add appear here and in the store.'}
        </EmptyState>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[14px]">
          {result.page > 1 ? <a href={pageHref(result.page - 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>← Previous</a> : <span />}
          <span className="text-ink-2">Page {result.page} of {result.pageCount}</span>
          {result.page < result.pageCount ? <a href={pageHref(result.page + 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Next →</a> : <span />}
        </nav>
      ) : null}
    </AdminFrame>
  );
}
