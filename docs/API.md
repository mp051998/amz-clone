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
| Faster delivery | $9.99 | ₹99 |
| Payment methods | `card`, `giftcard` | `upi`, `card`, `netbanking`, `cod`, `emi`, `amazonpay` |
| Returns | 30 days after delivery | 10 days after delivery |
| Address | US ZIP, 2-letter state | 6-digit pincode, `line2` (area) required, optional `landmark`, `addressType: home|office` |

Max 30 units per cart line. Quantities are also capped at available stock.

Plus members (see `/me/plus`) get standard delivery free on every order, whatever the total, and faster delivery free too. The cart and order totals already reflect this for a signed-in member.

Paying with the store balance (`giftcard` in the US, `amazonpay` in India) takes the order total from the shopper's gift card balance in that store when the order is placed. It fails with `409 insufficient_balance` when the balance doesn't cover it, and the cart is kept. Redeem gift card codes into the balance with `/me/balance/redeem`; each account can get one demo gift card per store (US $100, India ₹5,000). Refunds of balance orders (a cancel, or a received return) go back to the balance.

Gift cards can also be bought, by card only: `POST /me/gift-cards` records the purchase and returns a Stripe Checkout URL for exactly its amount (whole currency units, US $1–$2,000, India ₹10–₹10,000). Once Stripe reports the session paid (the `/gift-cards/success` return trip or the webhook, both re-reading the session from Stripe), a service-role call checks the amount and currency and issues a new code. The buyer sees it in `GET /me/gift-cards` and can give it away or redeem it themselves. No email is sent.

Some products have a coupon, a percent off (5–50%). A signed-in shopper applies it with `POST /products/:id/coupon`; while it's applied, the percent comes off every unit of that product in their cart and orders in that store, rounded to the minor unit per unit. A coupon isn't used up by an order: it stays applied until the shopper removes it. Delivery's free threshold and the tax are worked out on the subtotal after coupons. Guest carts never get coupon discounts.

## Auth

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/auth/signup` | `{email, password, name?}` | `201` token pair. The account is active at once: this demo store doesn't verify email addresses |
| POST | `/auth/token` | `{email, password}` | `200` token pair |
| POST | `/auth/refresh` | `{refreshToken}` | `200` new token pair |
| GET 🔒 | `/me` | | `{user: {id, email, name, createdAt, plus: {since} \| null}}` |
| PATCH 🔒 | `/me` | `{name?, email?, newPassword?, currentPassword?}` | `{user}`, plus `session` (a new token pair) when the password changed |
| DELETE 🔒 | `/me` | `{currentPassword}` | `204`. Closes the account for good; its tokens stop working. `409 account_not_closable` while an order is on the way, a return or refund is open, or a checkout is unpaid (cancel unpaid orders first). The profile, addresses, cart, lists, history, coupons, Plus and gift card balance go with it; orders, returns and gift card purchases stay on the store's books without the link to the account |
| GET 🔒 | `/me/data` | | `{data}`: everything the store keeps about the caller, both stores — `account`, `plus`, `stores.{US,IN}` (`currency`, `orders`, `addresses`, `lists`, `reviews`, `giftCardBalanceMinor`, `balanceHistory`), `returns`, `questions`, `answers`, `sellerFeedback`, `supportCases` (each with its `messages`, oldest first). The web app serves the same file at `/account/data` |
| GET 🔒 | `/me/plus` | | `{plus: {since} \| null}` |
| POST 🔒 | `/me/plus` | | `{plus: {since}}`. Joins Plus: a demo membership, never billed. Joining again keeps the first `since` |
| DELETE 🔒 | `/me/plus` | | `204`. Ends the membership; orders already placed keep their delivery charge |
| GET 🔒 | `/me/balance` | | `{balanceMinor, history: [{id, amountMinor, kind: gift_card \| order \| refund, orderId, giftCardCode, at}]}`, the caller's gift card balance in this store and its latest 50 changes (newest first) |
| POST 🔒 | `/me/balance/redeem` | `{code}` | `{amountMinor, balanceMinor}`. Case, spaces and dashes in the code don't matter. `404 gift_card_not_found`, `409 gift_card_redeemed`, `422 gift_card_other_store` (`detail` is its store) |
| POST 🔒 | `/me/balance/demo-card` | | `{giftCard: {code, amountMinor, redeemed}}`. The caller's demo gift card for this store, issued on the first call; it isn't redeemed until you redeem the code (anyone signed in can) |
| GET 🔒 | `/me/gift-cards?limit=20` | | `{items: GiftCardPurchase[]}`: the gift cards the caller bought in this store and paid for, newest first |
| POST 🔒 | `/me/gift-cards` | `{amountMinor, recipientName?, message?}` | `201 {purchase, checkoutUrl}`. `purchase.status` is `awaiting_payment` until Stripe reports it paid; then it has its `code`. `422 invalid_input` with `detail` `amount` (not a whole amount within the store's limits), `recipient` (over 60 characters) or `message` (over 240); `503 payments_unavailable` without Stripe |
| GET 🔒 | `/me/transactions` | | `{transactions: [{key, kind: charge\|refund, source: order\|cancellation\|return\|gift_card, amountMinor, at, status: completed\|pending\|failed\|due, method, paymentLabel, orderId?}]}`: the caller's charges and refunds in this store, newest first. An order is charged when placed; cash on delivery is `due` until it's delivered, then charged on delivery (and never, if cancelled first). Refunds for cancelled orders and received returns are `pending` until Stripe settles a card refund. The web app lists them at `/account/transactions` |
| GET 🔒 | `/me/messages` | | `{messages: [{key, kind, at, subject, href, orderId?, amountMinor?, detail?, from?, new}], seenAt}`: what's happened with the caller's orders, returns, support cases and questions in this store over the last 90 days, newest first (up to 100). `kind`: `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `refunded` (a cancelled order's refund), `items_cancelled` (some items cancelled before the order shipped: `subject` names them), `items_refunded` (their refund), `return_received`, `return_refunded`, `return_rejected` (`detail` says why), `replacement_shipped` and `replacement_delivered` (a replacement's way to you: `subject` names the items), `support_reply` (`subject` is the case's), `answer` (another shopper's answer to your question: `subject` is the question, `detail` the answer, `from` its author) or `review_request` (two days after something arrived that you haven't reviewed: `subject` is the product, `href` its review form; it goes once you review it). `href` is the store-relative page it's about. `new` is `true` for what came in after `seenAt`, when the caller last read them in this store (`null` the first time: everything is new); reading them marks them seen. The web app lists them at `/account/messages` |
| GET 🔒 | `/me/questions` | | `{questions: [{question: Question, product: Product}], answers: [{answer: Answer, question: {id, body}, product: Product}]}`: the questions the caller asked and the answers they gave in this store, newest first (up to 100 each). Delete them with `DELETE /questions/:id` and `DELETE /answers/:id`. The web app lists them at `/account/questions` |
| GET 🔒 | `/me/reviews` | | `{reviews: [{review: Review, product: Product}], awaiting: [{product: Product, orderId, deliveredAt}]}`. `reviews`: the caller's reviews in this store, newest first (up to 100; hidden ones included, with `hidden: true`). `awaiting`: products from the caller's delivered orders in this store that they haven't reviewed yet, most recently delivered first; archived products are left out |

`GiftCardPurchase` is `{id, market, amountMinor, currency, recipientName, message, status: awaiting_payment | paid, code, redeemed, createdAt, paidAt}`.

Token pair: `{tokenType: "bearer", accessToken, refreshToken, expiresAt, expiresIn, user: {id, email}}`.

`PATCH /me`:
- Changing `email` or setting `newPassword` needs `currentPassword` (`422 invalid_input`, `detail: "currentPassword"` when it's wrong). A taken email is `409 duplicate`.
- Every field is checked before anything changes: name 1–80 characters, password 6–72.
- A new password ends every session of the account, including the caller's, so switch to the returned `session`.
- Password resets are web only: `/signin/forgot` emails a link that opens `/auth/confirm` and then the Login & security page.
Access tokens are Supabase JWTs (1 h by default). The API only uses them to call
Postgres as that user, so RLS decides what each caller can see.

## Catalog (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/categories` | `{market, categories: [{slug, name}]}` in the store's nav order |
| GET | `/charts/:chart?dept=&limit=40` | `{market, chart, dept, items: Product[]}`: one of the store's charts as the site shows it, best first: `bestsellers` (most reviewed, then best rated), `new-releases` (newest), `most-wished-for` (most shoppers adding it to their lists in the last 30 days) or `gift-ideas` (most shoppers giving it in the last 30 days, by gift order or off a shared list). The last two fill up with bestsellers when too few products qualify. Each variant group shows once. `dept` keeps it to a department (`404 category_not_found` for one this store doesn't have); `limit` is 1–100 (`422 invalid_input`, `detail` `limit`). `404 chart_not_found` for any other chart. |
| GET | `/products` | Search and browse. Query params: `q` (full text, prefix-matched), `dept` (category slug), `brand=a,b`, `seller=a|b` (sold by any of them; `|`-separated, as seller names can hold commas), `rating=1..5` (minimum), `deal=1`, `min` and `max` (a price range in minor units, either one optional; products priced from `min` up to `max`, both included), `pct=1..99` ("Discount": only products on sale for at least that percentage off), `oos=1` (include products that are out of stock; they're left out otherwise, as Amazon's "Include Out of Stock"), `sort=featured\|price-asc\|price-desc\|review\|newest\|bestsellers` (`bestsellers`: most reviewed, then best rated, as `/bestsellers`), `page`. Returns `{market, query, total, groups, page, pageSize: 16, pageCount, brands: [{name, count}], sellers: [{name, count}], unavailable, items: Product[]}`. `unavailable` counts the matches (each variant group once) with no option in stock, whether or not they're included. Items and `total` are per product, so each option of a variant group is its own item (see `variant`); `groups` counts the matches with a group's options once, as the storefront shows them, and brand counts do the same. Brand and seller facets cover the query+department scope, before the brand/seller/rating/deal/discount/price filters (in-stock products only, unless `oos=1`). |
| GET | `/suggest?q=` | Search-as-you-type for the search box. The last word counts as a prefix. Returns `{market, q, total, terms: [{text, count}], departments: [{slug, name, count}], products: [{id, title, image}]}`. `terms` holds up to 4 completions of the last word, taken from matching titles and brands, most common first, each as a whole query (`sony he` → `sony headphones`). `departments` holds the 2 departments with the most matches for the top completion. `products` holds the 4 best-reviewed matches. Counts and products count a variant group once. Input with fewer than two letters or digits returns everything empty. |
| GET | `/products/:id` | `{product, ratings: {rating, count, bars: [{star, count, pct}]}, coupon, frequentlyReturned, usuallyKept, protection, emi}`. `frequentlyReturned` is `{reason}` when the product often comes back (over the last 90 days, at least 1 delivered unit in 10, with 10+ units delivered and 2+ returns), else null; `reason` is the usual product-side reason (`damaged`, `defective`, `wrong_item`, `missing_parts`, `not_as_described`) or null. `usuallyKept` ("Customers usually keep this item") is true when, over the last 90 days, 20+ units were delivered and at most 1 in 50 came back; never alongside `frequentlyReturned`, and false for an archived product. Here `product` also has `description` (string or null), `details`, the "Product information" table as `[label, value]` pairs, most important first, `gallery` (more image URLs after `image`, in order) and `variants`: null, or `{group, axis, label, options: [{id, label, image, priceMinor, stock, current}]}` when other products of this store share its variant group (e.g. `axis: "Color"`, `label: "Black"`). Options are in label order; archived ones are left out, except the product itself. Returns `404 product_not_found` if the product doesn't exist in this store. An archived product still loads, with `archived: true`. The response also has `coupon`: null, or `{percentOff, clipped}` (`clipped` is whether the caller has applied it, always false signed out); null for an archived product. `protection` is the store's protection plan for it, `{name, unitMinor}` (US "2-Year Protection Plan", India "1-Year Extended Warranty"), or null when the store doesn't cover it or it's archived. `emi` is the card EMI plans, as amazon.in shows them from ₹3,000 (empty otherwise, and always in the US): `[{months, monthlyMinor, interestMinor, noCost}]` for 3, 6, 9 and 12 months, 3 and 6 at No Cost EMI, the rest at a typical 16% a year, each month rounded up to the rupee. |
| GET | `/coupons` | `{market, items: [{product, percentOff, clipped}], promotions: [{code, percentOff, description, category?: {slug, name}, minSpendMinor, endsAt?}]}`: every coupon in this store on a product on sale (archived ones left out), biggest percent first. `clipped` is whether the caller has applied it, always false signed out. `promotions` are the promotion codes the store is running, biggest first (see *Promotion codes* under Orders). |
| POST 🔒 | `/products/:id/coupon` | Apply the product's coupon for the caller. Idempotent. Returns `{coupon: {percentOff, clipped: true}}`, or `404 coupon_not_found` when the product has no coupon or is archived. |
| DELETE 🔒 | `/products/:id/coupon` | `204`. Stop applying it. |
| GET | `/sellers?name=` | `{seller: {seller, periods: [{period: 30d\|90d\|12m\|all, ratings, positive, neutral, negative}], stars: {1..5: count}, recent: [{rating, arrivedOnTime, asDescribed, comment, createdAt}]}}`: a seller's page in this store, as the storefront shows it at `/seller?name=`. Positive is 4–5 stars, neutral 3, negative 1–2; `stars` covers the last 12 months and `recent` the 10 latest ratings with a comment, never who left them. `404 not_found` (`detail: "seller"`) when the seller has nothing listed and no ratings in this store; `422 invalid_input` without a name. |
| GET | `/profiles/:id?page=` | `{profile: {name, initial, total, helpful, page, pageCount, reviews: [{review, product}]}}`. A reviewer's public profile in this store (`:id` is a review's `authorId`): the name on their newest review, how many reviews shoppers can see and the helpful votes on them, and those reviews newest first, 10 a page. Hidden reviews are never listed. 404 `not_found` when they have no visible reviews here. |
| GET | `/products/:id/bought-together` | `{items: [{product, reason, source}]}`: up to 2 products to buy with this one for the product page's "Frequently bought together". `source: orders` items are bought together in placed orders by at least two shoppers; when there are fewer, `source: rules` accessories fill in. Empty for a sold-out or archived product. Returns `404 product_not_found` if the product doesn't exist in this store. |
| GET | `/products/:id/also-viewed` | `{items: Product[]}`: "Customers who viewed this item also viewed", up to 8 of this store's products on sale, most often viewed with this one first, one option per variant group. Empty until it's been viewed with others. Returns `404 product_not_found` if the product doesn't exist in this store. |
| POST | `/products/:id/views` | Body `{recent?: string[]}`. `204`. Counts a product page view with `recent`, the products this device looked at just before (newest first, its browsing history): each of the first 5 other products of the same store makes a pair, counted both ways. Unknown ids and other stores' products are skipped; views aren't tied to an account. The site sends it from the product page unless history is paused, and not on a reload. `422 invalid_input` (`detail` `recent`) when `recent` isn't a list of up to 30 product ids. |
| GET | `/products/:id/insights?summarize=1` | `{insight, attributes: [{key, label, phrase}]}`. `insight` has `productId, scores: {<attributeKey>: 1..5}, pros[], cons[], bestFor, summary, praised: [{theme, count}], criticized: [{theme, count}], source: rules\|ai, updatedAt`. When no insight is stored, a rules estimate is returned. `summarize=1` refreshes the review summary with the AI provider (cached; ignored when AI is off). |

`Product` has these fields:
- Identity: `id, market, title, brand?, category, categoryName, image`
- Price: `priceMinor, listMinor?, dealPct?, deal?, curBase`
- Ratings: `rating, reviewCount`
- Fulfilment: `seller, shipsFrom, stock, maxPerCustomer?`. `maxPerCustomer` is the product's "Limit N per customer", when it has one (see *Purchase limits* under Orders)
- Content: `bullets[], badge?, boughtPastMonth?`
- Variant: `variant?: {group, axis, label}` when the product is one option of a variant group (`/products/:id` lists the others)
- Status: `archived?`, true when an admin has taken it off sale. Archived products never appear in search and browse (`/products`), deals or compare. Their page and reviews stay, and carts and collections that already hold one keep it.

## Reviews

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/products/:id/reviews?limit=10&offset=0&sort=top&stars=&verified=&photos=&q=` | | `{items: Review[], total, mine, images}`. `sort=top` (default): most helpful first, then newest. `sort=recent`: newest first. `stars`: `1`–`5`, `positive` (4–5★) or `critical` (1–3★); `verified=1` keeps verified purchases, `photos=1` reviews with photos; `q` keeps reviews whose headline or text contains it (case-insensitive; 2–100 characters, shorter is ignored); `total` counts the filtered reviews. With auth, your own review is pinned to the top of page 1 when it passes the filter. `images`: "Customer images", the newest photos across its visible reviews, `[{reviewId, path, url, rating, author}]` (up to 12). `fit`: how its visible reviews say it fits, `{verdict, total, counts: {small, true_to_size, large}, pct: {…}}`, where `verdict` is the most given answer (`true_to_size` wins a tie). Null with fewer than 3 answers. |
| POST 🔒 | `/products/:id/reviews` | `{rating: 1..5, title, body, photos?, fit?}` | `201 {review}`. Creates or replaces your one review of the product. `fit`: `small`, `true_to_size` or `large` ("How does it fit?", which the web app asks on clothing and shoes); `null` clears it and leaving it out keeps it (`422 invalid_input`, `detail` `fit`, for anything else). `photos`: up to 5 `path`s from `POST /me/review-photos`, in order; leave it out to keep the ones it has, `[]` to clear them (`422 invalid_input`, `detail` `photos`, for more than 5, repeats, or a photo that isn't one of yours). Photos taken off are deleted. The DB sets `author`, `verified` (true when an order of yours containing it has been delivered, worked out on every write) and keeps the product's rating rollup current. |
| POST 🔒 | `/me/review-photos` | `multipart/form-data`, image in `photo` | `201 {photo: {path, url}}`. JPEG, PNG or WebP up to 3 MB (`422 invalid_input`, `detail` `photo`). It shows once a review of yours lists its `path`. |
| DELETE 🔒 | `/reviews/:id` | | `204`. Only works on your own review (`404` otherwise). Its photos are deleted too. |
| POST 🔒 | `/reviews/:id/helpful` | | Toggle. Returns `{reviewId, helpful, helpfulCount}`. Returns `409 own_review` on your own review. |
| POST 🔒 | `/reviews/:id/report` | `{reason: spam\|offensive\|off_topic\|other}` | `204`. Idempotent. Three open reports (from different shoppers, since an admin last looked) hide the review until an admin keeps it. |

`Review` has these fields:
- Content: `id, author, initial, rating, title, body, createdAt`
- `authorId`: the reviewer's account, for `GET /profiles/:id`. Absent once the account is closed.
- Status: `verified, helpful`
- Viewer state: `mine, votedHelpful, reported`
- `photos: [{path, url}]`: up to 5, in the author's order. `url` is public.
- `fit?`: `small`, `true_to_size` or `large`, when the author said how it fits.
- `hidden: true` only on your own review while it's hidden (by reports or an admin). Hidden reviews are left out of `items` and `total` for everyone else, and out of the star rating.

## Questions & answers

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/products/:id/questions?q=&limit=10&offset=0` | | `{items: Question[], total}`: most answered first, then newest, each with all its answers (most helpful first, then oldest). `q` (up to 100 characters, matched literally, any case) keeps questions whose text, or one of whose answers, contains it. |
| POST 🔒 | `/products/:id/questions` | `{body}` | `201 {question}`. 10–300 characters (`422 invalid_input`, `detail: "body"`). Asking the same question twice is `409 duplicate`; an archived product is `409 product_unavailable`. |
| POST 🔒 | `/products/:id/report` | `{reason, details?}` | Report an issue with the product. `reason`: `wrong_info`, `pricing`, `counterfeit`, `safety`, `offensive` or `other`; `details` up to 1000 characters, at least 10 for `other` (`422 invalid_input`, `detail: "reason"` / `"details"`). `201 {report, updated: false}`; while your report on that product is open, sending again rewrites it: `200 {report, updated: true}`. `report`: `{id, productId, reason, details, status, createdAt, updatedAt, resolvedAt, resolutionNote}`. Up to 20 open reports per shopper (`409 too_many_reports`). |
| DELETE 🔒 | `/questions/:id` | | `204`. Deletes your question and its answers (an admin can delete any); `404 question_not_found` otherwise. |
| POST 🔒 | `/questions/:id/answers` | `{body}` | `201 {answer}`. 2–1000 characters, one answer per shopper per question (`409 duplicate`, `detail: "answer"`). The DB sets `author` and `verified` (true when an order of yours containing the product has been delivered). |
| DELETE 🔒 | `/answers/:id` | | `204`. Your own answer (an admin, any); `404 answer_not_found` otherwise. |
| POST 🔒 | `/answers/:id/helpful` | | Toggle. Returns `{answerId, helpful, helpfulCount}`. Returns `409 own_answer` on your own answer. |

`Question` is `{id, productId, body, author, createdAt, answerCount, mine, answers: Answer[]}`; `Answer` is `{id, questionId, body, author, createdAt, verified, helpful, mine, votedHelpful}`. `author` is the shopper's profile name. A product taken off sale keeps its questions.

## Cart

Every cart response is `{cart}`, where `Cart` has these fields:
- Store: `market, currency, freeShipThresholdMinor`
- Lines: `count, selectedCount, lines: [{product, qty, lineTotalMinor, inStock, available, coupon, discountMinor, selected, protection?, addedPriceMinor?}]`. `available` is false for an archived product. Such a line can only be removed, and `inStock` is false for it too. `coupon` is null or `{percentOff, clipped}`; `discountMinor` is what the applied coupon takes off the line (`lineTotalMinor` is before it).
- Selection: each line is ticked for checkout (`selected`, true when added). `count` is every item in the cart; `selectedCount` and the totals cover the ticked lines only. Checkout orders the ticked lines and leaves the rest in the cart. Adding a product (`POST /cart/items`) ticks its line again.
- Price changes: `addedPriceMinor` is the product's price when the line went into the cart (kept when a guest cart merges on sign-in, and absent on Buy Now's quote). When it differs from `product.priceMinor`, the price has changed since, as the web cart's "Important messages about items in your cart" says.
- Protection plans: a line whose product the store covers has `protection: {unitMinor, added}` (absent otherwise). The plan costs about a tenth of the price per unit, rounded to $X.99 / ₹X99, for electronics and computers from $25 in the US, and mobiles, electronics, wearables, computers and kitchen appliances from ₹1,000 in India. Add or drop it with `PATCH /cart/items/:productId {protection}`; it stays on when a guest cart merges on sign-in.
- Totals: `{subtotalMinor, discountMinor, shipMinor, taxMinor, protectionMinor?, totalMinor}`, where `totalMinor = subtotalMinor - discountMinor + shipMinor + taxMinor + protectionMinor`. `protectionMinor` is the plans on the ticked lines, untaxed and outside free delivery (absent with none)
- Promotions: only a checkout quote (`GET /orders/quote`) has them. The code's part of each line's `discountMinor` is the line's `promoMinor` (absent when it took nothing off), the totals add `promoMinor` (inside `discountMinor`), and the cart names the code as `promo: {code, percentOff, description, category?}`.

Prices and totals are computed by the database on every read.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/cart` | | The signed-in user's cart, or the guest cart for `X-Cart-Token`. Returns an empty cart when neither is present. |
| PATCH | `/cart` | `{selected}` | Ticks (`true`) or unticks (`false`) every line |
| DELETE | `/cart` | | Empty it |
| POST | `/cart/items` | `{productId, qty = 1}` | `201`. Adds to the line. `404 product_not_found` if the product isn't in this store. `409 out_of_stock`, or `409 product_unavailable` if it's archived. Mints a guest token when needed. |
| PATCH | `/cart/items/:productId` | `{qty?, selected?, protection?}` | Sets the quantity (`0` removes the line), ticks or unticks the line, and/or adds (`true`) or drops the store's protection plan on it; send at least one. Archived products only accept `qty: 0` (`409 product_unavailable`). `404 not_in_cart` when ticking a line, or setting its plan, that isn't there; `422 invalid_input` (`detail` `protection`) for a plan on a product the store doesn't cover. |
| DELETE | `/cart/items/:productId` | | Remove the line |
| POST 🔒 | `/cart/merge` | `{cartToken}` or `X-Cart-Token` | Folds the guest cart (all stores) into the account and deletes it. Sold-out and archived products are dropped. Returns `{merged, cart}`. |

## Orders 🔒

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/orders` | `{paymentMethod, emiMonths?, shipping: {fullName, phone, line1, line2?, landmark?, city, state, postcode, addressType?, instructions?}, gift?: {message?, wrap?}, speed?: standard \| fast, buyNow?: {productId, qty = 1, protection?}, promoCode?}` | Checks out your cart in this store, or with `buyNow` just that product. See the details after this table. |
| GET | `/orders?limit=50` | | Orders placed (or charged) in this store, newest first. Cancelled ones stay listed; abandoned card checkouts don't. |
| GET | `/orders/buy-now?productId=&qty=1&protection=1` | | `{quote: Cart}`: what Buy Now would order, just that product at `qty` (1 up to the store's line limit), priced like a cart holding only it (coupon, delivery, tax, and its protection plan with `protection=1`). `404 product_not_found` if it isn't in this store. |
| GET | `/orders/quote?promo=&productId=&qty=1&protection=1` | | `{quote: Cart, promoError?: {code, detail?}}`: your checkout priced with the promotion code `promo`: the cart's ticked lines, or with `productId` Buy Now's product as `/orders/buy-now` prices it. The quote's lines and totals carry `promoMinor` and the cart `promo: {code, percentOff, description, category?}`. A code that doesn't apply comes back as `promoError` (the codes `POST /orders` fails with) and the quote is priced without it. `422 invalid_input` (`detail` `promo`) without a code. |
| GET | `/orders/buy-again?limit=60` | | Buy again: each product from your placed orders in this store once (cancelled and unpaid orders don't count), with `{productId, title, image, lastBoughtAt, lastOrderId, orders, availability, product}`. `availability` is `available`, `sold_out` or `gone` (archived or no longer in the catalog, when `product` is null and `title` and `image` are as bought). Available products come first, then sold out, then gone, each newest first. Reads your latest 100 orders. |
| GET | `/orders/:id` | | Any of your orders, in any status. `404` for someone else's order. |
| PATCH | `/orders/:id` | `{addressId?: string, archived?: boolean, instructions?: string \| null}` | `{order}`. `addressId` sends the order to another of your saved addresses in this store (`GET /addresses`) while it's being prepared; the order takes that address's delivery instructions too, and its total doesn't change. `404 address_not_found` for an address that isn't yours or is in the other store; once the order ships (or if it's unpaid or cancelled), `409 order_address_locked`. `instructions` changes the order's delivery instructions (up to 250 characters; `""` or `null` removes them) while it's being prepared or shipped; once it's out for delivery, `409 order_not_editable`. The saved address keeps its own note. `archived` archives an order (it gets `archivedAt`) or brings it back. Archived orders stay in `GET /orders`; the site lists them under *Archived* instead of the periods, and a search still finds them. `409 order_not_archivable` for an `awaiting_payment` order. Archiving changes nothing else: the order still ships and can be cancelled or returned. The fields apply in the order `addressId`, `instructions`, `archived`. |
| POST | `/orders/:id/pay` | | Finish paying an `awaiting_payment` card order: `{checkoutUrl}`, its Stripe Checkout page (the same one while it's open, so there's never a second payable page; a new one once it has lapsed), or `{order}` when Stripe reports it paid after all. `409 order_not_pending` for any other order, `503 payments_unavailable` without Stripe. |
| POST | `/orders/:id/cancel` | | `{order}`. An `awaiting_payment` card order is abandoned: the reserved stock is released, its Stripe page is closed and the cart is kept. A placed order can be cancelled until it ships (`409 order_not_cancellable` after that): the stock goes back and the payment is refunded (see `refund`). |
| POST | `/orders/:id/cancel-items` | `{productIds: string[]}` | `{order}`. Cancels some items of a placed order until it ships, each line whole; the rest keep coming. Their stock goes back, and the order is repriced over the lines left: `totals` and `items` drop them, the delivery charge stays and the tax only goes down. The cancelled lines move to `cancellations`, each with its own refund (what the items cost after any coupon, plus the tax that no longer applies, their gift wrap and their protection plans), paid back like a cancelled order's. Every item is the whole order, cancelled as `POST /orders/:id/cancel` does. `422 invalid_input` (`detail` `items`) for none or a product that isn't in the order, `409 order_not_cancellable` once it has shipped. |

There is no guest checkout. Orders belong to an account, so every route here needs a signed-in user (`401 not_authenticated`), and so does `place_order()` in the database. A guest's cart carries over: sign in, then `POST /cart/merge`.

How `POST /orders` works:
- In one transaction, it validates the address for the store, locks the products and reserves stock (`409 insufficient_stock`). A cart holding an archived product fails with `409 product_unavailable` (`detail` is its id) until that line is removed. It then snapshots each line's title, price, seller and coupon discount and computes the totals. An order's `totals` carry `discountMinor`, and each item `unitDiscountMinor` when a coupon applied; a return refunds what was paid for an item, after its coupon.
- **Ticked lines only:** a cart checkout orders the ticked lines (`selected`). The unticked ones stay in the cart. `409 nothing_selected` when the cart has lines but none is ticked.
- **Non-card methods** return `201 {order}` with `status: "placed"`, and the ordered lines leave the cart.
- **`card`** returns `201 {order, checkoutUrl}` with `status: "awaiting_payment"`. Send the customer to `checkoutUrl`, a Stripe-hosted page (test mode: card `4242 4242 4242 4242`). The cart is kept until payment succeeds.
- **Delivery speed:** `speed: "fast"` ships within 3 hours and delivers on the evening run (out at 17:00, delivered by 19:30 store time): the same day for orders placed by noon, otherwise the next day. It's offered only when it arrives before standard delivery would; at other times, or for an unknown speed, the order fails with `422 delivery_option_unavailable`. The store's fast fee (`markets.fast_ship_fee_minor`: $9.99 / ₹99) replaces the delivery charge; it's free only for Plus members.
- **Protection plans:** each cart line with its plan on (or `buyNow.protection: true`) buys the store's plan per unit with the item: the item has `protectionMinor` (per unit) and the order `totals.protectionMinor`, untaxed and outside free delivery. A line whose product is no longer covered goes without. Cancelling an item before it ships refunds its plan, and so does returning it for a refund (a replacement keeps the plan).
- **EMI** (India): `paymentMethod: "emi"` is for orders of ₹3,000 or more (`markets.emi_min_minor`); below that, and in the US store, the order fails with `422 emi_unavailable` (US: `payment_method_unavailable`). `emiMonths` is 3, 6, 9 or 12 (3 when left out; `422 invalid_input`, `detail` `emiMonths`, otherwise) and is ignored for other methods. The order keeps it as `emiMonths`, and `paymentLabel` reads `EMI · 6 months`.
- **Buy Now:** send `buyNow: {productId, qty}` to order just that product (`qty` 1 up to the store's line limit) instead of the cart. The cart isn't needed and is left as it is, whatever the payment method; `404 product_not_found` if the product isn't in this store. A card order's cancel page returns to that product's checkout.
- **Gifts:** send `gift: {message?}` (or `gift: true`) to mark the order as a gift. The note is trimmed and can be up to 240 characters (`422 invalid_input` beyond that); a blank one means no note. Add `wrap: true` to gift-wrap every item at the store's fee per item (US $3.99, India ₹30): it's `totals.wrapMinor`, untaxed and outside free delivery, and the order shows `gift.wrapped: true`. `422 invalid_input` (`detail` `gift_wrap`) for wrap without a gift.
- **Promotion codes:** send `promoCode` to take a store promotion off the order, as Amazon's "Add a gift card or promotion code" does. A code is a percent off (1–50%) either the whole order or one category's items, worked out per unit after the coupon and rounded down to the minor unit, so it goes into each item's `unitDiscountMinor` (the order's `discountMinor`) and returns and cancellations refund what was paid after it. The order has `promoCode`, each item it took money off `unitPromoMinor` (its part of `unitDiscountMinor`) and the totals `promoMinor`. Delivery's free threshold and the tax are worked out after it. A code can have a minimum spend on its qualifying items (after coupons, ticked lines only) and is good for one order per customer, which a cancelled order gives back. Codes are case-insensitive. The order fails with `422 promo_invalid` for a code the store doesn't have, `422 promo_expired` for one that has ended or not started, `409 promo_used` once you've used it, `422 promo_not_eligible` when nothing in the order qualifies, and `422 promo_min_spend` (`detail` the minimum, in minor units) below its minimum. `GET /coupons` lists them; `GET /orders/quote` prices one before ordering.
- **Purchase limits:** a product with `maxPerCustomer` can be bought that many times over, all told, by one account: the units in its orders that aren't cancelled (returned ones still count, as on Amazon, and items cancelled from an order don't). An order that would go past it fails with `409 purchase_limit`, `detail` the product's id, Buy Now and the cart alike, and nothing is placed. The product page, cart and checkout say the limit and how many more you can buy, and cap the quantity at it.
- **Delivery instructions:** `shipping.instructions` (up to 250 characters) goes on the order as `shipTo.instructions`. It's copied like the rest of the address, so editing a saved address later doesn't change orders already placed.

`Order` has these fields:
- Identity: `id` (`114-…` US / `402-…` IN), `market, currency`
- Status: `status: placed | awaiting_payment | cancelled`
- Payment: `paymentMethod, paymentLabel`, and `emiMonths?` for an EMI order
- Money: `totals`
- Delivery: `shipTo`, `shipSpeed?: fast` (absent means standard), and `gift?: {message?, wrapped?}` for a gift order
- `archivedAt?`: when you archived it (absent while it isn't)
- Lines: `items: [{productId, title, image, seller, unitPriceMinor, qty, unitDiscountMinor?, unitPromoMinor?, protectionMinor?}]` (`unitPromoMinor` is the promotion code's part of `unitDiscountMinor`; `protectionMinor` is the protection plan bought with it, per unit)
- `promoCode?`: the promotion code it was ordered with
- Timestamps: `createdAt, placedAt?, cancelledAt?`
- Delivery schedule (set once placed): `shippedAt?, outForDeliveryAt?, deliveredAt?`. Orders move along on their own: the stage is the latest of these that has passed (`preparing` before `shippedAt`). Admins can move them forward.
- Cancellation: `cancelReason?: customer | admin | sold_out`, and for orders that were placed or charged `refund?: {status, amountMinor, refundedAt?}`. `status` is `pending` / `succeeded` / `failed` for card refunds on Stripe, `succeeded` straight away for the simulated methods (the store balance is credited back), and `not_charged` for pay on delivery.
- `cancellations?`: items cancelled before it shipped while the rest kept coming, oldest first: `[{id, items, itemsMinor, taxMinor, wrapMinor?, protectionMinor?, refund: {status, amountMinor, refundedAt?}, createdAt}]` (absent when there are none). `refund` works like the order's.

### Returns

Delivered items can be returned within the store's window (`markets.return_days`). A return covers some or all of an order's lines and quantities; an order can have several returns, until every unit is in one that is open or received.

For a store-fault reason the shopper can ask for a replacement instead of a refund (`resolution: "replacement"`), as Amazon's "Replace item" does. The same items ship at once on an order-style schedule (`replacement.shippedAt`, `replacement.deliveredAt`), out of stock, at no charge; nothing is refunded, and the originals still have to be dropped off with the code. Each unit can be replaced once, and only while it's on sale and in stock. Replaced units stay returnable for a refund, since the shopper has the new ones.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/orders/:id/returns` | | `{delivered, returnBy?, returnable: {<productId>: qty}, replaceable: {<productId>: qty}, returns: [Return]}`. `returnBy` is set once the order is delivered. `returnable` is what's left to return; `replaceable` what can be replaced instead (not replaced before, still returnable, on sale and in stock). `404` for someone else's order. |
| POST | `/orders/:id/returns` | `{items: [{productId, qty}], reason, comment?, resolution?: refund \| replacement}` | `201 {return}`. `409 return_not_allowed` with `detail` `not_delivered` or `window_closed`; `409 replacement_unavailable` with `detail` `already_replaced` or `out_of_stock`; `422 invalid_input` with `detail` `items` (none, unknown, or more than is left), `reason`, `comment` (≤ 1000 chars) or `resolution` (unknown, or a replacement for a reason that isn't the store's fault). |
| GET | `/orders/:id/seller-feedback` | | `{feedback: [SellerFeedback]}`: the caller's ratings of the order's sellers, each `{orderId, seller, rating, arrivedOnTime, asDescribed, comment, createdAt, updatedAt}`. `404` for someone else's order. |
| PUT | `/orders/:id/seller-feedback` | `{seller, rating: 1–5, arrivedOnTime?: boolean \| null, asDescribed?: boolean \| null, comment?}` | `{feedback}`. Rates a seller in the order, or changes the rating: once the order is delivered, for 90 days; `409 feedback_not_open` before or after. `422 invalid_input` with `detail` `seller` (not in this order), `rating` or `comment` (≤ 500 chars). Product pages show each seller's rating over the last 12 months (average and share of 4–5 star ratings), never who left it. |
| DELETE | `/orders/:id/seller-feedback` | `{seller}` | `204`. Removes the caller's rating; `404 not_found` when there's none. |
| GET | `/orders/:id/delivery-feedback` | | `{feedback}`: the caller's feedback on the order's delivery, `{orderId, positive, reasons, comment, createdAt, updatedAt}`, or null. |
| PUT | `/orders/:id/delivery-feedback` | `{positive: boolean, reasons?: string[], comment?}` | `{feedback}`. "How was your delivery?": a thumbs up (`positive: true`) or down, with what went well (`on_time`, `good_condition`, `followed_instructions`, `courteous`) or wrong (`late`, `damaged`, `unsafe_spot`, `ignored_instructions`, `wrong_address`, `unprofessional`) and an optional comment (up to 500 characters). Leaves or changes it once the order is delivered, for 30 days (`409 feedback_not_open` otherwise). Repeated reasons drop out; `422 invalid_input` with `detail` `positive`, `reasons` (one that doesn't go with the thumb) or `comment`. Only the shopper and admins see it. |
| DELETE | `/orders/:id/delivery-feedback` | | `204`. Removes the caller's delivery feedback; `404 not_found` when there's none. |
| POST | `/orders/:id/not-received` | | `201 {return}`. "Package didn't arrive": the order was marked delivered but never turned up. Everything paid for it is refunded at once, as a `received` return with reason `not_received` that covers every item left in the order (nothing is sent back). `409 return_not_allowed` with `detail` `not_delivered` (not marked delivered yet), `window_closed` (more than 30 days after), `returned` (something from it has been returned or reported already) or `cash_on_delivery` (only paid when the package is). `404` for someone else's order. |
| POST | `/returns/:id/cancel` | | `{return}`. Only while `requested` (`409 return_not_open` after), and a replacement only until it ships (`409 replacement_shipped` after); cancelling one puts its stock back. |

`reason` is one of `no_longer_needed`, `bought_by_mistake`, `better_price`, `damaged`, `defective`, `wrong_item`, `missing_parts`, `not_as_described`. The last five are the store's fault. A missing-package report has reason `not_received`; it can't be asked for with `POST /orders/:id/returns`, and it doesn't count towards a product's `frequentlyReturned` or `usuallyKept`.

The refund is priced when the return starts:
- `itemsMinor`: the returned units at the prices paid.
- `taxMinor`: the items' share of the order's tax (US). The return that brings the order to fully returned gets whatever tax is left, so the shares add up to the tax charged.
- `shipMinor`: the items' share of the delivery charge, but only for store-fault reasons.
- `protectionMinor?`: the returned units' protection plans. Returning an item cancels its plan, so the plan is refunded with it (absent without one).
- `wrapMinor?`: gift wrap, refunded only when the package didn't arrive.
- `refundMinor = itemsMinor + taxMinor + shipMinor + protectionMinor + wrapMinor`.
- A replacement is all zeros. A missing package refunds the whole order: what's left of `totals` after any cancelled items.

`Return` has these fields:
- `id, orderId, status: requested | received | rejected | cancelled, reason, comment?`
- `resolution: refund | replacement`, and for a replacement `replacement: {shippedAt, deliveredAt}`
- `items: [{productId, title, image, unitPriceMinor, qty}]`
- `itemsMinor, taxMinor, shipMinor, refundMinor`
- `refund?: {status: pending | succeeded | failed, refundedAt?}`, set once received
- `dropoffCode` (e.g. `7F3A-09BC`, shown at a drop-off point), `dropoffBy` (14 days after the start)
- `rejectNote?`, `createdAt, receivedAt?, rejectedAt?, cancelledAt?`

When an admin marks a return received, the units go back into stock and the shopper is refunded (a replacement's refund is zero, recorded as `succeeded` at once): card payments on Stripe (a partial refund of the PaymentIntent, `metadata.returnId` set), simulated methods at once, pay on delivery at once to the shopper's bank (simulated).

### How card payment is confirmed

The customer never tells us they paid. Stripe does:

1. Stripe redirects to `/checkout/success?session_id=…` (web), and it also calls
   `POST /webhooks/stripe`. Both re-fetch the session from Stripe's API.
2. If Stripe says `paid`, `confirm_order_payment` runs. That function is only
   granted to the service role and checks that the amount and currency equal the
   order total. It is idempotent: the success page and the webhook may both run it.
   The order moves to `placed` and the ordered items leave the cart.
3. `checkout.session.expired` / `async_payment_failed`, `POST /orders/:id/cancel`,
   or the web cancel page all call `cancel_order`, which returns the reserved
   stock.

`POST /webhooks/stripe` verifies the `Stripe-Signature` header against
`STRIPE_WEBHOOK_SECRET`:
- It returns `503` when the secret is unset and `400` for a bad signature.
- Final domain outcomes (e.g. `payment_incomplete` for a forged "paid" event) are
  acknowledged with `200 {received, outcome}` so Stripe stops retrying.
- A gift card purchase's session (`metadata.kind: "gift_card"`) issues its code when paid; expiring, it has nothing to release.
- `refund.created`, `refund.updated` and `refund.failed` settle a return's refund
  (matched by the refund's `metadata.returnId`), cancelled items' (by
  `metadata.cancellationId`) or a cancelled order's (by `metadata.orderId`, else
  its PaymentIntent). Enable these events on the Stripe
  endpoint alongside the `checkout.session.*` ones.

A payment that arrives after the order's reserved stock was released and sold
(`409 stock_released`) leaves the order cancelled (`cancelReason: sold_out`) and
refunds the card in full.

## Customer service 🔒

"Contact us": a shopper opens a case in a store, optionally about one of their orders, and the
store's admins answer in the same thread until either side closes it. A case is `open` (waiting on
the store), `answered` (the store replied last) or `closed` (read only).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/me/support` | | `{cases: (Case & {newReply})[]}`: yours in this store, waiting or answered first, then closed; latest activity first (up to 100). `newReply` is `true` while the store has written since you last opened the case (or wrote on it). The web app lists them at `/customer-service/cases` |
| POST | `/me/support` | `{topic, subject, body, orderId?}` | `201 {case}`. `topic`: `order`, `delivery`, `return`, `payment`, `account` or `other`. `subject` 3–120 characters on one line, `body` 10–2000 (`422 invalid_input`, `detail` = field). `orderId` must be one of your orders in this store (`404 order_not_found`). Up to 5 cases open or answered per store (`409 too_many_cases`). The web app's form is `/customer-service/contact` (`?order=` picks the order) |
| GET | `/me/support/:id` | | `{case: Case & {messages: Message[]}}`, messages oldest first, and marks the store's replies seen. Someone else's case is `404 case_not_found` |
| POST | `/me/support/:id/messages` | `{body}` | `201 {message}`. 2–2000 characters. The case goes back to `open`. A closed case is `409 case_closed` |
| POST | `/me/support/:id/close` | | `{case}`. Closing it twice is fine |

`Case` is `{id, topic, subject, status, orderId, customer, createdAt, updatedAt, closedAt}` (`customer` is the shopper's profile name); `Message` is `{id, from: "customer" | "agent", body, createdAt}`.

## Addresses 🔒

Five per store. The first address becomes the default. There is always exactly
one default, and deleting it promotes the next one. Any address can carry
`instructions`, a delivery note of up to 250 characters (`422 invalid_input`
beyond that), returned on the address.

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

`Collection` has these fields: `id, name, note, kind: custom|considering|later, createdAt, shareToken, items: [{product, savedPriceMinor, savedInStock, addedAt}]`. `shareToken` is set while the list is shared by link. Items are sorted newest first. `savedPriceMinor` is the catalog price when the item was first saved, and `savedInStock` whether it was in stock then, both stamped by the database and kept when the item moves lists. Compare them with `product.priceMinor` and `product.stock` to show price drops and "back in stock" (saved sold out, `stock > 0` now). Items keep archived products (`product.archived: true`).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/collections` | | `{collections}` ordered considering, custom (oldest first), later |
| POST | `/collections` | `{name: 1..60, note?: ≤500}` | `201 {collection}`. Names are unique per store, ignoring case (`409 duplicate`). `409 collection_limit` past 20. |
| GET | `/collections/:id` | | `{collection}`. `404 collection_not_found` if it isn't yours. |
| PATCH | `/collections/:id` | `{name?, note?}` | `{collection}` |
| DELETE | `/collections/:id` | | `204`. Deletes its items too. |
| POST | `/collections/:id/items` | `{productId}` | `201 {item}`. Idempotent: re-adding keeps the original saved price. `404 product_not_found` if the product is from another store. `409 product_unavailable` if it's archived. `409 collection_item_limit` past 200. |
| DELETE | `/collections/:id/items/:productId` | | `204`. A no-op when the product isn't in the collection. |
| POST | `/collections/:id/items/:productId/move` | `{to: collectionId}` | `204`. Moves it onto another of your lists in the same store and keeps the price it was saved at. If it's already on that list, that copy stays. `404 item_not_found` if it isn't on this list. `409 collection_item_limit` if the target is full. |
| POST | `/collections/:id/share` | | `{token, sharedAt, url}`. Turns on a link anyone can open (`/lists/<token>`). The same link while it's on. |
| DELETE | `/collections/:id/share` | | `204`. The link stops working; sharing again makes a new one. |

**Shared lists** (no sign-in). Anyone with the link reads the list's name, the sharer's first name and its products, never the note, the saved prices or whose account it is. Marking an item bought needs sign-in.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/lists/:token` | | `{list: {token, name, kind, market, ownerName, sharedAt, mine, collectionId, products, bought}}`. Still-to-buy products first, then bought ones, newest first within each; archived products are left out. `mine` (and `collectionId`) only for the sharer. `bought` maps product ids to `you` (you marked it) or `someone` (another gift giver did); always `{}` for the sharer, so marks don't spoil the surprise. `404 collection_not_found` when the link is off or wrong. |
| POST 🔒 | `/lists/:token/items/:productId/bought` | | `204`. Marks the item bought by you (here or elsewhere; it isn't tied to an order) so other gift givers don't buy it twice. Again is a no-op. `409 gift_already_bought` when another giver marked it first; `409 own_list` on your own list; `404 item_not_found` when it isn't on the list. |
| DELETE 🔒 | `/lists/:token/items/:productId/bought` | | `204`. Undoes your mark; another giver's mark stays. |

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
| POST | `/ai/compare` | `{productIds: [2..4], weights?, use?, allowMixed?}` | `{mixed: false, weights, ranked: RankedProduct[], verdict: {winnerId, text, perProduct: [{productId, bestFor, strengths, tradeoffs}], source}, table: {rows: [{label, cells: [{text, best}]}], same: []}}`. `RankedProduct` is `{product, insight, match: 0..100, why: [], warn}`. Every product must be from this store. Products from different categories can't be ranked on a shared basis, so they fail with `409 mixed_categories` (`detail` lists the category slugs). With `allowMixed: true` the response is `{mixed: true, categories: [{slug, name, ids}], products, table}` instead: no weights, ranking or verdict, and the table has only the rows every product has (category, price, rating, discount, brand, seller, shipping, availability), with no `best` flags. |

Configuration (`.env.local` / Vercel):
- `GEMINI_API_KEY`: secret, optional. With it blank, the whole site runs on rules.
- `GEMINI_MODEL`: optional, default `gemini-2.5-flash`.

## Admin 🔒

Catalog and order management for store admins. You must be signed in **and** listed in `public.admins`; anyone else gets `403 forbidden`. The database checks the same rule on every write (RLS on `products`, `categories`, `market_categories`, `product_insights` and the `product-images` bucket; `is_admin()` inside the order functions), so going around these routes doesn't help. Products are per store (`?market=` / `X-Market`), and a product never moves between stores.

### Overview

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/overview` | | `{overview: {orders: {toShip, inTransit, refundIssues}, returns: {open, refundIssues}, reportedReviews, unansweredQuestions, productReports, support: {waiting, oldestWaiting}, stock: {out, low}}}`: what needs doing in this store, each count the same as its own queue's tab. `support.oldestWaiting` is when the longest-waiting case last changed (`null` if none wait); `stock.low` counts products on sale with 1–5 left. The web app shows it at `/admin` |
| GET | `/admin/sales?days=30` | | `{sales: {days, from, to, timeZone, totals: {orders, units, salesMinor, cancelledOrders, returns, unitsReturned, refundedMinor}, byDay: [{day, orders, units, salesMinor}], top: [{productId, title, image, orders, units, salesMinor}]}}`: how the store sold over its last `days` days (1–365, default 30; `422 invalid_input` otherwise), as Amazon's Business Reports show it. Days are the store's own calendar days in its time zone; `from` and `to` are the first and last (`YYYY-MM-DD`), and `byDay` has every day between, oldest first. Orders count from when they were placed. `salesMinor` is what the items sold for after coupons, before tax and delivery. Orders cancelled since don't count, nor do items cancelled from an order; `cancelledOrders` counts orders placed in those days and cancelled since. `returns` and `unitsReturned` are returns received in those days, and `refundedMinor` what was refunded for them. `top` is up to 10 products, most units first. The web app shows it at `/admin/sales` |

### Products

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/products?status=&q=&category=&stock=&page=&pageSize=25` | | `{items: [{id, title, brand, image, category, categoryName, priceMinor, listMinor, deal, stock, updatedAt, archivedAt}], total, page, pageCount}`. Products on sale, or with `status=archived` the archived ones. Most recently changed first. `q` matches the title, or an exact id. `stock=out` keeps those with none left, `stock=low` those with 1–5. |
| POST | `/admin/products` | `ProductInput` | `201 {product}`. The id is generated (`n…`, or `in-n…` in India) and the product goes last in catalog order. |
| GET | `/admin/products/:id` | | `{product}`: every editable field plus `id, market, createdAt, updatedAt, archivedAt`. |
| PATCH | `/admin/products/:id` | any `ProductInput` fields, and/or `archived` | `{product}`. Fields you leave out keep their values. `archived: true` takes it off sale; `false` puts it back. Archiving an archived product keeps its original `archivedAt`. |
| DELETE | `/admin/products/:id` | | `204`. It also comes out of carts, collections and reviews. `409 product_has_orders` once anyone has ordered it: archive it instead. |

`ProductInput` is `{title, brand?, category, image, priceMinor, listMinor?, deal, couponPct?, maxPerCustomer?, badge?, boughtPastMonth?, seller, shipsFrom, bullets: string[], description?, details?: [label, value][], stock, gallery?: string[], variantGroup?, variantAxis?, variantLabel?}`:
- `category` must be a slug this store carries (`422 invalid_category`).
- `image` is a site path (`/products/…`) or an `https://` URL. The admin pages upload files to the public `product-images` Storage bucket (JPEG, PNG or WebP, up to 3 MB) and store that URL.
- `listMinor` is the "was" price and must be above `priceMinor`. The discount % is worked out from it. `deal: true` (Today's Deals) needs a list price.
- `couponPct`: the product's coupon, a whole percent from 5 to 50; null or left out on create: none. Changing it keeps shoppers' coupons applied at the new percent; null removes the coupon and takes it off their carts.
- `maxPerCustomer`: "Limit N per customer", a whole number from 1 to 99; null or left out on create: no limit. Lowering it doesn't touch orders already placed, but shoppers who've bought that many can't buy more.
- `bullets`: up to 10, each up to 300 characters.
- `description`: the product page's "Product description", up to 2,000 characters (blank or left out: none).
- `details`: the "Product information" table, up to 20 `[label, value]` rows (labels up to 40 characters, values up to 200). Left out on create: empty. The admin form edits it as one `Label: value` per line.
- `gallery`: up to 8 more images after `image`, each a site path or `https://` URL, shown in this order. Repeats and the main image are dropped. Left out on create: none.
- `variantGroup`: products of a store with the same group show as options of each other (each keeps its own price, stock, reviews and orders). A lowercase slug (`sony-wh-ch520`), up to 60 characters; blank or null for none, which also clears `variantAxis` and `variantLabel`.
- `variantAxis`: what the options differ by, e.g. `Color` or `Size` (up to 30 characters, `Style` when left out). Every product in a group uses the same one (`422 invalid_input`, `detail: "variantAxis"`).
- `variantLabel`: this product's option, e.g. `Black` (up to 60 characters). Needed with a group, and unique within it, ignoring case (`422 invalid_input`, `detail: "variantLabel"`).
- Validation errors are `422 invalid_input` with the field in `detail`.

Saving re-derives the product's rules insight (scores, pros and cons for its category's attributes). This happens on create, and on any change of category, title, brand or bullets. A new category replaces an AI insight too, since its attributes belong to the old category. New wording only replaces a rules insight.

### Categories

A category (`{slug, name}`) is shared by both stores. Each store chooses whether its nav lists it, and where. The slug never changes once created, because products, links (`/s?dept=`) and saved searches key on it.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/categories` | | `{market, nav: [slug], categories: [{slug, name, tailored, stores: {US, IN}}]}`. `nav` is this store's order. Each `stores` entry is `{position, products, archived}`: `position` is null when that store doesn't list it, and `products` includes archived ones. `tailored` means the decision tools have attributes, presets and a quiz written for it. Other categories use a generic set. |
| POST | `/admin/categories` | `{name: 1..80, slug?, listed = true}` | `201 {category}`. The slug defaults to one made from the name (`Garden & Outdoors` → `garden-and-outdoors`). It must be lowercase words joined by single hyphens, up to 40 characters. `listed` puts it last in this store's nav. `409 category_exists` if the slug is taken. |
| PATCH | `/admin/categories/:slug` | `{name?, listed?, move?}` | `{category}`. `name` renames it. `listed: true` / `false` adds it to or drops it from this store's nav. A store can't drop a category it still has products in (`409 category_in_use`), archived ones included. `move` shifts it that many places in this store's nav (negative = earlier), clamped at the ends. |
| DELETE | `/admin/categories/:slug` | | `204`, and it leaves every store's nav. `409 category_in_use` while any product in any store uses it. |

### Orders

Orders of this store that were placed or charged (abandoned checkouts are left out).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/orders?filter=&q=&page=` | | `{orders: [{id, status, stage, currency, paymentMethod, paymentLabel, totalMinor, createdAt, placedAt, cancelledAt, cancelReason, refundStatus, shipName, customer: {email, name}, itemCount, firstTitle}], total, page, pageSize, counts}`. Newest first, 25 a page. `filter`: `all`, `preparing`, `shipped` (shipped or out for delivery), `delivered`, `cancelled`, `refund_issues` (refund `pending` or `failed`). `q` matches the start of the order number or part of the customer's email. `counts` has each filter's total, ignoring `q`. |
| GET | `/admin/orders/:id` | | `{order, returns}`: an `Order` plus `stage`, `customer: {id, email, name}`, `stripePaymentIntent`, `stripeRefundId`, and its returns as `AdminReturn`s (see below), oldest first. Another store's order is `404`. |
| POST | `/admin/orders/:id/ship` | | `{order}`. Shipped now; out for delivery and delivered move up to the next delivery morning if that's earlier. Placed orders only (`409 order_not_open`); repeating does nothing. |
| POST | `/admin/orders/:id/deliver` | | `{order}`. Every step still ahead happens now. Placed orders only. |
| POST | `/admin/orders/:id/cancel` | | `{order}`. Any order not yet delivered (`409 order_not_cancellable` after). Stock goes back; a card payment is refunded on Stripe. If Stripe refuses, the cancel stands with `refund.status: failed`. |
| POST | `/admin/orders/:id/refund` | | `{order}`. Retries a card refund that failed (or never reached Stripe), the order's own and its cancelled items'. `502 refund_failed` if one fails again. |

### Returns

Returns of this store's orders.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/returns?filter=&page=` | | `{returns: [AdminReturn], total, page, pageSize, counts: {open, refund_issues, closed, all}}`. 25 a page. `filter`: `open` (the default: `requested`, oldest first), `refund_issues` (received, card refund `failed` or `pending`), `closed` (received, rejected or cancelled, newest first) or `all`. |
| GET | `/admin/returns/:id` | | `{return}`: a `Return` plus `order: {id, market, currency, paymentMethod, paymentLabel, totalMinor, deliveredAt}`, `customer: {id, email, name}` and `stripeRefundId?`. Another store's return is `404`. |
| POST | `/admin/returns/:id/receive` | | `{return}`. The items are back: stock returned and the refund issued. A card refund is `pending` until Stripe confirms it, or `failed`. Open returns only (`409 return_not_open`). |
| POST | `/admin/returns/:id/reject` | `{note?}` | `{return}`. Closed without a refund; the shopper sees the note (≤ 500 chars). |
| POST | `/admin/returns/:id/refund` | | `{return}`. Retries a received return's card refund that failed or never reached Stripe. `502 refund_failed` if it fails again. |

### Reviews

Reviews of this store's products that shoppers reported, or that are hidden. A report is open when it was filed after the review's last admin decision; three open reports hide a review (`hiddenReason: reports`).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/reviews?view=&page=` | | `{reviews: [{id, productId, productTitle, author, rating, title, body, verified, seeded, helpful, createdAt, hiddenAt, hiddenReason, moderatedAt, openReports, lastReportedAt, reasons, photos}], total, page, pageSize, counts: {reported, hidden}}`. 25 a page. `view`: `reported` (the default: open reports, most reported first) or `hidden` (hidden by `reports` or `admin`, newest first). `reasons` counts open reports by reason, e.g. `{spam: 2, offensive: 1}`. |
| POST | `/admin/reviews/:id/keep` | | `{review: {id, deleted, hiddenAt, hiddenReason, moderatedAt}}`. Visible again; the reports so far are resolved, so it takes three new ones to hide it again. |
| POST | `/admin/reviews/:id/hide` | | `{review}`. Hidden by an admin until kept; also resolves the open reports. |
| DELETE | `/admin/reviews/:id` | | `{review: {id, deleted: true}}`. Removes the review with its votes, reports and photos. |

Another store's review is `404 review_not_found`. Shoppers can't change the moderation fields, not even on their own review: editing a hidden review keeps it hidden.

### Questions

Shoppers' questions about this store's products, with their answers.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/questions?view=&page=` | | `{questions: [{id, productId, productTitle, author, body, answerCount, createdAt, answers: [{id, author, body, verified, helpful, createdAt}]}], total, page, pageSize, counts: {unanswered, all}}`. 25 a page, newest first. `view`: `unanswered` (the default) or `all`. Answers are oldest first. |
| DELETE | `/admin/questions/:id` | | `{question: {id, deleted: true}}`. Removes the question with its answers and their votes. |
| DELETE | `/admin/answers/:id` | | `{answer: {id, deleted: true}}`. Removes one answer; the question's `answerCount` drops. |

Another store's question is `404 question_not_found`, and its answers `404 answer_not_found`.

### Product reports

Shoppers' "Report an issue with this product" reports on this store's products.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/product-reports?view=&page=` | | `{reports: [Report & {reporter, productTitle, productArchived}], total, page, pageSize, counts: {open, closed, all}}`. 25 a page. `view`: `open` (the default, oldest first), `closed` (resolved or dismissed) or `all` (latest first) |
| POST | `/admin/product-reports/:id` | `{status, note?}` | `{report}`. `status`: `resolved` (the listing was fixed) or `dismissed`; `note` up to 500 characters. `409 report_closed` once closed; another store's report is `404 report_not_found` |

### Support

Shoppers' "Contact us" cases in this store (see [Customer service](#customer-service-)).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/admin/support?view=&page=` | | `{cases: [Case & {last: Message \| null, messageCount}], total, page, pageSize, counts: {waiting, answered, closed}}`. 25 a page. `view`: `waiting` (the default: status `open`, longest waiting first), `answered` or `closed` (latest first) |
| GET | `/admin/support/:id` | | `{case: Case & {messages: Message[]}}` |
| POST | `/admin/support/:id/messages` | `{body}` | `201 {message}`. Answers as the store (`from: "agent"`); the case moves to `answered`. `409 case_closed` once closed |
| POST | `/admin/support/:id/close` | | `{case}` |

Another store's case is `404 case_not_found`.

**Making someone an admin.** Admins are rows in `public.admins`, managed only with SQL or the service role:

```bash
npm run admin:grant -- shopper@example.com            # uses .env.local
npm run admin:grant -- shopper@example.com --revoke
```

The web UI is at `/admin` (an overview of what needs doing), `/admin/products`, `/admin/categories`, `/admin/orders`, `/admin/returns`, `/admin/reviews`, `/admin/questions`, `/admin/product-reports` and `/admin/support` (plus `/in/admin/…` for India). Admins also get an **Admin · Overview** link in the account menu.

## Errors

| Status | Codes |
| --- | --- |
| 400 | `invalid_json`, `unknown_market`, `cart_token_required`, `invalid_signature` |
| 401 | `not_authenticated` |
| 402 | `payment_incomplete` |
| 403 | `forbidden` (the operation is not granted to your role, e.g. a guest calling a signed-in-only function, or a non-admin calling `/admin`) |
| 404 | `product_not_found`, `order_not_found`, `return_not_found`, `review_not_found`, `address_not_found`, `collection_not_found`, `category_not_found`, `chart_not_found`, `gift_card_not_found`, `coupon_not_found`, `purchase_not_found`, `question_not_found`, `answer_not_found`, `case_not_found`, `item_not_found`, `not_in_cart`, `not_found` |
| 405 | wrong method on a known path |
| 409 | `promo_used`, `purchase_limit`, `order_not_cancellable`, `order_not_archivable`, `order_not_editable`, `order_address_locked`, `feedback_not_open`, `account_not_closable`, `order_not_open`, `return_not_allowed`, `return_not_open`, `mixed_categories`, `product_has_orders`, `product_unavailable`, `category_in_use`, `category_exists`, `cart_empty`, `nothing_selected`, `out_of_stock`, `insufficient_stock`, `address_limit`, `collection_limit`, `collection_item_limit`, `own_review`, `own_answer`, `duplicate`, `order_not_pending`, `amount_mismatch`, `session_mismatch`, `stock_released`, `not_a_card_order`, `insufficient_balance`, `gift_card_redeemed`, `case_closed`, `too_many_cases` |
| 415 | `unsupported_media_type` |
| 422 | `invalid_input`, `invalid_shipping_address`, `invalid_postcode`, `invalid_category`, `payment_method_unavailable`, `emi_unavailable`, `delivery_option_unavailable`, `gift_card_other_store`, `promo_invalid`, `promo_expired`, `promo_not_eligible`, `promo_min_spend` |
| 502 | `refund_failed` |
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

Thirty-one migrations live in `supabase/migrations/`:

| Migration | Contents |
| --- | --- |
| foundation | `markets` (per-store tax, shipping, payment methods, caps), `categories`, `market_categories`, shared helpers |
| catalog | `products` with a generated `search_doc` tsvector (GIN), plus `catalog_products` (the read view) and `search_catalog()` |
| accounts | `profiles` (created by trigger on signup) and `addresses` (per-store validation, default handling, limit) |
| commerce | `carts`/`cart_items` (user or guest token), `orders`/`order_items` (snapshots) and these functions: `cart_*`, `order_totals()`, `place_order()`, `cancel_pending_order()`, `attach_checkout_session()`, `confirm_order_payment()`, `release_checkout_session()`, `purge_stale_guest_carts()` |
| reviews | `reviews` (one per user per product, with an optional `fit`), `review_votes`, `review_reports`, and the `product_ratings` rollup kept by triggers |
| admin | `admins` (no API access), `is_admin()`, admin-only insert/update/delete policies and column grants on `products`, a trigger that keeps a product in a category its store carries, and the public `product-images` Storage bucket (admin-only writes) |
| decision | `product_insights` (public read, server-written; seeded from `supabase/seed-insights.sql`, built by `npm run db:insights:build`), `collections`/`collection_items` (owner RLS, limit + saved-price triggers), `ai_cache` (service role only) |
| catalog admin | admin writes on `categories`, `market_categories` and `product_insights`; `move_category()`, `category_counts()`, `product_has_orders()`; a trigger stopping a store from unlisting a category it has products in; `products.archived_at`, with `catalog_products` now filtering archived products out and `catalog_products_all` keeping them; carts, checkout and saved lists refuse archived products |
| split IN categories | data only: moves India's smartwatches, mixer grinders and yoga mats into `wearables`, `kitchen-appliances` and `yoga`, and re-derives their insights. A no-op on a fresh database, where the seed already has them |
| order lifecycle | `markets.time_zone`; the saved delivery schedule on `orders` (filled by trigger when an order is placed, backfilled for existing ones); cancellation and refund columns; `cancel_my_order()`; the admin order functions `admin_list_orders()`, `admin_get_order()`, `admin_ship_order()`, `admin_deliver_order()`, `admin_cancel_order()`; and the service-role `record_payment_intent()`, `record_refund()`, `mark_sold_out()` |
| catalog enrichment | `products.description` and `products.details` (admin-writable, read by the product page and API, not the catalog views); for databases seeded earlier, the seeded products' descriptions, spec tables and missing brands (book authors) and category-specific wording for the seeded reviews. A no-op on a fresh database, where the seed has them |
| email in use | `email_in_use()`, service role only: whether an account already has an email address, checked before the server changes an account's email |
| review moderation | `reviews.hidden_at`, `hidden_reason` (`reports` or `admin`) and `moderated_at`; a trigger on `review_reports` that hides a review at three open reports; hidden reviews leave the public read policy (their author and admins still see them) and the `product_ratings` rollup; the admin functions `admin_review_queue()` and `admin_moderate_review()` (keep, hide, delete) |
| returns | `markets.return_days` (US 30, IN 10); `returns` and `return_items` (owner read only); `request_return()`, `order_returns()` and `cancel_my_return()` for shoppers; the admin functions `admin_list_returns()`, `admin_get_return()`, `admin_receive_return()` and `admin_reject_return()`; and the service-role `record_return_refund()` |
| galleries and variants | `products.gallery` (up to 8 more images) and `variant_group`, `variant_axis`, `variant_label`, admin-writable and read by the product page and API; labels unique per store and group (`products_variant_label_key`); for databases seeded earlier, the seeded variant groups (Sony, Brooks and FHUMSH colours in the US; Hawkins sizes and Lenovo configurations in India). A no-op on a fresh database, where the seed has them (`supabase/seed/variants.json`) |
| admin order returns | admin read policies on `returns` and `return_items` (the admin orders list marks orders with a return) and `admin_order_returns()`, one order's returns for the admin order page |
| folded variants | `variant_group`, `variant_axis` and `variant_label` on the `catalog_products` and `catalog_products_all` views; `search_catalog()` adds `groups` (matches with each variant group counted once) and counts brand facets the same way |
| search suggestions | `search_suggest()`: completions, departments and products for the header search box (`/suggest`) |
| bought together | `bought_together()`: the products most often in the same placed orders as a product, in the same store and in stock, other options of its variant group left out. A pair only counts once two different shoppers have bought it, so no one's order shows through (`/products/:id/bought-together`) |
| gift orders | `orders.gift` and `gift_message` (up to 240 characters, only on a gift); `place_order()` takes `p_gift` and `p_gift_message` |
| delivery speed | `markets.fast_ship_fee_minor`; `orders.ship_speed` (`standard` or `fast`), the fast schedule in the order trigger, and `place_order()`'s `p_speed`, refused with `delivery_option_unavailable` when faster delivery isn't offered |
| Plus membership | `plus_members` (owner read only); `join_plus()` and `leave_plus()`; `order_totals()` (now security definer) and `place_order()` make standard and faster delivery free for members |
| gift card balance | `markets.demo_gift_card_minor`; `gift_cards`, `store_balances` and `balance_entries` (owner read only); `claim_demo_gift_card()` and `redeem_gift_card()`; triggers that take a balance order's total when it's placed (`insufficient_balance`) and credit its refunds back, only for orders that were charged |
| coupons | `coupons` (one per product, 5–50% off; everyone reads, admins write) and `coupon_clips` (owner read only); `clip_coupon()` and `unclip_coupon()`; `orders.discount_minor` and `order_items.unit_discount_minor`, with `orders_total_adds_up` taking the discount off; `cart_json()`, `place_order()` and `request_return()` price applied coupons per unit |
| product Q&A | `product_questions` and `product_answers` (everyone reads) and `answer_votes` (owner read only); `ask_question()`, `answer_question()`, `delete_question()`, `delete_answer()` and `toggle_answer_helpful()` set the author, the verified mark and the counters |
| gift card purchases | `gift_cards.purchased_by`; `gift_card_purchases` (owner read only); `start_gift_card_purchase()`, `my_gift_card_purchases()`, and the service-role `attach_gift_card_session()` and `confirm_gift_card_purchase()`, which checks the amount and currency and issues the code |
| shared lists | `collections.share_token` / `shared_at`; `share_collection()` and `unshare_collection()` (owner), and `shared_collection()` for anyone with the link |
| moving list items | `move_collection_item()` (owner): moves a product between two of the caller's lists and keeps its saved price and date |
| shared list gifts | `collection_gifts` (no policies: read through `shared_collection()`, which now returns each item's `bought` for everyone but the owner, and written through `mark_shared_gift()`); one giver per item, and the mark goes with the item when it's removed or moved |
| verified after delivery | `private.has_received()`: review `verified` (in `reviews_before_write`) and answer `verified` (in `answer_question()`) need an order containing the product to have been delivered, not just placed; existing marks without one were cleared |
| buy now | `place_order(p_buy)` orders just one product and leaves the cart alone; `orders.from_cart` keeps `confirm_order_payment()` from taking a Buy Now order's items out of the cart; `buy_now_quote()` prices the line, and `cart_json()` now shares `private.checkout_json()` with it |
| cart selection | `cart_items.selected`; `cart_select()` ticks one line or all of them; `private.checkout_json()` lists every line but prices the ticked ones (`selected_count`); `place_order()` orders the ticked lines and removes only those from the cart; adding a product ticks it again |
| protection plans | `markets.protection_categories`, `protection_min_minor`, `protection_round_minor`; `protection_offer()` (anyone) prices a product's plan; `cart_items.protection` and `cart_set_protection()`; `private.checkout_json()` prices the ticked lines' plans; `place_order()` stores each item's `order_items.protection_minor` (per unit) and `orders.protection_minor` (in the total); `cancel_my_items()` refunds the cancelled lines' plans (`order_cancellations.protection_minor`) |
| delivery instructions | `addresses.instructions` and `orders.ship_instructions` (up to 250 characters); `place_order()` copies `shipping.instructions` onto the order |
| archived orders | `orders.archived_at`; `archive_my_order()` (owner) archives an order or brings it back; an unpaid card checkout can't be archived |
| close account | `orders`, `returns` and `gift_card_purchases` keep their rows when the account is deleted (`user_id` set null); `account_closure_check()` (caller) counts what's still open (unpaid and undelivered orders, open returns, pending refunds, gift card checkouts under an hour old) and lists the gift card balance that would be lost; the server deletes the auth user with the admin API |
| order instructions | `set_my_order_instructions()` (owner) changes an order's `ship_instructions` until it's out for delivery |
| seller feedback | `seller_feedback` (one per order and seller; the owner reads and deletes their own); `leave_seller_feedback()` (owner) rates a seller in a delivered order for 90 days; `seller_ratings()` (public) gives each seller's 12-month count, average and 4–5 star count |
| delivery feedback | `delivery_feedback` (one per order; the owner reads and deletes their own, admins read all); `leave_delivery_feedback()` (owner) rates a delivered order's delivery for 30 days, checking the reasons against the thumb |
| seller profile | `seller_profile()` (public) gives a seller's ratings over 30 days, 90 days, 12 months and in all, the 12-month star counts and the latest comments; null for a seller with nothing listed and no ratings in the store |
| search price | `search_catalog()` takes `p_min_price` and `p_max_price` (minor units) and keeps products priced within them; brand facets still cover the whole query+department scope |
| support cases | `support_cases` and `support_messages`; shoppers read their own (admins all) and write only through `open_support_case()`, `reply_support_case()` and `close_support_case()`, which set the status (`open` / `answered` / `closed`) and cap open cases at 5 per shopper per store |
| order address | `set_my_order_address()` (owner) copies one of their saved addresses in the order's store onto the order (with its instructions) while it's being prepared |
| support seen | `support_cases.customer_seen_at`: when the shopper last opened the case or wrote on it (a trigger on their messages). `my_unread_support_cases()` lists their cases with a store reply since, and `mark_support_case_seen()` (owner) records a visit |
| saved stock | `collection_items.saved_in_stock`: whether the product was in stock when saved, stamped by the insert trigger with the saved price and kept by `move_collection_item()` |
| inbox seen | `inbox_reads`: when each shopper last read their messages, per store (theirs to read). `mark_inbox_seen()` records a visit and never moves it back |
| review photos | `reviews.photos` (up to 5 storage paths) and the public `review-photos` bucket: shoppers upload to and delete from their own folder only, admins can delete any. A trigger (`reviews_photos_check`) lets a shopper's review list only files in their folder, no repeats. `admin_review_queue()` returns `photos`, and `admin_moderate_review()` returns them on delete so the app clears the files |
| product reports | `product_reports`: shoppers' reports on a product (reason, optional details), theirs to read (admins all). `report_product()` files one, or rewrites the caller's open one on that product, up to 20 open per shopper; `resolve_product_report()` (admins) resolves or dismisses an open one with an optional note |
| search in stock | `search_catalog(p_in_stock)` leaves out products with none left (the storefront and `/products` pass it unless `oos=1`) and returns `unavailable`, the matches with no option in stock, each variant group once |
| frequently returned | `product_return_signal()` (anyone) says whether a product is frequently returned and its usual product-side reason; counts never leave the database |
| cancel items | `order_cancellations` and `order_cancelled_items` (owner read only): items cancelled from an order before it shipped, with their refund; `cancel_my_items()` cancels some lines (all of them cancels the order) and `record_cancellation_refund()` (service role) records the Stripe refund |
| most wished for | `most_wished_for()` (anyone): product ids most shoppers saved to a list in the last 30 days, never whose lists (`/most-wished-for`, `/charts/most-wished-for`) |
| gift ideas | `gift_ideas()` (anyone): product ids most shoppers gave in the last 30 days, by gift order or off a shared list, never whose (`/gift-ideas`, `/charts/gift-ideas`) |
| admin sales | `admin_sales()` (admins): a store's orders, units and sales by day over its last N days, cancelled orders, returns and the best sellers (`/admin/sales`) |
| replacements | `returns.resolution` (`refund` or `replacement`), `replacement_shipped_at` and `replacement_delivered_at`; `request_return()` takes `p_resolution`, `order_returns()` adds `replaceable`, and `cancel_my_return()` refuses a shipped replacement and restocks one cancelled before |
| promo codes | `promo_codes` (no client access): a store's codes, a percent off the order or one category, with a minimum spend, uses per customer and dates; `orders.promo_code` and `order_items.unit_promo_minor` (inside `unit_discount_minor`); `checkout_quote()` prices the caller's checkout with a code, `active_promo_codes()` (anyone) lists the running ones, and `place_order()` takes `p_promo_code` |
| purchase limits | `products.max_per_customer` (in `catalog_products`); a before-insert trigger on `order_items` refuses a line that takes the customer past it, counting their orders that aren't cancelled; `purchase_allowance()` (caller) says how many of each limited product they've bought |
| also viewed | `product_coviews` (no client access): views per pair of products in a store; `record_product_view()` (anyone) counts a view with up to 5 products seen before it, and `also_viewed()` (anyone) lists the products most viewed with one, as ids and counts |

About the tables and functions:
- **Browser-facing roles cannot write any table directly.** The anon and authenticated roles either go through RLS-scoped policies or call functions with explicit grants. Order and total columns are never client-writable, and price and stock only by admins (`public.admins`), through the `products` policies.
- **Service-role-only functions.** `confirm_order_payment`, `attach_checkout_session`, `release_checkout_session`, `record_payment_intent`, `record_refund`, `record_return_refund`, `mark_sold_out`, `attach_gift_card_session`, `confirm_gift_card_purchase` and `email_in_use` are called by the server with `SUPABASE_SERVICE_ROLE_KEY`.
- **Guest carts.** They are only reachable through the `cart_*` functions with their token. `purge_stale_guest_carts()` deletes guest carts that have been idle for 30 days. It is service-role only, so schedule it with pg_cron or call it from a cron job.

Tests: `npm run test:db` runs `test/integration/*` against the local stack. It covers:
- totals, carts, stock reservation and overselling, card confirmation rules
- RLS isolation, reviews, addresses, search and home content
- returns: the delivery and window checks, what's left to return, refund pricing (tax shares that add up, delivery only for store-fault reasons), cancel, admin receive (stock back, refund per payment method) and reject, the admin list per store, an order's returns for the admin order page, and real Stripe test-mode partial refunds
- review moderation: auto-hide on the third report, who sees a hidden review, the rating rollup, keep resolving reports, admin hide, the queue per store, admin-only access, delete
- account settings: sign-up, rename, email change (current password, taken addresses), password change (sessions ended, new session returned, reset-link sessions)
- the signed Stripe webhook
- product variants and galleries: sibling options per store in label order, unique labels (and the index behind them), one option name per group, archived options, leaving a group, the gallery cap; listings and ranked search showing one card per group, group counts and brand facets, and the swatch summaries
- search suggestions: completions, departments that follow the top completion, one card per group, store isolation, short and punctuation-only input
- bought together: pairs from placed orders only, the two-shopper threshold, sold-out products left out, and the product page's pick (order pairs first, then accessories)
- admin catalog: product writes (including the description and spec table), archiving (listings, carts, checkout, saved lists), insights on save, and categories (create, rename, store navs, reorder, delete guards)
- buy again: one entry per product across orders, newest first, cancelled orders left out, per store and per shopper, sold-out and archived products last, and the API route
- order lifecycle: the saved schedule in both time zones, shopper and admin cancel windows, stock and refund state per payment method, admin moves and listing, refund bookkeeping, and real Stripe test-mode refunds
