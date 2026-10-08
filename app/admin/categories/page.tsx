import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Section } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { listAdminCategories, storeNav, totalProducts, type AdminCategory } from '@/lib/data/admin-categories';
import { messageFor } from '@/lib/data/errors';
import { RETURN_DAYS_MAX } from '@/lib/data/return-policy';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import type { Market } from '@/lib/types';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly } from '../ui';
import { addCategory, deleteCategoryAction, moveCategoryAction, renameCategoryAction, setListed, setReturnDaysAction } from './actions';

export const metadata: Metadata = { title: 'Categories · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const STORE_NAME: Record<Market, string> = { US: 'United States', IN: 'India' };

const DONE: Record<string, (name: string) => string> = {
  created: (n) => `Added “${n}”.`,
  renamed: (n) => `Renamed to “${n}”.`,
  listed: (n) => `“${n}” is now in this store’s nav.`,
  unlisted: (n) => `“${n}” is no longer in this store’s nav.`,
  moved: (n) => `Moved “${n}”.`,
  deleted: () => 'Category deleted.',
  returns: (n) => `Updated the return window for “${n}”.`,
};

const small = 'cursor-pointer border-0 bg-transparent p-0 text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink disabled:cursor-default disabled:text-ink-4 disabled:no-underline';

/**
 * /admin/categories (and /in/admin/categories): every category, which ones this store's nav lists
 * and in what order, plus add / rename / delete.
 */
export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/categories');
  if (!admin) return <AdminOnly store={store} />;

  const all = await listAdminCategories(await db());
  const nav = storeNav(all, store.id);
  const unlisted = all.filter((c) => c.stores[store.id].position == null);
  const other: Market = store.id === 'IN' ? 'US' : 'IN';
  const to = (path: string) => storePath(store, path);

  const slug = one(sp, 'slug');
  const editing = one(sp, 'edit');
  const touched = all.find((c) => c.slug === slug);
  const done = one(sp, 'done');
  const error = one(sp, 'error');
  const notice = DONE[done]?.(touched?.name ?? slug) ?? null;
  const problem = error ? (error === 'invalid_input' && one(sp, 'msg') ? one(sp, 'msg') : messageFor(error) ?? 'Something went wrong. Please try again.') : null;

  const count = (c: AdminCategory) => {
    const s = c.stores[store.id];
    if (!s.products) return <span className="text-ink-3">None</span>;
    return (
      <>
        <a href={to(`/admin/products?category=${encodeURIComponent(c.slug)}`)} className="text-ink underline underline-offset-2">{(s.products - s.archived).toLocaleString('en-US')} on sale</a>
        {s.archived ? <span className="block text-[12px] text-ink-3">+ {s.archived} archived</span> : null}
      </>
    );
  };

  const nameCell = (c: AdminCategory) =>
    editing === c.slug ? (
      <form action={renameCategoryAction.bind(null, c.slug)} className="flex flex-wrap items-center gap-2">
        <input name="name" defaultValue={c.name} maxLength={80} required aria-label={`New name for ${c.name}`} className={cn(fieldClass, 'h-9 w-[220px]')} autoFocus />
        <button type="submit" className={buttonClasses({ variant: 'dark', size: 'sm' })}>Save</button>
        <a href={to('/admin/categories')} className="text-[14px] text-ink-2 underline underline-offset-2">Cancel</a>
      </form>
    ) : (
      <span className="flex flex-col">
        <span className="font-semibold">{c.name}</span>
        <span className="font-mono text-[12px] text-ink-3">{c.slug}</span>
      </span>
    );

  // its own return window in this store, or the store's, and whether it's replacement only
  const returnsCell = (c: AdminCategory) => {
    const { returnDays: days, replacementOnly } = c.stores[store.id];
    return (
      <form action={setReturnDaysAction.bind(null, c.slug)} className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <input
            name="return_days"
            type="number"
            min={0}
            max={RETURN_DAYS_MAX}
            step={1}
            inputMode="numeric"
            defaultValue={days ?? ''}
            placeholder={String(store.returns.days)}
            aria-label={`Return window for ${c.name}, in days`}
            className={cn(fieldClass, 'h-9 w-[76px]')}
          />
          <button type="submit" className={small}>Save</button>
        </span>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <input type="checkbox" name="replacement_only" defaultChecked={replacementOnly} aria-label={`Replacement only for ${c.name}`} className="size-3.5 accent-ink" />
          Replacement only
        </label>
        <span className="text-[12px] text-ink-3">
          {days == null ? `Store’s ${store.returns.days} days` : days === 0 ? 'Not returnable' : `${days} days`}
          {replacementOnly && days !== 0 ? ', replacement only' : ''}
        </span>
      </form>
    );
  };

  const tools = (c: AdminCategory) =>
    c.tailored ? (
      <span className="text-ink-2">Tailored</span>
    ) : (
      <span className="text-ink-3" title="Compare and the quiz use general criteria: quality, durability, ease of use, owner satisfaction and value.">Generic</span>
    );

  const deleteButton = (c: AdminCategory) =>
    totalProducts(c) === 0 ? (
      <ConfirmAction
        action={deleteCategoryAction.bind(null, c.slug)}
        label="Delete"
        size="link"
        prompt={<>Delete <b className="font-semibold">{c.name}</b>? It leaves every store’s nav.</>}
        confirmLabel="Delete for good"
        pendingLabel="Deleting…"
      />
    ) : null;

  const actions = (items: ReactNode[]) => (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">{items.filter(Boolean)}</div>
  );

  const head = (cols: string[]) => (
    <thead>
      <tr className="border-b border-line text-[12px] font-mono uppercase tracking-[0.04em] text-ink-3">
        {cols.map((c, i) => (
          <th key={c || i} scope="col" className={cn('px-4 py-3 font-normal', i === cols.length - 1 && 'text-right')}>
            {c || <span className="sr-only">Actions</span>}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <AdminFrame
      store={store}
      path="/admin/categories"
      title="Categories"
      lede={<>Categories are shared by both stores; each store picks which ones its nav shows and in what order, and can give one its own return window (0 days: not returnable; blank: the store’s {store.returns.days}) or make it replacement only (back only when faulty, and replaced; refunded when it can’t be). A change applies to orders placed after it. A slug can’t change once it’s created.</>}
    >
      {problem ? <Alert tone="error">{problem}</Alert> : notice ? <Alert tone="success">{notice}</Alert> : null}

      <Section title={`In the ${STORE_NAME[store.id]} nav`} note={`${nav.length} categories, in nav order`}>
        {nav.length ? (
          <div className="relative overflow-x-auto rounded-panel border border-line bg-surface">
            <table className="w-full min-w-[880px] border-collapse text-left text-[14px]">
              <caption className="sr-only">Categories in this store’s nav, in order</caption>
              {head(['#', 'Category', 'Products', 'Returns', 'Decision tools', `${STORE_NAME[other]} nav`, ''])}
              <tbody>
                {nav.map((c, i) => {
                  const s = c.stores[store.id];
                  return (
                    <tr key={c.slug} className="border-b border-line-2 last:border-b-0">
                      <td className="px-4 py-3 tabular-nums text-ink-3">{i + 1}</td>
                      <td className="px-4 py-3">{nameCell(c)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{count(c)}</td>
                      <td className="px-4 py-3">{returnsCell(c)}</td>
                      <td className="px-4 py-3">{tools(c)}</td>
                      <td className="px-4 py-3 text-ink-2">{c.stores[other].position != null ? 'Listed' : <span className="text-ink-3">Not listed</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {actions([
                          <form key="up" action={moveCategoryAction.bind(null, c.slug, -1)} className="inline">
                            <button type="submit" className={small} disabled={i === 0} aria-label={`Move ${c.name} up`}>↑ Up</button>
                          </form>,
                          <form key="down" action={moveCategoryAction.bind(null, c.slug, 1)} className="inline">
                            <button type="submit" className={small} disabled={i === nav.length - 1} aria-label={`Move ${c.name} down`}>↓ Down</button>
                          </form>,
                          editing === c.slug ? null : <a key="rename" href={to(`/admin/categories?edit=${encodeURIComponent(c.slug)}`)} className="text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">Rename</a>,
                          s.products ? (
                            <span key="remove" className="text-[13px] text-ink-4" title="Move or delete this store’s products in it first">Has products</span>
                          ) : (
                            <form key="remove" action={setListed.bind(null, c.slug, false)} className="inline">
                              <button type="submit" className={small}>Remove from nav</button>
                            </form>
                          ),
                          <span key="delete">{deleteButton(c)}</span>,
                        ])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="This store’s nav is empty.">Add a category below, or list one that isn’t in this store yet.</EmptyState>
        )}
      </Section>

      {unlisted.length ? (
        <Section title="Not in this store" note="Listing one adds it to the end of the nav">
          <div className="relative overflow-x-auto rounded-panel border border-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <caption className="sr-only">Categories this store doesn’t list</caption>
              {head(['Category', 'Decision tools', `${STORE_NAME[other]} nav`, ''])}
              <tbody>
                {unlisted.map((c) => (
                  <tr key={c.slug} className="border-b border-line-2 last:border-b-0">
                    <td className="px-4 py-3">{nameCell(c)}</td>
                    <td className="px-4 py-3">{tools(c)}</td>
                    <td className="px-4 py-3 text-ink-2">
                      {c.stores[other].position != null ? `Listed · ${c.stores[other].products} products` : <span className="text-ink-3">Not listed</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {actions([
                        <form key="list" action={setListed.bind(null, c.slug, true)} className="inline">
                          <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Add to nav</button>
                        </form>,
                        editing === c.slug ? null : <a key="rename" href={to(`/admin/categories?edit=${encodeURIComponent(c.slug)}`)} className="text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">Rename</a>,
                        <span key="delete">{deleteButton(c)}</span>,
                      ])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title="Add a category">
        <div className="rounded-card border border-line bg-surface p-[18px]">
          <CategoryForm key={done === 'created' ? slug : 'new'} action={addCategory} storeLabel={STORE_NAME[store.id]} />
        </div>
        <p className="m-0 max-w-[680px] text-[14px] text-ink-3">
          Built-in categories have compare criteria, presets and a quiz written for them (“Tailored”). New ones use a general set: quality, durability, ease of use, owner satisfaction and value.
        </p>
      </Section>
    </AdminFrame>
  );
}
