import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { PublicMarketplace } from '@/lib/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Gift Registry & Wishlist | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

/** A registry / gift-list type shown in the picker grid. */
interface RegistryType {
  emoji: string;
  title: string;
  desc: string;
  /** soft CSS gradient for the card's header strip (no external images). */
  tint: string;
}

/** Per-store registry & gift-list types. US has a rich registry culture; IN leans on
 *  the Wish List and gifting for Indian occasions (design brief — Content). */
function registryTypes(isIN: boolean): RegistryType[] {
  if (isIN) {
    return [
      { emoji: '💝', title: 'Your Wish List', desc: 'Save everything you love in one place and share it with family.', tint: 'linear-gradient(135deg,#fde3ec,#f7b8d0)' },
      { emoji: '🎂', title: 'Birthday Gifts', desc: 'Drop hints for the big day and let everyone shop your picks.', tint: 'linear-gradient(135deg,#fff0d6,#ffd58a)' },
      { emoji: '💍', title: 'Wedding Gifting', desc: 'Curate a shagun-friendly list for the couple’s new home.', tint: 'linear-gradient(135deg,#e7f0ff,#b9d4ff)' },
      { emoji: '👶', title: 'Baby Needs', desc: 'Line up everyday essentials for the newest arrival.', tint: 'linear-gradient(135deg,#e6f7f0,#b7e6cf)' },
      { emoji: '🪔', title: 'Festive Gifting', desc: 'Diwali, Rakhi & more — ready-made lists for every celebration.', tint: 'linear-gradient(135deg,#ffe9dd,#ffc59e)' },
      { emoji: '🎁', title: 'Custom Gift List', desc: 'Mix and match items from across the store into one list.', tint: 'linear-gradient(135deg,#efeaff,#cfc2f5)' },
    ];
  }
  return [
    { emoji: '👶', title: 'Baby Registry', desc: 'From the crib to the car seat — everything for your little one.', tint: 'linear-gradient(135deg,#e6f7f0,#b7e6cf)' },
    { emoji: '💍', title: 'Wedding Registry', desc: 'Build the home you’ll share, one thoughtful gift at a time.', tint: 'linear-gradient(135deg,#e7f0ff,#b9d4ff)' },
    { emoji: '🎂', title: 'Birthday Gift List', desc: 'Make the wishing easy — share exactly what you’d love.', tint: 'linear-gradient(135deg,#fff0d6,#ffd58a)' },
    { emoji: '💝', title: 'Wish List', desc: 'Bookmark anything, anytime, and come back to it later.', tint: 'linear-gradient(135deg,#fde3ec,#f7b8d0)' },
    { emoji: '🎁', title: 'Custom Gift List', desc: 'Any occasion, any theme — a list that’s all your own.', tint: 'linear-gradient(135deg,#efeaff,#cfc2f5)' },
    { emoji: '🍎', title: 'Teacher List', desc: 'Help a classroom get the supplies it needs for the year.', tint: 'linear-gradient(135deg,#eaf6e6,#c3e6b7)' },
  ];
}

/** Benefits band content — store-aware (completion discount is a US registry perk). */
function benefits(store: PublicMarketplace, isIN: boolean): { emoji: string; title: string; desc: string }[] {
  const sym = store.currency.symbol;
  return [
    { emoji: '🤝', title: 'Group gifting', desc: `Friends and family can chip in together — contributions from as little as ${sym}5 toward the big-ticket picks.` },
    isIN
      ? { emoji: '↩️', title: 'Easy returns', desc: 'Gifts arrive not-quite-right? Returns are simple, so every present finds its perfect fit.' }
      : { emoji: '🏷️', title: 'Completion discount', desc: 'Once your event nears, save on everything left on your registry with a members’ completion discount.' },
    { emoji: '🔒', title: 'Private by default', desc: 'You decide who sees your list. Share a link with the people you choose — no one else.' },
    { emoji: '📦', title: 'One list, everything', desc: `Add anything across Amazon.${isIN ? 'in' : 'com'} to a single list, from tiny treats to the wishlist headliner.` },
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
    { n: 1, emoji: '✍️', title: 'Create your list', desc: `Pick a registry or gift list, give it a name, and set your event date on Amazon.${isIN ? 'in' : 'com'}.` },
    { n: 2, emoji: '🛒', title: 'Add items from anywhere', desc: 'Browse the whole store and add anything you love — as many items, from as many categories, as you like.' },
    { n: 3, emoji: '📣', title: 'Share with friends & family', desc: 'Send your list to the people who matter. They shop, you get exactly what you wanted.' },
  ];

  return (
    <AppShell>
      <div className="bg-surface-band pb-12">
        {/* 1 — Hero + search */}
        <section className="bg-nav-main text-white">
          <div
            className="w-full"
            style={{ background: isIN
              ? 'linear-gradient(120deg,rgba(35,47,62,0)0%,rgba(255,153,0,0.18)55%,rgba(255,153,0,0.30)100%)'
              : 'linear-gradient(120deg,rgba(35,47,62,0)0%,rgba(0,168,225,0.16)55%,rgba(255,153,0,0.22)100%)' }}
          >
            <div className="mx-auto max-w-[1100px] px-4 py-12 text-center sm:py-16">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand-orange">Gift Registry &amp; Wish List</p>
              <h1 className="mx-auto mt-2 max-w-[720px] text-[30px] font-bold leading-tight sm:text-[40px]">Find a registry or gift list</h1>
              <p className="mx-auto mt-3 max-w-[560px] text-[15px] text-white/80">
                {isIN
                  ? 'Search for someone’s wish list, or start your own for birthdays, weddings, baby and every festive occasion.'
                  : 'Search for a friend’s registry by name, or create your own for weddings, babies, birthdays and beyond.'}
              </p>

              {/* search-by-name row — real GET form to the store search page */}
              <form action={sp('/s')} className="mx-auto mt-6 flex max-w-[620px] flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  name="k"
                  placeholder={isIN ? 'Search by name, e.g. “Priya Sharma”' : 'Search by first or last name'}
                  aria-label="Search by name"
                  className="h-11 flex-1 rounded-pill border border-line bg-white px-5 text-[14px] text-ink shadow-input outline-none placeholder:text-ink-3 focus:border-brand-orange"
                />
                <button
                  type="submit"
                  className="h-11 rounded-pill bg-cta-yellow px-7 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
                >
                  Find a list
                </button>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <a href={createHref} className="rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
                  Get started
                </a>
                <a href={sp('/deals')} className="rounded-pill border border-line bg-white px-6 py-2.5 text-[14px] font-bold text-ink hover:bg-surface-2">
                  Shop gifts
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 2 — Registry-type cards */}
        <section className="mx-auto max-w-[1500px] px-4 pt-10">
          <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-[22px] font-bold text-ink">Start a registry or gift list</h2>
            <span className="text-[13px] text-ink-2">{isIN ? 'Gifting made easy for every Indian occasion' : 'A list for every milestone'}</span>
          </div>
          <p className="mb-5 max-w-[720px] text-[14px] text-ink-2">
            Pick the kind of list that fits the moment. Every list lives in your account and can be shared in a single tap.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((t) => (
              <div key={t.title} className="flex flex-col overflow-hidden rounded-[8px] border border-line bg-white transition hover:shadow-dropdown">
                <div className="flex h-[74px] items-center px-5" style={{ background: t.tint }}>
                  <span className="text-[34px] leading-none" aria-hidden>{t.emoji}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-[16px] font-bold text-ink">{t.title}</h3>
                  <p className="mt-1 flex-1 text-[13px] leading-5 text-ink-2">{t.desc}</p>
                  <a href={createHref} className="mt-3 inline-flex w-fit items-center gap-1 text-[13px] font-bold text-link-teal hover:text-brand-count hover:underline">
                    Create {t.title.toLowerCase().startsWith('your') ? t.title.slice(5).toLowerCase() : 'this list'} <span aria-hidden>›</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3 — How a registry works */}
        <section className="mx-auto mt-12 max-w-[1500px] px-4">
          <div className="rounded-[8px] border border-line bg-white p-6 sm:p-8">
            <h2 className="text-center text-[22px] font-bold text-ink">How a registry works</h2>
            <p className="mx-auto mt-1 max-w-[520px] text-center text-[14px] text-ink-2">Three simple steps from empty list to gifts at your door.</p>
            <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.n} className="relative flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-pill bg-surface-2 text-[26px]" aria-hidden>{s.emoji}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-nav-main text-[12px] font-bold text-white">{s.n}</span>
                    <h3 className="text-[15px] font-bold text-ink">{s.title}</h3>
                  </div>
                  <p className="mt-2 max-w-[280px] text-[13px] leading-5 text-ink-2">{s.desc}</p>
                  {i < steps.length - 1 ? (
                    <span className="pointer-events-none absolute right-[-14px] top-6 hidden text-[22px] text-ink-3 sm:block" aria-hidden>→</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 — Benefits band */}
        <section className="mx-auto mt-12 max-w-[1500px] px-4">
          <div
            className="rounded-[8px] border border-line p-6 sm:p-8"
            style={{ background: 'linear-gradient(135deg,#f7fafa,#eef4f4)' }}
          >
            <h2 className="text-[22px] font-bold text-ink">Why register with Amazon</h2>
            <p className="mt-1 text-[14px] text-ink-2">Perks that make giving — and getting — easier.</p>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {perks.map((b) => (
                <div key={b.title} className="rounded-[8px] border border-line bg-white p-5">
                  <div className="text-[28px] leading-none" aria-hidden>{b.emoji}</div>
                  <h3 className="mt-3 text-[15px] font-bold text-ink">{b.title}</h3>
                  <p className="mt-1 text-[13px] leading-5 text-ink-2">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5 — Closing CTA */}
        <section className="mx-auto mt-12 max-w-[1500px] px-4">
          <div className="overflow-hidden rounded-[8px] bg-nav-main text-white">
            <div
              className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:px-10"
              style={{ background: 'linear-gradient(120deg,rgba(35,47,62,0)0%,rgba(255,153,0,0.20)100%)' }}
            >
              <h2 className="max-w-[640px] text-[26px] font-bold leading-tight sm:text-[30px]">Create your registry</h2>
              <p className="max-w-[560px] text-[15px] text-white/80">
                {isIN
                  ? 'Start a wish list in minutes, add gifts from across the store, and share it with everyone you love.'
                  : 'It takes a minute to set up, it’s free, and it’s the easiest way to get exactly what you want.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a href={createHref} className="rounded-pill bg-cta-yellow px-7 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
                  Create a registry
                </a>
                <a href={sp('/deals')} className="rounded-pill border border-line bg-white px-7 py-2.5 text-[14px] font-bold text-ink hover:bg-surface-2">
                  Shop gifts
                </a>
              </div>
              <p className="mt-1 text-[12px] text-white/50">Unofficial clone of Amazon.{isIN ? 'in' : 'com'} — not affiliated with Amazon.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
