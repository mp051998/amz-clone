import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, TextLink, DemoNote, cardGrid } from '@/components/brand/Page';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Registry & gift lists · Store' };

interface RegistryType {
  title: string;
  desc: string;
}

/** Per-store registry & gift-list types. US has a registry culture; IN leans on wish lists and festive gifting. */
function registryTypes(isIN: boolean): RegistryType[] {
  if (isIN) {
    return [
      { title: 'Wish list', desc: 'Save everything you love in one place and share it with family.' },
      { title: 'Birthday gifts', desc: 'Drop hints for the big day and let everyone shop your picks.' },
      { title: 'Wedding gifting', desc: 'Curate a shagun-friendly list for the couple’s new home.' },
      { title: 'Baby needs', desc: 'Line up everyday essentials for the newest arrival.' },
      { title: 'Festive gifting', desc: 'Diwali, Rakhi and more — one list for each celebration.' },
      { title: 'Custom gift list', desc: 'Mix and match items from across the store into one list.' },
    ];
  }
  return [
    { title: 'Baby registry', desc: 'From the crib to the car seat — everything for your little one.' },
    { title: 'Wedding registry', desc: 'Build the home you’ll share, one thoughtful gift at a time.' },
    { title: 'Birthday gift list', desc: 'Make the wishing easy — share exactly what you’d love.' },
    { title: 'Wish list', desc: 'Bookmark anything, anytime, and come back to it later.' },
    { title: 'Custom gift list', desc: 'Any occasion, any theme — a list that’s all your own.' },
    { title: 'Teacher list', desc: 'Help a classroom get the supplies it needs for the year.' },
  ];
}

/** What a list here actually does (lib/data/collections.ts, /lists/<token>). */
const PERKS: RegistryType[] = [
  { title: 'Private by default', desc: 'Nobody can find your list. Only people you send the link to can open it, and you can turn the link off any time.' },
  { title: 'Easy for them', desc: 'People open your link without an account and add gifts straight to their own cart.' },
  { title: 'One list, everything', desc: 'Add anything in the store to a single list, from small treats to the headline gift.' },
  { title: 'Prices tracked', desc: 'You see what’s cheaper than when you saved it. Your note and those prices stay private.' },
];

export default async function RegistryPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (path: string) => storePath(store, path);
  const types = registryTypes(isIN);
  const createHref = (await readUser()) ? sp('/collections') : sp(`/signin?new=1&next=${encodeURIComponent('/collections')}`);

  const steps = [
    { title: 'Make a list', desc: 'In Collections, start a list and name it for the occasion.' },
    { title: 'Add anything', desc: 'Use Add to List on any product page and pick your list. Add as much as you like.' },
    { title: 'Share the link', desc: 'Turn on sharing and send the link. People open it and add gifts to their own cart.' },
  ];

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Registry & gift lists" title="Make a registry or gift list">
          {isIN
            ? 'Start a wish list for birthdays, weddings, babies and every festive occasion, then share it with the people you choose.'
            : 'Make a registry for weddings, babies, birthdays and beyond, then share it with the people you choose.'}
        </PageHead>
        <div className="flex flex-wrap gap-2.5">
          <a href={createHref} className={buttonClasses({ variant: 'dark' })}>Start a list</a>
          <a href={sp('/deals')} className={buttonClasses({ variant: 'secondary' })}>Shop gifts</a>
        </div>

        <Section title="Start a registry or gift list" note={isIN ? 'Gifting for every occasion' : 'A list for every milestone'}>
          <div className={cardGrid}>
            {types.map((t) => (
              <InfoCard key={t.title} title={t.title} footer={<TextLink href={createHref}>Create {t.title.toLowerCase()}</TextLink>}>
                {t.desc}
              </InfoCard>
            ))}
          </div>
        </Section>

        <Section title="How it works">
          <div className="grid gap-3.5 sm:grid-cols-3">
            {steps.map((s, i) => (<InfoCard key={s.title} index={`Step ${i + 1}`} title={s.title}>{s.desc}</InfoCard>))}
          </div>
        </Section>

        <Section title="Why keep your list here">
          <div className={cardGrid}>
            {PERKS.map((b) => (<InfoCard key={b.title} title={b.title}>{b.desc}</InfoCard>))}
          </div>
        </Section>

        <section className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex max-w-[620px] flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">Create your registry</h2>
            <p className="m-0 text-[15px] text-ink-2">
              {isIN
                ? 'Start a wish list in minutes, add gifts from across the store, and share it with everyone you love.'
                : 'It takes a minute, it’s free, and it’s the easiest way to get what you actually want.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={createHref} className={buttonClasses({ variant: 'dark' })}>Create a registry</a>
            <a href={sp('/deals')} className={buttonClasses({ variant: 'secondary' })}>Shop gifts</a>
          </div>
        </section>

        <DemoNote>Demo store — lists are shared by link only. There’s no searching for other people’s lists, and nothing is marked as bought when someone shops from yours.</DemoNote>
      </Page>
    </AppShell>
  );
}
