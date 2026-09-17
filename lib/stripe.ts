import Stripe from 'stripe';

/**
 * Server-only Stripe client, gated on STRIPE_SECRET_KEY (like supabaseConfigured):
 * when the key is absent the app still builds and the checkout falls back to the
 * demo order flow. The key is read from the environment only — never hard-coded.
 * Charges are made in the active store's currency: USD for amazon.com, INR for
 * amazon.in (see startStripeCheckout in app/actions/order.ts).
 */
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeConfigured = Boolean(secretKey);

export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;
