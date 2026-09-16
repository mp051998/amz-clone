import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Amazon Pay | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

interface Tile { icon: string; title: string; desc: string }

const IN_SERVICES: Tile[] = [
  { icon: '📲', title: 'UPI payments', desc: 'Pay any UPI ID, scan any QR, and send money to friends — right from your Amazon app.' },
  { icon: '📱', title: 'Mobile & DTH recharge', desc: 'Prepaid, postpaid, and DTH recharges for every operator in seconds.' },
  { icon: '💡', title: 'Bill payments', desc: 'Electricity, water, gas, broadband, and credit-card bills — all in one place.' },
  { icon: '👛', title: 'Amazon Pay Balance', desc: 'A single wallet for shopping, bills, and refunds — money back in an instant.' },
  { icon: '⏱️', title: 'Amazon Pay Later', desc: 'Buy now, pay next month or in easy EMIs with instant activation.' },
  { icon: '✈️', title: 'Travel & tickets', desc: 'Book flights, buses, and more, and earn rewards on every trip.' },
];

const US_SERVICES: Tile[] = [
  { icon: '⚡', title: 'Faster checkout', desc: 'Use the addresses and payment methods already in your Amazon account on thousands of sites and apps.' },
  { icon: '🔒', title: 'Trusted & secure', desc: 'Your card details stay with Amazon — merchants never see them.' },
  { icon: '🛡️', title: 'A-to-z Guarantee', desc: 'Eligible purchases on participating merchants are backed by Amazon protection.' },
  { icon: '🎁', title: 'Amazon Pay balance', desc: 'Reload your balance and shop with gift-card funds across Amazon.' },
  { icon: '💠', title: 'Shop with Points', desc: 'Redeem eligible rewards points toward your order at checkout.' },
  { icon: '📊', title: 'One place to manage', desc: 'See every Amazon Pay transaction and manage payment methods in your account.' },
];

export default async function AmazonPayPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const services = isIN ? IN_SERVICES : US_SERVICES;

  return (
    <AppShell>
      {/* hero */}
      <section className="bg-gradient-to-br from-[#232F3E] via-[#232F3E] to-[#146EB4] text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-14">
          <div className="flex items-end gap-1 text-[30px] font-bold leading-none">
            <span>amazon</span><span className="text-brand-search">pay</span>
          </div>
          <h1 className="max-w-[640px] text-[34px] font-bold leading-tight">
            {isIN ? 'UPI, bills, recharges & more — one app for it all' : 'Checkout faster, everywhere you shop'}
          </h1>
          <p className="max-w-[600px] text-[15px] text-line-2">
            {isIN
              ? 'Send money over UPI, pay your bills, recharge in seconds, and earn rewards — all with your Amazon account.'
              : 'Use the payment methods and addresses already in your Amazon account to breeze through checkout on thousands of sites and apps.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a href={storePath(store, '/signin?new=1')} className="rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
              {isIN ? 'Get started' : 'Set up Amazon Pay'}
            </a>
            <a href={storePath(store, '/deals')} className="rounded-pill border border-white/60 px-6 py-2.5 text-[14px] font-bold text-white hover:bg-white/10">
              Shop deals
            </a>
          </div>
        </div>
      </section>

      {/* services */}
      <section className="mx-auto max-w-[1200px] px-4 py-10">
        <h2 className="text-[22px] font-bold text-ink">{isIN ? 'Everything you can do with Amazon Pay' : 'Why use Amazon Pay'}</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.title} className="rounded-[8px] border border-line bg-white p-5 hover:shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
              <div className="text-[28px]" aria-hidden>{s.icon}</div>
              <h3 className="mt-2 text-[16px] font-bold text-ink">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* rewards / cashback band */}
      <section className="bg-surface-band">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-[22px] font-bold text-ink">
              {isIN ? 'Earn cashback on every payment' : 'Earn rewards with the Amazon Pay card'}
            </h2>
            <p className="mt-2 max-w-[560px] text-[14px] leading-6 text-ink-2">
              {isIN
                ? 'Get Amazon Pay Balance cashback on recharges, bill payments, and shopping. Pair it with the Amazon Pay ICICI Bank credit card for up to 5% back for Prime members.'
                : 'Prime members earn 5% back with the Amazon Visa card at Amazon and Whole Foods Market, plus rewards everywhere Visa is accepted — with no annual fee.'}
            </p>
            <a href={storePath(store, '/signin?new=1')} className="mt-4 inline-block rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
              {isIN ? 'Activate Amazon Pay' : 'Learn about the card'}
            </a>
          </div>
          <div className="flex items-center justify-center rounded-[12px] bg-gradient-to-br from-[#37475A] to-[#146EB4] p-8 text-white">
            <div className="text-center">
              <div className="text-[40px] font-bold leading-none">{isIN ? 'up to 5%' : '5%'}</div>
              <div className="mt-1 text-[14px] text-line-2">{isIN ? 'cashback for Prime members' : 'back for Prime members'}</div>
            </div>
          </div>
        </div>
      </section>

      <p className="mx-auto max-w-[1200px] px-4 py-6 text-center text-[12px] text-ink-4">
        Demo experience — Amazon Pay services are illustrative and no real payment is processed.
      </p>
    </AppShell>
  );
}
