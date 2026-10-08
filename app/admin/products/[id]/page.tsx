import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DeleteProduct } from '@/components/admin/DeleteProduct';
import { ProductForm } from '@/components/admin/ProductForm';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass } from '@/components/lib/controls';
import {
  GALLERY_MAX,
  PRODUCT_BADGES,
  VARIANT_AXES,
  getAdminProduct,
  listVariantGroups,
  listVariantSiblings,
  productHasOrders,
} from '@/lib/data/admin-catalog';
import { listCategories } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { getRecall, RECALL_TEXT_MAX, RECALL_TEXT_MIN } from '@/lib/data/recalls';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { archiveProduct, recallProductAction, removeProduct, saveProduct } from '../../actions';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly, productFormValues } from '../../ui';

export const metadata: Metadata = { title: 'Edit product · Admin · Store' };

export default async function EditProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; done?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const path = `/admin/products/${encodeURIComponent(id)}`;
  const { store, admin } = await adminPage(path);
  if (!admin) return <AdminOnly store={store} />;

  const client = await db();
  const [product, categories, ordered, variantGroups, recall] = await Promise.all([
    getAdminProduct(client, id),
    listCategories(client, store.id),
    productHasOrders(client, id),
    listVariantGroups(client, store.id),
    getRecall(client, id).catch(() => null),
  ]);
  if (!product) notFound();
  // a product belongs to one store; edit it there
  if (product.market !== store.id) redirect(storePath({ id: product.market }, path));
  const siblings = product.variantGroup ? await listVariantSiblings(client, store.id, product.variantGroup, product.id) : [];

  const problem = messageFor(first(sp.error));
  const done = first(sp.done);
  const archived = product.archivedAt != null;
  const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const archivedOn = product.archivedAt ? dateText(product.archivedAt) : '';
  const toggle = (
    <form action={archiveProduct.bind(null, product.id, !archived, 'edit')}>
      <button type="submit" className={buttonClasses({ variant: archived ? 'dark' : 'secondary', size: 'sm' })}>
        {archived ? 'Restore to sale' : 'Archive'}
      </button>
    </form>
  );
  return (
    <AdminFrame
      store={store}
      path="/admin/products"
      title="Edit product"
      lede={<span className="font-mono text-[13px]">{product.id}</span>}
      actions={
        <>
          <a href={storePath(store, `/product/${encodeURIComponent(product.id)}`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>View in store</a>
          {archived ? null : toggle}
          {ordered ? null : <DeleteProduct action={removeProduct.bind(null, product.id)} name={product.title} />}
        </>
      }
    >
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      {done === 'restored' ? <Alert tone="success">Restored. It’s back on sale.</Alert> : null}
      {archived ? (
        <Alert tone={done === 'archived' ? 'success' : 'info'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {done === 'archived' ? 'Archived. ' : `Archived on ${archivedOn}. `}
              It’s off the storefront and can’t be added to carts or saved lists; its page says it’s no longer available.
              {ordered ? ' It stays in order history.' : ''}
              {recall ? ' It’s been recalled, so it can’t go back on sale.' : ''}
            </span>
            {recall ? null : toggle}
          </div>
        </Alert>
      ) : ordered ? (
        <p className="m-0 text-[14px] text-ink-3">This product has been ordered, so it can be archived but not deleted.</p>
      ) : null}
      <ProductForm
        action={saveProduct.bind(null, product.id)}
        initial={productFormValues(product)}
        categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
        badges={PRODUCT_BADGES}
        currencySymbol={store.currency.symbol}
        submitLabel="Save changes"
        cancelHref={storePath(store, '/admin/products')}
        galleryMax={GALLERY_MAX}
        variantGroups={variantGroups}
        variantAxes={VARIANT_AXES}
        siblings={siblings.map((x) => ({ ...x, href: storePath(store, `/admin/products/${encodeURIComponent(x.id)}`) }))}
        addOptionHref={product.variantGroup ? storePath(store, `/admin/products/new?from=${encodeURIComponent(product.id)}`) : undefined}
      />
      <section id="recall" aria-labelledby="recall-h" className="flex max-w-[760px] scroll-mt-24 flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <h2 id="recall-h" className="m-0 text-[18px] font-semibold">Safety recall</h2>
        {done === 'recalled' ? <Alert tone="success">Recalled. It’s off sale, its page shows the recall, and shoppers who bought it are told.</Alert> : null}
        {done === 'recall_updated' ? <Alert tone="success">Recall updated.</Alert> : null}
        {recall ? (
          <p className="m-0 text-[14px] text-ink-2">
            Recalled on {dateText(recall.issuedAt)}{recall.updatedAt !== recall.issuedAt ? `, last changed ${dateText(recall.updatedAt)}` : ''}. Shoppers see it on the product page, on{' '}
            <a href={storePath(store, '/recalls')} className="text-ink underline underline-offset-2">Recalls and Product Safety Alerts</a>, and, if they bought it, in their messages and on the order.
          </p>
        ) : (
          <p className="m-0 text-[14px] text-ink-2">
            If this product isn’t safe, recall it. That takes it off sale for good, shows the recall on its page and on Recalls and Product Safety Alerts, and tells everyone who bought it.
          </p>
        )}
        <form action={recallProductAction.bind(null, product.id)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
            Hazard
            <textarea name="hazard" required minLength={RECALL_TEXT_MIN} maxLength={RECALL_TEXT_MAX} rows={2} defaultValue={recall?.hazard} placeholder="e.g. The handle can overheat and cause burns." className={`${fieldClass} h-auto py-2.5 font-normal leading-normal`} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
            What shoppers should do
            <textarea name="remedy" required minLength={RECALL_TEXT_MIN} maxLength={RECALL_TEXT_MAX} rows={2} defaultValue={recall?.remedy} placeholder="e.g. Stop using it and return it for a full refund." className={`${fieldClass} h-auto py-2.5 font-normal leading-normal`} />
          </label>
          <button type="submit" className={`${buttonClasses({ variant: recall ? 'secondary' : 'dark', size: 'sm' })} self-start`}>
            {recall ? 'Update recall' : 'Recall this product'}
          </button>
        </form>
      </section>
    </AdminFrame>
  );
}
