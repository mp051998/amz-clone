# amz-clone — build plan

A faithful **amazon.com** storefront clone. Judged on speed, product judgement, and UX/UI.
Unofficial demo — not affiliated with Amazon.

## Architecture
- **Single Next.js app** (App Router, React 19, Tailwind v4). Components vendored under `components/`, local types/formatters under `lib/`.
- **Data:** seed + session. Seeded TS catalog; cart, orders, and auth in signed cookies. No DB → the live demo can't break on a connection.
- **Images:** real product photos downloaded from Amazon's CDN, **self-hosted** in `public/products/` (Amazon blocks hotlinking).
- **Deploy:** Vercel (production URL already live).

## Done so far
- Standalone app scaffolded; Amazon design tokens wired (`app/globals.css`); UI kit vendored + rebranded (Amazon wordmark + smile).
- Deployed skeleton to Vercel.
- Recon of live amazon.com (below); 17 real product images pulled as the first catalog slice.

## Recon — amazon.com surfaces to replicate (measured live 2026-09-16)

**Header belt (`#131921`)** — amazon logo + orange smile · "Deliver to {city}" with pin · search = dept dropdown ("All") + input + orange (`#FEBD69`) magnifier button · flag + "EN" · "Hello, sign in / Account & Lists" (hover flyout) · "Returns & Orders" · Cart icon + count (`#F08804`).
**Sub-nav (`#232F3E`)** — ☰ All · Today's Deals · Customer Service · Registry · Gift Cards · Sell · right-side promo.

**Home** — hero carousel (full-bleed colored bg, "{Category} under $50", ‹ › arrows) · grid of **white category cards** over a grey band, each: heading + single image OR 2×2 image grid with labels + teal "See more / Shop X" link · product rails lower down.

**Search results (SRP)** — left **facet rail**: Department, Brands (checkboxes), Customer Reviews (★ & Up), Deals & Discounts · results header "1-16 of over N results" + "Sort by" dropdown · **list rows**: image | title (link) + spec subtitle + badges (Overall Pick / Amazon's Choice / "Top Reviewed for X") + rating (stars + count) + "N bought in past month" + price + colour swatches + "Add to cart". Sponsored tag on some.

**Product page (PDP)** — breadcrumb · left thumbnail strip + main image · center: title, "Visit the {Brand} Store" (teal), rating + count, Amazon's Choice badge, "N bought in past month", **deal badge + price** (`-X%` red, price, unit price, "List Price" struck), colour/variant tiles, "About this item" bullets + accordions · right **buy box**: delivery date (green) + "Order within {countdown}", **In Stock** (green), Quantity, **Add to cart** (yellow `#FFD814`), **Buy Now** (orange `#FFA41C`), **Ships from / Sold by {seller}**, Returns, Add to List.

**Today's Deals** — promo banner · filter chips (Lightning deals, New Arrivals, …) · **deal cards**: image + circular "+" add, red "**X% off**" + "Limited time deal" badge, title, price + "List/Typical" struck, rating, "**N% claimed**" progress bar, "Shop {brand} deals".

**Seller** — "Ships from Amazon / Sold by {seller}" in the buy box; "Visit the {Brand} Store" brand link on PDP/SRP.

## Build phases
- **B1 — Catalog.** ~100 products across ~12 categories (Electronics, Computers, Home & Kitchen, Fashion, Beauty, Books, Toys, Sports, Automotive, Pet, Grocery, Smart Home). Each: id, title, brand, category, priceMinor, listMinor, rating, reviewCount, images[], bullets[], seller, badges, boughtPastMonth. Real images self-hosted; data authored to read real. → `lib/catalog.ts`.
- **B2 — AppShell + Home.** Amazon header (logo, deliver-to, search, account flyout, cart), sub-nav, hero carousel, category-card grid, product rails, footer (+ "unofficial demo" disclaimer).
- **B3 — SRP `/s`.** Facet rail + sort toolbar + result rows + pagination, driven by catalog + query/filter.
- **B4 — PDP `/product/[id]`.** Gallery, title, buy box, seller, About, similar items.
- **B5 — Cart + Checkout + Orders.** Session-backed; address form; fake payment; order confirmation; orders list.
- **B6 — Auth.** Sign in / create account (cookie session), account menu state.
- **B7 — Deals `/deals`.** Deal-card grid with badges + "% claimed".
- **B8 — Polish.** Responsive, micro-interactions, empty/loading states, final deploy + incognito check.

## Cut (out of scope for the demo)
Real payments, real DB/accounts, seller onboarding, marketplace/2-store, writing reviews, returns processing, Prime Video, recommendation ML.
