import type { Db } from '../db/client';
import { isBankOfferMethod, type BankOffer } from '../bank-offers';
import type { Market } from '../types';

/**
 * A store's current Bank Offers, read by anyone (best first: highest cap, then percentage). They
 * decorate the product page and checkout, so a failed read is no offers rather than an error.
 */
export async function listBankOffers(db: Db, market: Market, now: Date = new Date()): Promise<BankOffer[]> {
  const at = now.toISOString();
  const { data, error } = await db
    .from('bank_offers')
    .select('id, bank, methods, percent_off, max_off_minor, min_spend_minor, ends_at')
    .eq('market_id', market)
    .lte('starts_at', at)
    .or(`ends_at.is.null,ends_at.gt.${at}`)
    .order('max_off_minor', { ascending: false })
    .order('percent_off', { ascending: false })
    .order('id');
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    bank: r.bank,
    methods: r.methods.filter(isBankOfferMethod),
    percentOff: r.percent_off,
    maxOffMinor: r.max_off_minor,
    minSpendMinor: r.min_spend_minor,
    ...(r.ends_at ? { endsAt: r.ends_at } : {}),
  }));
}
