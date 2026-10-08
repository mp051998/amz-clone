/**
 * Mobile recharge (amazon.in's Amazon Pay recharges; a demo: no operator is reached), the parts
 * the pages and the database share: the operators, the telecom circles
 * (`private.recharge_circles`), what a mobile number looks like, the ways to pay and the cashback
 * (`private.recharge_cashback`: 2% of the plan, rounded down to the rupee, up to ₹25, into the store
 * balance at once).
 */

export const OPERATORS = ['Jio', 'Airtel', 'Vi', 'BSNL'] as const;

export type Operator = (typeof OPERATORS)[number];

export function isOperator(v: unknown): v is Operator {
  return (OPERATORS as readonly unknown[]).includes(v);
}

export const CIRCLES = [
  'Andhra Pradesh & Telangana', 'Assam', 'Bihar & Jharkhand', 'Chennai', 'Delhi NCR', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Karnataka', 'Kerala', 'Kolkata',
  'Madhya Pradesh & Chhattisgarh', 'Maharashtra & Goa', 'Mumbai', 'North East', 'Odisha',
  'Punjab', 'Rajasthan', 'Tamil Nadu', 'UP East', 'UP West & Uttarakhand', 'West Bengal',
] as const;

export function isCircle(v: unknown): v is (typeof CIRCLES)[number] {
  return (CIRCLES as readonly unknown[]).includes(v);
}

/**
 * An Indian mobile number as ten digits ("+91 98765-43210" → "9876543210"), or null when it isn't
 * one (ten digits starting 6–9, after an optional +91, 91 or 0).
 */
export function mobileNumber(raw: unknown): string | null {
  const digits = (typeof raw === 'string' ? raw : '').replace(/[\s()-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** "9876543210" → "98765 43210". */
export function formatMobile(number: string): string {
  return number.length === 10 ? `${number.slice(0, 5)} ${number.slice(5)}` : number;
}

/** How a recharge is paid: the store balance (Store Pay), UPI or net banking. */
export type RechargeMethod = 'amazonpay' | 'upi' | 'netbanking';

export const RECHARGE_METHODS: readonly RechargeMethod[] = ['amazonpay', 'upi', 'netbanking'];

export function isRechargeMethod(v: unknown): v is RechargeMethod {
  return (RECHARGE_METHODS as readonly unknown[]).includes(v);
}

export const RECHARGE_CASHBACK_PCT = 2;
export const RECHARGE_CASHBACK_CAP_MINOR = 2500;

/** A recharge's cashback (minor units): 2% of the plan, rounded down to the rupee, up to ₹25. */
export function rechargeCashback(amountMinor: number): number {
  return Math.min(Math.floor((amountMinor * RECHARGE_CASHBACK_PCT) / 100 / 100) * 100, RECHARGE_CASHBACK_CAP_MINOR);
}
