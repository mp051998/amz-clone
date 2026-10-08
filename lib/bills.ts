import { isRechargeMethod, RECHARGE_METHODS, type RechargeMethod } from './recharge';

/**
 * Bill payments (amazon.in's Amazon Pay "Pay bills"; a demo: no biller is reached), the parts the
 * pages and the database share: the kinds of biller (`billers.category`), what an account looks
 * like once tidied (`private.bill_account`), the ways to pay, and amounts typed in rupees.
 */

export const BILL_CATEGORIES = ['electricity', 'dth', 'broadband', 'gas', 'water', 'fastag'] as const;

export type BillCategory = (typeof BILL_CATEGORIES)[number];

export function isBillCategory(v: unknown): v is BillCategory {
  return (BILL_CATEGORIES as readonly unknown[]).includes(v);
}

/** Each kind of biller: its tile (`name`), its page's title, and what the shopper's account with it is called. */
export const BILL_CATEGORY: Record<BillCategory, { name: string; title: string; account: string }> = {
  electricity: { name: 'Electricity', title: 'Electricity bill', account: 'Consumer number' },
  dth: { name: 'DTH', title: 'DTH recharge', account: 'Subscriber ID' },
  broadband: { name: 'Broadband', title: 'Broadband bill', account: 'Account number' },
  gas: { name: 'Piped gas', title: 'Piped gas bill', account: 'Customer number' },
  water: { name: 'Water', title: 'Water bill', account: 'Consumer number' },
  fastag: { name: 'FASTag', title: 'FASTag recharge', account: 'Vehicle number' },
};

/** An account as the database keeps it: upper case, without spaces or dashes ("mh 12-ab 1234" → "MH12AB1234"). */
export function billAccount(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '').replace(/[\s-]/g, '').toUpperCase();
}

/** Whether `raw`, tidied, is an account with a biller whose accounts match `pattern` (`billers.account_pattern`). */
export function isBillAccount(raw: unknown, pattern: string): boolean {
  const account = billAccount(raw);
  try {
    return account !== '' && new RegExp(pattern).test(account);
  } catch {
    return false;
  }
}

/** How a bill is paid: as a recharge is — the store balance (Store Pay), UPI or net banking. */
export type BillMethod = RechargeMethod;

export const BILL_METHODS = RECHARGE_METHODS;

export const isBillMethod = isRechargeMethod;

/** An amount typed in whole rupees ("1,500" → 150000 minor units), or null when it isn't one. */
export function rupeesMinor(raw: unknown): number | null {
  const s = (typeof raw === 'string' ? raw : '').replace(/[,\s₹]/g, '');
  return /^\d{1,7}$/.test(s) && Number(s) > 0 ? Number(s) * 100 : null;
}

/** "2026-10-01" → "October 2026": the month a bill is for. */
export function billMonth(period: string, locale = 'en-IN'): string {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}
