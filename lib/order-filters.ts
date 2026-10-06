/**
 * Your Orders: search every order, or narrow to a period (last 30 days, past 3 months, a year,
 * everything), ten to a page. Archived orders leave the periods for an "Archived" view of their
 * own, as on Amazon; a search still finds them. The "Not yet shipped" and "Cancelled orders" tabs
 * list every such order whatever its date (archived ones aside). A shopper has few enough orders
 * that this runs over their list.
 */
import { orderStage } from './decision/tracking';
import type { Order } from './types';

export type OrderPeriod = 'last30' | 'months3' | 'all' | 'archived' | `y${number}`;

/** The tab: every order (by period), or those not shipped yet, or the cancelled ones. */
export type OrderView = 'all' | 'not-shipped' | 'cancelled';

export interface OrderFilter {
  /** words to find in an order (searches every order, archived too, whatever the period or tab) */
  q: string;
  period: OrderPeriod;
  view: OrderView;
  page: number;
}

export const ORDERS_PER_PAGE = 10;
const DEFAULT_PERIOD: OrderPeriod = 'months3';
const Q_MAX = 100;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function isPeriod(v: string | undefined): v is OrderPeriod {
  return v === 'last30' || v === 'months3' || v === 'all' || v === 'archived' || (!!v && /^y\d{4}$/.test(v));
}

const isView = (v: string | undefined): v is OrderView => v === 'all' || v === 'not-shipped' || v === 'cancelled';

export function readOrderFilter(sp: SP): OrderFilter {
  const period = one(sp.period);
  const view = one(sp.view);
  const page = Number.parseInt(one(sp.page) ?? '', 10);
  return {
    q: (one(sp.q) ?? '').trim().slice(0, Q_MAX),
    period: isPeriod(period) ? period : DEFAULT_PERIOD,
    view: isView(view) ? view : 'all',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

const placed = (o: Order) => new Date(o.placedAt ?? o.createdAt);

/**
 * The periods to pick from: the recent windows, each year with an order (and this one), then
 * everything; and "Archived" while there are archived orders (or it's the view being shown).
 */
export function periodOptions(orders: readonly Order[], now: Date, current?: OrderPeriod): { value: OrderPeriod; label: string }[] {
  const listed = orders.filter((o) => !o.archivedAt);
  const years = new Set([now.getUTCFullYear(), ...listed.map((o) => placed(o).getUTCFullYear())]);
  return [
    { value: 'last30', label: 'Last 30 days' },
    { value: 'months3', label: 'Past 3 months' },
    ...[...years].sort((a, b) => b - a).map((y) => ({ value: `y${y}` as OrderPeriod, label: String(y) })),
    { value: 'all', label: 'All' },
    ...(current === 'archived' || listed.length < orders.length ? [{ value: 'archived' as const, label: 'Archived' }] : []),
  ];
}

/** In the view: an archived order is only in "Archived", the others only in the periods. */
function inPeriod(o: Order, period: OrderPeriod, now: Date): boolean {
  if (period === 'archived' || o.archivedAt) return period === 'archived' && !!o.archivedAt;
  const at = placed(o);
  if (period === 'all') return true;
  if (period === 'last30') return at.getTime() >= now.getTime() - 30 * 86_400_000;
  if (period === 'months3') {
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 3);
    return at >= from;
  }
  return at.getUTCFullYear() === Number(period.slice(1));
}

/** In a tab: an unpaid checkout or a placed order still being prepared; or a cancelled one. */
function inView(o: Order, view: Exclude<OrderView, 'all'>, now: Date, timeZone: string): boolean {
  if (o.archivedAt) return false;
  if (view === 'cancelled') return o.status === 'cancelled';
  return o.status === 'awaiting_payment' || (o.status === 'placed' && orderStage(o, now, timeZone) === 'preparing');
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

/** `timeZone`: the store's, which places an order's delivery steps (for "Not yet shipped"). */
export function filterOrders(orders: readonly Order[], filter: OrderFilter, now: Date, timeZone = 'UTC'): OrderPage {
  const words = filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  const { view } = filter;
  const found = words.length
    ? orders.filter((o) => matches(o, words))
    : view !== 'all'
      ? orders.filter((o) => inView(o, view, now, timeZone))
      : orders.filter((o) => inPeriod(o, filter.period, now));
  const pageCount = Math.max(1, Math.ceil(found.length / ORDERS_PER_PAGE));
  const page = Math.min(filter.page, pageCount);
  return { items: found.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE), total: found.length, page, pageCount };
}

export function periodPhrase(period: OrderPeriod): string {
  if (period === 'all') return 'in all';
  if (period === 'archived') return 'archived';
  if (period === 'last30') return 'placed in the last 30 days';
  if (period === 'months3') return 'placed in the past 3 months';
  return `placed in ${period.slice(1)}`;
}

/** "2 orders placed in the past 3 months", "1 order matching “mug”", "3 cancelled orders" */
export function orderSummary(total: number, filter: OrderFilter): string {
  const orders = total === 1 ? 'order' : 'orders';
  if (filter.q) return `${total} ${orders} matching “${filter.q}”`;
  if (filter.view === 'not-shipped') return `${total} ${orders} not yet shipped`;
  if (filter.view === 'cancelled') return `${total} cancelled ${orders}`;
  return `${total} ${orders} ${periodPhrase(filter.period)}`;
}
