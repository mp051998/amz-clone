import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { getLegalPage, legalSlugs } from '@/lib/legal';

export function generateStaticParams() {
  return legalSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getLegalPage(slug);
  const store = await getMarketplace();
  const tld = store.id === 'IN' ? 'in' : 'com';
  return { title: page ? `${page.title} | Amazon.${tld}` : `Amazon.${tld}` };
}

export default async function LegalContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) notFound();
  const store = await getMarketplace();

  return (
    <AppShell>
      <div className="mx-auto max-w-[820px] px-4 py-8">
        <nav className="text-[12px] text-ink-2">
          <a href={storePath(store, '/')} className="text-link hover:text-link-hover hover:underline">Amazon</a>
          <span className="mx-1 text-ink-3">›</span>
          <span>{page.title}</span>
        </nav>

        <h1 className="mt-2 text-[28px] font-bold text-ink">{page.title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">Last updated {page.updated}</p>

        <div className="mt-4 rounded-[8px] border border-[#E0C200] bg-[#FEF8E7] p-3 text-[13px] leading-5 text-ink-2">
          Portfolio demo — this is an unofficial Amazon clone. The text below is illustrative, written for the demo only. It is not a legal agreement and is not affiliated with, endorsed by, or connected to Amazon.com, Inc.
        </div>

        <p className="mt-5 text-[14px] leading-6 text-ink">{page.intro}</p>

        {page.sections.map((s) => (
          <section key={s.heading} className="mt-6">
            <h2 className="text-[18px] font-bold text-ink">{s.heading}</h2>
            {s.body.map((para, j) => (
              <p key={j} className="mt-2 text-[14px] leading-6 text-ink">{para}</p>
            ))}
          </section>
        ))}

        <div className="mt-9 border-t border-line pt-4">
          <h2 className="text-[13px] font-bold text-ink-2">More policies</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {legalSlugs
              .filter((sl) => sl !== slug)
              .map((sl) => (
                <li key={sl}>
                  <a href={storePath(store, `/legal/${sl}`)} className="text-link hover:text-link-hover hover:underline">
                    {getLegalPage(sl)!.title}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
