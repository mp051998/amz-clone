import type { PublicMarketplace } from './contracts';
import { formatMoney } from './marketplaces';

export interface HelpArticle { q: string; a: string }
export interface HelpTopic {
  slug: string;
  title: string;
  /** one line under the title */
  intro: string;
  articles: HelpArticle[];
  /** where to do it ("Your orders"), store-relative */
  links: { label: string; href: string }[];
}

type HelpStore = Pick<PublicMarketplace, 'id' | 'currency' | 'delivery' | 'returns'>;

/** The topics' slugs, the same in both stores (their pages are in the sitemap). */
export const HELP_TOPIC_SLUGS = ['ordering', 'shipping-delivery', 'returns-refunds', 'account', 'payments', 'plus', 'safety-recalls'] as const;

/** The help page's "Browse help topics", each with its own page of answers (per store where the flow differs). */
export function helpTopics(store: HelpStore): HelpTopic[] {
  const isIN = store.id === 'IN';
  const free = formatMoney(store.delivery.freeThresholdMinor, store.currency.code);
  return [
    {
      slug: 'ordering',
      title: 'Ordering',
      intro: 'Placing, changing and cancelling orders.',
      articles: [
        { q: 'How do I place an order?', a: 'Add items to your cart and choose “Proceed to checkout”. Pick a delivery address and a payment method, review the order, then place it.' },
        { q: 'Can I cancel an order?', a: 'Open Orders and choose the order. Until it ships you can cancel it, or just some of its items; once it has shipped, request a cancellation or return it after delivery.' },
        { q: 'Can I change the delivery address?', a: 'Before the order ships, open it from Orders and choose “Change delivery address” to send it to another of your saved addresses.' },
        { q: 'How do I send an order as a gift?', a: 'Tick “This order contains a gift” in your cart, then add a gift message, and gift wrap where it’s offered, at checkout.' },
      ],
      links: [
        { label: 'Your orders', href: '/orders' },
        { label: 'Your cart', href: '/cart' },
      ],
    },
    {
      slug: 'shipping-delivery',
      title: 'Shipping & delivery',
      intro: 'Delivery costs, tracking and packages that haven’t turned up.',
      articles: [
        { q: 'Is delivery free?', a: `Orders over ${free} are delivered free. Plus members get free delivery on every order.` },
        { q: 'How do I track a package?', a: 'Open Orders, choose the order, and select “Track order” to see each step and the expected delivery date.' },
        { q: 'Can I leave delivery instructions?', a: 'Yes. On the order’s page, choose “Add delivery instructions” to tell the driver where to leave it.' },
        { q: 'My package says delivered but I can’t find it', a: 'Check around your door and with neighbours first. Then open the order and choose “Item missing from package?”, or contact us about the order.' },
      ],
      links: [
        { label: 'Your orders', href: '/orders' },
        { label: 'Your addresses', href: '/account/addresses' },
      ],
    },
    {
      slug: 'returns-refunds',
      title: 'Returns, refunds & exchanges',
      intro: 'Sending items back, replacements and refunds.',
      articles: [
        {
          q: 'How long do I have to return an item?',
          a: `Most items can be returned within ${store.returns.days} days of delivery${store.returns.renewedDays ? `, and Renewed items within ${store.returns.renewedDays} days` : ''}. The order’s page shows each item’s return date.`,
        },
        {
          q: 'How do I return an item?',
          a: isIN
            ? 'Open Orders, choose “Return or replace items”, pick a reason, and schedule a pickup. Cash on Delivery orders are refunded to your bank account or store balance.'
            : 'Open Orders, choose “Return or replace items”, pick a reason, and print the prepaid label to drop the package off.',
        },
        { q: 'Can I get a replacement instead?', a: 'For items that can be replaced, “Return or replace items” offers a replacement. Some items can only be replaced, and the order’s page says so.' },
        { q: 'Where is my refund?', a: 'Once we receive your return, the refund goes to your original payment method. Most complete within 3–5 business days. Your returns shows where each one stands.' },
      ],
      links: [
        { label: 'Your returns', href: '/returns' },
        { label: 'Your orders', href: '/orders' },
      ],
    },
    {
      slug: 'account',
      title: 'Managing your account',
      intro: 'Sign-in details, security, addresses and your data.',
      articles: [
        { q: 'How do I change my password, email or name?', a: 'Go to Account, then Login & security, and edit the detail you want to change.' },
        { q: 'How do I turn on two-step verification?', a: 'In Login & security, choose two-step verification and set it up with an authenticator app. You’ll enter a code from the app as well as your password when you sign in.' },
        { q: 'How do I add or change an address?', a: 'Go to Account, then Your addresses, to add, edit or remove an address and pick your default.' },
        { q: 'Can I get a copy of my data?', a: 'Yes. From Account you can download the data the store holds about you, and choose which messages you get in Communication preferences.' },
      ],
      links: [
        { label: 'Login & security', href: '/account/security' },
        { label: 'Your addresses', href: '/account/addresses' },
        { label: 'Communication preferences', href: '/account/communications' },
      ],
    },
    {
      slug: 'payments',
      title: 'Payments, pricing & promotions',
      intro: 'Ways to pay, gift cards and coupons.',
      articles: [
        {
          q: 'How can I pay?',
          a: isIN
            ? 'With UPI, a credit or debit card, net banking, or Pay on Delivery where it’s offered. Your gift card balance can go towards any order.'
            : 'With a credit or debit card. Your gift card balance can go towards any order.',
        },
        {
          q: 'How do I change my payment method?',
          a: isIN
            ? 'Go to Account, then Payment options, to add or remove cards, UPI, net banking, or your store balance.'
            : 'Go to Account, then Payment options, to add, edit or remove cards and your gift card balance.',
        },
        { q: 'How do coupons work?', a: 'Apply a coupon on the product page or from Coupons, and its saving comes off every unit of that product in your cart and at checkout. It stays applied until you remove it.' },
        { q: 'How do I use a gift card?', a: 'Redeem the code from Gift cards. The balance is added to your account and used at checkout.' },
      ],
      links: [
        { label: 'Payment options', href: '/account/payments' },
        { label: 'Coupons', href: '/coupons' },
        { label: 'Gift cards', href: '/gift-cards' },
      ],
    },
    {
      slug: 'plus',
      title: 'Plus membership',
      intro: 'Benefits, plans and cancelling.',
      articles: [
        { q: 'What do I get with Plus?', a: 'Fast, free delivery on every order, and more. The Plus page lists every benefit and plan.' },
        { q: 'How do I change my plan?', a: 'Open Plus membership and choose “Switch to” another plan. You move to it when your current period ends.' },
        { q: 'How do I cancel Plus?', a: 'Go to Account, open Plus membership, and choose “Manage membership”. You keep the benefits until the current period ends.' },
      ],
      links: [{ label: 'Plus membership', href: '/prime' }],
    },
    {
      slug: 'safety-recalls',
      title: 'Product safety & recalls',
      intro: 'Recalled items and reporting a problem with a product.',
      articles: [
        { q: 'Has something I bought been recalled?', a: 'Product recalls lists recalled items, and an order with one in it says so on its page, with what to do next.' },
        { q: 'How do I report a problem with a product?', a: 'On the product’s page, choose “Report an issue with this product” to tell us about wrong details or a safety concern.' },
      ],
      links: [{ label: 'Product recalls', href: '/recalls' }],
    },
  ];
}

export function helpTopic(store: HelpStore, slug: string): HelpTopic | null {
  return helpTopics(store).find((t) => t.slug === slug) ?? null;
}
