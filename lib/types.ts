import type { CurrencyCode } from './contracts';

/** Storefront id — amazon.com (US) or amazon.in (IN). */
export type Market = 'US' | 'IN';

/** A catalog product as every listing renders it (read from `catalog_products`). */
export interface Product {
  id: string;
  market: Market;
  title: string;
  brand?: string;
  category: string;
  categoryName: string;
  image: string;
  priceMinor: number;
  listMinor?: number;
  dealPct?: number;
  rating: number;
  reviewCount: number;
  seller: string;
  shipsFrom: string;
  bullets: string[];
  badge?: string;
  deal?: boolean;
  boughtPastMonth?: string;
  /** units available to order right now. */
  stock: number;
  /** currency the price fields are in — always the product's market currency. */
  curBase: CurrencyCode;
  /** taken off sale by an admin: out of every listing, its page says "no longer available". */
  archived?: boolean;
  /** one of several options of a product (Color: Black); listings show one card per group. */
  variant?: { group: string; axis: string; label: string };
}

export interface Category {
  slug: string;
  name: string;
}

export interface OrderTotals {
  subtotalMinor: number;
  shipMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface CartLine {
  product: Product;
  qty: number;
  lineTotalMinor: number;
  /** false when stock dropped below the quantity in the cart, or the product was archived. */
  inStock: boolean;
  /** false when the product was archived: it must be removed before checkout. */
  available: boolean;
}

export interface Cart {
  market: Market;
  currency: CurrencyCode;
  lines: CartLine[];
  count: number;
  totals: OrderTotals;
  freeShipThresholdMinor: number;
}

export type OrderStatus = 'awaiting_payment' | 'placed' | 'cancelled';
/** Where an order is now: its status, or for a placed order the latest stage time that has passed. */
export type OrderStage = 'awaiting_payment' | 'preparing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type CancelReason = 'customer' | 'admin' | 'sold_out';
/** pending: card refund asked of Stripe; not_charged: cash on delivery, nothing to give back. */
export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'not_charged';

export type ReturnStatus = 'requested' | 'received' | 'rejected' | 'cancelled';
export type ReturnReason =
  | 'no_longer_needed'
  | 'bought_by_mistake'
  | 'better_price'
  | 'damaged'
  | 'defective'
  | 'wrong_item'
  | 'missing_parts'
  | 'not_as_described';

export interface ReturnItem {
  productId: string;
  title: string;
  image: string;
  unitPriceMinor: number;
  qty: number;
}

/** A return of some of a delivered order's items. */
export interface OrderReturn {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  comment?: string;
  items: ReturnItem[];
  /** the refund: items, their share of tax, and of delivery when the store was at fault */
  itemsMinor: number;
  taxMinor: number;
  shipMinor: number;
  refundMinor: number;
  /** set once the store has received the items */
  refund?: { status: 'pending' | 'succeeded' | 'failed'; refundedAt?: string };
  dropoffCode: string;
  dropoffBy: string;
  rejectNote?: string;
  createdAt: string;
  receivedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
}
export type PaymentMethod = 'card' | 'giftcard' | 'upi' | 'netbanking' | 'cod' | 'emi' | 'amazonpay';

export interface OrderItem {
  productId: string;
  title: string;
  image: string;
  seller: string;
  unitPriceMinor: number;
  qty: number;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postcode: string;
}

export interface Order {
  id: string;
  market: Market;
  currency: CurrencyCode;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  totals: OrderTotals;
  shipTo: ShippingAddress;
  items: OrderItem[];
  createdAt: string;
  placedAt?: string;
  /** saved delivery schedule, set when the order is placed (absent before the lifecycle migration). */
  shippedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  /** set once a paid (or cash on delivery) order is cancelled. */
  refund?: { status: RefundStatus; amountMinor: number; refundedAt?: string };
}

/**
 * A saved shipping address. Field names are store-neutral; the US/IN schema
 * difference is only in which fields the form collects (landmark/kind are IN-only).
 */
export interface Address {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  zip: string;
  kind?: 'home' | 'office';
  isDefault?: boolean;
}

export interface Review {
  id: string;
  author: string;
  initial: string;
  rating: number;
  title: string;
  body: string;
  /** ISO timestamp */
  createdAt: string;
  verified: boolean;
  helpful: number;
  /** true when the signed-in viewer wrote it. */
  mine: boolean;
  /** the signed-in viewer marked it helpful. */
  votedHelpful: boolean;
  /** the signed-in viewer reported it. */
  reported: boolean;
  /** hidden from shoppers (reports or an admin); only its author sees it, on their own review. */
  hidden?: boolean;
}

export interface RatingBar {
  star: number;
  count: number;
  pct: number;
}

export interface RatingSummary {
  rating: number;
  count: number;
  bars: RatingBar[];
}
