import type { Product, Category } from '@/lib/types';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { Page, PageHead, Section, cardGrid } from '../brand/Page';
import { Pill } from '../decision/Pill';
import { EmptyState } from '../decision/Badges';
import { buttonClasses } from '../primitives/Button';
import { RankCard } from './RankCard';

export interface RankedPageProps {
  store: Store;
  /** route this page lives at, e.g. '/bestsellers' (store-prefixed here). */
  basePath: string;
  kicker: string;
  title: string;
  lede: string;
  categories: Category[];
  /** active category slug, if any. */
  active?: string;
  items: Product[];
  saved: Set<string>;
  /** show "#N" ranks (bestsellers) or a mono tag (new releases). */
  ranked: boolean;
  tag?: string;
}

/** The store's charts, linked from each one as Amazon's tabs are. */
export const CHARTS = [
  { path: '/bestsellers', label: 'Bestsellers' },
  { path: '/new-releases', label: 'New & trending' },
  { path: '/most-wished-for', label: 'Most wished for' },
  { path: '/gift-ideas', label: 'Gift ideas' },
] as const;

/** Shared layout for the charts (Bestsellers, New & trending, Most wished for, Gift ideas): kicker + title, chart tabs, department pills, card grid. */
export function RankedPage({ store, basePath, kicker, title, lede, categories, active, items, saved, ranked, tag }: RankedPageProps) {
  const activeName = active ? categories.find((x) => x.slug === active)?.name ?? active : undefined;
  return (
    <Page>
      <PageHead kicker={kicker} title={activeName ? `${title} in ${activeName}` : title}>{lede}</PageHead>

      <Section>
        <nav aria-label="Charts" className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line text-[15px]">
          {CHARTS.map((chart) => (
            <a
              key={chart.path}
              href={storePath(store, active ? `${chart.path}?c=${active}` : chart.path)}
              aria-current={chart.path === basePath ? 'page' : undefined}
              className={
                chart.path === basePath
                  ? '-mb-px border-b-2 border-ink pb-2 font-semibold text-ink no-underline'
                  : '-mb-px border-b-2 border-transparent pb-2 text-ink-2 no-underline hover:text-ink'
              }
            >
              {chart.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Departments" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
          <Pill href={storePath(store, basePath)} selected={!active}>All departments</Pill>
          {categories.map((cat) => (
            <Pill key={cat.slug} href={storePath(store, `${basePath}?c=${cat.slug}`)} selected={active === cat.slug}>{cat.name}</Pill>
          ))}
        </nav>
        <p className="m-0 text-[14px] text-ink-3">
          {activeName ?? 'All departments'} · <span className="tabular-nums">{items.length}</span> {items.length === 1 ? 'product' : 'products'}
        </p>

        {items.length ? (
          <ol className={`${cardGrid} m-0 list-none p-0`}>
            {items.map((p, i) => (
              <li key={p.id} className="flex">
                <div className="flex w-full flex-col [&>article]:flex-1">
                  <RankCard product={p} store={store} rank={ranked ? i + 1 : undefined} tag={ranked ? undefined : tag} saved={saved.has(p.id)} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title={`Nothing here yet${activeName ? ` in ${activeName}` : ''}`}
            action={<a href={storePath(store, basePath)} className={buttonClasses({ variant: 'secondary' })}>See all departments</a>}
          >
            Try another department — the list updates as people shop.
          </EmptyState>
        )}
      </Section>
    </Page>
  );
}
