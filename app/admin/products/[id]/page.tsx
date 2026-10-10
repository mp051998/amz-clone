import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DeleteProduct } from '@/components/admin/DeleteProduct';
import { ProductForm } from '@/components/admin/ProductForm';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import {
  GALLERY_MAX,
  PRODUCT_BADGES,
  VARIANT_AXES,
  getAdminProduct,
  listVariantGroups,
  listVariantSiblings,
  productHasOrders,
} from '@/lib/data/admin-catalog';
import { DEAL_HOURS_DEFAULT, DEAL_HOURS_MAX, dealProblemText, openDealsOf } from '@/lib/data/admin-lightning-deals';
import { listCategories } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { getRecall, RECALL_TEXT_MAX, RECALL_TEXT_MIN } from '@/lib/data/recalls';
import { dealOffPct } from '@/lib/lightning';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { archiveProduct, cancelDealAction, recallProductAction, removeProduct, saveProduct, scheduleDealAction } from '../../actions';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly, productFormValues } from '../../ui';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Edit product · Admin · Store' };

export default async function EditProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; done?: string | string[]; deal_error?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const path = `/admin/products/${encodeURIComponent(id)}`;
  const { store, admin } = await adminPage(path);
  if (!admin) return <AdminOnly store={store} />;

  const client = await db();
  const [product, categories, ordered, variantGroups, recall, deals] = await Promise.all([
    getAdminProduct(client, id),
    listCategories(client, store.id),
    productHasOrders(client, id),
    listVariantGroups(client, store.id),
    getRecall(client, id).catch(() => null),
    openDealsOf(client, id).catch(() => []),
  ]);
  if (!product) notFound();
  // a product belongs to one store; edit it there
  if (product.market !== store.id) redirect(storePath({ id: product.market }, path));
  const siblings = product.variantGroup ? await listVariantSiblings(client, store.id, product.variantGroup, product.id) : [];

  const problem = messageFor(first(sp.error));
  const dealProblem = dealProblemText(first(sp.deal_error), { stock: product.stock });
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const at = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: store.dates.timeZone });
  const done = first(sp.done);
  const archived = product.archivedAt != null;
  const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const archivedOn = product.archivedAt ? dateText(product.archivedAt) : '';
  const toggle = (
    <form action={archiveProduct.bind(null, product.id, !archived, 'edit')}>
      <SubmitButton variant={archived ? 'dark' : 'secondary'} size="sm">
        {archived ? 'Restore to sale' : 'Archive'}
      </SubmitButton>
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
        initial={productFormValues(product, store.dates.timeZone)}
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
          <SubmitButton variant={recall ? 'secondary' : 'dark'} size="sm" className="self-start">
            {recall ? 'Update recall' : 'Recall this product'}
          </SubmitButton>
        </form>
      </section>
      <section id="lightning-deal" aria-labelledby="lightning-deal-h" className="flex max-w-[760px] scroll-mt-24 flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <h2 id="lightning-deal-h" className="m-0 text-[18px] font-semibold">Lightning Deal</h2>
        {done === 'deal_scheduled' ? <Alert tone="success">Deal scheduled. It shows on the product’s page and on Today’s Deals.</Alert> : null}
        {done === 'deal_cancelled' ? <Alert tone="success">Deal cancelled. A live one ended now, and the product is back at its own price.</Alert> : null}
        {dealProblem ? <Alert tone="error">{dealProblem}</Alert> : null}
        <p className="m-0 text-[14px] text-ink-2">
          Drop the price for a few hours, for so many units. While it’s live the product sells at the deal price, struck against what it cost; it ends when the time’s up or the units are claimed, and the price goes back. See every deal on{' '}
          <a href={storePath(store, '/admin/deals')} className="text-ink underline underline-offset-2">Lightning Deals</a>.
        </p>
        {deals.length ? (
          <ul aria-label="This product’s deals" className="m-0 flex list-none flex-col gap-2 p-0">
            {deals.map((d) => {
              const live = d.startedAt != null;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-line-2 px-3 py-2 text-[14px]">
                  <span className="tabular-nums">
                    <strong className="font-semibold">{live ? 'Live' : 'Upcoming'}</strong> · {money(d.dealPriceMinor)}
                    {d.wasPriceMinor != null && d.wasPriceMinor > d.dealPriceMinor ? ` (${dealOffPct(d.wasPriceMinor, d.dealPriceMinor)}% off)` : ''} ·{' '}
                    {live ? `${d.claimed} of ${d.quota} claimed · ends ${at.format(new Date(d.endsAt))}` : `${d.quota} ${d.quota === 1 ? 'unit' : 'units'} · ${at.format(new Date(d.startsAt))} to ${at.format(new Date(d.endsAt))}`}
                  </span>
                  <form action={cancelDealAction.bind(null, d.id, { product: product.id })}>
                    <SubmitButton variant="secondary" size="sm">{live ? 'End now' : 'Cancel'}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}
        {archived ? (
          <p className="m-0 text-[14px] text-ink-3">Archived products can’t have deals.</p>
        ) : (
          <form action={scheduleDealAction.bind(null, product.id)} className="grid grid-cols-[repeat(auto-fill,minmax(min(160px,100%),1fr))] items-end gap-3">
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Deal price ({store.currency.symbol})
              <input name="price" required inputMode="decimal" placeholder={`Below ${money(product.priceMinor)}`} className={`${fieldClass} font-normal`} />
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Units at the deal price
              <input name="quota" required type="number" min={1} max={Math.max(1, product.stock)} placeholder={`Up to ${product.stock}`} className={`${fieldClass} font-normal`} />
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Starts (blank for now)
              <input name="starts" type="datetime-local" className={`${fieldClass} font-normal`} />
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Runs for
              <select name="hours" defaultValue={String(DEAL_HOURS_DEFAULT)} className={`${selectClass} font-normal`}>
                {Array.from({ length: DEAL_HOURS_MAX }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                ))}
              </select>
            </label>
            <p className="col-span-full m-0 text-[13px] text-ink-3">Times are the store’s ({store.dates.timeZone}).</p>
            <SubmitButton variant="dark" size="sm" className="justify-self-start">Schedule deal</SubmitButton>
          </form>
        )}
      </section>
    </AdminFrame>
  );
}
