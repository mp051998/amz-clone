/**
 * Your Orders: search every order, or narrow to a period (last 30 days, past 3 months, a year,
 * everything), ten to a page. A shopper has few enough orders that this runs over their list.
 */
import type { Order } from './types';

export type OrderPeriod = 'last30' | 'months3' | 'all' | `y${number}`;

export interface OrderFilter {
  /** words to find in an order (searches every order, whatever the period) */
  q: string;
  period: OrderPeriod;
  page: number;
}

export const ORDERS_PER_PAGE = 10;
const DEFAULT_PERIOD: OrderPeriod = 'months3';
const Q_MAX = 100;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function isPeriod(v: string | undefined): v is OrderPeriod {
  return v === 'last30' || v === 'months3' || v === 'all' || (!!v && /^y\d{4}$/.test(v));
}

export function readOrderFilter(sp: SP): OrderFilter {
  const period = one(sp.period);
  const page = Number.parseInt(one(sp.page) ?? '', 10);
  return {
    q: (one(sp.q) ?? '').trim().slice(0, Q_MAX),
    period: isPeriod(period) ? period : DEFAULT_PERIOD,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

const placed = (o: Order) => new Date(o.placedAt ?? o.createdAt);

/** The periods to pick from: the recent windows, each year with an order (and this one), then everything. */
export function periodOptions(orders: readonly Order[], now: Date): { value: OrderPeriod; label: string }[] {
  const years = new Set([now.getUTCFullYear(), ...orders.map((o) => placed(o).getUTCFullYear())]);
  return [
    { value: 'last30', label: 'Last 30 days' },
    { value: 'months3', label: 'Past 3 months' },
    ...[...years].sort((a, b) => b - a).map((y) => ({ value: `y${y}` as OrderPeriod, label: String(y) })),
    { value: 'all', label: 'All' },
  ];
}

function inPeriod(at: Date, period: OrderPeriod, now: Date): boolean {
  if (period === 'all') return true;
  if (period === 'last30') return at.getTime() >= now.getTime() - 30 * 86_400_000;
  if (period === 'months3') {
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 3);
    return at >= from;
  }
  return at.getUTCFullYear() === Number(period.slice(1));
}

/** Every word appears in the order: its number, an item, a seller or who it went to. */
function matches(o: Order, words: string[]): boolean {
  const text = [o.id, o.shipTo.name, ...o.items.flatMap((it) => [it.title, it.seller])].join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}

export interface OrderPage {
  items: Order[];
  /** orders the search or period found, across all pages */
  total: number;
  page: number;
  pageCount: number;
}

export function filterOrders(orders: readonly Order[], filter: OrderFilter, now: Date): OrderPage {
  const words = filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? orders.filter((o) => matches(o, words)) : orders.filter((o) => inPeriod(placed(o), filter.period, now));
  const pageCount = Math.max(1, Math.ceil(found.length / ORDERS_PER_PAGE));
  const page = Math.min(filter.page, pageCount);
  return { items: found.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE), total: found.length, page, pageCount };
}

export function periodPhrase(period: OrderPeriod): string {
  if (period === 'all') return 'in all';
  if (period === 'last30') return 'placed in the last 30 days';
  if (period === 'months3') return 'placed in the past 3 months';
  return `placed in ${period.slice(1)}`;
}

/** "2 orders placed in the past 3 months", "1 order matching “mug”" */
export function orderSummary(total: number, filter: OrderFilter): string {
  const n = `${total} ${total === 1 ? 'order' : 'orders'}`;
  return filter.q ? `${n} matching “${filter.q}”` : `${n} ${periodPhrase(filter.period)}`;
}
