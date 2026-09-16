import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Amazon Gift Cards | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

const DENOMS: Record<'US' | 'IN', number[]> = {
  US: [25, 50, 100, 150, 250],
  IN: [100, 250, 500, 1000, 5000],
};

const FORMATS = [
  { icon: '✉️', title: 'eGift Card', desc: 'Delivered by email in minutes — perfect for last-minute gifting.' },
  { icon: '🖨️', title: 'Print at Home', desc: 'Personalise, print, and hand it over yourself.' },
  { icon: '📦', title: 'Gift Box', desc: 'A physical card in a keepsake box, shipped to their door.' },
  { icon: '🏢', title: 'Corporate Gifting', desc: 'Reward employees and clients at scale with bulk gift cards.' },
];

export default async function GiftCardsPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;
  const denoms = DENOMS[isIN ? 'IN' : 'US'];
  const occasions = isIN
    ? ['Birthday', 'Diwali', 'Rakhi', 'Wedding', 'Thank You', 'Congrats']
    : ['Birthday', 'Thank You', 'Congratulations', 'Holiday', 'Wedding', 'Just Because'];

  return (
    <AppShell>
      {/* hero */}
      <section className="bg-gradient-to-br from-[#232F3E] to-[#37475A] text-white">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-12 md:grid-cols-[1fr_360px]">
          <div className="flex flex-col justify-center">
            <h1 className="text-[34px] font-bold leading-tight">Amazon Gift Cards</h1>
            <p className="mt-2 max-w-[520px] text-[15px] text-line-2">
              The gift they always wanted — however they shop. No fees, and it never expires.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="#denoms" className="rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">Shop gift cards</a>
              <a href="#redeem" className="rounded-pill border border-white/60 px-6 py-2.5 text-[14px] font-bold text-white hover:bg-white/10">Redeem a card</a>
            </div>
          </div>
          {/* stylised card */}
          <div className="mx-auto w-full max-w-[360px]">
            <div className="rounded-[14px] bg-gradient-to-br from-[#FF9900] to-[#e77600] p-6 text-ink shadow-lg">
              <div className="flex items-end gap-1 text-[22px] font-bold leading-none text-ink">
                <span>amazon</span><span className="text-white">.{isIN ? 'in' : 'com'}</span>
              </div>
              <div className="mt-8 text-[13px] font-bold uppercase tracking-wide text-ink/70">Gift Card</div>
              <div className="mt-1 text-[30px] font-bold text-ink">{sym}{isIN ? '1,000' : '100'}.00</div>
            </div>
          </div>
        </div>
      </section>

      {/* denominations */}
      <section id="denoms" className="mx-auto max-w-[1200px] px-4 py-10">
        <h2 className="text-[22px] font-bold text-ink">Choose an amount</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {denoms.map((d) => (
            <a
              key={d}
              href={storePath(store, '/signin?new=1')}
              className="flex flex-col items-center justify-center rounded-[8px] border border-line bg-white py-6 text-ink hover:border-ink hover:shadow-[0_1px_2px_rgba(15,17,17,0.15)]"
            >
              <span className="text-[24px] font-bold">{sym}{d.toLocaleString(isIN ? 'en-IN' : 'en-US')}</span>
              <span className="mt-1 text-[12px] text-link-teal">Buy now</span>
            </a>
          ))}
          <a href={storePath(store, '/signin?new=1')} className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-line bg-surface-3 py-6 text-ink hover:border-ink">
            <span className="text-[16px] font-bold">Custom</span>
            <span className="mt-1 text-[12px] text-ink-3">Enter any amount</span>
          </a>
        </div>
      </section>

      {/* formats */}
      <section className="bg-surface-band">
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <h2 className="text-[22px] font-bold text-ink">Pick how you send it</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((f) => (
              <div key={f.title} className="rounded-[8px] border border-line bg-white p-5">
                <div className="text-[28px]" aria-hidden>{f.icon}</div>
                <h3 className="mt-2 text-[15px] font-bold text-ink">{f.title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-ink-2">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* occasions */}
      <section className="mx-auto max-w-[1200px] px-4 py-10">
        <h2 className="text-[22px] font-bold text-ink">Shop by occasion</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {occasions.map((o) => (
            <a key={o} href={storePath(store, '/signin?new=1')} className="rounded-pill border border-line bg-white px-4 py-2 text-[13px] text-ink hover:bg-surface-2">{o}</a>
          ))}
        </div>
      </section>

      {/* redeem + reload */}
      <section id="redeem" className="bg-surface-band">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 md:grid-cols-2">
          <div className="rounded-[8px] border border-line bg-white p-6">
            <h2 className="text-[18px] font-bold text-ink">Redeem a gift card</h2>
            <p className="mt-1 text-[13px] text-ink-2">Enter your claim code to add funds to your balance.</p>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Gift card claim code"
                placeholder="XXXX-XXXXXX-XXXX"
                className="h-[38px] flex-1 rounded-[4px] border border-[#A6A6A6] px-3 text-[14px] text-ink shadow-input outline-none focus:border-[#E77600] focus:ring-[3px] focus:ring-[rgb(228_121_17_/_0.5)]"
              />
              <a href={storePath(store, '/signin')} className="flex items-center rounded-pill bg-cta-yellow px-5 text-[13px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">Apply</a>
            </div>
          </div>
          <div className="rounded-[8px] border border-line bg-white p-6">
            <h2 className="text-[18px] font-bold text-ink">Reload your balance</h2>
            <p className="mt-1 text-[13px] text-ink-2">Top up your Amazon Pay balance and shop without re-entering card details.</p>
            <a href={storePath(store, '/amazon-pay')} className="mt-3 inline-block rounded-pill border border-line bg-surface-3 px-5 py-2 text-[13px] font-bold text-ink hover:bg-surface-2">Reload now</a>
          </div>
        </div>
      </section>

      <p className="mx-auto max-w-[1200px] px-4 py-6 text-center text-[12px] text-ink-4">
        Demo experience — gift cards are illustrative and no real payment is processed.
      </p>
    </AppShell>
  );
}
