# Store — Design System (decision-support storefront)

Provenance: this system is derived from the design source `design-import/Shopping Prototype.dc.html` (header, category strip, home, search, compare, product, collections, cart, checkout, confirmation and tracking screens, plus the compare tray, quiz dialog and toast). Token values below are the ones implemented in [`app/globals.css`](app/globals.css) under Tailwind v4 `@theme` (§14). Component code cites this document by section, e.g. `design.md §5 Compare tray`. The plan that drives the rebuild is `docs/superpowers/plans/2026-09-26-decision-store-redesign.md`.

Legal: this is an **unofficial demo/portfolio store**. It is not affiliated with, endorsed by, or connected to Amazon.com, Inc. or any other retailer; there are no real orders, payments or deliveries. Every page carries the demo disclaimer in the footer. Do not present it as a real store. Both storefronts stay: US at `/`, India under the `/in` path prefix.

## 1. Principles

1. **Decision support, not a catalogue.** The shopper says what matters (priorities, budget, use); the store ranks by *match* and gets out of the way. Every listing answers "which one should I buy?", not "here are 2,481 results".
2. **Explain every recommendation.** No ranked card, pick or verdict appears without its reasons: a match %, up to three ✓ strengths and one ⚠ trade-off, and a "Best for". If we can't explain it, we don't rank it.
3. **Calm, warm neutrals.** Warm off-white ground, white cards, hairline warm-grey lines, near-black ink. No gradients, no decorative shadows, no badges competing for attention.
4. **One accent = commit.** The amber accent is reserved for the action that moves the purchase forward (Search, Add to cart, Place order, Compare N →), the cart count, and "Top pick". Everything else is ink on neutral. Dark ink fills are the strong secondary (Buy now, selected chips).
5. **Honest trade-offs.** Warnings are first-class content, not fine print. Savings are shown in green only when they're real (struck list price present).
6. **Transparent machinery.** AI-generated content is labelled, sourced, and always has a rules fallback (§9).

## 2. Colour

Semantic tokens only; components never write raw hex/oklch. Tailwind utilities: `bg-bg`, `bg-surface`, `text-ink-3`, `border-line`, `bg-accent`, `text-good`, …

### 2.1 Ground and surfaces
| Token | Value | Use |
|---|---|---|
| `bg` | `#F7F6F3` | Page ground, dialog ground |
| `surface` | `#FFFFFF` | Cards, header, footer, inputs |
| `surface-2` | `#F2F0EB` | Chips, tag fills, match badge, hover fill, tray items |
| `surface-3` | `#FAF9F6` | Quiet table band ("What's different?") |
| `surface-4` | `#EFECE6` | Segmented-control track, bar tracks, disabled button |
| `hatch-a` / `hatch-b` | `#EFEDE8` / `#F7F6F2` | Image-frame hatch stripes |
| `scrim` | `rgb(21 21 21 / .45)` | Dialog backdrop |

### 2.2 Ink
| Token | Value | Use |
|---|---|---|
| `ink` | `#151515` | Text, dark buttons, selected chips, 1.5px strong borders (search, tray, dashed) |
| `ink-2` | `#3E3C38` | Secondary text, meta lines |
| `ink-3` | `#5E5C57` | Kickers, labels, struck prices |
| `ink-4` | `#6F6C66` | Placeholders, image-frame labels |
| `ink-raised` | `#3A3936` | Hover on ink fills; × inside a selected chip |

### 2.3 Lines
| Token | Value | Use |
|---|---|---|
| `line` | `#E7E4DE` | Card border, header bottom border, cart pill |
| `line-2` | `#EFECE6` | Inner dividers (card sections, table cells, category strip top) |
| `line-3` | `#CFCBC3` | Secondary-button border, input border, dashed empties |
| `line-4` | `#DAD6CE` | Example-query chips |

### 2.4 Accent (one colour = commit)
| Token | Value | Use |
|---|---|---|
| `accent` | `oklch(0.78 0.16 65)` | Primary CTA fill, cart count bubble, Top pick / Best match, deal "N% off" tag |
| `accent-hover` | `oklch(0.73 0.16 62)` | Hover on accent fills |
| `accent-ink` | `oklch(0.52 0.15 55)` | Link hover colour |
| `accent-soft` | `oklch(0.82 0.14 70)` | Kicker on dark panels ("OUR VERDICT") |

Text on `accent` is always `ink` (never white).

### 2.5 Signals
| Token | Value | Use |
|---|---|---|
| `star` | `oklch(0.62 0.16 60)` | ★ |
| `good` | `oklch(0.48 0.11 150)` | ✓ marks, "N% off", price drops |
| `good-strong` | `oklch(0.38 0.1 150)` | Text on `good-bg` ("✓ Added to cart", "High" confidence) |
| `good-bg` | `oklch(0.96 0.04 150)` | Success fills |
| `good-dot` | `oklch(0.6 0.13 150)` | Timeline "done" dot, status dots |
| `warn` | `oklch(0.52 0.15 35)` | ⚠ trade-offs |
| `warn-strong` | `oklch(0.5 0.15 35)` | Deal timers ("Ends in 3h"), warning text on `warn-bg` |
| `warn-bg` | `oklch(0.96 0.03 45)` | Warning alert fill |
| `bad` | `oklch(0.5 0.17 28)` | Form errors, destructive text |
| `bad-dot` | `oklch(0.58 0.17 30)` | Negative status dot |
| `bad-bg` | `oklch(0.96 0.03 28)` | Error alert fill |

`warn-bg`, `bad`, `bad-bg`, `ink-raised`, `hatch-*`, `scrim` are additions to the prototype palette needed for forms/alerts; they are tuned to sit in the same warm family.

## 3. Typography

Fonts load through `next/font/google` in `app/layout.tsx` and are exposed as `--font-sans` / `--font-mono`.

- **Instrument Sans** 400/500/600/700 — everything.
- **JetBrains Mono** 400/500/600 — kickers, match %, order ids, the wordmark, source tags. Mono means "system talking": labels and machine-derived facts.

Body: 15px / 1.45, antialiased, `ink` on `bg`.

| Role | Size / weight / tracking | Example |
|---|---|---|
| Display | clamp(30px, 4.4vw, 44px) / 600 / −0.02em, lh 1.08 | "What are you looking for?" |
| Page title | clamp(26px, 3.2vw, 32px) / 600 / −0.01em | Search headline, "Compare products" |
| Section title | 22–24px / 600 | "Continue shopping", "What buyers actually think" |
| Card title | 17–18px / 600, lh 1.2 | Product name on cards |
| Sub-section | 16–17px / 600 | "Refine what matters", "Why people buy it" |
| Body | 15px / 400 | Paragraphs, list lines on PDP |
| Small | 14px / 400–500 | Card meta, ✓/⚠ lines, buttons |
| Meta | 13px | Hints, "Clear", legal |
| Kicker | 12px mono / 500 / uppercase / 0.04em, `ink-3` | "YOU SEARCHED", "WHY IT'S HERE" |
| Micro mono | 11px mono | Image-frame label, source tag |
| Price | 18–22px (cards), 32px (PDP) / 700 / −0.01em | `₹8,999` |

Prices, counts and ids use `tabular-nums`.

## 4. Shape and elevation

| Radius token | px | Use |
|---|---|---|
| `rounded-tag` | 4 | Small tags ("PLUS"), compare checkbox square |
| `rounded-chip` | 6 | Match badge, Top pick, reason chip, category-strip hover pill |
| `rounded-image` | 8 | Image frames, thumbnails |
| `rounded-input` | 10 | Inputs, header search, toast, tray items, alerts |
| `rounded-card` | 12 | Cards, panels, dropdowns |
| `rounded-panel` | 14 | Hero search, big panels (verdict, compare table, PDP gallery) |
| `rounded-tray` | 16 | Compare tray, desktop dialogs |
| `rounded-pill` | 999 | All buttons, chips, segmented control |

| Shadow token | Value | Use |
|---|---|---|
| `shadow-tray` | `0 10px 30px rgb(20 20 20 / .14)` | Compare tray |
| `shadow-toast` | `0 8px 24px rgb(0 0 0 / .2)` | Toast |
| `shadow-hero` | `0 1px 0 #151515` | Home hero search (a hard 1px "lip") |
| `shadow-pop` | `0 8px 24px rgb(20 20 20 / .12)` | Menus / popovers |

Borders do the structural work: 1px `line` for containment, 1.5px `ink` for "this is the thing to use" (search, tray, dashed CTA).

## 5. Components

Implemented in `components/primitives/**`, `components/chrome/**`, `components/decision/**`.

### Buttons
`<Button variant size block loading>`; `buttonClasses({variant,size,block})` styles links.
- `primary` — accent fill, ink text; the commit action. **One per view region.**
- `dark` — ink fill, white text (Buy now, "Not sure what you need?").
- `secondary` — white, 1px `line-3`, hover border `ink` (Save, Compare, Edit priorities).
- `dashed` — white, 1.5px dashed `ink` ("Tune for me…").
- `link` — underlined text.
- Sizes: `sm` 36px, `md` 44px (default, touch target), `lg` 48px (page CTA). All pills, weight 600.

### Chips
`<Pill selected href|onClick size tone removeHref|onRemove>`. Unselected: white + `line-3` (or `line-4` for example queries), hover border `ink`. Selected: `ink` fill, white text. Removable intent chips ("We understood: Headphones ×") show a 22px round × (on `ink-raised` when selected); only the × is interactive. `Chip`/`Badge tone="neutral"` is the static reason chip (surface-2, radius 6).

### Badges
`<Badge tone>`: `accent` | `neutral` | `dark` | `good` | `warn`. 12px/700, radius 6.

### Match badge
`<MatchBadge match={92}/>` → "92% match", mono 12/600 on `surface-2`, radius 6. Shown top-left of ranked cards, on PDP under the rating, in compare headers. Accessible label: "92% match for your priorities". `<TopPickBadge>` (accent) sits top-right of the #1 card; on compare it reads "Best match".

### Kicker
`<Kicker tone>` — 12px mono uppercase `ink-3`; `tone="onDark"` uses `accent-soft` on ink panels.

### Why it's here
`<CheckList good={why} warn={warn}/>` under a `WHY IT'S HERE` kicker, separated from the card body by a `line-2` rule. Max three ✓ (green `good`) then at most one ⚠ (`warn`). Then "**Best for:** …". Same component renders "Why people buy it" / "Things to know" on PDP (`size="md"`) and Strengths / Trade-offs on compare.

### ProductFrame
`<ProductFrame src alt aspect="4/3" radius="image|panel" label/>` — hatched frame (`hatch` utility: 135° stripes `hatch-a`/`hatch-b`, 8px) with the real image `object-contain` on top (multiply blend so white product shots sit on the hatch). No image → mono 11px label ("product shot"). PDP hero uses `aspect="1/1" radius="panel"` with a `line` border.

### Price
`<Price minor currency listMinor listLabel showSavings size/>` — bold whole price (formatMoney: `$1,299.00`, `₹1,29,999`), struck list/M.R.P. in `ink-3`, green "N% off" when a real saving exists. One accessible label: "₹8,999, was ₹12,999, 31% off".

### Stars
`<Stars rating count href size showValue/>` — `★★★★★` in `star` over `line-3`, clipped for partial ratings; `role="img"` label "4.4 out of 5 stars".

### Inputs
44px, radius 10, 1px `line-3`, white; hover `ink-3`, focus border `ink` + 2px ink outline. Label 14/600 above; hint 13 `ink-3`; error 13 `bad` with ⚠ and `aria-describedby`. `Select` and `Checkbox` (18px, ink `accent-color`, label is a 44px hit area) follow suit. Shared classes: `fieldClass`, `selectClass` in `components/lib/controls.ts`.

### Alerts
`<Alert tone="info|success|warning|error">` — soft tone fill, radius 10, leading mark (ⓘ ✓ ⚠).

### Header
Sticky, white, 1px `line` bottom border, z 50.
- **Desktop (md+)**: `[ STORE ]` wordmark link → "Deliver to / <city>" (opens *Choose your location*) → bordered search (1.5px ink, radius 10, accent **Search**) → store switch (lg+) → "Hello, <name> / Account & Collections" (→ `/collections`, or `/signin` signed out; hover menu: Collections, Orders, Account, Addresses, Sign out) → **Orders** → **Cart** pill (1px `line`, hover `ink`, accent count bubble).
- **Mobile**: row 1 wordmark · spacer · Saved · Orders · Cart (all ≥44px); row 2 full-width search ("Search or describe what you need", 16px to prevent iOS zoom); row 3 "Deliver to **Name · City**".
- Search is `GET <store>/s?k=` (store-prefixed). No department select.

### Wordmark
`[ STORE ]` — JetBrains Mono 600, 13px, 0.08em tracking, 1.5px dashed `ink` border, transparent. It is a mark, not a logo: never recoloured.

### Category strip
Under the header, 1px `line-2` top border. Program links (Today's Deals, New & Trending, Bestsellers) then catalog departments (`/s?dept=`). 14px `ink-2`, 40px tall, radius-6 hover pill on `surface-2`. Scrolls horizontally with the bar hidden.

### Store switch
US ⇄ India via the `/in` prefix. Header: compact mono `US ▾` menu (lg+). Footer: two pills (selected = ink). Prices, dates, address schema follow the store (§13).

### Footer
White, 1px `line` top border. Mark + one-line promise, four link columns (Shop, Your things, Help, Work with us; mono kicker headings), then store pills + legal links, then the demo disclaimer on `bg`. No dark bands, no sub-brand grid.

### Priorities panel
White card (radius 12, padding 18). Header "Your priorities" + Reset. Either a "TUNED FROM YOUR ANSWERS" summary block (`surface-2`, "See why") or a dashed "Not sure? Answer 5 quick questions" prompt. Budget: label row + range slider (`accent-color: ink`). "What matters most?": per attribute, label + level text ("Very important") and `<PriorityDots value onChange label/>` — five 16px circles, 1.5px ink border, filled ink up to the value, each in a 32×36 hit area; clicking the current value clears to 0. Footnote: results re-rank instantly; other filters live under "More filters". On mobile it collapses behind a full-width "Your priorities · <preset> ▾" button (48px).

### Segmented control
`<SegmentedControl options value onChange|href ariaLabel/>` — `surface-4` pill track, 3px padding, selected segment white with a hairline shadow. Options can be links (URL state) or buttons.

### Compare toggle, tray
- `<CompareToggle item={{id,name,image}}/>` — secondary pill with an 18px square (radius 4, 1.5px ink); checked = ink fill + white ✓, label flips "Compare" → "Comparing". `role="checkbox"`.
- `<CompareTray/>` (mounted once by AppShell) — fixed bottom-centre, `min(960px, 100% − 24px)`, white, 1.5px ink border, radius 16, `shadow-tray`. "Compare N products" · scrollable item chips (26px hatched thumb, name, ×) · Clear · **Compare N →** (accent, links to `/compare?ids=a,b`) or a disabled-looking "Add 1 more" (`surface-4`) that toasts. Max 4; overflow toasts "You can compare up to 4 products". Persisted per market in `localStorage` `compare:v1:US|IN`. An in-flow spacer keeps page ends visible above it.

### Save
`<SaveButton productId saved/>` — secondary pill "♡ Save" / "♥ Saved", optimistic. Calls `toggleSave`; signed-out → `/signin?next=<here>`. Toast: "Saved to Things I'm Considering · price tracking on" / "Removed from collections".

### Toast
`useToast().toast(text)` — bottom-centred ink pill (radius 10, 14px white, `shadow-toast`), 2.6s, one at a time, `role="status"`. Sits at 24px from the bottom; lifts to 96px (desktop) / 150px (mobile) while the compare tray is showing.

### Quiz dialog
"Tune my priorities": scrim backdrop; panel on `bg`, `min(640px, 100%)`, radius 16 (desktop, centred) or 18px top corners (mobile bottom sheet), padding 24. Mono kicker ("QUESTION 2 OF 5") + round 40px close; 5 progress bars (4px, ink done / `surface-4` todo). Step: title (22–26px/600), sub, option grid (`minmax(180px,1fr)`, 56px tall option cards, radius 12, 1.5px border; selected = ink fill). Free-text step: textarea. Footer: "← Back" link + accent Next. Loading step: "Working out what matters to you…" with ✓ echo lines. Result: "Your priorities" summary, rows of label + reason + static `PriorityDots size="sm"`, optional ⚠ "Watch out for", `SourceTag`, "Change answers" + accent Apply.

### Verdict panel (compare)
Ink panel, radius 14, padding 18/20: `OUR VERDICT` kicker (`accent-soft`) + one-sentence verdict (18px/600 white) + accent "Choose <winner> →". Below: compare table in a white radius-14 card — header cells (frame, name, price, rating, match), Quick verdict row (BEST FOR / STRENGTHS / TRADE-OFFS), "What's different?" band on `surface-3`, attribute rows with the best cell bold + a mono `good-strong` mark, "Same on all:" footer. Winner column tinted `surface-3`.

### Timeline (tracking)
Ink ETA panel (kicker + big date + status) then a vertical list: 12px dots (`good-dot` done, ink ring current, `line-3` upcoming) joined by a 2px line (`good-dot` up to current, `line-2` after), label 15/600 + mono time. Order facts in a white card of key/value rows.

### Empty state
`<EmptyState title action>` — white, 1px dashed `line-3`, radius 12, padding 28. Always offers the next step ("Widen budget to ₹12,000", "Browse headphones").

## 6. Layout

- Container: `max-w-page` (1320px), side padding `clamp(16px, 3vw, 24px)`, centred.
- Page top padding 22–40px; section gap 44–56px (home), 22px (search/compare).
- Grids: cards `repeat(auto-fill, minmax(250–260px, 1fr))`, gap 14. Search: priorities aside `flex 1 1 270px` sticky + results `flex 999 1 560px`.
- The compare tray is fixed; AppShell renders a spacer so it never covers content.
- Global chrome (AppShell): skip link → Header (+ category strip) → `<main id="main">` → Footer → CompareTray, inside `ToastProvider` + `CompareProvider`.

## 7. States

- **Hover**: bordered things darken their border to `ink`; filled accent → `accent-hover`; ink → `ink-raised`; text links → `accent-ink`.
- **Selected**: ink fill + white text (chips, quiz options, compare checkbox). Never accent.
- **Disabled**: `surface-4` fill, `ink-4` text, no border; still focusable when it explains itself (tray "Add 1 more" toasts why).
- **Loading**: button spinner in current colour + `aria-busy`; skeletons use the hatch.
- **Empty**: dashed card with a next step (§5 Empty state).
- **Error**: inline `bad` text with ⚠ under the field; page-level `Alert tone="error"`.
- **Success**: `good-bg` strip with `good-strong` text ("✓ Added to cart · View cart →") or a toast.
- **Price moved**: "↓ ₹800 since you saved" in `good`; increases in `warn`.

## 8. Responsive

- Breakpoint `md` (768px) switches the header between mobile stack and desktop row; `lg` adds the store switch.
- Horizontal scrollers (category strip, refine chips, continue shopping, tray items) scroll rather than wrap.
- Priorities collapse behind a toggle on mobile; quiz becomes a bottom sheet; the tray wraps to two rows (toast lifts to 150px).
- Mobile search inputs are 16px to prevent iOS zoom. No horizontal page scroll at 375px.

## 9. AI transparency

- Anything generated by a model is labelled with a mono `SourceTag`: **AI SUMMARY · FROM 12,482 REVIEWS**, **AI VERDICT**, **TUNED BY AI FROM YOUR ANSWERS**.
- Rules-derived content is labelled too ("BASED ON RATINGS & SPECS", "TUNED FROM YOUR ANSWERS") — the shopper can always tell which is which (`source: 'ai' | 'rules'` on every contract).
- Show the source of every claim: review counts for summaries, the weights used for a ranking ("Ranked using your priorities: battery ●●●●●, sound ●●●●○"), and a "See why" path for tuned priorities.
- AI never blocks the page: every feature has a deterministic rules fallback, rendered with the same components; if the provider is off or slow, the rules result ships and is labelled as such.
- AI output is advisory: it never changes price, stock, delivery or order data, and never invents specs — strengths/trade-offs cite catalog attributes or review themes.

## 10. Accessibility

- Touch targets ≥ 44px (buttons `md`, toggles, header links, dots' hit areas 32×36 in a dense panel with 44px rows).
- Focus: global 2px `ink` outline, 2px offset, on every interactive element (`:focus-visible`); accent fills keep the ink ring. Search forms show the ring on the whole field (`focus-within`).
- Colour is never the only signal: ✓/⚠ glyphs + sr-only "Strength:" / "Trade-off:", selected chips also set `aria-pressed`/`aria-current`, compare toggle is `role="checkbox"` with `aria-checked`.
- Labels: icon-only or glyph buttons have `aria-label` ("Remove Sony WH-1000XM5 from compare", "Set Battery life to 4 of 5"); price and stars expose one sentence each; the toast region is `role="status" aria-live="polite"`; dialogs are `role="dialog" aria-modal` with Escape to close.
- Contrast: body text `ink`/`ink-2` on `bg`/`surface` ≥ 7:1; `ink-3` for meta ≥ 4.5:1; text on accent is always `ink`.
- Skip link to `#main`; `prefers-reduced-motion` disables transitions.

## 11. Motion

Minimal: 100–150ms colour/position transitions on hover and the toast lift. No carousels auto-advance, no parallax, no bouncing.

## 12. Copy and voice

Second person, plain, specific: "Nothing fits under ₹8,000", "Add one more product to compare", "Saved to Things I'm Considering · price tracking on". Kickers are terse uppercase facts. Trade-offs are stated plainly ("Bulky case", "No multipoint"). Never hype; never fake urgency beyond real deal timers.

## 13. Regional variants (US vs IN)

| | US (`/`) | India (`/in`) |
|---|---|---|
| Currency | USD, `$1,299.00` | INR, whole rupees, Indian grouping `₹1,29,999` |
| List price label | "List" | "M.R.P." (`store.pricing.listLabel`) |
| Dates | "September 24" | "24 September" (`DateText`) |
| Postcode | ZIP Code | Pincode |
| Deliver-to default | "Update location" | "Bengaluru 560001" |

Every navigational href goes through `storePath(store, path)` (server) or `storeHref(market, path)` (client, `components/lib/store.ts`). Compare state is per market.

## 14. Token → Tailwind mapping

`@theme` in `app/globals.css` defines `--color-*`, `--radius-*`, `--shadow-*`, `--container-page`; fonts are in `@theme inline` pointing at the next/font variables. Utilities follow Tailwind v4 naming: `bg-surface-2`, `text-ink-3`, `border-line-3`, `rounded-card`, `shadow-tray`, `max-w-page`, `font-mono`. Custom utilities: `hatch` (image-frame stripes), `no-scrollbar`.

