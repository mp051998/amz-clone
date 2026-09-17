# Storefront Chrome and Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared storefront chrome and US/India homepages read as intentional, marketplace-specific Amazon-style shopping surfaces while preserving existing routes and concurrent work.

**Architecture:** Keep `AppShell` as the site-chrome boundary, with its copy and route labels derived from `PublicMarketplace`. Move home merchandising composition into a typed module so `app/page.tsx` only resolves the store and renders configured modules. Build campaign visuals from local/generated art and existing local catalog photos; no live Amazon assets are embedded.

**Tech Stack:** Next.js 16.3, React 19, TypeScript 5.9, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-09-17-storefront-fidelity-design.md`

## Global Constraints

- Preserve existing catalog, navigation, auth, cart, and checkout route contracts.
- Do not stage or edit a file currently modified by the parallel Claude session without first confirming its commit or coordinating the overlap.
- Keep the existing non-affiliation disclosure and do not imply Amazon affiliation.
- Use self-hosted catalog images and original/generated campaign art only; do not hotlink Amazon campaign artwork.
- Maintain keyboard access, visible focus states, labelled controls, and touch equivalents for hover interactions.
- Verify with `npm run typecheck` and `npm run build` before each task commit.

---

## File Structure

- `lib/contracts.ts` — extend the marketplace UI projection with typed nav and home merchandising configuration.
- `lib/amazon.ts`, `lib/marketplace-in.ts` — own the US/India labels, right-side nav promotion copy, delivery placeholder copy, and module ordering.
- `components/chrome/HeaderBelt.tsx` — renders configured header affordances without hard-coded city or marketplace conditionals.
- `components/chrome/SubNav.tsx` — renders the configured nav sequence and optional desktop promotion.
- `components/chrome/Footer.tsx` — preserves compact footer hierarchy and legal disclosure.
- `components/home/CampaignHero.tsx` — image-led, keyboard-controllable campaign hero with original local art.
- `components/home/MerchandisingCard.tsx` — reusable four-up/single-image editorial card with required image alt text.
- `components/home/DealRail.tsx` — dense deal carousel with deal badge, price, and accessible scroll controls.
- `lib/home-content.ts` — typed US/India home composition data mapped to local catalog product IDs and generated artwork paths.
- `app/page.tsx` — server composition of configured home modules only.
- `public/campaigns/*.svg` — original campaign artwork used by `CampaignHero`; no Amazon-owned campaign asset is copied.
- `app/globals.css` — shared tokens and focus/overflow safeguards only.

### Task 1: Guard concurrent work and introduce home configuration types

**Files:**
- Modify: `lib/contracts.ts`
- Modify: `lib/amazon.ts`
- Modify: `lib/marketplace-in.ts`
- Test: `lib/marketplace.test.ts`

**Interfaces:**
- Produces `HomeModule`, `HomeCampaign`, and `MarketplaceUi` types used by Tasks 2–5.
- Produces `marketplace.ui.home: readonly HomeModule[]` and `marketplace.ui.navPromotion?: { label: string; href: string }`.

- [ ] **Step 1: Write the failing marketplace configuration test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';

test('marketplaces provide distinct home and navigation configurations', () => {
  assert.notDeepEqual(amazon.ui.home, amazonIn.ui.home);
  assert.equal(amazon.ui.home[0].kind, 'campaign');
  assert.equal(amazonIn.ui.home[0].kind, 'campaign');
  assert.ok(amazonIn.nav.subnav.includes('Fresh'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/marketplace.test.ts`

Expected: FAIL because Node cannot execute the TypeScript source or `ui` is absent. If Node cannot execute `.ts`, record that limitation in the test file's header and use `npm run typecheck` as the executable contract until a project-supported TS runner is introduced.

- [ ] **Step 3: Add minimal typed configuration**

```ts
export type HomeModule =
  | { kind: 'campaign'; id: string; campaign: HomeCampaign }
  | { kind: 'merchandising-grid'; id: string; cardIds: readonly string[] }
  | { kind: 'deal-rail'; id: string; title: string; productIds: readonly string[] };

export interface MarketplaceUi {
  navPromotion?: { label: string; href: string };
  home: readonly HomeModule[];
}
```

Add `ui` to `PublicMarketplace`, then define different ordered module lists for `amazon` and `amazonIn`. Keep the existing public routes as each `href`.

- [ ] **Step 4: Verify the configuration compiles**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit only the configuration task**

```bash
git add lib/contracts.ts lib/amazon.ts lib/marketplace-in.ts lib/marketplace.test.ts
git commit -m "feat: configure marketplace merchandising"
```

### Task 2: Build an accessible image-led campaign hero

**Files:**
- Create: `components/home/CampaignHero.tsx`
- Create: `public/campaigns/us-deals.svg`
- Create: `public/campaigns/in-festival.svg`
- Modify: `app/globals.css`
- Test: `components/home/CampaignHero.test.tsx`

**Interfaces:**
- Consumes `HomeCampaign` from Task 1.
- Produces `CampaignHero({ campaign }: { campaign: HomeCampaign }): JSX.Element` used by Task 5.

- [ ] **Step 1: Write the failing component test**

```tsx
import { render, screen } from '@testing-library/react';
import { CampaignHero } from './CampaignHero';

it('renders a labelled campaign image and destination link', () => {
  render(<CampaignHero campaign={{ id: 'us-deals', title: 'Deals for every day', href: '/deals', image: '/campaigns/us-deals.svg', alt: 'Colorful boxes for a daily deals campaign' }} />);
  expect(screen.getByRole('link', { name: /deals for every day/i })).toHaveAttribute('href', '/deals');
  expect(screen.getByRole('img', { name: /colorful boxes/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CampaignHero.test.tsx`

Expected: FAIL because the project does not yet provide an `npm test` script or the component does not exist. Add Vitest plus Testing Library only if Task 1 confirms no existing test runner; otherwise use the existing runner.

- [ ] **Step 3: Implement the smallest accessible hero**

```tsx
export function CampaignHero({ campaign }: { campaign: HomeCampaign }) {
  return <section aria-label={campaign.title}><a href={campaign.href}><img src={campaign.image} alt={campaign.alt} /><span>{campaign.title}</span><span>{campaign.cta}</span></a></section>;
}
```

Add original SVG artwork with `role="img"`-compatible visual content and style the full-bleed campaign via semantic classes. Include visible previous/next controls only when the implementation accepts more than one campaign.

- [ ] **Step 4: Run component and build verification**

Run: `npm test -- CampaignHero.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the hero task**

```bash
git add components/home/CampaignHero.tsx components/home/CampaignHero.test.tsx public/campaigns app/globals.css package.json package-lock.json
git commit -m "feat: add marketplace campaign hero"
```

### Task 3: Add reusable merchandising cards and dense deal rail

**Files:**
- Create: `components/home/MerchandisingCard.tsx`
- Create: `components/home/DealRail.tsx`
- Modify: `components/home/CategoryCard.tsx`
- Modify: `components/home/ProductRail.tsx`
- Test: `components/home/MerchandisingCard.test.tsx`
- Test: `components/home/DealRail.test.tsx`

**Interfaces:**
- Consumes module content from `lib/home-content.ts` in Task 4 and `Product` from `lib/catalog.ts`.
- Produces `MerchandisingCard({ card }: { card: MerchandisingCardData })` and `DealRail({ title, products, store }: DealRailProps)` for Task 5.

- [ ] **Step 1: Write failing tests for meaningful media labels and carousel buttons**

```tsx
expect(screen.getByRole('img', { name: /wireless headphones/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /scroll right/i })).toBeEnabled();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- MerchandisingCard.test.tsx DealRail.test.tsx`

Expected: FAIL because the components are not yet implemented.

- [ ] **Step 3: Implement focused presentation components**

```tsx
export interface MerchandisingCardData { id: string; title: string; cta: string; href: string; items: readonly { image: string; alt: string; href: string; label?: string }[]; }

export function MerchandisingCard({ card }: { card: MerchandisingCardData }) {
  return <section><h2>{card.title}</h2>{card.items.map((item) => <a href={item.href} key={item.href}><img src={item.image} alt={item.alt} />{item.label && <span>{item.label}</span>}</a>)}<a href={card.href}>{card.cta}</a></section>;
}
```

Make `DealRail` use the same local `Product` price conversion as `ProductRail`, include the existing deal badges, and give its previous/next buttons `aria-label`s. Retain horizontal touch scrolling.

- [ ] **Step 4: Verify cards and rails**

Run: `npm test -- MerchandisingCard.test.tsx DealRail.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the component task**

```bash
git add components/home/MerchandisingCard.tsx components/home/DealRail.tsx components/home/CategoryCard.tsx components/home/ProductRail.tsx components/home/*.test.tsx
git commit -m "feat: add storefront merchandising modules"
```

### Task 4: Compose US and India home content from typed data

**Files:**
- Create: `lib/home-content.ts`
- Modify: `app/page.tsx`
- Test: `lib/home-content.test.ts`

**Interfaces:**
- Consumes `HomeModule` from Task 1 and components from Tasks 2–3.
- Produces `getHomeContent(store: PublicMarketplace): HomeContent` with `{ campaign, cards, rails, showPay }` for `app/page.tsx`.

- [ ] **Step 1: Write a failing content test**

```ts
assert.equal(getHomeContent(amazon).campaign.id, 'us-deals');
assert.equal(getHomeContent(amazonIn).campaign.id, 'in-festival');
assert.equal(getHomeContent(amazonIn).showPay, true);
assert.equal(getHomeContent(amazon).showPay, false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- home-content.test.ts`

Expected: FAIL because `getHomeContent` does not exist.

- [ ] **Step 3: Implement one content resolver and simplify the page**

```ts
export function getHomeContent(store: PublicMarketplace): HomeContent {
  return store.id === 'IN' ? INDIA_HOME : US_HOME;
}
```

Map every product reference through the existing `productsIn` and `deals` helpers; never duplicate product records in home data. Replace inline `homeContent`, `items`, `heroImages`, and `promoTiles` in `app/page.tsx` with the resolver and presentation components.

- [ ] **Step 4: Verify both marketplace routes compile and render**

Run: `npm run typecheck && npm run build`

Expected: PASS; the build output includes `/` and the `/in` rewrite path remains supported by `proxy.ts`.

- [ ] **Step 5: Commit the composition task**

```bash
git add lib/home-content.ts lib/home-content.test.ts app/page.tsx
git commit -m "feat: compose distinct marketplace homepages"
```

### Task 5: Align shared chrome after parallel edits are committed

**Files:**
- Modify: `components/AppShell.tsx`
- Modify: `components/chrome/HeaderBelt.tsx`
- Modify: `components/chrome/SubNav.tsx`
- Modify: `components/chrome/Footer.tsx`
- Modify: `components/chrome/Wordmark.tsx`
- Modify: `components/chrome/MobileNav.tsx`
- Test: `components/chrome/AppShell.test.tsx`

**Interfaces:**
- Consumes `marketplace.ui.navPromotion` from Task 1.
- Produces desktop and mobile chrome with the same resolved routes and accessible drawer/flyout controls.

- [ ] **Step 1: Confirm the parallel changes are committed before editing overlap**

Run: `git status --short components/AppShell.tsx components/chrome/SubNav.tsx components/chrome/MobileNav.tsx`

Expected: no output. If output exists, do not edit these files; request a commit/hand-off from the parallel worker.

- [ ] **Step 2: Write failing chrome tests**

```tsx
expect(screen.getByRole('link', { name: /amazon\.com/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false');
expect(screen.getByRole('navigation')).toHaveTextContent("Today's Deals");
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- AppShell.test.tsx`

Expected: FAIL until a testable chrome harness and assertions are present.

- [ ] **Step 4: Implement marketplace-aware chrome refinements**

```tsx
{store.ui.navPromotion ? <a href={store.ui.navPromotion.href}>{store.ui.navPromotion.label}</a> : null}
```

Use the resolved marketplace paths already passed through `AppShell`; do not re-prefix paths in child components. Align compact Amazon-like spacing, wordmark baseline, focus outlines, desktop promotion placement, and mobile drawer header without removing the existing disclosure.

- [ ] **Step 5: Verify shared chrome across routes**

Run: `npm test -- AppShell.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the chrome task**

```bash
git add components/AppShell.tsx components/chrome/HeaderBelt.tsx components/chrome/SubNav.tsx components/chrome/Footer.tsx components/chrome/Wordmark.tsx components/chrome/MobileNav.tsx components/chrome/AppShell.test.tsx
git commit -m "feat: refine marketplace storefront chrome"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–5 cover marketplace-driven content, local campaign art, shared chrome, accessibility, responsive behavior, and build verification for the first two spec passes. Shopping and destination pages are intentionally deferred to separate plans because they are independent, route-specific subsystems.
- **Placeholder scan:** No unresolved implementation markers are present. Test-runner setup is explicitly conditional on the observed absence of a runner, avoiding an unbounded dependency change.
- **Type consistency:** `HomeModule`, `HomeCampaign`, and `MarketplaceUi` originate in Task 1; all subsequent task interfaces consume those exact names.

