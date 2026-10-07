import type { CurrencyCode } from '../contracts';
import type { Database } from '../db/database.types';
import type { Address, CancelReason, Cart, Market, Order, OrderCancellation, OrderItem, OrderStatus, PaymentMethod, Product, RefundStatus } from '../types';

type ProductRow = Database['public']['Views']['catalog_products_all']['Row'];
type AddressRow = Database['public']['Tables']['addresses']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type OrderItemRow = Database['public']['Tables']['order_items']['Row'];

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** catalog_products(_all) row (from a select or embedded in RPC JSON) → Product. */
export function toProduct(row: Partial<ProductRow>): Product {
  return {
    id: row.id ?? '',
    market: (row.market_id ?? 'US') as Market,
    title: row.title ?? '',
    brand: opt(row.brand),
    category: row.category_slug ?? '',
    categoryName: row.category_name ?? row.category_slug ?? '',
    image: row.image ?? '',
    priceMinor: row.price_minor ?? 0,
    listMinor: opt(row.list_minor),
    dealPct: opt(row.deal_pct),
    rating: Number(row.rating ?? 0),
    reviewCount: row.review_count ?? 0,
    seller: row.seller ?? '',
    shipsFrom: row.ships_from ?? '',
    bullets: row.bullets ?? [],
    badge: opt(row.badge),
    deal: row.deal || undefined,
    boughtPastMonth: opt(row.bought_past_month),
    stock: row.stock ?? 0,
    curBase: (row.currency ?? 'USD') as CurrencyCode,
    archived: row.archived_at ? true : undefined,
    variant: row.variant_group && row.variant_axis && row.variant_label ? { group: row.variant_group, axis: row.variant_axis, label: row.variant_label } : undefined,
  };
}

interface CartJson {
  market: Market;
  currency: CurrencyCode;
  free_ship_threshold_minor: number;
  count: number;
  selected_count?: number;
  lines: {
    product: Partial<ProductRow>;
    qty: number;
    line_total_minor: number;
    in_stock: boolean;
    available?: boolean;
    coupon?: { percent_off: number; clipped: boolean } | null;
    discount_minor?: number;
    selected?: boolean;
    protection_unit_minor?: number | null;
    protection?: boolean;
    added_price_minor?: number | null;
    promo_minor?: number;
  }[];
  totals: { subtotal_minor: number; discount_minor?: number; promo_minor?: number; ship_minor: number; tax_minor: number; protection_minor?: number; total_minor: number };
  promo?: { code: string; percent_off: number; description: string; category_slug: string | null } | null;
}

/** JSON returned by the cart RPCs → Cart. */
export function toCart(json: unknown): Cart {
  const c = json as CartJson;
  return {
    market: c.market,
    currency: c.currency,
    freeShipThresholdMinor: c.free_ship_threshold_minor,
    count: c.count,
    // absent before cart lines could be unticked: every line counted
    selectedCount: c.selected_count ?? c.count,
    lines: c.lines.map((l) => ({
      product: toProduct(l.product),
      qty: l.qty,
      lineTotalMinor: l.line_total_minor,
      inStock: l.in_stock,
      // absent before the archive migration: every line was available
      available: l.available ?? true,
      // absent before the coupons migration
      ...(l.coupon ? { coupon: { percentOff: l.coupon.percent_off, clipped: l.coupon.clipped } } : {}),
      discountMinor: l.discount_minor ?? 0,
      selected: l.selected ?? true,
      // absent before the protection plans migration
      ...(l.protection_unit_minor ? { protection: { unitMinor: l.protection_unit_minor, added: l.protection === true } } : {}),
      // absent before the cart price changes migration, and for Buy Now's line
      ...(l.added_price_minor != null ? { addedPriceMinor: l.added_price_minor } : {}),
      // checkout quotes with a promotion code only
      ...(l.promo_minor ? { promoMinor: l.promo_minor } : {}),
    })),
    totals: {
      subtotalMinor: c.totals.subtotal_minor,
      discountMinor: c.totals.discount_minor ?? 0,
      ...(c.totals.promo_minor ? { promoMinor: c.totals.promo_minor } : {}),
      shipMinor: c.totals.ship_minor,
      taxMinor: c.totals.tax_minor,
      ...(c.totals.protection_minor ? { protectionMinor: c.totals.protection_minor } : {}),
      totalMinor: c.totals.total_minor,
    },
    ...(c.promo
      ? {
          promo: {
            code: c.promo.code,
            percentOff: c.promo.percent_off,
            description: c.promo.description,
            ...(c.promo.category_slug ? { category: c.promo.category_slug } : {}),
          },
        }
      : {}),
  };
}

export function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone,
    line1: row.line1,
    line2: opt(row.line2),
    landmark: opt(row.landmark),
    city: row.city,
    state: row.state,
    zip: row.postcode,
    kind: (opt(row.kind) as Address['kind']) ?? undefined,
    // absent on rows read before the delivery instructions migration lands
    instructions: opt(row.instructions) ?? undefined,
    isDefault: row.is_default,
  };
}

type CancellationRow = Database['public']['Tables']['order_cancellations']['Row'];
type CancellationWithItems = CancellationRow & { items?: Partial<OrderItemRow>[]; order_cancelled_items?: Partial<OrderItemRow>[] };
type OrderWithItems = OrderRow & {
  items?: Partial<OrderItemRow>[];
  order_items?: Partial<OrderItemRow>[];
  cancellations?: CancellationWithItems[];
  order_cancellations?: CancellationWithItems[];
};

function toOrderItems(rows: Partial<OrderItemRow>[]): OrderItem[] {
  return rows
    .slice()
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map((it) => ({
      productId: it.product_id ?? '',
      title: it.title ?? '',
      image: it.image ?? '',
      seller: it.seller ?? '',
      unitPriceMinor: it.unit_price_minor ?? 0,
      qty: it.qty ?? 0,
      ...(it.unit_discount_minor ? { unitDiscountMinor: it.unit_discount_minor } : {}),
      // absent on rows read before the promo codes migration lands
      ...(it.unit_promo_minor ? { unitPromoMinor: it.unit_promo_minor } : {}),
      ...(it.protection_minor ? { protectionMinor: it.protection_minor } : {}),
    }));
}

function toCancellation(row: CancellationWithItems): OrderCancellation {
  return {
    id: row.id,
    items: toOrderItems(row.items ?? row.order_cancelled_items ?? []),
    itemsMinor: row.items_minor,
    taxMinor: row.tax_minor,
    // absent on rows read before the gift wrap migration lands
    ...(row.wrap_minor ? { wrapMinor: row.wrap_minor } : {}),
    ...(row.protection_minor ? { protectionMinor: row.protection_minor } : {}),
    refund: { status: row.refund_status as RefundStatus, amountMinor: row.refund_minor, refundedAt: opt(row.refunded_at) },
    createdAt: row.created_at,
  };
}

/** orders row with embedded items (PostgREST embed or RPC JSON) → Order. */
export function toOrder(row: OrderWithItems): Order {
  // absent on rows read before the cancel-items migration lands
  const items = toOrderItems(row.items ?? row.order_items ?? []);
  // the promotion's part of the discount, over the items still in the order
  const promoMinor = items.reduce((s, it) => s + (it.unitPromoMinor ?? 0) * it.qty, 0);
  const cancellations = (row.cancellations ?? row.order_cancellations ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(toCancellation);
  return {
    id: row.id,
    market: row.market_id as Market,
    currency: row.currency as CurrencyCode,
    status: row.status as OrderStatus,
    paymentMethod: row.payment_method as PaymentMethod,
    paymentLabel: row.payment_label,
    totals: {
      subtotalMinor: row.subtotal_minor,
      // absent on rows read before the coupons migration lands
      discountMinor: row.discount_minor ?? 0,
      ...(promoMinor ? { promoMinor } : {}),
      shipMinor: row.ship_minor,
      taxMinor: row.tax_minor,
      // absent on rows read before the gift wrap migration lands
      ...(row.wrap_minor ? { wrapMinor: row.wrap_minor } : {}),
      ...(row.protection_minor ? { protectionMinor: row.protection_minor } : {}),
      totalMinor: row.total_minor,
    },
    shipTo: {
      name: row.ship_name,
      phone: row.ship_phone,
      line1: row.ship_line1,
      line2: opt(row.ship_line2),
      landmark: opt(row.ship_landmark),
      city: row.ship_city,
      state: row.ship_state,
      postcode: row.ship_postcode,
      instructions: opt(row.ship_instructions) ?? undefined,
    },
    items,
    createdAt: row.created_at,
    placedAt: opt(row.placed_at),
    // the lifecycle columns are absent on rows read before that migration lands
    shippedAt: opt(row.shipped_at),
    outForDeliveryAt: opt(row.out_for_delivery_at),
    deliveredAt: opt(row.delivered_at),
    cancelledAt: opt(row.cancelled_at),
    cancelReason: opt(row.cancel_reason) as CancelReason | undefined,
    refund: row.refund_status
      ? { status: row.refund_status as RefundStatus, amountMinor: row.refund_minor ?? row.total_minor, refundedAt: opt(row.refunded_at) }
      : undefined,
    // absent on rows read before the gift migration lands
    ...(row.gift ? { gift: { ...(row.gift_message ? { message: row.gift_message } : {}), ...(row.gift_wrap ? { wrapped: true } : {}) } } : {}),
    ...(row.ship_speed === 'fast' ? { shipSpeed: 'fast' as const } : {}),
    ...(row.emi_months ? { emiMonths: row.emi_months } : {}),
    ...(row.promo_code ? { promoCode: row.promo_code } : {}),
    // absent on rows read before the archive migration lands
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    ...(cancellations.length ? { cancellations } : {}),
  };
}
