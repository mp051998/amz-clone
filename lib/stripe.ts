import Stripe from 'stripe';

/**
 * Server-only Stripe client, gated on STRIPE_SECRET_KEY: when the key is absent
 * the app still builds and checkout simply hides the card method. The key is read
 * from the environment only — never hard-coded. Charges are made in the order's
 * store currency (USD for amazon.com, INR for amazon.in); see lib/data/payments.ts.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeConfigured = Boolean(secretKey);

export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;
