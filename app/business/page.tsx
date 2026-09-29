import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, DemoNote, cardGrid } from '@/components/brand/Page';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Business accounts · Store' };

function benefits(isIN: boolean) {
  return [
    { title: 'Business pricing', desc: 'Discounts and quantity breaks on eligible items across the catalogue.' },
    { title: 'Multi-user accounts', desc: 'Add your team, set approval workflows, and share payment methods.' },
    { title: isIN ? 'GST-ready invoices' : 'Tax-ready invoices', desc: 'Downloadable invoices on every order for painless reconciliation.' },
    { title: 'Spend analytics', desc: 'See who bought what, track budgets, and export reports in a click.' },
    { title: 'Free delivery', desc: 'Free delivery on qualifying business orders, with scheduled options.' },
    { title: 'Guided buying', desc: 'Steer purchases to preferred products and stay within policy.' },
  ];
}

const STEPS = [
  { title: 'Create a free account', desc: 'Sign up with your work email in a couple of minutes.' },
  { title: 'Add your team', desc: 'Invite buyers and set up approval rules that fit how you work.' },
  { title: 'Buy with your priorities', desc: 'Rank products by what your team needs, and keep every invoice in one place.' },
];

export default async function BusinessPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (p: string) => storePath(store, p);

  return (
    <AppShell>
      <Page>
        <PageHead
          kicker="Business accounts"
          title="Everything your business buys, in one account"
          actions={
            <>
              <a href={sp('/signin?new=1')} className={buttonClasses({ variant: 'primary', size: 'lg' })}>Create a free account</a>
              <a href="#how" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>How it works</a>
            </>
          }
        >
          Business pricing, multi-user accounts and tax-ready invoicing on the same catalogue.{' '}
          Selling instead? <a href={sp('/sell')} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">Sell with us</a>.
        </PageHead>

        <Section title="Why a business account">
          <div className={cardGrid}>
            {benefits(isIN).map((b) => (<InfoCard key={b.title} title={b.title}>{b.desc}</InfoCard>))}
          </div>
        </Section>

        <Section id="how" title="Get started in three steps">
          <div className="grid gap-3.5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <InfoCard key={s.title} index={`Step ${i + 1}`} title={s.title}>{s.desc}</InfoCard>
            ))}
          </div>
          <div>
            <a href={sp('/signin?new=1')} className={buttonClasses({ variant: 'dark' })}>Create a free account</a>
          </div>
        </Section>

        <DemoNote>Demo store — business features are illustrative and no real business account is created.</DemoNote>
      </Page>
    </AppShell>
  );
}
