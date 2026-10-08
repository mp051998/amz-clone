'use client';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProductFormState } from '@/app/admin/actions';
import { Alert } from '../primitives/Alert';
import { Button, buttonClasses } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';
import { GalleryField } from './GalleryField';

/** Form values as strings (prices in major units, bullets one per line). */
export interface ProductFormValues {
  title: string;
  brand: string;
  category: string;
  image: string;
  price: string;
  listPrice: string;
  deal: boolean;
  /** coupon percent, blank for none. */
  coupon: string;
  /** limit per customer, blank for none. */
  limit: string;
  /** the sizes it comes in, comma-separated ("S, M, L"), blank for none. */
  sizes: string;
  /** how much it holds ("3 fl oz"), blank for none. */
  unit: string;
  /** quantity discount percent and the units it starts at, both blank for none. */
  qtyPct: string;
  qtyMin: string;
  /** release date ("2026-11-20", the store's day), blank once it's out. */
  release: string;
  badge: string;
  boughtPastMonth: string;
  seller: string;
  shipsFrom: string;
  bullets: string;
  description: string;
  /** "Label: value", one row per line. */
  details: string;
  stock: string;
  /** extra image URLs, one per line. */
  gallery: string;
  variantGroup: string;
  variantAxis: string;
  variantLabel: string;
}

/** Another product in this one's variant group (edit page). */
export interface VariantSibling {
  id: string;
  label: string;
  title: string;
  href: string;
  archived: boolean;
}

export interface ProductFormProps {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initial: ProductFormValues;
  categories: { value: string; label: string }[];
  badges: string[];
  currencySymbol: string;
  submitLabel: string;
  cancelHref: string;
  galleryMax: number;
  /** the store's variant groups, for suggestions (and to fill in their option name). */
  variantGroups: { group: string; axis: string; count: number }[];
  variantAxes: string[];
  siblings?: VariantSibling[];
  /** "add another option" link for a grouped product (edit page). */
  addOptionHref?: string;
}

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" loading={pending}>
      {pending ? 'Saving…' : children}
    </Button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-[18px]">
      <legend className="float-left mb-1 w-full p-0 text-[17px] font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Add / edit a product (admin). Validation errors come back from the server action with the
 * submitted values, so nothing typed is lost; a chosen image file has to be picked again.
 */
export function ProductForm({
  action,
  initial,
  categories,
  badges,
  currencySymbol,
  submitLabel,
  cancelHref,
  galleryMax,
  variantGroups,
  variantAxes,
  siblings = [],
  addOptionHref,
}: ProductFormProps) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const val = (k: Exclude<keyof ProductFormValues, 'deal'>) => v?.[k] ?? initial[k];
  const e = state.errors ?? {};
  const bulletsId = useId();
  const descriptionId = useId();
  const detailsId = useId();
  const badgeList = useId();
  const groupList = useId();
  const axisList = useId();
  const axisRef = useRef<HTMLInputElement>(null);
  const gallery = val('gallery').split('\n').filter(Boolean);

  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview ?? (val('image') || null);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {e.form ? <Alert tone="error">{e.form}</Alert> : null}
      {Object.keys(e).some((k) => k !== 'form') ? (
        <Alert tone="error">Some details need fixing — see the highlighted fields.</Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Group title="Basics">
            <Input label="Title" name="title" required maxLength={300} defaultValue={val('title')} error={e.title} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Brand" name="brand" maxLength={80} defaultValue={val('brand')} error={e.brand} hint="Optional" />
              <div className="flex flex-col gap-1.5">
                <Select label="Category" name="category" options={categories} defaultValue={val('category')} aria-invalid={e.category ? true : undefined} className="w-full" />
                {e.category ? <span className="text-[13px] text-bad">⚠ {e.category}</span> : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Badge" name="badge" list={badgeList} maxLength={40} defaultValue={val('badge')} error={e.badge} hint="Optional, e.g. Best Seller" />
              <datalist id={badgeList}>{badges.map((b) => <option key={b} value={b} />)}</datalist>
              <Input label="Bought in past month" name="boughtPastMonth" maxLength={40} defaultValue={val('boughtPastMonth')} error={e.boughtPastMonth} hint="Optional, e.g. 1K+" />
            </div>
          </Group>

          <Group title="Price and stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label={`Price (${currencySymbol})`} name="price" inputMode="decimal" required defaultValue={val('price')} error={e.priceMinor} placeholder="19.99" />
              <Input label={`List price (${currencySymbol})`} name="listPrice" inputMode="decimal" defaultValue={val('listPrice')} error={e.listMinor} hint="Optional “was” price" />
              <Input label="Stock" name="stock" inputMode="numeric" required defaultValue={val('stock')} error={e.stock} />
            </div>
            <Input
              label="Coupon (% off)"
              name="coupon"
              inputMode="numeric"
              defaultValue={val('coupon')}
              error={e.couponPct}
              placeholder="15"
              hint="Optional, 5 to 50. Shoppers apply it on the product page; removing it takes it off their carts."
              className="sm:max-w-[240px]"
            />
            <Input
              label="Limit per customer"
              name="limit"
              inputMode="numeric"
              defaultValue={val('limit')}
              error={e.maxPerCustomer}
              placeholder="3"
              hint="Optional, 1 to 99: the most one shopper can buy across their orders. Cancelled orders don’t count."
              className="sm:max-w-[240px]"
            />
            <Input
              label="Sizes"
              name="sizes"
              defaultValue={val('sizes')}
              error={e.sizes}
              placeholder="S, M, L, XL"
              hint="Optional, for clothes and shoes: up to 20, comma-separated, in size-chart order. Shoppers pick one before adding it to their cart; every size shares the stock."
              autoCapitalize="none"
              spellCheck={false}
            />
            <Input
              label="Unit count"
              name="unit"
              defaultValue={val('unit')}
              error={e.unit}
              placeholder="3 fl oz"
              hint="Optional: how much it holds, in count, oz, fl oz, lb, g, kg, ml or l. Shoppers see the price per unit beside the price, like ($6.55 / Fl Oz)."
              autoCapitalize="none"
              spellCheck={false}
              className="sm:max-w-[240px]"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Quantity discount (% off)"
                name="qtyPct"
                inputMode="numeric"
                defaultValue={val('qtyPct')}
                error={e.qtyDiscount}
                placeholder="5"
                hint="Optional, 1 to 50, off each unit once a shopper buys enough"
              />
              <Input
                label="When buying at least"
                name="qtyMin"
                inputMode="numeric"
                defaultValue={val('qtyMin')}
                placeholder="2"
                hint="2 to 99 of it in one order. Shoppers see “Save 5% when you buy 2 or more”."
              />
            </div>
            <div className="flex flex-col gap-1">
              <Checkbox label="Show on Today’s Deals" name="deal" defaultChecked={v ? v.deal === 'on' : initial.deal} />
              {e.deal ? <span className="text-[13px] text-bad">⚠ {e.deal}</span> : <span className="text-[13px] text-ink-3">The discount is worked out from the list price.</span>}
            </div>
          </Group>

          <Group title="Seller and shipping">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Sold by" name="seller" required maxLength={120} defaultValue={val('seller')} error={e.seller} />
              <Input label="Ships from" name="shipsFrom" required maxLength={120} defaultValue={val('shipsFrom')} error={e.shipsFrom} />
            </div>
            <Input
              label="Release date"
              name="release"
              type="date"
              defaultValue={val('release')}
              error={e.releaseAt}
              hint="Optional, for something not out yet: until this day it’s sold as a pre-order and orders of it ship on the day. Moving it moves those orders too."
              className="sm:max-w-[240px]"
            />
          </Group>

          <Group title="Product details">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={bulletsId} className="text-[14px] font-semibold">About this item</label>
              <textarea
                id={bulletsId}
                name="bullets"
                rows={6}
                defaultValue={val('bullets')}
                aria-invalid={e.bullets ? true : undefined}
                className={cn(fieldClass, 'h-auto py-2.5 leading-normal', e.bullets && 'border-bad')}
              />
              {e.bullets ? <span className="text-[13px] text-bad">⚠ {e.bullets}</span> : <span className="text-[13px] text-ink-3">One point per line, up to 10.</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={descriptionId} className="text-[14px] font-semibold">Product description</label>
              <textarea
                id={descriptionId}
                name="description"
                rows={4}
                maxLength={2000}
                defaultValue={val('description')}
                aria-invalid={e.description ? true : undefined}
                className={cn(fieldClass, 'h-auto py-2.5 leading-normal', e.description && 'border-bad')}
              />
              {e.description ? <span className="text-[13px] text-bad">⚠ {e.description}</span> : <span className="text-[13px] text-ink-3">Optional. A short paragraph under the specifications.</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={detailsId} className="text-[14px] font-semibold">Product information</label>
              <textarea
                id={detailsId}
                name="details"
                rows={7}
                defaultValue={val('details')}
                placeholder={'Brand: Acme\nColor: Black\nItem weight: 1.2 lb'}
                aria-invalid={e.details ? true : undefined}
                className={cn(fieldClass, 'h-auto py-2.5 font-mono text-[13px] leading-normal', e.details && 'border-bad')}
              />
              {e.details ? <span className="text-[13px] text-bad">⚠ {e.details}</span> : <span className="text-[13px] text-ink-3">One “Label: value” per line, up to 20. Shown as a table on the product page.</span>}
            </div>
          </Group>

          <Group title="Variants">
            <p className="m-0 text-[14px] text-ink-2">
              Products that share a group show as options of each other on their pages (e.g. Color: Black, Blue). Each keeps its own price, stock and reviews.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Group"
                name="variantGroup"
                list={groupList}
                maxLength={60}
                defaultValue={val('variantGroup')}
                error={e.variantGroup}
                hint="Optional, e.g. sony-wh-ch520"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(ev) => {
                  // joining a known group: use its option name
                  const g = variantGroups.find((x) => x.group === ev.currentTarget.value.trim().toLowerCase());
                  if (g && axisRef.current) axisRef.current.value = g.axis;
                }}
              />
              <datalist id={groupList}>
                {variantGroups.map((g) => <option key={g.group} value={g.group}>{`${g.axis} · ${g.count} product${g.count === 1 ? '' : 's'}`}</option>)}
              </datalist>
              <Input ref={axisRef} label="Option name" name="variantAxis" list={axisList} maxLength={30} defaultValue={val('variantAxis')} error={e.variantAxis} hint="e.g. Color or Size" />
              <datalist id={axisList}>{variantAxes.map((a) => <option key={a} value={a} />)}</datalist>
              <Input label="This product’s option" name="variantLabel" maxLength={60} defaultValue={val('variantLabel')} error={e.variantLabel} hint="e.g. Black" />
            </div>
            {siblings.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-[14px] font-semibold">Other options in this group</span>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                  {siblings.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                      <a href={s.href} className="font-semibold underline underline-offset-2">{s.label}</a>
                      <span className="min-w-0 truncate text-ink-3">{s.title}</span>
                      {s.archived ? <span className="text-[13px] text-ink-3">(archived, hidden)</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {addOptionHref ? (
              <a href={addOptionHref} className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>Add another option</a>
            ) : null}
          </Group>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Group title="Image">
            <div className="hatch relative aspect-square overflow-hidden rounded-input border border-line-2">
              {shown ? <img src={shown} alt="" className="absolute inset-0 h-full w-full object-contain p-[8%]" /> : (
                <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-3">No image yet</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-semibold" htmlFor="imageFile">Upload</label>
              <input
                id="imageFile"
                type="file"
                name="imageFile"
                accept="image/jpeg,image/png,image/webp"
                onChange={(ev) => {
                  const f = ev.currentTarget.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="text-[14px] file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-pill file:border file:border-line-3 file:bg-surface file:px-3.5 file:text-[14px] file:font-semibold"
              />
              <span className="text-[13px] text-ink-3">JPEG, PNG or WebP, up to 3 MB.</span>
            </div>
            <Input label="Or image URL" name="image" defaultValue={val('image')} error={e.image} placeholder="https://…" hint="Used when no file is uploaded." />
          </Group>

          <Group title="More images">
            {/* re-seeded from the server's echo after a failed save */}
            <GalleryField key={v?.gallery ?? 'initial'} initial={gallery} max={galleryMax} error={e.gallery} />
          </Group>

          <div className="flex flex-wrap items-center gap-3">
            <Submit>{submitLabel}</Submit>
            <a href={cancelHref} className={buttonClasses({ variant: 'link' })}>Cancel</a>
          </div>
        </div>
      </div>
    </form>
  );
}
