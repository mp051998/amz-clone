# Storefront fidelity design

## Goal

Bring the existing Amazon storefront rebuild materially closer to the live
`amazon.com` and `amazon.in` shopping experiences while preserving its local
catalog, working cart and checkout flows, and the parallel agent's changes.
The result remains clearly labeled as an unofficial educational demo.

## Scope and sequencing

Work is split into independently verifiable passes. A pass is complete only
after its supported desktop and mobile layouts render without overflow,
placeholder navigation, or regressions in existing flows.

1. **Shared chrome.** Align header geometry, logo treatment, delivery/search
   controls, account/cart states, navigation, footer density, focus states,
   and responsive behavior. Model marketplace differences as data rather than
   conditionals scattered through components.
2. **Marketplace homepages.** Replace generic gradient-and-product heroes with
   campaign-style image-led placements. Compose marketplace-specific hero,
   promo card, discovery, deal, and horizontal rail modules from reusable data
   types. US and India get independently ordered content; India keeps Fresh,
   Amazon Pay, Prime Video, and local price-point merchandising.
3. **Shopping surfaces.** Bring search, PDP, cart, checkout, orders, sign-in,
   and account screens into the same hierarchy: dense information layout,
   clear price/deal semantics, delivery promises, selection controls, and
   appropriate empty/signed-out states.
4. **Destination pages.** Complete Deals, Best Sellers, New Releases, Gift
   Cards, Registry, Customer Service, Sell, Prime, Prime Video, and Amazon
   Pay with consistent page-level headings, banners, modules, and calls to
   action.
5. **Visual QA.** Exercise the shared navigation and representative flows at
   phone, tablet, and desktop widths; compare each storefront against current
   public Amazon references and fix observable regressions.

## Architecture

`AppShell` remains the sole shared chrome owner. Marketplace configuration
supplies nav labels, locale and currency, delivery copy, and content module
definitions. Page components assemble typed presentation modules rather than
embedding campaign copy or marketplace conditionals inline.

Use local, intentionally licensed or generated artwork for campaigns and
continue using self-hosted catalog images. Do not hotlink or copy Amazon's
live campaign assets. The existing SVG wordmark is retained only in the
context of the existing non-affiliation disclosure.

Where the clone currently has functional pages, visual work must preserve the
route and form contracts. No live Amazon integrations, account scraping,
recommendation system, payments beyond the current Stripe integration, or
user-review/returns platform is introduced.

## Data flow

Request → marketplace resolver → typed marketplace configuration and catalog
→ page composition → shared components. Interaction state remains local to
client components (carousel, drawers, flyouts, rail controls); cart/auth/order
state continues through the existing server-side interfaces.

## Accessibility and resilience

All interactive chrome retains keyboard access, labelled controls, visible
focus treatment, and non-hover access on touch devices. Campaign artwork must
have meaningful alternate text when it conveys content. Missing imagery falls
back to neutral component treatments rather than broken image boxes. Layout
uses constrained widths and horizontal overflow only for intentionally
scrollable rails or navigation.

## Verification

- `npm run typecheck`
- `npm run build`
- Render checks for US and India roots plus a representative search result,
  product, cart, checkout, account, deals, and Prime/Pay route.
- Manual responsive checks at approximately 375px, 768px, 1024px, and 1440px.
- Verify checkout/auth changes made concurrently by the other agent remain
  intact before staging any overlapping file.

## Acceptance conditions

- US and India no longer share a merely recolored homepage; each has a
  deliberate marketplace-specific merchandising sequence.
- The shared header/footer and page chrome visually support Amazon's compact,
  information-dense storefront patterns without misrepresenting affiliation.
- Existing catalog, navigation, auth, cart, and checkout routes remain
  functional.
- All edits are scoped away from uncommitted concurrent work unless explicitly
  coordinated.
