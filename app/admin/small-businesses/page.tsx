import type { Metadata } from 'next';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Section } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { fieldClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { messageFor } from '@/lib/data/errors';
import { listSmallBusinesses, SMALL_BUSINESS_STORY_MAX, storeBrands } from '@/lib/data/small-businesses';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly } from '../ui';
import { addSmallBusinessAction, removeSmallBusinessAction, updateSmallBusinessAction } from './actions';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Small businesses · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const DONE: Record<string, (brand: string) => string> = {
  added: (b) => `${b} is now a small business: its products carry the badge.`,
  updated: (b) => `Updated what ${b}’s products say.`,
  removed: (b) => `${b} is no longer a small business.`,
};

const small = 'cursor-pointer border-0 bg-transparent p-0 text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink';

/** The brand field for the add form, suggesting the store's brands not marked yet. */
function BrandField({ brands, value }: { brands: string[]; value: string }) {
  const list = 'small-business-brands';
  return (
    <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
      Brand
      <input name="brand" list={list} required maxLength={120} defaultValue={value} autoComplete="off" className={cn(fieldClass, 'sm:max-w-[320px]')} />
      <datalist id={list}>
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <span className="text-[13px] font-normal text-ink-3">As its products name it. Every product from the brand in this store gets the badge.</span>
    </label>
  );
}

/**
 * /admin/small-businesses (and /in/admin/small-businesses): the brands this store marks as small
 * businesses, what each one's products say about it, and adding or removing one.
 */
export default async function AdminSmallBusinessesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/small-businesses');
  if (!admin) return <AdminOnly store={store} />;

  const client = await db();
  const [businesses, brands] = await Promise.all([listSmallBusinesses(client, store.id), storeBrands(client, store.id)]);
  const marked = new Set(businesses.map((b) => b.brand));
  const to = (path: string) => storePath(store, path);

  const brand = one(sp, 'brand');
  const done = one(sp, 'done');
  const error = one(sp, 'error');
  const notice = DONE[done]?.(brand) ?? null;
  const problem = error ? (error === 'invalid_input' && one(sp, 'msg') ? one(sp, 'msg') : messageFor(error) ?? 'Something went wrong. Please try again.') : null;
  // a failed add keeps what was typed
  const adding = error && !marked.has(brand) ? { brand, story: one(sp, 'story') } : { brand: '', story: '' };

  return (
    <AdminFrame
      store={store}
      path="/admin/small-businesses"
      title="Small businesses"
      lede={<>Brands marked as small businesses carry the Small Business badge on their products, can be filtered for in search, and show what they make on their product pages and brand store. Each store keeps its own list.</>}
    >
      {problem ? <Alert tone="error">{problem}</Alert> : notice ? <Alert tone="success">{notice}</Alert> : null}

      <Section title="In this store" note={businesses.length === 1 ? '1 brand' : `${businesses.length} brands`}>
        {businesses.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {businesses.map((b) => (
              <li key={b.brand} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={to(`/stores/${encodeURIComponent(b.brand)}`)} className="text-[16px] font-semibold text-ink underline underline-offset-2">{b.brand}</a>
                  <ConfirmAction
                    action={removeSmallBusinessAction.bind(null, b.brand)}
                    label="Remove"
                    size="link"
                    prompt={<>Stop marking <b className="font-semibold">{b.brand}</b> as a small business?</>}
                    confirmLabel="Remove"
                    pendingLabel="Removing…"
                  />
                </div>
                <form action={updateSmallBusinessAction.bind(null, b.brand)} className="flex flex-col gap-1.5">
                  <textarea
                    name="story"
                    rows={2}
                    required
                    maxLength={SMALL_BUSINESS_STORY_MAX}
                    defaultValue={b.story}
                    aria-label={`What ${b.brand} makes`}
                    className={cn(fieldClass, 'h-auto py-2.5 leading-normal')}
                  />
                  <SubmitButton bare className={cn(small, 'self-start')}>Save</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No small businesses yet.">Add a brand below to give its products the badge.</EmptyState>
        )}
      </Section>

      <Section title="Add a small business">
        <form action={addSmallBusinessAction} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-[18px]">
          <BrandField brands={brands.filter((b) => !marked.has(b))} value={adding.brand} />
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
            What it makes
            <textarea name="story" rows={2} required maxLength={SMALL_BUSINESS_STORY_MAX} defaultValue={adding.story} className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')} />
            <span className="text-[13px] font-normal text-ink-3">One or two sentences, shown with its products (up to {SMALL_BUSINESS_STORY_MAX} characters).</span>
          </label>
          <SubmitButton variant="dark" className="self-start">Add small business</SubmitButton>
        </form>
      </Section>
    </AdminFrame>
  );
}
