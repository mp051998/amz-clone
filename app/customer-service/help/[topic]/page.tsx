import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section } from '@/components/brand/Page';
import { Breadcrumbs } from '@/components/commerce/Breadcrumbs';
import { buttonClasses } from '@/components/primitives/Button';
import { helpTopic, helpTopics } from '@/lib/help-topics';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

type Params = Promise<{ topic: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const topic = helpTopic(await getMarketplace(), (await params).topic);
  return { title: `${topic?.title ?? 'Help'} · Help · Store` };
}

/** One of the help page's "Browse help topics": its answers, where to do it, and the other topics. */
export default async function HelpTopicPage({ params }: { params: Params }) {
  const store = await getMarketplace();
  const topic = helpTopic(store, (await params).topic);
  if (!topic) notFound();
  const sp = (p: string) => storePath(store, p);
  const others = helpTopics(store).filter((t) => t.slug !== topic.slug);

  return (
    <AppShell>
      <Page>
        <div className="flex flex-col gap-3">
          <Breadcrumbs trail={[{ label: 'Help', href: sp('/customer-service') }, { label: topic.title }]} />
          <PageHead title={topic.title}>{topic.intro}</PageHead>
        </div>

        <div className="grid items-start gap-11 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
          <Section title="Answers">
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {topic.articles.map((item, i) => (
                <details key={item.q} open={i === 0} className="group border-b border-line-2 last:border-b-0">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex-none text-[14px] text-ink-3 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <p className="m-0 px-[18px] pb-4 text-[14px] leading-relaxed text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </Section>

          <div className="flex flex-col gap-8">
            <Section title="Go to">
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {topic.links.map((l) => (
                  <li key={l.href}>
                    <a href={sp(l.href)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Other help topics">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {others.map((t) => (
                  <li key={t.slug}>
                    <a href={sp(`/customer-service/help/${t.slug}`)} className="inline-flex min-h-8 items-center text-[15px] text-ink underline underline-offset-2 hover:text-accent-ink">{t.title}</a>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>

        <section className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-5 sm:p-7 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">Didn’t find your answer?</h2>
            <p className="m-0 text-[15px] text-ink-2">Tell us what’s wrong and we’ll reply on your case.</p>
          </div>
          <a href={sp('/customer-service/contact')} className={buttonClasses({ variant: 'dark' })}>Contact us</a>
        </section>
      </Page>
    </AppShell>
  );
}
