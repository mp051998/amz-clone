import type { ClimateCert } from './climate';
import type { CurrencyCode } from './contracts';
import type { DropoffSpot } from './dropoff';
import type { ExchangeCondition } from './exchange';
import type { QtyDiscount } from './qty-discount';
import type { FeatureStars } from './review-features';
import type { ProductUnit } from './unit-price';

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
  /** "Limit 3 per customer": the most units one shopper can buy across their orders (absent: no limit). */
  maxPerCustomer?: number;
  /** the sizes it comes in (clothes, shoes): one is picked before it goes in the cart (absent: no sizes). */
  sizes?: string[];
  /** how much it holds (3 fl oz, 150 ml), for the unit price beside its price (absent: none). */
  unit?: ProductUnit;
  /** "Save 5% when you buy 2 or more": a percent off each unit of a line of at least minQty (absent: none). */
  qtyDiscount?: QtyDiscount;
  /** when it comes out: until then it's sold as a pre-order and ships on the day (absent: out already). */
  releaseAt?: string;
  /** another seller's offer of this product (its id): not listed on its own, its page is the product's (absent: the product itself). */
  offerOf?: string;
  /** an offer's condition, when it isn't new (absent: new). */
  condition?: UsedCondition;
  /** what the seller says about the item's condition (absent: nothing). */
  conditionNote?: string;
  /** can be bought with Subscribe & Save, delivered every few months (absent: it can't). */
  subscribeSave?: boolean;
  /** Climate Pledge Friendly: its sustainability certifications (absent: it has none). */
  climate?: ClimateCert[];
  /** Small Business: its brand is one of the store's small businesses (absent: it isn't). */
  smallBusiness?: true;
}

/** The conditions an offer can be in other than new: Amazon's renewed and used grades. */
export type UsedCondition = 'renewed' | 'used_like_new' | 'used_very_good' | 'used_good' | 'used_acceptable';

export interface Category {
  slug: string;
  name: string;
}

export interface OrderTotals {
  /** the items at their list price */
  subtotalMinor: number;
  /** what applied coupons, quantity discounts and a promotion code take off the items (0 or absent without any) */
  discountMinor?: number;
  /** the quantity discounts' part of discountMinor (absent without one) */
  qtyDiscountMinor?: number;
  /** the promotion code's part of discountMinor (absent without one) */
  promoMinor?: number;
  /** the Subscribe & Save part of discountMinor (absent without one) */
  snsMinor?: number;
  /** the Bank Offer's part of discountMinor (absent without one) */
  bankOfferMinor?: number;
  /** an old device traded in: its part of discountMinor (absent without one) */
  exchangeMinor?: number;
  shipMinor: number;
  taxMinor: number;
  /** gift wrap, per unit wrapped (absent or 0 without it) */
  wrapMinor?: number;
  /** protection plans on the items (absent or 0 without any) */
  protectionMinor?: number;
  totalMinor: number;
}

export interface CartLine {
  product: Product;
  qty: number;
  lineTotalMinor: number;
  /** the product's coupon, applied (clipped) by this shopper or not */
  coupon?: { percentOff: number; clipped: boolean };
  /** what the applied coupon, the quantity discount and a promotion code take off this line (0 without any) */
  discountMinor?: number;
  /** the quantity discount's part of discountMinor, when the line holds enough (absent otherwise) */
  qtyDiscountMinor?: number;
  /** false when stock dropped below the quantity in the cart, or the product was archived. */
  inStock: boolean;
  /** false when the product was archived: it must be removed before checkout. */
  available: boolean;
  /** ticked for checkout; unticked lines stay in the cart, outside the subtotal. */
  selected: boolean;
  /** the store's protection plan for the product, per unit, and whether this line has it (absent when there's no plan) */
  protection?: { unitMinor: number; added: boolean };
  /** the product's price when it was put in the cart (absent for lines from before that was kept) */
  addedPriceMinor?: number;
  /** the promotion code's part of discountMinor at checkout (absent without one) */
  promoMinor?: number;
  /** the size picked, for a product that comes in sizes */
  size?: string;
  /** the product comes in sizes and the line has none of them: it needs one before checkout */
  needsSize?: boolean;
}

/** A promotion code applied at checkout. */
export interface AppliedPromo {
  code: string;
  percentOff: number;
  description: string;
  /** the one category it's for (absent for the whole store) */
  category?: string;
}

export interface Cart {
  market: Market;
  currency: CurrencyCode;
  lines: CartLine[];
  /** every item in the cart (the header badge) */
  count: number;
  /** the items the subtotal and checkout cover (the ticked lines) */
  selectedCount: number;
  totals: OrderTotals;
  freeShipThresholdMinor: number;
  /** the promotion code priced in (checkout quotes only) */
  promo?: AppliedPromo;
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
  | 'not_as_described'
  /** a "Package didn't arrive" claim: the whole order, refunded at once with nothing sent back */
  | 'not_received'
  /** a granted A-to-z Guarantee claim: one seller's items, refunded at once with nothing sent back */
  | 'atoz_claim';

/** refund: money back once the items arrive; replacement: the same items again, sent now at no charge. */
export type ReturnResolution = 'refund' | 'replacement';

export interface ReturnItem {
  productId: string;
  title: string;
  image: string;
  unitPriceMinor: number;
  qty: number;
  /** the size ordered, for a product that comes in sizes */
  size?: string;
  /** bought as another seller's offer: the product it's an offer of (reviews, buy again and recalls go by it) */
  offerOf?: string;
  /** the condition it was bought in, when it wasn't new (another seller's renewed or used offer) */
  condition?: UsedCondition;
}

/** A return of some of a delivered order's items. */
export interface OrderReturn {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  comment?: string;
  resolution: ReturnResolution;
  /** a replacement's delivery: ships, then arrives (absent for a refund) */
  replacement?: { shippedAt: string; deliveredAt: string };
  items: ReturnItem[];
  /** the refund: items, their share of tax, and of delivery when the store was at fault (zero for a replacement) */
  itemsMinor: number;
  taxMinor: number;
  shipMinor: number;
  /** the returned units' protection plans, cancelled with them (absent without any) */
  protectionMinor?: number;
  /** gift wrap, refunded only when the package didn't arrive (absent otherwise) */
  wrapMinor?: number;
  refundMinor: number;
  /** the part of the refund back to the balance, on an order paid partly from it (absent with none) */
  balanceRefundMinor?: number;
  /** set once the store has received the items */
  refund?: { status: 'pending' | 'succeeded' | 'failed'; refundedAt?: string };
  /** the shopper asked for the refund on their balance in the store, not back to how they paid (absent otherwise) */
  refundToBalance?: boolean;
  dropoffCode: string;
  dropoffBy: string;
  /** the Hub Locker or Hub Counter the shopper chose to drop it off at (absent: any drop-off point, or a pickup) */
  dropoffPoint?: PickupPoint;
  /** a courier collects it from the delivery address on this day, "2026-10-14" in the store's time zone (absent: it's dropped off) */
  pickupOn?: string;
  rejectNote?: string;
  createdAt: string;
  receivedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
}
export type PaymentMethod = 'card' | 'giftcard' | 'upi' | 'netbanking' | 'cod' | 'emi' | 'amazonpay' | 'paylater';

export interface OrderItem {
  productId: string;
  title: string;
  image: string;
  seller: string;
  unitPriceMinor: number;
  qty: number;
  /** what a coupon, a quantity discount and a promotion code took off each unit (absent without any) */
  unitDiscountMinor?: number;
  /** the quantity discount's part of unitDiscountMinor (absent without one) */
  unitQtyDiscountMinor?: number;
  /** the promotion code's part of unitDiscountMinor (absent without one) */
  unitPromoMinor?: number;
  /** the protection plan bought with it, per unit (absent without one) */
  protectionMinor?: number;
  /** the size ordered, for a product that comes in sizes */
  size?: string;
  /** the product it was another seller's offer on (absent when bought from the product itself) */
  offerOf?: string;
  /** a renewed or used offer's condition (absent when new) */
  condition?: UsedCondition;
  /** the Subscribe & Save subscription that delivered it (absent when bought otherwise) */
  subscriptionId?: string;
  /** the Subscribe & Save part of unitDiscountMinor (absent without one) */
  unitSnsMinor?: number;
  /** the Bank Offer's part of unitDiscountMinor (absent without one) */
  unitBankMinor?: number;
  /** an old device traded in for it: its part of unitDiscountMinor (absent without one) */
  unitExchangeMinor?: number;
  /**
   * days after delivery it can be returned, when its category had its own window in the store
   * when it was ordered (0: not returnable); absent for the store's own window
   */
  returnDays?: number;
  /** its category was replacement only in the store when it was ordered: back for a fault only, replaced */
  replacementOnly?: boolean;
}

/** Some items of an order cancelled before it shipped, with their own refund. */
export interface OrderCancellation {
  id: string;
  items: OrderItem[];
  /** what the items cost after any coupon */
  itemsMinor: number;
  /** the tax that no longer applies */
  taxMinor: number;
  /** the cancelled units' gift wrap (absent without it) */
  wrapMinor?: number;
  /** the cancelled lines' protection plans (absent without any) */
  protectionMinor?: number;
  /** `balanceMinor`: the part of it back to the balance, on an order paid partly from it (absent with none) */
  refund: { status: RefundStatus; amountMinor: number; refundedAt?: string; balanceMinor?: number };
  createdAt: string;
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
  /** the delivery note the shopper gave with this order */
  instructions?: string;
  /** where the courier leaves it when nobody's there (absent: no preference) */
  dropoff?: DropoffSpot;
}

/** Delivery speed chosen at checkout: standard, faster (paid), or on the Plus member's Delivery Day. */
export type ShipSpeed = 'standard' | 'fast' | 'day' | 'no_rush';

export interface Order {
  id: string;
  market: Market;
  currency: CurrencyCode;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  /**
   * paid partly from the shopper's balance (card, UPI or net banking paid the rest): the balance's
   * part and what the payment method was charged, as placed (absent otherwise)
   */
  split?: { balanceMinor: number; chargedMinor: number };
  /**
   * an old device traded in (Buy Now of one phone or laptop, amazon.in): its name as ordered, its
   * condition and what it took off (`deviceId` absent once the store stops listing it); collected
   * when the order is delivered
   */
  exchange?: { deviceId?: string; device: string; condition: ExchangeCondition; valueMinor: number };
  totals: OrderTotals;
  shipTo: ShippingAddress;
  /** set while the shopper keeps it out of their order list */
  archivedAt?: string;
  items: OrderItem[];
  createdAt: string;
  placedAt?: string;
  /** when a Cash on Delivery order was paid online before delivery ("Pay now"); it's paid by `paymentMethod` since */
  prepaidAt?: string;
  /** saved delivery schedule, set when the order is placed (absent before the lifecycle migration). */
  shippedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  /**
   * set once a paid (or cash on delivery) order is cancelled; `balanceMinor` is the part of it back to
   * the balance, on an order paid partly from it (absent with none)
   */
  refund?: { status: RefundStatus; amountMinor: number; refundedAt?: string; balanceMinor?: number };
  /** items cancelled before it shipped while the rest kept coming, oldest first (absent with none). */
  cancellations?: OrderCancellation[];
  /** a gift order, with the note for the recipient when there is one, and whether it's gift-wrapped. */
  gift?: { message?: string; wrapped?: boolean };
  /** delivery speed chosen at checkout (absent means standard). */
  shipSpeed?: ShipSpeed;
  /** a Delivery Day order: the weekday it arrives on (ISO, 1 = Monday) */
  deliveryDay?: number;
  /** a No-Rush order: the reward it earns (to the gift card balance once it ships), and when it was credited */
  noRushReward?: { amountMinor: number; creditedAt?: string };
  /**
   * a pickup order: the pickup point it goes to (its name and street are `shipTo.line1` and
   * `line2`) and the six-digit code to collect it with
   */
  pickup?: { pointId: string; code: string };
  /**
   * a high-value order's six-digit one-time password, which the courier needs to hand it over
   * (absent: none needed, or a pickup order)
   */
  deliveryOtp?: string;
  /** a pre-order: when its last item comes out; it ships from then (absent: nothing on it was a pre-order). */
  releaseAt?: string;
  /** EMI orders: how many monthly payments the shopper chose. */
  emiMonths?: number;
  /** the promotion code used at checkout (absent without one) */
  promoCode?: string;
  /** net banking and EMI: the bank paid through, whose Bank Offer applied when `totals.bankOfferMinor` says so */
  bank?: string;
  /** India: the business buyer's GSTIN and name for a GST invoice (absent without one) */
  gst?: { gstin: string; name: string };
}

/** A Hub Locker (open around the clock, no cash) or Hub Counter (shop hours) to collect orders at. */
export interface PickupPoint {
  id: string;
  kind: 'locker' | 'counter';
  name: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  /** opening hours, as the point gives them */
  hours: string;
  /** how many days it holds an order for collection */
  holdDays: number;
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
  /** delivery note for the courier ("Leave it with the front desk") */
  instructions?: string;
  /** where to leave packages here when nobody's there to take them (absent: no preference) */
  dropoff?: DropoffSpot;
  isDefault?: boolean;
}

export interface Review {
  id: string;
  author: string;
  /** the reviewer's account, for their public profile (/profile/:id); absent once the account is closed */
  authorId?: string;
  initial: string;
  rating: number;
  title: string;
  body: string;
  /** ISO timestamp */
  createdAt: string;
  verified: boolean;
  /** a Vine Customer Review of Free Product (never a verified purchase); absent otherwise */
  vine?: boolean;
  helpful: number;
  /** true when the signed-in viewer wrote it. */
  mine: boolean;
  /** the signed-in viewer marked it helpful. */
  votedHelpful: boolean;
  /** the signed-in viewer reported it. */
  reported: boolean;
  /** hidden from shoppers (reports or an admin); only its author sees it, on their own review. */
  hidden?: boolean;
  /** up to 5, in the author's order */
  photos: ReviewPhoto[];
  /** clothing and shoes: how the author found it fits (absent when not answered) */
  fit?: ReviewFit;
  /** "By feature": the author's 1–5 stars on features of the product (absent when none rated) */
  features?: FeatureStars;
}

/** "How does it fit?" on a review of clothing or shoes. */
export type ReviewFit = 'small' | 'true_to_size' | 'large';

/** A photo on a review: its storage path (what a review lists) and public URL. */
export interface ReviewPhoto {
  path: string;
  url: string;
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

/** Why a subscription's last delivery wasn't sent. */
export type SubscriptionIssue = 'out_of_stock' | 'unavailable' | 'address' | 'payment';

/** A Subscribe & Save subscription: a product delivered every few months, each delivery its own order. */
export interface Subscription {
  id: string;
  market: Market;
  productId: string;
  /** how many each delivery (1–10) */
  qty: number;
  /** how often, in months (1–6) */
  everyMonths: number;
  /** the store's date the next delivery is placed on (YYYY-MM-DD) */
  nextOn: string;
  /** where it goes (absent: that address was deleted, so nothing goes until another is chosen) */
  addressId?: string;
  paymentMethod: PaymentMethod;
  status: 'active' | 'cancelled';
  /** why the last delivery wasn't sent, and the store's date it should have gone (absent: it went) */
  issue?: { kind: SubscriptionIssue; on: string };
  /** the last delivery's order (absent: none yet, or deleted) */
  lastOrderId?: string;
  createdAt: string;
  cancelledAt?: string;
}

/**
 * A Lightning Deal: a product's price for a few hours, for so many units. While it's live the
 * product carries the deal price; `wasPriceMinor` is what it cost before.
 */
export interface LightningDeal {
  id: string;
  productId: string;
  market: Market;
  dealPriceMinor: number;
  /** the price before it went live (absent while upcoming) */
  wasPriceMinor?: number;
  /** units at the deal price, and how many have been ordered */
  quota: number;
  claimed: number;
  startsAt: string;
  endsAt: string;
  /** live now; upcoming; or sold out before its end */
  state: 'live' | 'upcoming' | 'sold_out';
}
