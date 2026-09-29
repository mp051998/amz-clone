import type { Metadata } from 'next';
import { ProductForm } from '@/components/admin/ProductForm';
import { PRODUCT_BADGES } from '@/lib/data/admin-catalog';
import { listCategories } from '@/lib/data/catalog';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { saveProduct } from '../../actions';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly } from '../../ui';

export const metadata: Metadata = { title: 'Add product · Admin · Store' };

export default async function NewProductPage() {
  const { store, admin } = await adminPage('/admin/products/new');
  if (!admin) return <AdminOnly store={store} />;
  const categories = await listCategories(await db(), store.id);

  return (
    <AdminFrame store={store} path="/admin/products/new" title="Add product" lede="It goes live in this store as soon as you save.">
      <ProductForm
        action={saveProduct.bind(null, null)}
        initial={{
          title: '', brand: '', category: categories[0]?.slug ?? '', image: '', price: '', listPrice: '', deal: false,
          badge: '', boughtPastMonth: '', seller: '', shipsFrom: '', bullets: '', stock: '0',
        }}
        categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
        badges={PRODUCT_BADGES}
        currencySymbol={store.currency.symbol}
        submitLabel="Add product"
        cancelHref={storePath(store, '/admin/products')}
      />
    </AdminFrame>
  );
}
