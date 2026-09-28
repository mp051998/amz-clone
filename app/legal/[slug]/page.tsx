import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead, pageXNarrow } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { cn } from '@/components/lib/cn';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { getLegalPage, legalSlugs } from '@/lib/legal';

export function generateStaticParams() {
  return legalSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getLegalPage(slug);
  return { title: page ? `${page.title} · Store` : 'Store' };
}

export default async function LegalContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) notFound();
  const store = await getMarketplace();

  return (
    <AppShell>
      <article className={cn(pageXNarrow, 'flex flex-col gap-6 pb-16 pt-7 sm:pt-10')}>
        <PageHead kicker={`Policies · updated ${page.updated}`} title={page.title} />

        <Alert tone="warning">
          Portfolio demo — this is an unofficial demo store. The text below is illustrative, written for the demo only. It is not a legal
          agreement and is not affiliated with, endorsed by, or connected to Amazon.com, Inc. or any other retailer.
        </Alert>

        <p className="m-0 text-[16px] leading-relaxed text-ink">{page.intro}</p>

        {page.sections.map((s) => (
          <section key={s.heading} className="flex flex-col gap-2">
            <h2 className="m-0 text-[20px] font-semibold leading-tight text-ink">{s.heading}</h2>
            {s.body.map((para, j) => (
              <p key={j} className="m-0 text-[15px] leading-relaxed text-ink-2">{para}</p>
            ))}
          </section>
        ))}

        <nav aria-label="More policies" className="mt-4 flex flex-col gap-3 border-t border-line-2 pt-5">
          <Kicker as="h2">More policies</Kicker>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {legalSlugs
              .filter((sl) => sl !== slug)
              .map((sl) => (
                <li key={sl}>
                  <a
                    href={storePath(store, `/legal/${sl}`)}
                    className="inline-flex min-h-11 items-center rounded-pill border border-line-3 bg-surface px-4 text-[14px] font-medium text-ink no-underline transition-colors hover:border-ink hover:text-ink"
                  >
                    {getLegalPage(sl)!.title}
                  </a>
                </li>
              ))}
          </ul>
        </nav>
      </article>
    </AppShell>
  );
}
