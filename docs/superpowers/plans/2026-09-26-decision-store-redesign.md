# Decision-store redesign + AI layer — plan (2026-09-26)

Source design: `design-import/Shopping Prototype.dc.html` (moved from ~/Downloads by the user). It replaces the
amazon.com visual language with a warm, calm "decision-support" store: shoppers state priorities, results are
ranked by match %, every card explains *why it's here*, products can be compared with a verdict, saved into
collections with price tracking, and orders are tracked on a timeline. The prototype calls `window.claude.complete`
for AI with rule fallbacks; here that becomes a server-side, provider-agnostic AI layer with Gemini as the provider.

Both stores stay (US at `/`, IN at `/in`), money stays store-aware. The prototype is headphone-only and INR; we
generalise its headphone attributes to per-category attribute sets.

## Design tokens (from the prototype)

| Token | Value | Use |
|---|---|---|
| `bg` | `#F7F6F3` | page ground |
| `surface` | `#FFFFFF` | cards, header |
| `surface-2` | `#F2F0EB` | chips, tag fills, hover |
| `surface-3` | `#FAF9F6` | quiet table band |
| `surface-4` | `#EFECE6` | segmented control track, bar tracks |
| `ink` | `#151515` | text, dark buttons, 1.5px "strong" borders |
| `ink-2` | `#3E3C38` | secondary text |
| `ink-3` | `#5E5C57` | meta / mono kickers |
| `ink-4` | `#6F6C66` | placeholder text |
| `line` | `#E7E4DE` | card border |
| `line-2` | `#EFECE6` | inner dividers |
| `line-3` | `#CFCBC3` | secondary button border, dashed empties |
| `line-4` | `#DAD6CE` | example chips |
| `accent` | `oklch(0.78 0.16 65)` | primary CTA (Add to cart, Search, Place order), count bubble, "Top pick" |
| `accent-hover` | `oklch(0.73 0.16 62)` | |
| `accent-ink` | `oklch(0.52 0.15 55)` | link hover |
| `accent-soft` | `oklch(0.82 0.14 70)` | kicker on dark panels |
| `star` | `oklch(0.62 0.16 60)` | ★ |
| `good` | `oklch(0.48 0.11 150)` | ✓, savings %, | `good-strong` `oklch(0.38 0.1 150)`, `good-bg` `oklch(0.96 0.04 150)`, `good-dot` `oklch(0.6 0.13 150)` |
| `warn` | `oklch(0.52 0.15 35)` | ⚠ trade-offs | `warn-strong` `oklch(0.5 0.15 35)` deal timers, `bad-dot` `oklch(0.58 0.17 30)` |
| fonts | Instrument Sans 400/500/600/700; JetBrains Mono 400/500/600 | mono = kickers, match %, order ids |
| radius | 4 (tags) · 6 (chips) · 8 (images) · 10 (inputs, search) · 12 (cards) · 14 (hero search, big panels) · 16 (tray) · 999 (buttons) | |
| shadows | tray `0 10px 30px rgba(20,20,20,.14)`; toast `0 8px 24px rgba(0,0,0,.2)`; hero search `0 1px 0 #151515` | |
| wordmark | `[ STORE ]` in JetBrains Mono 600, 1.5px dashed ink border | |
| image frame | hatched `repeating-linear-gradient(135deg,#EFEDE8 0 8px,#F7F6F2 8px 16px)`, radius 8, real image `object-contain` on top | |

Layout: container `max-width:1320px`, side padding `clamp(16px,3vw,24px)`; sticky white header with 1px `line`
bottom border; category strip under it; bottom padding ~140px so the compare tray never covers content. Touch
targets ≥ 44px. Buttons are pills: primary = accent fill, dark = ink fill + white, secondary = white + `line-3`
border, dashed = 1.5px dashed ink ("Tune for me…").

## Screens → routes

| Prototype screen | Route | Notes |
|---|---|---|
| Home | `/` | greeting kicker, big search, quiz CTA, example queries, Continue shopping (recently viewed, cookie), Picks (reason chip), Deals for you |
| Search | `/s` | "YOU SEARCHED", title, intent chips, "Refine what matters" presets, priorities panel (budget slider + 0–5 dots per attribute), sort segmented (Best match / Price / Rating), result cards with match %, Top pick, WHY IT'S HERE ✓×3 + ⚠, Best for, Compare toggle, Save. Existing brand/rating/deal facets move under "More filters". Weights/budget/use live in the URL. |
| Compare | `/compare?ids=a,b,c` | verdict panel (dark), header cards, Quick verdict (best for / strengths / trade-offs), What's different rows with best-cell marks, Same on all |
| Product | `/product/[id]` | gallery, match badge, Why people buy it / Things to know, delivery card, Purchase confidence, Add to cart / Buy now, Save / Compare; "What buyers actually think" (rating + histogram, praised/criticized themes, AI summary); Explore reviews with filter chips; Often compared with; Specifications accordion |
| Collections | `/collections` (🔒) | list + selected collection items with price change since saved, Add to cart, Remove, notes, New collection, Compare these |
| Cart | `/cart` | items with qty stepper, Save for later (→ collection), price-drop chips, Save money swap, Complete your setup, sticky summary |
| Checkout | `/checkout` | numbered step cards with Change → option list (address, payment); keeps existing Stripe + demo flows |
| Confirmation | `/orders/[id]?placed=1` | ✓ badge, Arriving card, Track order |
| Tracking | `/orders/[id]` | dark ETA panel + vertical timeline (derived) + order facts |
| Global | — | compare tray (fixed bottom, ≤4, localStorage), quiz dialog, toast |

## AI layer (`lib/ai/`) — Gemini-ready, rules fallback

- `types.ts` — `LlmProvider` contract (written).
- `providers/gemini.ts` — REST `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, `generationConfig.responseMimeType = application/json` when `json`, AbortController timeout. Env: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`).
- `index.ts` — `getProvider(): LlmProvider | null`; `generateJson<T>(req, zodSchema)` (parse first `{…}`, validate, throw on mismatch); `withFallback(aiFn, rulesFn)` → result + `source`.
- `cache.ts` — `ai_cache` table (service role) keyed by sha256(feature + provider + input); TTL per feature.
- Features (`features/*.ts`, each = rules implementation + AI prompt + zod schema, server-only):
  - `parseQuery(market, q, categories)` → `ParsedQuery`
  - `buildProfile(category, answers, budget)` → `PriorityProfile`
  - `summarizeReviews(product, reviews)` → summary/praised/criticized/pros/cons/bestFor (writes `product_insights`, `source:'ai'`)
  - `compareVerdict(category, ranked[], weights)` → `CompareVerdict`
- A mock provider for tests (`providers/mock.ts`) proves the AI path + validation + fallback.

## Backend

Migration `supabase/migrations/20260926090000_decision.sql`:
- `product_insights` (product_id pk → products, scores jsonb, pros text[], cons text[], best_for, summary, praised jsonb, criticized jsonb, source, updated_at) — public read, service-role write.
- `collections` (id uuid, user_id → auth.users, market_id, name, note, position, created_at) + `collection_items` (collection_id, product_id, saved_price_minor, added_at, pk(collection_id, product_id)) — RLS: owner only; max 20 collections/user, 200 items/collection (trigger).
- `ai_cache` (key pk, feature, provider, value jsonb, created_at, expires_at) — no anon/auth access.
- Seed: `product_insights` rows for every product from deterministic rules (`scripts/build-insights.mjs` → `supabase/seed/…` or SQL in seed), so the store works with no key.

Data layer (`lib/data/`): `insights.ts` (get/getMany/upsert), `collections.ts` (list, create, rename/note, delete, addItem, removeItem, isSaved map). Decision logic (`lib/decision/`): `attributes.ts` (per-category config, presets, quiz), `rank.ts` (match, why, warn, rankProducts), `query.ts` (rules parser), `profile.ts` (rules profile), `verdict.ts` (rules verdict), `tracking.ts` (timeline from order), `params.ts` (weights/budget ↔ URL). All pure + unit-tested.

Server actions `app/actions/collections.ts`: `toggleSave(productId, path)`, `createCollection(name)`, `removeFromCollection(collectionId, productId)`, `updateCollectionNote(id, note)`, `moveToSaved(productId)` (cart → "Saved for later"). `app/actions/ai.ts`: `buildProfileAction(category, answers, budgetMinor)`.

API (`app/api/v1`, documented in `docs/API.md`): `GET/POST /collections`, `PATCH/DELETE /collections/:id`, `POST /collections/:id/items`, `DELETE /collections/:id/items/:productId`, `GET /products/:id/insights`, `POST /ai/parse-query`, `POST /ai/profile`, `POST /ai/compare`, `GET /ai/status` ({provider, enabled}).

## Execution (subagents, disjoint file ownership, one shared working tree)

Phase 1 (parallel):
- **A · Backend + AI** — owns `supabase/**`, `lib/data/**`, `lib/db/**`, `lib/ai/**`, `lib/decision/**` (not `types.ts`), `app/actions/collections.ts`, `app/actions/ai.ts`, `app/api/v1/**`, `docs/API.md`, `.env.example`, `test/**`, `scripts/build-insights.mjs`.
- **B · Design foundation** — owns `app/globals.css`, `app/layout.tsx`, `design.md`, `components/primitives/**`, `components/chrome/**`, `components/AppShell.tsx`, `components/lib/**`, `components/icons/**`, new `components/decision/**` (MatchBadge, ProductFrame, CompareProvider + CompareTray + CompareToggle, SaveButton, Toast, PriorityDots, SegmentedControl, Kicker).

Phase 2 (parallel, after 1):
- **C · Home + Search + Compare** — `app/page.tsx`, `app/in/**` home if any, `components/home/**`, `app/s/**`, `components/search/**`, `components/commerce/{FacetRail,Toolbar,Pagination,ProductCard}.tsx`, new `app/compare/**`, `components/quiz/**`.
- **D · Product** — `app/product/**`, `components/product/**`, `components/commerce/{BuyBox,Breadcrumbs}.tsx`.
- **E · Collections + Cart + Checkout + Orders + Account** — `app/collections/**`, `app/cart/**`, `app/checkout/**`, `app/orders/**`, `app/account/**`, `app/signin/**`, `components/cart/**`, `components/checkout/**`, `components/forms/**`.
- **F · Secondary pages** — deals, bestsellers, new-releases, prime, prime-video, gift-cards, registry, sell, business, amazon-pay, customer-service, legal, not-found and their components.

Phase 3: typecheck, unit + db tests, browser pass over every route (desktop + 375px), code review, capture check.

Rules for every agent: read `AGENTS.md` (Next 16 — check `node_modules/next/dist/docs/`), edit only owned files (ask the lead for anything else), no raw hex in components (tokens only), keep both stores working, no commits.
