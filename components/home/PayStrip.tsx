import { AmazonPayLogo } from '../brand/AmazonPayLogo';

/** Amazon Pay / UPI promo band — an amazon.in home module (recharges, bills, UPI,
 *  balance). Rendered only on the IN storefront; amazon.com has no equivalent.
 *  The header sits on white so the Amazon Pay logo reads seamlessly (matches
 *  amazon.in/amazonpay). */
const TILES = [
  { icon: '📷', label: 'Scan any QR' },
  { icon: '🏦', label: 'UPI payments' },
  { icon: '📱', label: 'Mobile recharge' },
  { icon: '🧾', label: 'Pay bills' },
  { icon: '💳', label: 'Add money' },
  { icon: '🎁', label: 'Gift cards' },
];

export function PayStrip({ href }: { href: string }) {
  return (
    <section className="overflow-hidden rounded-[8px] bg-white shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <div className="flex flex-col gap-4 border-b border-line-3 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <AmazonPayLogo className="h-[26px]" />
          <p className="mt-1.5 text-[13px] text-ink-2">One balance for UPI, recharges, bills &amp; shopping — rewarded every time.</p>
        </div>
        <a href={href} className="w-fit rounded-pill bg-cta-yellow px-6 py-2 text-[13px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">Explore Amazon Pay</a>
      </div>
      <div className="grid grid-cols-3 gap-px bg-line sm:grid-cols-6">
        {TILES.map((t) => (
          <a key={t.label} href={href} className="flex flex-col items-center gap-1 bg-white px-2 py-4 text-center hover:bg-surface-2">
            <span className="text-[24px]" aria-hidden>{t.icon}</span>
            <span className="text-[12px] font-medium text-ink">{t.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
