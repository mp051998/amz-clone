import type { PostgrestError } from '@supabase/supabase-js';

/** HTTP status for each domain error code the database (or service layer) raises. */
const STATUS: Record<string, number> = {
  not_authenticated: 401,
  forbidden: 403,
  product_not_found: 404,
  order_not_found: 404,
  review_not_found: 404,
  address_not_found: 404,
  collection_not_found: 404,
  not_found: 404,
  unknown_market: 400,
  invalid_mode: 400,
  cart_token_required: 400,
  invalid_json: 400,
  unsupported_media_type: 415,
  method_not_allowed: 405,
  invalid_input: 422,
  invalid_shipping_address: 422,
  invalid_postcode: 422,
  invalid_category: 422,
  payment_method_unavailable: 422,
  mixed_categories: 409,
  cart_empty: 409,
  product_has_orders: 409,
  out_of_stock: 409,
  insufficient_stock: 409,
  address_limit: 409,
  collection_limit: 409,
  collection_item_limit: 409,
  own_review: 409,
  duplicate: 409,
  order_not_pending: 409,
  amount_mismatch: 409,
  session_mismatch: 409,
  stock_released: 409,
  not_a_card_order: 409,
  payment_incomplete: 402,
  payments_unavailable: 503,
};

/** Customer-facing copy for each code (API clients get `code`; pages show `message`). */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Sign in to continue.',
  forbidden: 'You do not have access to that.',
  product_not_found: 'That product is not available in this store.',
  order_not_found: 'Order not found.',
  review_not_found: 'Review not found.',
  address_not_found: 'Address not found.',
  collection_not_found: 'Collection not found.',
  not_found: 'Not found.',
  unknown_market: 'Unknown store.',
  invalid_input: 'Some of the details you entered are not valid.',
  invalid_json: 'The request body must be valid JSON.',
  unsupported_media_type: 'Send the request body as application/json.',
  cart_token_required: 'Send the guest cart token in the X-Cart-Token header.',
  invalid_shipping_address: 'Please complete the shipping address.',
  invalid_postcode: 'Enter a valid postcode for this store.',
  invalid_category: 'Pick a category this store carries.',
  payment_method_unavailable: 'That payment method is not available in this store.',
  mixed_categories: 'Products from different categories can\'t be ranked against each other.',
  cart_empty: 'Your cart is empty.',
  product_has_orders: 'This product has been ordered, so it can\'t be deleted. Set its stock to 0 to stop selling it.',
  out_of_stock: 'That item is out of stock.',
  insufficient_stock: 'An item in your cart no longer has enough stock. Please review your cart.',
  address_limit: 'You can save up to 5 addresses per store.',
  collection_limit: 'You can have up to 20 collections.',
  collection_item_limit: 'A collection can hold up to 200 items.',
  own_review: 'You cannot vote on your own review.',
  duplicate: 'You have already done that.',
  order_not_pending: 'That order is not awaiting payment.',
  amount_mismatch: 'The payment amount did not match the order. You have not been charged twice — contact support.',
  session_mismatch: 'That payment does not belong to this order.',
  stock_released: 'Your payment went through, but an item sold out meanwhile. A refund will be issued.',
  not_a_card_order: 'That order is not paid by card.',
  payment_incomplete: 'Payment was not completed.',
  payments_unavailable: 'Card payments are unavailable right now.',
};

/** Customer-facing copy for a code carried in a URL (`?error=code`); null when unknown. */
export function messageFor(code: string | null | undefined): string | null {
  return code ? MESSAGES[code] ?? null : null;
}

export class DataError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(code: string, detail?: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code);
    this.name = 'DataError';
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.detail = detail;
  }
}

/**
 * Translate a PostgREST error into a DataError. RPCs raise their domain code as
 * the exception message (e.g. `raise exception 'out_of_stock'`); constraint and
 * RLS violations map onto generic codes.
 */
export function fromPostgrest(err: PostgrestError): DataError {
  if (err.message in STATUS) return new DataError(err.message, err.details || undefined);
  switch (err.code) {
    case '23514': // check_violation
    case '22P02': // invalid_text_representation (bad uuid etc.)
    case '23502': // not_null_violation
      return new DataError('invalid_input', err.message);
    case '23505':
      return new DataError('duplicate', err.message);
    case '23503':
      return new DataError('not_found', err.message);
    case '42501':
      return new DataError('forbidden', err.message);
    case 'PGRST116':
      return new DataError('not_found');
  }
  const e = new DataError('internal', err.message, 'Something went wrong. Please try again.');
  return e;
}

type Response = { data: unknown; error: PostgrestError | null };

/** Unwrap a Supabase response, throwing a DataError on failure. Returns the success branch's data type. */
export function unwrap<R extends Response>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw fromPostgrest(res.error);
  return res.data as Extract<R, { error: null }>['data'];
}
