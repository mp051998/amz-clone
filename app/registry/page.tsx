import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, TextLink, DemoNote, cardGrid } from '@/components/brand/Page';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { PublicMarketplace } from '@/lib/contracts';

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
      { title: 'Festive gifting', desc: 'Diwali, Rakhi and more — ready-made lists for every celebration.' },
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

/** Benefits — store-aware (the completion discount is a US registry perk). */
function benefits(store: PublicMarketplace, isIN: boolean): RegistryType[] {
  const sym = store.currency.symbol;
  return [
    { title: 'Group gifting', desc: `Friends and family can chip in together — from as little as ${sym}5 toward the big-ticket picks.` },
    isIN
      ? { title: 'Easy returns', desc: 'Gift not quite right? Returns are simple, so every present finds its fit.' }
      : { title: 'Completion discount', desc: 'As your event nears, save on everything still left on your registry.' },
    { title: 'Private by default', desc: 'You decide who sees your list. Share a link with the people you choose — no one else.' },
    { title: 'One list, everything', desc: 'Add anything in the store to a single list, from small treats to the headline gift.' },
  ];
}

export default async function RegistryPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (path: string) => storePath(store, path);
  const types = registryTypes(isIN);
  const perks = benefits(store, isIN);
  const createHref = sp('/signin?new=1');

  const steps = [
    { title: 'Create your list', desc: 'Pick a registry or gift list, give it a name, and set your event date.' },
    { title: 'Add items from anywhere', desc: 'Save anything in the store — as many items, from as many departments, as you like.' },
    { title: 'Share it', desc: 'Send the link to the people who matter. They shop, you get what you actually wanted.' },
  ];

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Registry & gift lists" title="Find a registry or gift list">
          {isIN
            ? 'Search for someone’s wish list, or start your own for birthdays, weddings, babies and every festive occasion.'
            : 'Search for a friend’s registry by name, or create your own for weddings, babies, birthdays and beyond.'}
        </PageHead>

        {/* search-by-name — real GET form to the store search page */}
        <form action={sp('/s')} role="search" className="flex max-w-[680px] flex-col gap-2 rounded-panel border-[1.5px] border-ink bg-surface p-2 shadow-hero focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink sm:flex-row sm:items-center">
          <label htmlFor="registry-name" className="sr-only">Search by name</label>
          <input
            id="registry-name"
            type="text"
            name="k"
            placeholder={isIN ? 'Search by name, e.g. “Priya Sharma”' : 'Search by first or last name'}
            className="h-11 min-w-0 flex-1 rounded-input bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-ink-4"
          />
          <button type="submit" className={buttonClasses({ variant: 'primary' })}>Find a list</button>
        </form>

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
            {perks.map((b) => (<InfoCard key={b.title} title={b.title}>{b.desc}</InfoCard>))}
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

        <DemoNote>Demo store — registries are illustrative; searching looks through the product catalogue, not real people’s lists.</DemoNote>
      </Page>
    </AppShell>
  );
}
