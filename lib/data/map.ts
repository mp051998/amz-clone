import { climateCerts } from '../climate';
import type { CurrencyCode } from '../contracts';
import type { Database } from '../db/database.types';
import { isDropoffSpot } from '../dropoff';
import { isExchangeCondition } from '../exchange';
import { earlyAccessAt } from '../lightning';
import { isUsedCondition } from '../offers';
import { isUnitKind } from '../unit-price';
import type { Address, CancelReason, Cart, LightningDeal, Market, Order, OrderCancellation, OrderItem, OrderStatus, PaymentMethod, Product, RefundStatus, Subscription, SubscriptionIssue } from '../types';

type ProductRow = Database['public']['Views']['catalog_products_all']['Row'];
type AddressRow = Database['public']['Tables']['addresses']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type OrderItemRow = Database['public']['Tables']['order_items']['Row'];
type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
type LightningDealRow = Database['public']['Tables']['lightning_deals']['Row'];

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
    // absent on rows read before the purchase limits migration lands
    maxPerCustomer: opt(row.max_per_customer),
    // absent on rows read before the sizes migration lands
    ...(row.sizes?.length ? { sizes: row.sizes } : {}),
    // absent on rows read before the unit price migration lands
    ...(row.unit_qty != null && isUnitKind(row.unit_kind) ? { unit: { qty: Number(row.unit_qty), kind: row.unit_kind } } : {}),
    // absent on rows read before the quantity discounts migration lands
    ...(row.qty_discount_pct && row.qty_discount_min ? { qtyDiscount: { percentOff: row.qty_discount_pct, minQty: row.qty_discount_min } } : {}),
    // absent on rows read before the Plus exclusive deals migration lands
    ...(row.member_pct ? { memberPct: row.member_pct } : {}),
    // absent on rows read before the pre-orders migration lands
    ...(row.release_at ? { releaseAt: row.release_at } : {}),
    // absent on rows read before the seller offers migration lands
    ...(row.offer_of ? { offerOf: row.offer_of } : {}),
    ...(isUsedCondition(row.condition) ? { condition: row.condition } : {}),
    ...(row.condition_note ? { conditionNote: row.condition_note } : {}),
    // absent on rows read before the Subscribe & Save migration lands
    ...(row.subscribe_save ? { subscribeSave: true } : {}),
    // absent on rows read before the Climate Pledge Friendly migration lands
    ...(climateCerts(row.climate).length ? { climate: climateCerts(row.climate) } : {}),
    // absent on rows read before the Small Business migration
    ...(row.small_business ? { smallBusiness: true as const } : {}),
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
    member_minor?: number;
    early_access_minor?: number;
    qty_discount_minor?: number;
    size?: string | null;
    needs_size?: boolean;
  }[];
  totals: { subtotal_minor: number; discount_minor?: number; member_minor?: number; qty_discount_minor?: number; promo_minor?: number; ship_minor: number; tax_minor: number; protection_minor?: number; total_minor: number };
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
      // absent before the Plus exclusive deals migration, and for anyone but a member
      ...(l.member_minor ? { memberMinor: l.member_minor } : {}),
      // absent before the Lightning Deal early access migration, and outside it
      ...(l.early_access_minor ? { earlyAccessMinor: l.early_access_minor } : {}),
      // absent before the quantity discounts migration
      ...(l.qty_discount_minor ? { qtyDiscountMinor: l.qty_discount_minor } : {}),
      // absent before the sizes migration
      ...(l.size ? { size: l.size } : {}),
      ...(l.needs_size ? { needsSize: true } : {}),
    })),
    totals: {
      subtotalMinor: c.totals.subtotal_minor,
      discountMinor: c.totals.discount_minor ?? 0,
      ...(c.totals.member_minor ? { memberMinor: c.totals.member_minor } : {}),
      ...(c.totals.qty_discount_minor ? { qtyDiscountMinor: c.totals.qty_discount_minor } : {}),
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
    // likewise before the drop-off spots migration
    ...(isDropoffSpot(row.dropoff) ? { dropoff: row.dropoff } : {}),
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
      // absent on rows read before the Plus exclusive deals migration lands
      ...(it.unit_member_minor ? { unitMemberMinor: it.unit_member_minor } : {}),
      // absent on rows read before the quantity discounts migration lands
      ...(it.unit_qty_discount_minor ? { unitQtyDiscountMinor: it.unit_qty_discount_minor } : {}),
      ...(it.protection_minor ? { protectionMinor: it.protection_minor } : {}),
      // absent on rows read before the sizes migration lands
      ...(it.size ? { size: it.size } : {}),
      // absent on rows read before the seller offers migration lands (and on cancelled items)
      ...(it.offer_of ? { offerOf: it.offer_of } : {}),
      ...(isUsedCondition(it.condition) ? { condition: it.condition } : {}),
      // absent on rows read before the Subscribe & Save migration lands
      ...(it.subscription_id ? { subscriptionId: it.subscription_id } : {}),
      ...(it.unit_sns_minor ? { unitSnsMinor: it.unit_sns_minor } : {}),
      // absent on rows read before the Bank Offers migration lands
      ...(it.unit_bank_minor ? { unitBankMinor: it.unit_bank_minor } : {}),
      // absent on rows read before the exchange offers migration lands
      ...(it.unit_exchange_minor ? { unitExchangeMinor: it.unit_exchange_minor } : {}),
      // absent on rows read before the category return windows migration lands, and for the store's window
      ...(typeof it.return_days === 'number' ? { returnDays: it.return_days } : {}),
      // absent on rows read before the replacement-only migration lands, and for refundable lines
      ...(it.replacement_only ? { replacementOnly: true } : {}),
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
    refund: {
      status: row.refund_status as RefundStatus,
      amountMinor: row.refund_minor,
      refundedAt: opt(row.refunded_at),
      // absent on rows read before the split payment migration lands
      ...(row.balance_refund_minor ? { balanceMinor: row.balance_refund_minor } : {}),
    },
    createdAt: row.created_at,
  };
}

/** orders row with embedded items (PostgREST embed or RPC JSON) → Order. */
export function toOrder(row: OrderWithItems): Order {
  // absent on rows read before the cancel-items migration lands
  const items = toOrderItems(row.items ?? row.order_items ?? []);
  // the promotion's part of the discount, over the items still in the order
  const promoMinor = items.reduce((s, it) => s + (it.unitPromoMinor ?? 0) * it.qty, 0);
  // and a member's price's
  const memberMinor = items.reduce((s, it) => s + (it.unitMemberMinor ?? 0) * it.qty, 0);
  // and the quantity discounts' part
  const qtyDiscountMinor = items.reduce((s, it) => s + (it.unitQtyDiscountMinor ?? 0) * it.qty, 0);
  // and Subscribe & Save's
  const snsMinor = items.reduce((s, it) => s + (it.unitSnsMinor ?? 0) * it.qty, 0);
  // and the Bank Offer's
  const bankOfferMinor = items.reduce((s, it) => s + (it.unitBankMinor ?? 0) * it.qty, 0);
  // and an exchange's
  const exchangeMinor = items.reduce((s, it) => s + (it.unitExchangeMinor ?? 0) * it.qty, 0);
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
    // absent on rows read before the split payment migration lands
    ...(row.balance_minor && row.charged_minor ? { split: { balanceMinor: row.balance_minor, chargedMinor: row.charged_minor } } : {}),
    // absent on rows read before the exchange offers migration lands
    ...(row.exchange_device && row.exchange_minor && isExchangeCondition(row.exchange_condition)
      ? {
          exchange: {
            ...(row.exchange_device_id ? { deviceId: row.exchange_device_id } : {}),
            device: row.exchange_device,
            condition: row.exchange_condition,
            valueMinor: row.exchange_minor,
          },
        }
      : {}),
    totals: {
      subtotalMinor: row.subtotal_minor,
      // absent on rows read before the coupons migration lands
      discountMinor: row.discount_minor ?? 0,
      ...(memberMinor ? { memberMinor } : {}),
      ...(qtyDiscountMinor ? { qtyDiscountMinor } : {}),
      ...(promoMinor ? { promoMinor } : {}),
      ...(snsMinor ? { snsMinor } : {}),
      ...(bankOfferMinor ? { bankOfferMinor } : {}),
      ...(exchangeMinor ? { exchangeMinor } : {}),
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
      ...(isDropoffSpot(row.ship_dropoff) ? { dropoff: row.ship_dropoff } : {}),
    },
    items,
    createdAt: row.created_at,
    placedAt: opt(row.placed_at),
    // a Cash on Delivery order paid online before it arrived (Pay now)
    prepaidAt: opt(row.prepaid_at),
    // the lifecycle columns are absent on rows read before that migration lands
    shippedAt: opt(row.shipped_at),
    outForDeliveryAt: opt(row.out_for_delivery_at),
    deliveredAt: opt(row.delivered_at),
    cancelledAt: opt(row.cancelled_at),
    cancelReason: opt(row.cancel_reason) as CancelReason | undefined,
    refund: row.refund_status
      ? {
          status: row.refund_status as RefundStatus,
          amountMinor: row.refund_minor ?? row.total_minor,
          refundedAt: opt(row.refunded_at),
          ...(row.balance_refund_minor ? { balanceMinor: row.balance_refund_minor } : {}),
        }
      : undefined,
    // absent on rows read before the gift migration lands
    ...(row.gift ? { gift: { ...(row.gift_message ? { message: row.gift_message } : {}), ...(row.gift_wrap ? { wrapped: true } : {}) } } : {}),
    ...(row.ship_speed === 'fast' || row.ship_speed === 'day' || row.ship_speed === 'no_rush' ? { shipSpeed: row.ship_speed } : {}),
    // absent on rows read before the No-Rush migration lands
    ...(row.no_rush_reward_minor
      ? { noRushReward: { amountMinor: row.no_rush_reward_minor, ...(row.reward_credited_at ? { creditedAt: row.reward_credited_at } : {}) } }
      : {}),
    // absent on rows read before the Delivery Day migration lands
    ...(row.delivery_day ? { deliveryDay: row.delivery_day } : {}),
    // absent on rows read before the pickup migration lands
    ...(row.pickup_point_id && row.pickup_code ? { pickup: { pointId: row.pickup_point_id, code: row.pickup_code } } : {}),
    // absent on rows read before the delivery OTP migration lands
    ...(row.delivery_otp ? { deliveryOtp: row.delivery_otp } : {}),
    // absent on rows read before the pre-orders migration lands
    ...(row.release_at ? { releaseAt: row.release_at } : {}),
    ...(row.emi_months ? { emiMonths: row.emi_months } : {}),
    ...(row.promo_code ? { promoCode: row.promo_code } : {}),
    // absent on rows read before the Bank Offers migration lands
    ...(row.bank ? { bank: row.bank } : {}),
    // absent on rows read before the GST invoice migration lands
    ...(row.gstin ? { gst: { gstin: row.gstin, name: row.gst_name ?? '' } } : {}),
    // absent on rows read before the archive migration lands
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    ...(cancellations.length ? { cancellations } : {}),
  };
}

/** subscriptions row (from a select or RPC JSON) → Subscription. */
export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    market: row.market_id as Market,
    productId: row.product_id,
    qty: row.qty,
    everyMonths: row.every_months,
    nextOn: row.next_on,
    ...(row.address_id ? { addressId: row.address_id } : {}),
    paymentMethod: row.payment_method as PaymentMethod,
    status: row.status === 'cancelled' ? 'cancelled' : 'active',
    ...(row.issue && row.issue_on ? { issue: { kind: row.issue as SubscriptionIssue, on: row.issue_on } } : {}),
    ...(row.last_order_id ? { lastOrderId: row.last_order_id } : {}),
    createdAt: row.created_at,
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
  };
}

/** lightning_deals row → LightningDeal; null for one that's over (its time came, or it was called off). */
export function toLightningDeal(row: LightningDealRow): LightningDeal | null {
  const state = row.ended_at ? (row.end_reason === 'sold_out' ? 'sold_out' : null) : row.started_at ? 'live' : 'upcoming';
  if (!state) return null;
  return {
    id: row.id,
    productId: row.product_id,
    market: row.market_id as Market,
    dealPriceMinor: row.deal_price_minor,
    ...(row.was_price_minor != null ? { wasPriceMinor: row.was_price_minor } : {}),
    quota: row.quota,
    claimed: row.claimed,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    earlyAccessAt: earlyAccessAt(row.starts_at),
    state,
  };
}
