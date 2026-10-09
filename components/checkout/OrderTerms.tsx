/**
 * The line under "Place your order", as Amazon words it: placing it agrees to the store's privacy
 * notice and conditions of use (each linked), then how this demo charges. `href` puts a path in
 * the current store.
 */
export function OrderTerms({ href, stripe, currency }: { href: (path: string) => string; stripe: boolean; currency: string }) {
  const link = 'text-ink underline underline-offset-2 hover:text-accent-ink';
  return (
    <span className="text-[13px] leading-[1.4] text-ink-2">
      By placing your order, you agree to the store’s{' '}
      <a href={href('/legal/privacy-notice')} className={link}>privacy notice</a> and{' '}
      <a href={href('/legal/conditions-of-use')} className={link}>conditions of use</a>.{' '}
      {stripe ? `Cards are paid on Stripe in ${currency} (test card 4242 4242 4242 4242); other methods are demo only.` : 'No real charge is made.'}
    </span>
  );
}
