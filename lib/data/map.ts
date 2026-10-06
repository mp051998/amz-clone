import type { CurrencyCode } from '../contracts';
import type { Database } from '../db/database.types';
import type { Address, CancelReason, Cart, Market, Order, OrderStatus, PaymentMethod, Product, RefundStatus } from '../types';

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
  lines: { product: Partial<ProductRow>; qty: number; line_total_minor: number; in_stock: boolean; available?: boolean }[];
  totals: { subtotal_minor: number; ship_minor: number; tax_minor: number; total_minor: number };
}

/** JSON returned by the cart RPCs → Cart. */
export function toCart(json: unknown): Cart {
  const c = json as CartJson;
  return {
    market: c.market,
    currency: c.currency,
    freeShipThresholdMinor: c.free_ship_threshold_minor,
    count: c.count,
    lines: c.lines.map((l) => ({
      product: toProduct(l.product),
      qty: l.qty,
      lineTotalMinor: l.line_total_minor,
      inStock: l.in_stock,
      // absent before the archive migration: every line was available
      available: l.available ?? true,
    })),
    totals: {
      subtotalMinor: c.totals.subtotal_minor,
      shipMinor: c.totals.ship_minor,
      taxMinor: c.totals.tax_minor,
      totalMinor: c.totals.total_minor,
    },
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
    isDefault: row.is_default,
  };
}

type OrderWithItems = OrderRow & { items?: Partial<OrderItemRow>[]; order_items?: Partial<OrderItemRow>[] };

/** orders row with embedded items (PostgREST embed or RPC JSON) → Order. */
export function toOrder(row: OrderWithItems): Order {
  const items = (row.items ?? row.order_items ?? []).slice().sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  return {
    id: row.id,
    market: row.market_id as Market,
    currency: row.currency as CurrencyCode,
    status: row.status as OrderStatus,
    paymentMethod: row.payment_method as PaymentMethod,
    paymentLabel: row.payment_label,
    totals: {
      subtotalMinor: row.subtotal_minor,
      shipMinor: row.ship_minor,
      taxMinor: row.tax_minor,
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
    },
    items: items.map((it) => ({
      productId: it.product_id ?? '',
      title: it.title ?? '',
      image: it.image ?? '',
      seller: it.seller ?? '',
      unitPriceMinor: it.unit_price_minor ?? 0,
      qty: it.qty ?? 0,
    })),
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
    ...(row.gift ? { gift: row.gift_message ? { message: row.gift_message } : {} } : {}),
  };
}
