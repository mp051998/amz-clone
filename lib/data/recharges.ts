import type { Db } from '../db/client';
import type { Market } from '../types';
import { isOperator, type Operator, type RechargeMethod } from '../recharge';
import { DataError, unwrap } from './errors';

/**
 * Mobile recharges (amazon.in; a demo: nothing is recharged or charged). The database keeps the
 * operators' plans and the shopper's recharges; recharge_mobile() checks a recharge, takes it from
 * the store balance when that pays, and pays the cashback into the balance.
 */

export interface RechargePlan {
  id: string;
  operator: Operator;
  amountMinor: number;
  /** days; absent for a data pack, good for as long as the plan it's added to */
  validityDays?: number;
  /** "1.5 GB/day" */
  data: string;
  /** "Unlimited" (absent for a data pack) */
  calls?: string;
  /** "100/day" */
  sms?: string;
  kind: 'unlimited' | 'data';
}

export interface Recharge {
  id: string;
  number: string;
  operator: Operator;
  circle: string;
  planId: string;
  amountMinor: number;
  /** paid into the store balance at once */
  cashbackMinor: number;
  method: RechargeMethod;
  /** net banking: the bank */
  bank?: string;
  at: string;
}

type PlanRow = {
  id: string;
  operator: string;
  amount_minor: number;
  validity_days: number | null;
  data: string;
  calls: string | null;
  sms: string | null;
  kind: string;
};

type RechargeRow = {
  id: string;
  number: string;
  operator: string;
  circle: string;
  plan_id: string;
  amount_minor: number;
  cashback_minor: number;
  method: string;
  bank: string | null;
  created_at: string;
};

function toPlan(r: PlanRow): RechargePlan {
  return {
    id: r.id,
    operator: isOperator(r.operator) ? r.operator : 'Jio',
    amountMinor: r.amount_minor,
    ...(r.validity_days ? { validityDays: r.validity_days } : {}),
    data: r.data,
    ...(r.calls ? { calls: r.calls } : {}),
    ...(r.sms ? { sms: r.sms } : {}),
    kind: r.kind === 'data' ? 'data' : 'unlimited',
  };
}

function toRecharge(r: RechargeRow): Recharge {
  return {
    id: r.id,
    number: r.number,
    operator: isOperator(r.operator) ? r.operator : 'Jio',
    circle: r.circle,
    planId: r.plan_id,
    amountMinor: r.amount_minor,
    cashbackMinor: r.cashback_minor,
    method: r.method === 'amazonpay' || r.method === 'netbanking' ? r.method : 'upi',
    ...(r.bank ? { bank: r.bank } : {}),
    at: r.created_at,
  };
}

/** A store's recharge plans (none outside amazon.in), an operator's only when given: plans first, then data packs, cheapest first. */
export async function listRechargePlans(db: Db, market: Market, operator?: Operator): Promise<RechargePlan[]> {
  let q = db
    .from('recharge_plans')
    .select('id, operator, amount_minor, validity_days, data, calls, sms, kind')
    .eq('market_id', market)
    .eq('active', true);
  if (operator) q = q.eq('operator', operator);
  const rows = unwrap(await q.order('kind', { ascending: false }).order('amount_minor', { ascending: true })) as PlanRow[];
  return rows.map(toPlan);
}

export interface RechargeInput {
  number: string;
  circle: string;
  planId: string;
  method: RechargeMethod;
  bank?: string;
}

/**
 * Recharge a prepaid number (`422 invalid_input`, detail number | circle | plan | method, for one
 * that isn't valid; `409 insufficient_balance` when the balance pays and doesn't cover it).
 */
export async function rechargeMobile(db: Db, input: RechargeInput): Promise<Recharge> {
  try {
    const row = unwrap(
      await db.rpc('recharge_mobile', {
        p_number: input.number,
        p_circle: input.circle,
        p_plan: input.planId,
        p_method: input.method,
        ...(input.bank ? { p_bank: input.bank } : {}),
      }),
    ) as unknown as RechargeRow;
    return toRecharge(row);
  } catch (err) {
    if (err instanceof DataError && err.code === 'insufficient_balance') {
      throw new DataError('insufficient_balance', undefined, 'Your balance doesn’t cover this recharge. Add to it, or pay by UPI or net banking.');
    }
    throw err;
  }
}

/** The caller's recharges in a store, newest first. */
export async function listRecharges(db: Db, market: Market, limit = 20): Promise<Recharge[]> {
  const rows = unwrap(
    await db
      .from('recharges')
      .select('id, number, operator, circle, plan_id, amount_minor, cashback_minor, method, bank, created_at')
      .eq('market_id', market)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as RechargeRow[];
  return rows.map(toRecharge);
}

/** The numbers recharged lately, each once (its latest recharge), for "Recharge again". */
export function recentNumbers(recharges: Recharge[], max = 3): Recharge[] {
  const seen = new Set<string>();
  return recharges.filter((r) => !seen.has(r.number) && seen.add(r.number)).slice(0, max);
}
