# amz-clone — Design System (faithful amazon.com / amazon.in clone)

Provenance: this design system was measured from computed styles and bounding boxes read from amazon.com and amazon.in (desktop 1024 px and mobile 375 px: both homepages, both search-results pages, product detail pages, empty cart, the "Choose your location" popover, and the language/currency flyout). Both stores share one visual system — identical belt, sub-nav and search-button colours, the same body face and component anatomy. §13 lists every store-specific difference. Values marked *(measured)* come from those reads; values marked *(canonical)* are amazon.com's long-standing CSS values that the measurement did not directly hit (sprites, hover states).

The token values here are the ones actually implemented in [`app/globals.css`](app/globals.css) under Tailwind v4 `@theme` (see §12). Component code cites this document by section, e.g. `design.md §5 Footer`.

Legal: this is an **unofficial demo/portfolio clone**, not affiliated with, endorsed by, or connected to Amazon.com, Inc. It reproduces Amazon's visual language and uses Amazon brand names/marks/product imagery for fidelity; every page carries a demo disclaimer (see the footer). Do not present it as a real store. Real membership is called "Prime"; the India store is served under the `/in` path prefix (a stand-in for amazon.in, since the demo can't register real domains).

## 1. Principles

1. **Density over air.** Body is 14/20 everywhere; the page is a utility, not a brochure. White ground, hairline greys, no decorative shadows.
2. **Colour is a verb.** Yellow means commit (Add to Cart, Sign in, Proceed). Orange means accelerate (Buy Now, search submit). Teal/blue means "this is a link". Red means money moving in your favour (deal, savings) or an error. Green means availability. Nothing else gets colour.
3. **The product image is the only hero.** Chrome recedes: dark navy header and footer bracket a white page.
4. **Trust is typographic.** Bold black delivery dates, bold "In Stock", verified badges, explicit counts ("50+ bought in past month"), prices with superscript cents.
5. **Every state is designed.** Out of stock, price changed, only-3-left, sponsored, deal-claimed %, loading skeletons.

## 2. Colour

Tokens are defined in `app/globals.css` `@theme` and consumed as Tailwind colour utilities (`bg-nav-belt`, `text-ink-2`, `border-line`, …). A few source concepts (`ink.hint`, `cta.secondary`, `cta.dark`, `success.legacy`, `overlay`, form focus ring) are applied via arbitrary values in components rather than named tokens; those rows are marked *(arbitrary)*.

### 2.1 Chrome
| Token | Hex | Use |
|---|---|---|
| `nav-belt` | `#131921` | Top header belt (logo, deliver-to, search, account, cart), 60 px tall |
| `nav-main` | `#232F3E` | Sub-navigation strip (39 px) and footer body |
| `nav-back` | `#37475A` | "Back to top" band above the footer |
| `nav-bottom` | `#131A22` | Footer bottom band (sub-brands, locale, copyright) |
| `brand-orange` | `#FF9900` | Wordmark accent, membership accents |
| `brand-search` | `#FEBD69` | Search submit button |
| `brand-search-hover` | `#F3A847` | Search submit hover |
| `brand-count` | `#F08804` | Cart item count in the header |
| header hover | `#FFFFFF` 1 px outline *(arbitrary)* | Header items get a 1 px white outline on hover, no fill |

### 2.2 Text
| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| `ink` | `#0F1111` | Body, titles, prices | 18.6:1 |
| `ink-2` | `#565959` | Secondary text, strike-through list price, breadcrumbs | 7.1:1 |
| `ink-3` | `#6F7373` | Tertiary text, meta | 4.8:1 |
| `ink-4` | `#888C8C` | Placeholder, disabled (≥ 18 px only) | 3.4:1 |
| `#999` | *(arbitrary)* | Decorative only (footer copyright), never body text | 2.8:1 |

### 2.3 Links and focus
| Token | Hex | Use |
|---|---|---|
| `link` | `#2162A1` | Default link (review counts, sponsored label). 6.3:1 |
| `link-teal` | `#007185` | Secondary link ("See more"), selected swatch border, focus border. 5.7:1 |
| `link-hover` | `#C7511F` | Link hover, underline appears |
| `link-visited` | `#004B91` | Visited/dark link |
| form focus | `#E77600` border + `rgb(228 121 17 / .5)` 3 px ring *(arbitrary)* | Keyboard focus on inputs (canonical Amazon form-focus orange) |

### 2.4 Actions
| Token | Hex | Hover | Use |
|---|---|---|---|
| `cta-yellow` | `#FFD814` | `cta-yellow-hover` `#F7CA00` | Add to Cart, Sign in, Proceed to checkout, Place your order. Text `ink`, 13.6:1 |
| `cta-orange` | `#FFA41C` | `cta-orange-hover` `#FA8900` | Buy Now. Text `ink`, 9.5:1 |
| secondary | `#FFFFFF` / hover `#F7FAFA`, border `#D5D9D9` *(arbitrary)* | – | Secondary buttons ("Add to List") |

### 2.5 Signals
| Token | Hex | Use |
|---|---|---|
| `star` | `#DE7921` | Rating stars (fill and outline) |
| `plus` | `#00A8E1` | Membership badge (Prime-blue equivalent) |
| `price-deal` | `#C10015` | Savings %, "Limited time deal" text, deal price accent, "Verified Purchase". 6.4:1 |
| `price-legacy` | `#B12704` | Older price red, still used in some rails |
| `badge-deal` | `#CC0C39` | "Limited time deal" filled badge, radius 2 |
| `badge-pick` | `#161D26` | "Overall Pick" filled badge, white text, radius 4 |
| `badge-bestseller` | `#E67A00` | "#1 Best Seller" ribbon |
| `success` | `#0B7B3C` | "In Stock" (18 px), "FREE Returns", delivered. 5.4:1 |
| `success-deep` | `#04705B` | Secondary green (savings on coupons, order-placed banner) |
| `warn` | `#C45500` | "Only 3 left in stock", price-changed notices |
| `error` | `#EB0000` | Form errors, declined payment |

### 2.6 Lines and surfaces
| Token | Hex | Use |
|---|---|---|
| `line` | `#D5D9D9` | Buy box border, dividers (`hr`), secondary button border |
| `line-2` | `#DDDDDD` | Quantity select border, list separators |
| `line-3` | `#CCCCCC` | Results toolbar bottom border |
| `line-soft` | `#E6E6E6` | Table rules, footer column rules |
| `line-card` | `#F5F5F5` | Search result card 1 px border, radius 4 |
| `surface-2` | `#F0F2F2` | Secondary buttons hover, info callouts, grey panels |
| `surface-3` | `#F7FAFA` | Table zebra rows, quiet panels |
| `surface-4` | `#F8F8F8` | Sticky sub-headers, image placeholders |
| `surface-band` | `#EAEDED` | Cart/checkout page background band |
| overlay | `rgb(0 0 0 / 0.5)` *(arbitrary)* | Modal scrim, drawer backdrop |

## 3. Typography

- `--font-sans` = `"Amazon Ember", Arial, "Helvetica Neue", Helvetica, sans-serif`. Amazon Ember when available, falling back to Arial (what amazon.com actually paints for most elements) at zero webfont cost.
- `--font-mono` = `ui-monospace, "SF Mono", Menlo, monospace` for order numbers and tracking ids.

Scale (measured px / line-height), realised with Tailwind arbitrary sizes (`text-[14px]`, `leading-5`, …):

| Role | Size / LH | Weight | Where |
|---|---|---|---|
| xs | 11 / 15 | 400 | "Sponsored" label |
| sm | 12 / 16 | 400 | Footer copyright, review count, breadcrumbs, badge text |
| base | 14 / 20 | 400 | Body, nav links, bullets, facet links, delivery line |
| md | 15 / 21 | 400 | Search input, homepage card links |
| lg | 18 / 24 | 400 | Search-result title (400, not bold), "In Stock", small h2 |
| xl | 20 / 24–28 | 700 | Section h2 ("About this item") |
| 2xl | 24 / 32 | 400 | PDP product title (400, `ink`); homepage h2 (700) |
| 3xl | 28 / 36 | 400 | Cart h1, price whole number |
| 4xl | 32 / 40 | 700 | Checkout page title |
| btn | 13 / 19 | 400 | Text inside primary/secondary buttons |
| price symbol / cents | 13 px superscript beside a 28 px whole | 400 | Currency symbol and cents |

Weights: 400 and 700 only. Bold is semantic: delivery dates, "In Stock", counts, labels. Titles are regular weight. Underline only on link hover and in-copy links.

## 4. Layout, spacing, shape

**Page.** Fluid; content container `max-w-[1200px]` with `px-4` padding on most pages (`max-w-[1000px]` in the footer, `max-w-[820px]` on legal pages). Header = belt 60 px + sub-nav 39 px. Grey ground `surface-band` on cart and checkout; white elsewhere. India is served under `/in`; `storePath(store, path)` prefixes internal links.

**Search results (SRP).** Two columns: link-driven facet rail (~241 px) + results. Toolbar 42 px, white, `line-3` bottom border, holds the result count (left) and Sort dropdown (right). Result card: full-width row; inner container 1 px `line-card` border radius 4, no shadow; image box contained; title 18/24 regular up to 3 lines; rating row (stars 16 px + count link); price block; delivery line with bold date; yellow "Add to cart" pill under the price. Grid mode reuses the same card. Pagination: bordered boxes, selected has 1 px `ink` border.

**Product detail (PDP).** Three columns at desktop: image column (thumb rail + contained main image), centre (brand link, title 24/32, rating row, "bought in past month", price block, variation swatches, "About this item" bullets), right buy box: 1 px `line`, radius 8; price 28 px; delivery lines; "In Stock" 18 px `success`; quantity select; yellow Add to Cart; orange Buy Now; "Ships from / Sold by / Returns" grid. Below the fold: rails, product-information table (zebra `surface-3`), reviews section with histogram bars in `star` and an interactive write-review form (star picker + Helpful + Report, persisted per-viewer in `localStorage`).

**Cart.** Left list (image, title link, "In Stock" green, qty select + Delete, price right-aligned bold); right box: subtotal (X items) + yellow Proceed to checkout. Empty cart: "Your Cart is empty" + sign-in CTA.

**Checkout.** Single column on `surface-band`, minimal header (wordmark + "Secure checkout" + lock; no search/nav), numbered steps stacked; right sticky order-summary box with yellow "Place your order" top and bottom. Card payments hand off to Stripe hosted Checkout; other methods (UPI, COD, …) run the demo order flow. Requires a signed-in account.

**Spacing scale.** Tailwind's default scale plus arbitrary values (no custom spacing tokens); source anatomy: mini 4, small 8, base 12, medium 20, large 24, xl 32; gutter 14; page padding 16–18.

**Radius.** `--radius-card` 4 (cards, selects), `--radius-box` 8 (search box, buy box, modals), `--radius-pill` 100 (all primary buttons). Legacy 2 px on the deal badge (arbitrary).

**Shadows.** Almost none. `--shadow-input` inset `0 1px 2px rgb(15 17 17 / .15)` on inputs/buttons; `--shadow-dropdown` `0 1px 3px rgb(0 0 0 / .2)` on menus. Carousel arrow tiles use an arbitrary soft shadow. Cards never lift on hover.

## 5. Components

| Component | Spec |
|---|---|
| **Header belt** | 60 px `nav-belt`. Left → right: wordmark, "Deliver to ▾ City" with pin icon, search (below), region flag + country, "Hello, sign in / Account & Lists ▾", "Returns / & Orders", cart icon with count in `brand-count`. Items outline 1 px white on hover |
| **Search** | 38 px tall, radius 8. Category select on the left (`surface-2`, `ink-2`, "All ▾"), input 15 px placeholder "Search Amazon", submit `brand-search` with magnifier, right radius 8. GET `/s?k=` so results are shareable |
| **Sub-nav** | 39 px `nav-main`, white 14 px links; "☰ All" opens a 365 px department flyout (white, `ink`, 700 headers, `surface-2` hover). Item set is per store (§13) |
| **Footer** | "Back to top" band `nav-back` 13 px bold; 4 columns of `line-2` links with 700 white headers on `nav-main`; wordmark + locale/region pills; `nav-bottom` sub-brand grid + legal link row + copyright + demo disclaimer. Every link resolves to a real destination via `lib/footer-links.ts` (internal store-prefixed, external opens a new tab); legal links go to `/legal/[slug]` |
| **Product card (SRP/list)** | See §4. States: sponsored, deal (`badge-deal` chip + `price-deal` "-23 %"), Overall Pick (`badge-pick` chip), out of stock (`ink-2`, CTA hidden), variant count |
| **Product card (rail)** | ~200–230 px wide, contained square image, 2-line title link, stars + count, price block, no border |
| **Price** | Symbol 13 px superscript, whole 28 px `ink` 400, cents 13 px superscript; "List: ~~$X~~" `ink-2` strike; savings "-23 %" `price-deal` left of the price on deals. Store-aware (§13) |
| **Stars** | SVG, 5 stars, `star` fill, half via clip; 12/16/18 px; `aria-label="4.6 out of 5 stars"`; count link beside in `link`; histogram rows with `surface-2` track + `star` fill and % on the right |
| **Buttons** | Height 32 (default) / 40 (checkout) / ~29 (dense); pill radius 100; 13 px text (14 in buy box); 1 px border same as fill; hover darkens; focus ring; disabled `surface-2`/`ink-4`. Variants: yellow, orange, secondary white, link-style |
| **Inputs** | ~31 px, 1 px border, radius 3–6, inset shadow, focus border `#E77600` with tinted ring, label 13 px bold above, error 12 px `error` |
| **Select / dropdown** | `surface`→`surface-2` gradient, 1 px `line-2`, radius 4–8, chevron; menu white with `line` border and `surface-2` hover |
| **Buy box** | 1 px `line`, radius 8; order: price → delivery promise (bold date) → "Deliver to" → "In Stock" `success` → quantity → Add to Cart → Buy Now → "Secure transaction" lock → Ships from / Sold by / Returns grid |
| **Delivery promise line** | "FREE delivery **Thursday, September 24**" 14/20, bold date `ink`; store-aware date order (§13) |
| **Badges** | Filled chips 12 px white text, height 22–24; `badge-pick`, `badge-deal`, `badge-bestseller` ribbon, membership pill on `plus` |
| **Facet rail** | ~241 px; group header 14 px bold; links 14/20 (`link-hover` on hover); brand checkboxes; star-filter rows; SSR link-driven so it works without JS |
| **Breadcrumbs** | 12 px `ink-2`, "›" separators, last item current, links hover `link-hover` |
| **Toolbar** | 42 px, result count left, sort select right |
| **Pagination** | Row of 32–40 px boxes, selected 1 px `ink` border; Previous/Next with 8 px outer radius; disabled `ink-4` |
| **Alerts** | Boxed callouts 1 px border radius 8: info (`link-teal` fill `surface-3`), warning (`warn`), error (`error`), success (`success`) |
| **Home hero** | Full-bleed auto-advancing carousel; arrows + dots; pauses on hover |
| **Home cards** | White card over the grey band: heading, image(s), teal see-more link |
| **Home rails** | Titled horizontal product strip with scroll arrows |
| **Deals** | Today's-Deals card: image + quick-add, % off, claimed progress bar, brand-deals link |
| **Review card** | Avatar 32 px + name; stars 16 px + bold title; "Reviewed in … on …" 12 px `ink-2`; "Verified Purchase" `price-deal` bold; body 14/20; "Helpful" pill + "Report" (both interactive) |
| **Order card** | Header band `surface-3` with ORDER PLACED / TOTAL / SHIP TO / ORDER # 12 px uppercase labels; body per item with image, "Buy it again", details |
| **Mobile drawer** | Left slide-in from a dark greeting header; Shop by Department / Programs & Features / Help sections; scroll-locked; Escape closes |

## 6. Screen inventory

**Built (customer web).** Home (hero, category cards, product rails). Search results `/s` (list + facets). PDP `/product/[id]` (bullets, buy panel, reviews). Cart (+ empty). Checkout (address → payment → review) with Stripe hosted Checkout. Order confirmation + Your Orders + order detail (sign-in gated). Sign in. Your Account hub + addresses. Deals, Bestsellers, New Releases. Prime, Prime Video, Amazon Pay, Gift Cards, Registry, Customer Service, Sell, Amazon Business. Legal pages `/legal/[slug]` (Conditions of Use & Sale, Privacy Notice, Interest-Based Ads, Consumer Health Data Privacy Disclosure, Your Ads Privacy Choices). All of the above are store-aware and also served under `/in`.

**Not built (aspirational).** Full account security/payments/lists management, returns/replace flow, tracking, reviews moderation, seller central, admin, quick-commerce and sale-event skins. Auth persistence beyond the demo cookie/Supabase fallback is parked.

## 7. Responsive rules

Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Mobile (375 px): belt keeps `nav-belt` with a hamburger opening the left drawer, wordmark, "Sign in ›" + cart; search drops to a full-width row; PDP becomes one column (brand → stars → title → image → price → promise → buy fields → sticky bottom Add to Cart / Buy Now). Facet rail becomes a Filters sheet. Cart lines stack. Rails become horizontal scroll-snap. Touch targets ≥ 44 px; hover-only affordances (magnifier, header outlines) drop on touch.

## 8. Motion

100 ms colour transitions on buttons/links; ~150–200 ms dropdown/flyout + drawer transitions; ~300 ms carousel translate; deal countdowns tick every second; no parallax or scroll-triggered animation; `prefers-reduced-motion` disables all but colour changes.

## 9. Accessibility

Contrast on white unless noted: `ink` 18.6:1, `ink-2` 7.1:1, `ink-3` 4.8:1, `link` 6.3:1, `link-teal` 5.7:1, `price-deal` 6.4:1, `success` 5.4:1, `ink` on `cta-yellow` 13.6:1, `ink` on `cta-orange` 9.5:1, white on `nav-main` 13.6:1, `brand-count` on `nav-belt` 6.9:1. Restricted: `ink-4` 3.4:1 (≥ 18 px or non-text), `#999` 2.8:1 (decorative only). Stars carry text alternatives; prices read as one number; carousels expose Previous/Next; the header hover outline is mirrored by the focus ring; toggling visibility uses the `hidden` attribute.

## 10. Iconography and imagery

Line icons in [`components/icons`](components/icons/index.tsx): 1.5 px stroke, 24 viewBox, `currentColor`, `aria-hidden` unless an `aria-label` is passed — cart, menu, close, user, chevron, search, pin, lock, check, star (filled for ratings), etc. Product photography on pure white, contained not cropped, self-hosted under `public/products` (and `public/products/in` for the India catalogue). Empty states use flat two-tone treatments.

## 11. Copy and voice

Sentence case for everything except product-supplied titles and the two commit buttons: "Add to Cart", "Buy Now". No exclamation marks. Delivery lines are literal: "FREE delivery Thursday, September 24". Counts are shown, not implied: "1-16 of over 30,000 results", "50+ bought in past month". Errors say what to do: "Enter a valid ZIP code". Demo-only copy (legal pages, checkout note) states plainly that no real order or charge occurs.

## 12. Token → Tailwind mapping

amz-clone uses **Tailwind v4** — there is no `tailwind.config.ts`. All tokens are declared in `app/globals.css` inside `@theme` and become utilities automatically:

- **Colours** (`--color-*`): `nav-belt`, `nav-main`, `nav-back`, `nav-bottom`, `brand-orange`, `brand-search`, `brand-search-hover`, `brand-count`, `ink`, `ink-2`, `ink-3`, `ink-4`, `link`, `link-teal`, `link-hover`, `link-visited`, `cta-yellow`, `cta-yellow-hover`, `cta-orange`, `cta-orange-hover`, `star`, `plus`, `price-deal`, `price-legacy`, `badge-deal`, `badge-pick`, `badge-bestseller`, `success`, `success-deep`, `warn`, `error`, `line`, `line-2`, `line-3`, `line-soft`, `line-card`, `surface-2`, `surface-3`, `surface-4`, `surface-band` → `bg-*`, `text-*`, `border-*`.
- **Type** (`--font-*`): `font-sans` (Amazon Ember → Arial), `font-mono`. The type scale is applied with arbitrary sizes (`text-[14px]`, `leading-5`) rather than named steps.
- **Radius** (`--radius-*`): `rounded-card` (4), `rounded-box` (8), `rounded-pill` (100). Components sometimes use arbitrary radii (`rounded-[6px]`).
- **Shadows** (`--shadow-*`): `shadow-input`, `shadow-dropdown`.
- **Spacing / width / z-index:** no custom tokens — Tailwind's default scale plus arbitrary values (`max-w-[1200px]`, `h-[38px]`, `z-[60]`).

Prefer semantic tokens in components; reach for arbitrary values only for the one-off measurements above, never a raw hex that duplicates a token.

## 13. Regional variants (US vs IN)

The two stores are one design system driven by config, not forked screens. Each difference is a prop on an existing component fed from the marketplace config (`lib/amazon.ts` for US, `lib/marketplace-in.ts` for IN); `proxy.ts` rewrites `/in/*` onto the base routes and stamps `x-amz-country: IN`, and `getMarketplace()` selects the store. Rows marked *(config)* are implemented; rows marked *(not built)* describe the real stores but are out of scope for the demo.

| Surface | amazon.com (US) | amazon.in (IN, `/in`) |
|---|---|---|
| Store identity | `hostname: amazon.com`, USD, membership "Prime" | `hostname: amazon.in`, INR, membership "Prime" |
| Header region slot | Country/region selector (`CountryFlyout`) — US flag + "US ▾" | Same component — IN flag + "IN ▾"; deliver-to shows an Indian city + pincode *(config)* |
| Sub-nav | Today's Deals, Prime Video, Customer Service, Registry, Gift Cards, Sell *(config)* | Mobiles, Prime Video, Today's Deals, Amazon Pay, Bestsellers, Customer Service, New Releases, Prime, Sell — plus the "Prime" flyout CTA. (The old "Fresh" entry was removed as a dead placeholder.) *(config)* |
| Departments | Electronics, Computers, Smart Home, Home & Kitchen, Fashion, Beauty & Personal Care, Books, Toys & Games, Sports & Outdoors, Automotive, Pet Supplies, Grocery | Adds a dedicated **Mobiles** category (amazon.in has a Mobiles nav; amazon.com folds phones into Electronics) *(config)* |
| Price | `$` 13 px superscript, whole 28 px, cents 13 px superscript; "List: ~~$X~~"; 2 fraction digits, `en-US` grouping | `₹` superscript, whole, **no paise**; "M.R.P: ~~₹1,699~~"; 0 fraction digits, Indian digit grouping `₹1,49,999`; "Inclusive of all taxes" note *(config)* |
| Delivery date | `en-US` month-first ("September 24") | `en-IN` day-first ("24 September") *(config)* |
| Checkout payments | Card via Stripe hosted Checkout (USD); demo methods otherwise | Card via Stripe hosted Checkout (INR); UPI, net banking, COD, EMI, Amazon Pay run the demo order flow *(config)* |
| Footer bottom | Locale/region pills incl. currency; US legal set (Conditions of Use, Privacy Notice, Consumer Health Data Privacy Disclosure, Your Ads Privacy Choices) | Region pill without currency; IN legal set (Conditions of Use & Sale, Privacy Notice, Interest-Based Ads); IN sub-brand grid (Prime Now, Amazon Business, IMDb, …) *(config)* |
| Offers / EMI / GST invoice / quick-commerce / sale-event skins | — | Real amazon.in surfaces, **not built** in this demo |

Formatting is centralised so a component never branches on store inline: INR uses `Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })`, USD uses `en-US` with 2 fraction digits; dates use `en-IN` (day-first) vs `en-US` (month-first).
