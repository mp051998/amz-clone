# Storefront API (v1)

The storefront is backed by Supabase Postgres. Every read and write below
runs against the real database. There are no mocks or fixtures. Business rules
live in the database, where both the web app and API clients hit them: stock
reservation, totals, one review per customer, verified purchases, and the address
book limits. They are enforced by row-level security, triggers and
`SECURITY DEFINER` functions. The web app (server actions) and this HTTP API
are two thin clients over the same data layer (`lib/data/*`).

Base URL: `https://<host>/api/v1` (local: `http://localhost:3000/api/v1`).
`GET /api/v1` returns a machine-readable index of what follows.

## Conventions

| Topic | Rule |
| --- | --- |
| Format | JSON in, JSON out. `POST`/`PATCH` bodies must be `Content-Type: application/json` (else `415`). An empty body is treated as `{}`. |
| Store | `?market=US` (amazon.com, USD) or `?market=IN` (amazon.in, INR). You can also send an `X-Market` header. The default is `US`. Carts, orders, addresses, categories and search are all per store. |
| Auth | `Authorization: Bearer <accessToken>` from `POST /auth/token`. The web app's session cookie is accepted too. Endpoints marked 🔒 return `401 not_authenticated` without one. |
| Guest cart | Guests address their cart with `X-Cart-Token: <uuid>`. You don't create one: the first cart write without a token mints one. It comes back in the `X-Cart-Token` response header and as `cartToken` in the body. Keep it, then fold it into the account after sign-in with `POST /cart/merge`. |
| Money | Integer minor units (cents / paise), e.g. `priceMinor: 2199` = $21.99. The currency is on the cart / order / product (`curBase`). |
| Errors | `{"error": {"code", "message", "detail?"}}` with a matching status (table below). `detail` names the offending field for `422`s. |
| CORS | `Access-Control-Allow-Origin: *`. The allowed headers are `Authorization, Content-Type, X-Cart-Token, X-Market`. `X-Cart-Token` is exposed. |
| Caching | Every response is `Cache-Control: no-store`. |

### Store rules (from the `markets` table)

| | US | IN |
| --- | --- | --- |
| Currency | USD | INR |
| Tax | 8% added at checkout | prices include GST |
| Shipping | $5.99, free from $35 | ₹40, free from ₹499 |
| Payment methods | `card`, `giftcard` | `upi`, `card`, `netbanking`, `cod`, `emi`, `amazonpay` |
| Address | US ZIP, 2-letter state | 6-digit pincode, `line2` (area) required, optional `landmark`, `addressType: home|office` |

Max 30 units per cart line. Quantities are also capped at available stock.

## Auth

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/auth/signup` | `{email, password, name?}` | `201` token pair. If the project requires email confirmation: `202 {confirmationRequired: true, user}` |
| POST | `/auth/token` | `{email, password}` | `200` token pair |
| POST | `/auth/refresh` | `{refreshToken}` | `200` new token pair |
| GET 🔒 | `/me` | | `{user: {id, email, name, createdAt}}` |

Token pair: `{tokenType: "bearer", accessToken, refreshToken, expiresAt, expiresIn, user: {id, email}}`.
Access tokens are Supabase JWTs (1 h by default). The API only uses them to call
Postgres as that user, so RLS decides what each caller can see.

## Catalog (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/categories` | `{market, categories: [{slug, name}]}` in the store's nav order |
| GET | `/products` | Search and browse. Query params: `q` (full text, prefix-matched), `dept` (category slug), `brand=a,b`, `rating=1..5` (minimum), `deal=1`, `sort=featured\|price-asc\|price-desc\|review\|newest`, `page`. Returns `{market, query, total, page, pageSize: 16, pageCount, brands: [{name, count}], items: Product[]}`. Brand facets cover the query+department scope, before the brand/rating/deal filters. |
| GET | `/products/:id` | `{product, ratings: {rating, count, bars: [{star, count, pct}]}}`. Returns `404 product_not_found` if the product doesn't exist in this store. |
| GET | `/products/:id/insights?summarize=1` | `{insight, attributes: [{key, label, phrase}]}`. `insight` has `productId, scores: {<attributeKey>: 1..5}, pros[], cons[], bestFor, summary, praised: [{theme, count}], criticized: [{theme, count}], source: rules\|ai, updatedAt`. When no insight is stored, a rules estimate is returned. `summarize=1` refreshes the review summary with the AI provider (cached; ignored when AI is off). |

`Product` has these fields:
- Identity: `id, market, title, brand?, category, categoryName, image`
- Price: `priceMinor, listMinor?, dealPct?, deal?, curBase`
- Ratings: `rating, reviewCount`
- Fulfilment: `seller, shipsFrom, stock`
- Content: `bullets[], badge?, boughtPastMonth?`

## Reviews

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/products/:id/reviews?limit=10&offset=0` | | `{items: Review[], total, mine}`. Sorted most helpful first, then newest. With auth, your own review is pinned to the top of page 1. |
| POST 🔒 | `/products/:id/reviews` | `{rating: 1..5, title, body}` | `201 {review}`. Creates or replaces your one review of the product. The DB sets `author`, `verified` (true when you have a placed order containing it) and keeps the product's rating rollup current. |
| DELETE 🔒 | `/reviews/:id` | | `204`. Only works on your own review (`404` otherwise). |
| POST 🔒 | `/reviews/:id/helpful` | | Toggle. Returns `{reviewId, helpful, helpfulCount}`. Returns `409 own_review` on your own review. |
| POST 🔒 | `/reviews/:id/report` | `{reason: spam\|offensive\|off_topic\|other}` | `204`. Idempotent. |

`Review` has these fields:
- Content: `id, author, initial, rating, title, body, createdAt`
- Status: `verified, helpful`
- Viewer state: `mine, votedHelpful, reported`

## Cart

Every cart response is `{cart}`, where `Cart` has these fields:
- Store: `market, currency, freeShipThresholdMinor`
- Lines: `count, lines: [{product, qty, lineTotalMinor, inStock}]`
- Totals: `{subtotalMinor, shipMinor, taxMinor, totalMinor}`

Prices and totals are computed by the database on every read.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/cart` | | The signed-in user's cart, or the guest cart for `X-Cart-Token`. Returns an empty cart when neither is present. |
| DELETE | `/cart` | | Empty it |
| POST | `/cart/items` | `{productId, qty = 1}` | `201`. Adds to the line. `404 product_not_found` if the product isn't in this store. `409 out_of_stock`. Mints a guest token when needed. |
| PATCH | `/cart/items/:productId` | `{qty}` | Sets the quantity. `0` removes the line. |
| DELETE | `/cart/items/:productId` | | Remove the line |
| POST 🔒 | `/cart/merge` | `{cartToken}` or `X-Cart-Token` | Folds the guest cart (all stores) into the account and deletes it. Returns `{merged, cart}`. |

## Orders 🔒

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/orders` | `{paymentMethod, shipping: {fullName, phone, line1, line2?, landmark?, city, state, postcode, addressType?}}` | Checks out your cart in this store. See the details after this table. |
| GET | `/orders?limit=50` | | Placed orders in this store, newest first |
| GET | `/orders/:id` | | Any of your orders, in any status. `404` for someone else's order. |
| POST | `/orders/:id/cancel` | | Abandons an `awaiting_payment` card order. Releases the reserved stock. The cart is kept. |

How `POST /orders` works:
- In one transaction, it validates the address for the store, locks the products and reserves stock (`409 insufficient_stock`). It then snapshots each line's title, price and seller and computes the totals.
- **Non-card methods** return `201 {order}` with `status: "placed"`, and the cart is emptied.
- **`card`** returns `201 {order, checkoutUrl}` with `status: "awaiting_payment"`. Send the customer to `checkoutUrl`, a Stripe-hosted page (test mode: card `4242 4242 4242 4242`). The cart is kept until payment succeeds.

`Order` has these fields:
- Identity: `id` (`114-…` US / `402-…` IN), `market, currency`
- Status: `status: placed | awaiting_payment | cancelled`
- Payment: `paymentMethod, paymentLabel`
- Money: `totals`
- Delivery: `shipTo`
- Lines: `items: [{productId, title, image, seller, unitPriceMinor, qty}]`
- Timestamps: `createdAt, placedAt?`

### How card payment is confirmed

The customer never tells us they paid. Stripe does:

1. Stripe redirects to `/checkout/success?session_id=…` (web), and it also calls
   `POST /webhooks/stripe`. Both re-fetch the session from Stripe's API.
2. If Stripe says `paid`, `confirm_order_payment` runs. That function is only
   granted to the service role and checks that the amount and currency equal the
   order total. It is idempotent: the success page and the webhook may both run it.
   The order moves to `placed` and the cart is emptied.
3. `checkout.session.expired` / `async_payment_failed`, `POST /orders/:id/cancel`,
   or the web cancel page all call `cancel_order`, which returns the reserved
   stock.

`POST /webhooks/stripe` verifies the `Stripe-Signature` header against
`STRIPE_WEBHOOK_SECRET`:
- It returns `503` when the secret is unset and `400` for a bad signature.
- Final domain outcomes (e.g. `payment_incomplete` for a forged "paid" event) are
  acknowledged with `200 {received, outcome}` so Stripe stops retrying.

## Addresses 🔒

Five per store. The first address becomes the default. There is always exactly
one default, and deleting it promotes the next one.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/addresses` | | Default first |
| POST | `/addresses` | address fields + `makeDefault?` | `201 {address}`. `409 address_limit`. `422 invalid_input` with `detail` = field. |
| GET | `/addresses/:id` | | |
| PATCH | `/addresses/:id` | full address fields + `makeDefault?` | |
| DELETE | `/addresses/:id` | | `204` |
| POST | `/addresses/:id/default` | | Make default |

Phone numbers are normalised: digits only, with a leading `+1` / `+91` dropped.

## Collections 🔒

Saved products, per store. Two system lists are created on first use: `considering` ("Things I'm Considering", where the Save button puts things) and `later` ("Saved for later", from the cart). Shoppers can add up to 20 collections, each holding up to 200 items.

`Collection` has these fields: `id, name, note, kind: custom|considering|later, createdAt, items: [{product, savedPriceMinor, addedAt}]`. Items are sorted newest first. `savedPriceMinor` is the catalog price when the item was first saved, stamped by the database. Compare it with `product.priceMinor` to show price drops.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/collections` | | `{collections}` ordered considering, custom (oldest first), later |
| POST | `/collections` | `{name: 1..60, note?: ≤500}` | `201 {collection}`. Names are unique per store, ignoring case (`409 duplicate`). `409 collection_limit` past 20. |
| GET | `/collections/:id` | | `{collection}`. `404 collection_not_found` if it isn't yours. |
| PATCH | `/collections/:id` | `{name?, note?}` | `{collection}` |
| DELETE | `/collections/:id` | | `204`. Deletes its items too. |
| POST | `/collections/:id/items` | `{productId}` | `201 {item}`. Idempotent: re-adding keeps the original saved price. `404 product_not_found` if the product is from another store. `409 collection_item_limit` past 200. |
| DELETE | `/collections/:id/items/:productId` | | `204`. A no-op when the product isn't in the collection. |

## AI layer

Four decision features. Each one runs deterministic **rules** first, so every endpoint works with no configuration. When `GEMINI_API_KEY` is set, the server also asks Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`, called over plain REST).

How AI replies are handled:
- Replies must be JSON. They are validated with zod, and weights are clamped to the category's attribute keys (0..5).
- Any failure falls back to the rules result: no key, HTTP or safety error, timeout (4s for query parsing, 8s otherwise), unparseable JSON, or a schema mismatch.
- Every result carries `source: "rules" | "ai"`.
- Successful AI results are cached in `ai_cache` (service role only). TTLs: query 7d, profile 30d, reviews 14d, compare 1d.
- The key never leaves the server.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/ai/status` | | `{provider: "gemini:<model>" \| null, enabled}` |
| POST | `/ai/parse-query` | `{q}` | `{query: {keywords, category, budgetMinor, use, intents: [{kind: category\|budget\|use\|keyword, label, param, value, removable}], title, source}}`. `category` is one of the store's slugs. `use` is a preset id. Each intent's `param` is the `/s` search param it maps to (`dept`, `budget`, `use`, `k`). |
| POST | `/ai/profile` | `{category?, answers: {use: [], duration, priceVsQuality, pain: [], note}, budgetMinor?}` | `{profile: {weights: {<key>: 0..5}, reasons: {<key>: sentence}, summary, watch, source}}`. Answer labels come from the category's quiz. |
| POST | `/ai/compare` | `{productIds: [2..4], weights?, use?}` | `{weights, ranked: RankedProduct[], verdict: {winnerId, text, perProduct: [{productId, bestFor, strengths, tradeoffs}], source}, table: {rows: [{label, cells: [{text, best}]}], same: []}}`. `RankedProduct` is `{product, insight, match: 0..100, why: [], warn}`. Every product must be from this store. |

Configuration (`.env.local` / Vercel):
- `GEMINI_API_KEY`: secret, optional. With it blank, the whole site runs on rules.
- `GEMINI_MODEL`: optional, default `gemini-2.5-flash`.

## Errors

| Status | Codes |
| --- | --- |
| 400 | `invalid_json`, `unknown_market`, `cart_token_required`, `invalid_signature` |
| 401 | `not_authenticated` |
| 402 | `payment_incomplete` |
| 403 | `forbidden` (the operation is not granted to your role, e.g. a guest calling a signed-in-only function) |
| 404 | `product_not_found`, `order_not_found`, `review_not_found`, `address_not_found`, `collection_not_found`, `not_found` |
| 405 | wrong method on a known path |
| 409 | `cart_empty`, `out_of_stock`, `insufficient_stock`, `address_limit`, `collection_limit`, `collection_item_limit`, `own_review`, `duplicate`, `order_not_pending`, `amount_mismatch`, `session_mismatch`, `stock_released`, `not_a_card_order` |
| 415 | `unsupported_media_type` |
| 422 | `invalid_input`, `invalid_shipping_address`, `invalid_postcode`, `payment_method_unavailable` |
| 503 | `payments_unavailable` |

## Walkthrough

```bash
API=http://localhost:3000/api/v1

# browse
curl "$API/products?q=headphones&sort=price-asc&market=US"

# guest cart: first write mints the token (X-Cart-Token response header)
curl -i -X POST "$API/cart/items" -H 'content-type: application/json' \
  -d '{"productId":"51rpbVmi9XL","qty":2}'

# account + token
curl -X POST "$API/auth/signup" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-password","name":"Your Name"}'
TOKEN=$(curl -s -X POST "$API/auth/token" -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-password"}' | jq -r .accessToken)

# bring the guest cart along, then check out
curl -X POST "$API/cart/merge" -H "Authorization: Bearer $TOKEN" -H "X-Cart-Token: <token>"
curl -X POST "$API/orders" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "paymentMethod": "giftcard",
  "shipping": {"fullName":"Your Name","phone":"2065550123","line1":"410 Terry Ave N",
               "city":"Seattle","state":"WA","postcode":"98109"}}'
```

## Data model

Six migrations live in `supabase/migrations/`:

| Migration | Contents |
| --- | --- |
| foundation | `markets` (per-store tax, shipping, payment methods, caps), `categories`, `market_categories`, shared helpers |
| catalog | `products` with a generated `search_doc` tsvector (GIN), plus `catalog_products` (the read view) and `search_catalog()` |
| accounts | `profiles` (created by trigger on signup) and `addresses` (per-store validation, default handling, limit) |
| commerce | `carts`/`cart_items` (user or guest token), `orders`/`order_items` (snapshots) and these functions: `cart_*`, `order_totals()`, `place_order()`, `cancel_pending_order()`, `attach_checkout_session()`, `confirm_order_payment()`, `release_checkout_session()`, `purge_stale_guest_carts()` |
| reviews | `reviews` (one per user per product), `review_votes`, `review_reports`, and the `product_ratings` rollup kept by triggers |
| decision | `product_insights` (public read, server-written; seeded from `supabase/seed-insights.sql`, built by `npm run db:insights:build`), `collections`/`collection_items` (owner RLS, limit + saved-price triggers), `ai_cache` (service role only) |

About the tables and functions:
- **Browser-facing roles cannot write any table directly.** The anon and authenticated roles either go through RLS-scoped policies or call functions with explicit grants. Price, stock, order and total columns are never client-writable.
- **Service-role-only functions.** `confirm_order_payment`, `attach_checkout_session` and `release_checkout_session` are called by the server with `SUPABASE_SERVICE_ROLE_KEY`.
- **Guest carts.** They are only reachable through the `cart_*` functions with their token. `purge_stale_guest_carts()` deletes guest carts that have been idle for 30 days. It is service-role only, so schedule it with pg_cron or call it from a cron job.

Tests: `npm run test:db` runs `test/integration/*` against the local stack. It covers:
- totals, carts, stock reservation and overselling, card confirmation rules
- RLS isolation, reviews, addresses, search and home content
- the signed Stripe webhook
