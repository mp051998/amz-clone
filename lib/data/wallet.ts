import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '../stripe';
import { createAdminClient } from '../supabase/admin';
import { DataError } from './errors';

/**
 * Saved cards, as Amazon's "Your Payments" wallet. Cards are typed and kept on Stripe, never
 * here. Each shopper gets a Stripe Customer the first time they pay by card or add a card;
 * hosted Checkout then offers to save the card to it, and shows the saved ones next time. The
 * database only records whose customer is whose (stripe_customers, service role only), so a
 * shopper can never reach another shopper's cards.
 */

/** Who is paying: enough to make their Stripe Customer. */
export interface Payer {
  id: string;
  email: string | null;
  name?: string | null;
}

export interface SavedCard {
  /** the Stripe PaymentMethod id */
  id: string;
  /** "Visa", "Mastercard", "RuPay"… */
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** past the end of its expiry month */
  expired: boolean;
}

export interface WalletUrls {
  /** absolute; `added={CHECKOUT_SESSION_ID}` is appended */
  successUrl: string;
  /** absolute */
  cancelUrl: string;
}

export function brandLabel(brand?: string | null): string {
  switch (brand) {
    case 'visa': return 'Visa';
    case 'mastercard': return 'Mastercard';
    case 'amex': return 'Amex';
    case 'discover': return 'Discover';
    case 'rupay': return 'RuPay';
    default: return 'Card';
  }
}

/** A Stripe card PaymentMethod as a saved card; null for anything that isn't a card. */
export function toSavedCard(pm: Pick<Stripe.PaymentMethod, 'id' | 'card'>, now = new Date()): SavedCard | null {
  const card = pm.card;
  if (!card) return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return {
    id: pm.id,
    brand: brandLabel(card.brand),
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
    expired: card.exp_year < year || (card.exp_year === year && card.exp_month < month),
  };
}

/** "Visa ending 4242" */
export function cardLabel(c: Pick<SavedCard, 'brand' | 'last4'>): string {
  return `${c.brand} ending ${c.last4}`;
}

function requireStripe(): Stripe {
  if (!stripe) throw new DataError('payments_unavailable');
  return stripe;
}

function stripeFailed(what: string, err: unknown): DataError {
  console.error(`[stripe] ${what} failed`, err instanceof Error ? err.message : err);
  return new DataError('payments_unavailable');
}

/** The shopper's Stripe Customer id, or null while they have none. */
export async function stripeCustomerOf(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('stripe_customers').select('customer_id').eq('user_id', userId).maybeSingle();
  if (error) throw new DataError('internal', `stripe customer: ${error.code ?? ''} ${error.message}`);
  return data?.customer_id ?? null;
}

/** The shopper's Stripe Customer, made now if they have none yet. */
export async function ensureStripeCustomer(payer: Payer): Promise<string> {
  const s = requireStripe();
  const existing = await stripeCustomerOf(payer.id);
  if (existing) return existing;
  let customer: Stripe.Customer;
  try {
    // the key makes two requests at the same moment get the same customer
    customer = await s.customers.create(
      { email: payer.email ?? undefined, name: payer.name ?? undefined, metadata: { userId: payer.id } },
      { idempotencyKey: `customer-${payer.id}` },
    );
  } catch (err) {
    throw stripeFailed('customer create', err);
  }
  const { error } = await createAdminClient().from('stripe_customers').upsert({ user_id: payer.id, customer_id: customer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw new DataError('internal', `stripe customer: ${error.code ?? ''} ${error.message}`);
  return (await stripeCustomerOf(payer.id)) ?? customer.id;
}

/**
 * Checkout Session params that offer to save the card and show the saved ones, for a shopper
 * paying by card. Best effort: if their customer can't be made, they pay as a guest of Stripe.
 */
export async function savedCardsCheckout(payer?: Payer | null): Promise<Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'saved_payment_method_options'>> {
  if (!payer) return {};
  let customer: string;
  try {
    customer = await ensureStripeCustomer(payer);
  } catch (err) {
    console.error('[wallet] no saved cards for this checkout', err instanceof DataError ? err.code : err);
    return {};
  }
  return {
    customer,
    // cards added on the wallet page are saved without a redisplay setting: show those too
    saved_payment_method_options: { payment_method_save: 'enabled', allow_redisplay_filters: ['always', 'limited', 'unspecified'] },
  };
}

async function cardMethods(customer: string): Promise<Stripe.PaymentMethod[]> {
  try {
    return (await requireStripe().customers.listPaymentMethods(customer, { type: 'card', limit: 50 })).data;
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw stripeFailed('list payment methods', err);
  }
}

/**
 * The shopper's saved cards, newest first. The same card saved twice (once at checkout, once
 * added here) shows once.
 */
export async function listSavedCards(userId: string, now = new Date()): Promise<SavedCard[]> {
  const customer = await stripeCustomerOf(userId);
  if (!customer || !stripe) return [];
  const seen = new Set<string>();
  const cards: SavedCard[] = [];
  for (const pm of [...(await cardMethods(customer))].sort((a, b) => b.created - a.created)) {
    const card = toSavedCard(pm, now);
    const key = pm.card?.fingerprint ?? pm.id;
    if (!card || seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}

/** Remove a saved card (every copy of it). Only the shopper's own cards can be removed. */
export async function removeSavedCard(userId: string, paymentMethodId: unknown): Promise<void> {
  if (typeof paymentMethodId !== 'string' || !/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) throw new DataError('card_not_found');
  const customer = await stripeCustomerOf(userId);
  if (!customer) throw new DataError('card_not_found');
  const methods = await cardMethods(customer);
  const target = methods.find((pm) => pm.id === paymentMethodId);
  if (!target) throw new DataError('card_not_found');
  const fingerprint = target.card?.fingerprint;
  const copies = methods.filter((pm) => pm.id === target.id || (fingerprint && pm.card?.fingerprint === fingerprint));
  try {
    for (const pm of copies) await requireStripe().paymentMethods.detach(pm.id);
  } catch (err) {
    throw stripeFailed('detach payment method', err);
  }
}

/** Open Stripe's page for adding a card (a setup-mode Checkout Session); returns its URL. */
export async function startAddCard(payer: Payer, urls: WalletUrls): Promise<string> {
  const s = requireStripe();
  const customer = await ensureStripeCustomer(payer);
  let session: Stripe.Checkout.Session;
  try {
    session = await s.checkout.sessions.create({
      mode: 'setup',
      customer,
      payment_method_types: ['card'],
      metadata: { kind: 'wallet', userId: payer.id },
      success_url: `${urls.successUrl}${urls.successUrl.includes('?') ? '&' : '?'}added={CHECKOUT_SESSION_ID}`,
      cancel_url: urls.cancelUrl,
    });
  } catch (err) {
    throw stripeFailed('setup session create', err);
  }
  if (!session.url) throw new DataError('payments_unavailable');
  return session.url;
}

/**
 * The card a finished add-card session saved, for the "card saved" note; null unless that
 * session is this shopper's and complete.
 */
export async function addedCard(userId: string, sessionId: unknown): Promise<SavedCard | null> {
  if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !stripe) return null;
  const customer = await stripeCustomerOf(userId);
  if (!customer) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent.payment_method'] });
    if (session.mode !== 'setup' || session.status !== 'complete' || session.customer !== customer) return null;
    const intent = session.setup_intent;
    const pm = intent && typeof intent === 'object' ? intent.payment_method : null;
    return pm && typeof pm === 'object' ? toSavedCard(pm) : null;
  } catch (err) {
    console.error('[stripe] setup session retrieve failed', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Delete a closed account's Stripe Customer, and with it the saved cards. Best effort. */
export async function deleteStripeCustomer(customerId: string | null | undefined): Promise<void> {
  if (!customerId || !stripe) return;
  try {
    await stripe.customers.del(customerId);
  } catch (err) {
    console.error('[stripe] customer delete failed', customerId, err instanceof Error ? err.message : err);
  }
}
