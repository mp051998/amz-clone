import type { Metadata } from 'next';
import { ProductForm, type ProductFormValues } from '@/components/admin/ProductForm';
import { GALLERY_MAX, PRODUCT_BADGES, VARIANT_AXES, getAdminProduct, listVariantGroups } from '@/lib/data/admin-catalog';
import { listCategories } from '@/lib/data/catalog';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { saveProduct } from '../../actions';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly, productFormValues } from '../../ui';

export const metadata: Metadata = { title: 'Add product · Admin · Store' };

/**
 * /admin/products/new. `?from=<id>` ("Add another option" on a grouped product) starts from a copy
 * of that product in the same variant group, with the option, stock and extra images left blank.
 */
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/products/new');
  if (!admin) return <AdminOnly store={store} />;
  const client = await db();
  const fromId = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const [categories, variantGroups, from] = await Promise.all([
    listCategories(client, store.id),
    listVariantGroups(client, store.id),
    fromId ? getAdminProduct(client, fromId) : null,
  ]);
  const base = from && from.market === store.id ? from : null;

  const initial: ProductFormValues = base
    ? { ...productFormValues(base), variantLabel: '', stock: '0', gallery: '' }
    : {
        title: '', brand: '', category: categories[0]?.slug ?? '', image: '', price: '', listPrice: '', deal: false, coupon: '',
        badge: '', boughtPastMonth: '', seller: '', shipsFrom: '', bullets: '', description: '', details: '', stock: '0',
        gallery: '', variantGroup: '', variantAxis: '', variantLabel: '',
      };

  return (
    <AdminFrame
      store={store}
      path="/admin/products/new"
      title={base ? 'Add an option' : 'Add product'}
      lede={
        base
          ? <>A new {base.variantAxis?.toLowerCase() ?? 'option'} of “{base.title}”, copied from it. Name the option and check what differs (price, image, details).</>
          : 'It goes live in this store as soon as you save.'
      }
    >
      <ProductForm
        action={saveProduct.bind(null, null)}
        initial={initial}
        categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
        badges={PRODUCT_BADGES}
        currencySymbol={store.currency.symbol}
        submitLabel={base ? 'Add option' : 'Add product'}
        cancelHref={storePath(store, base ? `/admin/products/${encodeURIComponent(base.id)}` : '/admin/products')}
        galleryMax={GALLERY_MAX}
        variantGroups={variantGroups}
        variantAxes={VARIANT_AXES}
      />
    </AdminFrame>
  );
}
