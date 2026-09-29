import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DeleteProduct } from '@/components/admin/DeleteProduct';
import { ProductForm } from '@/components/admin/ProductForm';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { PRODUCT_BADGES, getAdminProduct } from '@/lib/data/admin-catalog';
import { listCategories } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { removeProduct, saveProduct } from '../../actions';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly, majorText } from '../../ui';

export const metadata: Metadata = { title: 'Edit product · Admin · Store' };

export default async function EditProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const path = `/admin/products/${encodeURIComponent(id)}`;
  const { store, admin } = await adminPage(path);
  if (!admin) return <AdminOnly store={store} />;

  const client = await db();
  const [product, categories] = await Promise.all([getAdminProduct(client, id), listCategories(client, store.id)]);
  if (!product) notFound();
  // a product belongs to one store; edit it there
  if (product.market !== store.id) redirect(storePath({ id: product.market }, path));

  const problem = messageFor(Array.isArray(error) ? error[0] : error);
  return (
    <AdminFrame
      store={store}
      path="/admin/products"
      title="Edit product"
      lede={<span className="font-mono text-[13px]">{product.id}</span>}
      actions={
        <>
          <a href={storePath(store, `/product/${encodeURIComponent(product.id)}`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>View in store</a>
          <DeleteProduct action={removeProduct.bind(null, product.id)} name={product.title} />
        </>
      }
    >
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      <ProductForm
        action={saveProduct.bind(null, product.id)}
        initial={{
          title: product.title,
          brand: product.brand ?? '',
          category: product.category,
          image: product.image,
          price: majorText(product.priceMinor),
          listPrice: majorText(product.listMinor),
          deal: product.deal,
          badge: product.badge ?? '',
          boughtPastMonth: product.boughtPastMonth ?? '',
          seller: product.seller,
          shipsFrom: product.shipsFrom,
          bullets: product.bullets.join('\n'),
          stock: String(product.stock),
        }}
        categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
        badges={PRODUCT_BADGES}
        currencySymbol={store.currency.symbol}
        submitLabel="Save changes"
        cancelHref={storePath(store, '/admin/products')}
      />
    </AdminFrame>
  );
}
