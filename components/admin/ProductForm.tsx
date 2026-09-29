'use client';
import { useActionState, useEffect, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProductFormState } from '@/app/admin/actions';
import { Alert } from '../primitives/Alert';
import { Button, buttonClasses } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

/** Form values as strings (prices in major units, bullets one per line). */
export interface ProductFormValues {
  title: string;
  brand: string;
  category: string;
  image: string;
  price: string;
  listPrice: string;
  deal: boolean;
  badge: string;
  boughtPastMonth: string;
  seller: string;
  shipsFrom: string;
  bullets: string;
  description: string;
  /** "Label: value", one row per line. */
  details: string;
  stock: string;
}

export interface ProductFormProps {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initial: ProductFormValues;
  categories: { value: string; label: string }[];
  badges: string[];
  currencySymbol: string;
  submitLabel: string;
  cancelHref: string;
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
export function ProductForm({ action, initial, categories, badges, currencySymbol, submitLabel, cancelHref }: ProductFormProps) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const val = (k: Exclude<keyof ProductFormValues, 'deal'>) => v?.[k] ?? initial[k];
  const e = state.errors ?? {};
  const bulletsId = useId();
  const descriptionId = useId();
  const detailsId = useId();
  const badgeList = useId();

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

          <div className="flex flex-wrap items-center gap-3">
            <Submit>{submitLabel}</Submit>
            <a href={cancelHref} className={buttonClasses({ variant: 'link' })}>Cancel</a>
          </div>
        </div>
      </div>
    </form>
  );
}
